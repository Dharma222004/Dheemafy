const crypto = require('node:crypto');
const path = require('node:path');
const db = require('../db/database');
const cloudinaryService = require('./cloudinary');
const { normalizeStr, slugify, parseMetadataLine, loadAllMetadata } = require('./metadataParser');
const { resolveArtistImage, resolveSongCover } = require('./mediaArtwork');

/**
 * Generate stable IDs
 */
function makeId(prefix = 'song') {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function getArtistImage(artistName, sampleCover = null) {
  return resolveArtistImage(artistName, sampleCover);
}

/**
 * Fallback parser for Cloudinary assets when not found in .txt metadata files
 */
function parseFromPublicId(publicId) {
  const parts = publicId.split('/');
  let filename = parts[parts.length - 1];
  filename = filename.replace(/\.[a-zA-Z0-9]+$/, ''); // remove extension

  // Protect duo names
  filename = filename.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');

  let artistPart = 'Various Artists';
  let titlePart = filename.replace(/_/g, ' ');
  let movie = null;

  if (filename.includes('_-_')) {
    const split = filename.split('_-_');
    artistPart = split[0].replace(/_/g, ' ').replace('Vivek-Mervin', 'Vivek - Mervin').trim();
    titlePart = split.slice(1).join(' - ').replace(/_/g, ' ').trim();
  } else if (filename.includes(' - ')) {
    const split = filename.split(' - ');
    artistPart = split[0].trim();
    titlePart = split.slice(1).join(' - ').trim();
  }

  // Check for movie in title e.g. "Railin Oligal - From Blue Star" or "Kanimaa From Retro"
  const fromMatch = titlePart.match(/[-_\s]*From\s+([A-Za-z0-9\s&]+)/i);
  if (fromMatch) {
    movie = fromMatch[1].trim();
    titlePart = titlePart.replace(fromMatch[0], '').trim();
  }

  let artists = [];
  if (artistPart.includes(',')) {
    artists = artistPart.split(',').map(a => a.trim()).filter(Boolean);
  } else {
    artists = [artistPart];
  }

  return {
    title: titlePart,
    artists,
    artistString: artists.join(', '),
    movie: movie,
    album: movie || 'Tamil Hits',
    language: 'Tamil'
  };
}

/**
 * Main synchronization engine
 */
async function syncCloudinaryCatalog(customFolder = 'Songs') {
  const folder = typeof customFolder === 'string' ? customFolder : (customFolder?.folder || 'Songs');

  console.log(`[Sync] Starting Cloudinary catalog sync for folder "${folder}"...`);
  const logId = db.prepare(`
    INSERT INTO cloudinary_sync_log (status, discovered, added, updated, duplicates, errors, details)
    VALUES ('RUNNING', 0, 0, 0, 0, 0, 'Sync in progress...')
  `).run().lastInsertRowid;

  let discovered = 0;
  let added = 0;
  let updated = 0;
  let duplicates = 0;
  let errors = 0;
  const errorDetails = [];

  try {
    if (!cloudinaryService.isConfigured()) {
      throw new Error('Cloudinary credentials are not configured in environment variables.');
    }

    // 1. Load all structured metadata from Meta Data directory
    console.log('[Sync] Loading metadata from Meta Data directory...');
    const metadataSongs = loadAllMetadata();

    // 2. Scan all audio files from Cloudinary
    console.log(`[Sync] Scanning Cloudinary audio resources in folder "${folder}"...`);
    const resources = await cloudinaryService.scanAllAudioResources(folder);
    discovered = resources.length;
    console.log(`[Sync] Discovered ${discovered} audio files in Cloudinary.`);

    // 3. Prepare Database Statements
    const findByPublicId = db.prepare('SELECT id, title, artist, album FROM media_file WHERE cloudinary_public_id = ?');

    const findArtistByName = db.prepare('SELECT id, name FROM artist WHERE LOWER(name) = LOWER(?)');
    const findArtistBySlug = db.prepare('SELECT id, name FROM artist WHERE slug = ?');
    const insertArtist = db.prepare(`
      INSERT INTO artist (id, name, slug, full_text, created_at, updated_at, large_image_url)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);
    const updateArtistSlug = db.prepare('UPDATE artist SET slug = ?, large_image_url = ? WHERE id = ?');

    const findAlbum = db.prepare('SELECT id FROM album WHERE LOWER(name) = LOWER(?)');
    const insertAlbum = db.prepare(`
      INSERT INTO album (id, name, album_artist, album_artist_id, genre, song_count, duration, created_at, updated_at, large_image_url)
      VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);

    const insertSong = db.prepare(`
      INSERT INTO media_file (
        id, path, title, artist, artist_id, artists_json, album, album_id, album_artist, album_artist_id,
        duration, size, suffix, genre, language, year, has_cover_art,
        cloudinary_public_id, audio_url, cover_image_url, is_active,
        movie, folder, slug, search_keywords, full_text, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 1,
        ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const updateSong = db.prepare(`
      UPDATE media_file SET
        title = ?, artist = ?, artist_id = ?, artists_json = ?, album = ?, album_id = ?,
        duration = ?, size = ?, genre = ?, language = ?, audio_url = ?, cover_image_url = ?,
        movie = ?, folder = ?, slug = ?, search_keywords = ?, full_text = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const deleteMediaArtists = db.prepare('DELETE FROM media_file_artists WHERE media_file_id = ?');
    const insertMediaArtist = db.prepare(`
      INSERT INTO media_file_artists (media_file_id, artist_id, role, sub_role)
      VALUES (?, ?, 'artist', '')
    `);

    const insertFts = db.prepare(`
      INSERT OR REPLACE INTO spotkify_fts (song_id, title, artist, album, genre, language, search_keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Helper to get or create artist
    function getOrCreateArtist(artistName, sampleCover = null) {
      const cleanName = artistName.trim();
      const slug = slugify(cleanName);
      let existing = findArtistByName.get(cleanName);
      if (!existing && slug) {
        existing = findArtistBySlug.get(slug);
      }

      const avatarUrl = getArtistImage(cleanName, sampleCover);

      if (existing) {
        updateArtistSlug.run(slug, avatarUrl, existing.id);
        return existing.id;
      }

      const artistId = makeId('art');
      insertArtist.run(artistId, cleanName, slug, cleanName.toLowerCase(), avatarUrl);
      return artistId;
    }

    // Helper to get or create album
    function getOrCreateAlbum(albumName, primaryArtistName, primaryArtistId, coverUrl) {
      if (!albumName) return null;
      const existing = findAlbum.get(albumName);
      if (existing) return existing.id;

      const albumId = makeId('alb');
      insertAlbum.run(
        albumId,
        albumName,
        primaryArtistName,
        primaryArtistId,
        'Soundtrack',
        0,
        coverUrl || getArtistImage(primaryArtistName)
      );
      return albumId;
    }

    // 4. Process each Cloudinary resource
    for (const res of resources) {
      try {
        const pubId = res.public_id;
        const normPubId = normalizeStr(pubId);

        // Extract folder name from asset_folder or folder
        const rawFolder = res.asset_folder || res.folder || '';
        let folderName = null;
        if (rawFolder.startsWith('Songs/')) {
          folderName = rawFolder.replace(/^Songs\//, '').trim();
        } else if (rawFolder && rawFolder !== 'Songs') {
          folderName = rawFolder.trim();
        }

        // Extract title portion if formatted as Artists_-_Title
        let rawPubId = pubId.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');
        let rawTitlePart = rawPubId;
        let rawArtistPart = '';
        if (rawPubId.includes('_-_')) {
          const parts = rawPubId.split('_-_');
          rawArtistPart = parts[0].replace('Vivek-Mervin', 'Vivek - Mervin');
          rawTitlePart = parts.slice(1).join('_-_');
        } else if (rawPubId.includes(' - ')) {
          const parts = rawPubId.split(' - ');
          rawArtistPart = parts[0].replace('Vivek-Mervin', 'Vivek - Mervin');
          rawTitlePart = parts.slice(1).join(' - ');
        }

        const cleanTitlePart = rawTitlePart.replace(/_from_.*$/i, '').replace(/ - from .*$/i, '');
        const normTitlePart = normalizeStr(cleanTitlePart);
        const normArtistPart = normalizeStr(rawArtistPart);

        // A. Match against parsed metadata with artist verification
        let matchedMeta = null;

        for (const meta of metadataSongs) {
          const normTitle = normalizeStr(meta.title);
          if (!normTitle || normTitle.length < 2) continue;

          // Check if title matches strictly
          const titleMatches = (normTitlePart === normTitle);

          if (titleMatches) {
            if (rawArtistPart) {
              const hasArtistMatch = meta.artists.some(a => {
                const normA = normalizeStr(a);
                return normA.length >= 3 && normArtistPart.includes(normA);
              });
              if (hasArtistMatch) {
                matchedMeta = meta;
                break;
              }
            } else {
              matchedMeta = meta;
              break;
            }
          }
        }

        // B. Fallback to parsing publicId directly
        if (!matchedMeta) {
          matchedMeta = parseFromPublicId(pubId);
        }

        // Final structured metadata
        const title = matchedMeta.title;
        const artists = matchedMeta.artists && matchedMeta.artists.length > 0
          ? matchedMeta.artists
          : ['Various Artists'];
        const artistString = artists.join(', ');
        const movie = matchedMeta.movie || null;
        const album = matchedMeta.album || movie || 'Tamil Hits';
        const language = matchedMeta.language || 'Tamil';
        const slug = slugify(title);

        // Playback details
        const audioUrl = res.secure_url || cloudinaryService.getAudioStreamUrl(pubId);
        const duration = Math.round(Number(res.duration) || 0);
        const size = Number(res.bytes) || 5000000;
        const format = res.format || 'mp3';
        const coverImageUrl = resolveSongCover(title, movie, artists[0]);

        // Manage Artists
        const artistIds = artists.map(a => getOrCreateArtist(a, coverImageUrl));
        const primaryArtistId = artistIds[0];

        // Manage Album
        const albumId = getOrCreateAlbum(album, artists[0], primaryArtistId, coverImageUrl);

        const keywords = `${title} ${artists.join(' ')} ${album} ${movie || ''} ${language}`.toLowerCase();
        const artistsJson = JSON.stringify(artists);

        // Check if existing record exists strictly by public_id
        const existingByPub = findByPublicId.get(pubId);
        const targetSongId = existingByPub ? existingByPub.id : null;

        if (targetSongId) {
          // UPDATE
          updateSong.run(
            title,
            artistString,
            primaryArtistId,
            artistsJson,
            album,
            albumId,
            duration,
            size,
            'Soundtrack',
            language,
            audioUrl,
            coverImageUrl,
            movie,
            folderName,
            slug,
            keywords,
            keywords,
            targetSongId
          );

          // Update junction table
          deleteMediaArtists.run(targetSongId);
          for (const aId of artistIds) {
            insertMediaArtist.run(targetSongId, aId);
          }

          insertFts.run(targetSongId, title, artistString, album, 'Soundtrack', language, keywords);
          updated++;
        } else {
          // INSERT NEW
          const newSongId = makeId('track');
          insertSong.run(
            newSongId,
            pubId,
            title,
            artistString,
            primaryArtistId,
            artistsJson,
            album,
            albumId,
            artists[0],
            primaryArtistId,
            duration,
            size,
            format,
            'Soundtrack',
            language,
            new Date(res.created_at || Date.now()).getFullYear(),
            1,
            pubId,
            audioUrl,
            coverImageUrl,
            movie,
            folderName,
            slug,
            keywords,
            keywords
          );

          // Insert into junction table for each credited artist
          for (const aId of artistIds) {
            insertMediaArtist.run(newSongId, aId);
          }

          insertFts.run(newSongId, title, artistString, album, 'Soundtrack', language, keywords);
          added++;
        }
      } catch (itemErr) {
        errors++;
        errorDetails.push(`Error on ${res.public_id}: ${itemErr.message}`);
        console.error(`[Sync] Error processing resource ${res.public_id}:`, itemErr.message);
      }
    }

    // 5. Deactivate any songs in database that are NOT in Cloudinary to prevent 404 playback errors
    try {
      const activePublicIds = new Set(resources.map(r => r.public_id));
      const allDbSongs = db.prepare('SELECT id, cloudinary_public_id, is_active FROM media_file').all();
      const deactivateStmt = db.prepare('UPDATE media_file SET is_active = 0 WHERE id = ?');
      let deactivatedCount = 0;
      for (const song of allDbSongs) {
        if (!activePublicIds.has(song.cloudinary_public_id)) {
          if (song.is_active !== 0) {
            deactivateStmt.run(song.id);
            deactivatedCount++;
          }
        }
      }
      console.log(`[Sync] Verified ${activePublicIds.size} active Cloudinary songs. Deactivated ${deactivatedCount} missing/un-uploaded songs.`);
    } catch (deactErr) {
      console.warn('[Sync] Note during deactivating missing songs:', deactErr.message);
    }

    // Update aggregated album duration and song counts (active songs only)
    try {
      db.exec(`
        UPDATE album SET
          duration = (SELECT COALESCE(SUM(duration), 0) FROM media_file WHERE album_id = album.id AND (is_active = 1 OR is_active IS NULL)),
          song_count = (SELECT COUNT(*) FROM media_file WHERE album_id = album.id AND (is_active = 1 OR is_active IS NULL))
      `);
    } catch (albErr) {
      console.warn('[Sync] Album aggregation update note:', albErr.message);
    }

    // Synchronize Playlists from Cloudinary subfolders
    try {
      console.log('[Sync] Updating Playlists from Cloudinary subfolders...');
      const folderRows = db.prepare(`
        SELECT DISTINCT folder
        FROM media_file
        WHERE folder IS NOT NULL AND TRIM(folder) != ''
      `).all();

      const findPlaylistByName = db.prepare('SELECT id FROM playlist WHERE LOWER(name) = LOWER(?)');
      const insertPlaylist = db.prepare(`
        INSERT INTO playlist (id, name, comment, duration, song_count, public, owner_id, uploaded_image, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 'admin-user-id', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      const updatePlaylist = db.prepare(`
        UPDATE playlist SET
          duration = ?, song_count = ?, uploaded_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const clearPlaylistTracks = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
      const insertPlaylistTrack = db.prepare('INSERT INTO playlist_tracks (playlist_id, media_file_id) VALUES (?, ?)');

      for (const { folder } of folderRows) {
        const songsInFolder = db.prepare(`
          SELECT id, duration
          FROM media_file
          WHERE folder = ? AND (is_active = 1 OR is_active IS NULL)
          ORDER BY title ASC
        `).all(folder);

        if (songsInFolder.length === 0) continue;

        const songCount = songsInFolder.length;
        const totalDuration = songsInFolder.reduce((sum, s) => sum + (s.duration || 0), 0);
        const slug = folder.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
        const uploadedImage = `/images/playlists/${slug}.svg`;
        const comment = `Curated playlist from folder "${folder}"`;

        const existingPl = findPlaylistByName.get(folder);
        let plId = existingPl ? existingPl.id : null;

        if (plId) {
          updatePlaylist.run(totalDuration, songCount, uploadedImage, plId);
        } else {
          plId = `pl-${slug}`;
          insertPlaylist.run(plId, folder, comment, totalDuration, songCount, uploadedImage);
        }

        // Re-populate playlist_tracks
        clearPlaylistTracks.run(plId);
        for (const s of songsInFolder) {
          insertPlaylistTrack.run(plId, s.id);
        }
        console.log(`[Sync] Playlist "${folder}": ${songCount} songs synced (ID: ${plId}).`);
      }
    } catch (plErr) {
      console.warn('[Sync] Folder playlist sync note:', plErr.message);
    }

    const summary = `Completed: Discovered ${discovered}, Added ${added}, Updated ${updated}, Duplicates ${duplicates}, Errors ${errors}.`;
    db.prepare(`
      UPDATE cloudinary_sync_log SET
        completed_at = CURRENT_TIMESTAMP,
        status = 'SUCCESS',
        discovered = ?,
        added = ?,
        updated = ?,
        duplicates = ?,
        errors = ?,
        details = ?
      WHERE id = ?
    `).run(discovered, added, updated, duplicates, errors, summary, logId);

    console.log(`[Sync] Finished successfully: ${summary}`);
    return {
      discovered,
      added,
      updated,
      duplicates,
      errors,
      details: summary
    };
  } catch (err) {
    console.error('[Sync] Fatal error during sync:', err);
    db.prepare(`
      UPDATE cloudinary_sync_log SET
        completed_at = CURRENT_TIMESTAMP,
        status = 'FAILED',
        details = ?
      WHERE id = ?
    `).run(`Fatal Error: ${err.message}`, logId);
    throw err;
  }
}

/**
 * Auto-Sync Engine:
 * Ensures catalog is fresh. Automatically runs on cold start or if cache is older than 2 minutes.
 */
let lastSyncTime = Date.now();
let isSyncing = false;
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function ensureFreshCatalog(force = false) {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as c FROM media_file WHERE is_active = 1').get();
    const count = countRow ? countRow.c : 0;

    if (count === 0) {
      console.log('[AutoSync] Database has 0 songs. Running initial sync synchronously...');
      const res = await syncCloudinaryCatalog('Songs');
      lastSyncTime = Date.now();
      return res;
    }

    const now = Date.now();
    if ((now - lastSyncTime > AUTO_SYNC_INTERVAL_MS || force) && !isSyncing) {
      isSyncing = true;
      console.log('[AutoSync] Revalidating Cloudinary catalog in background...');
      syncCloudinaryCatalog('Songs')
        .then(res => {
          lastSyncTime = Date.now();
          console.log(`[AutoSync] Background sync complete: ${res.discovered} discovered (${res.added} added, ${res.updated} updated).`);
        })
        .catch(err => {
          console.warn('[AutoSync] Background sync error:', err.message);
        })
        .finally(() => {
          isSyncing = false;
        });
    }
  } catch (e) {
    console.warn('[AutoSync] Check error:', e.message);
  }
}

module.exports = {
  syncCloudinaryCatalog,
  ensureFreshCatalog,
  getArtistImage,
  parseFromPublicId
};
