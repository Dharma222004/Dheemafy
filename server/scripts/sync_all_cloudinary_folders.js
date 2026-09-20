const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { loadAllMetadata, normalizeStr, slugify } = require('../services/metadataParser');
const { resolveSongCover, resolveArtistImage, DEFAULT_COVER } = require('../services/mediaArtwork');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const db = new DatabaseSync(path.resolve(__dirname, '../../data/navidrome.db'));
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA busy_timeout = 15000;');

async function fetchFolderResources(folderName) {
  console.log(`\nFetching resources for folder: "${folderName}"...`);
  let allResources = [];
  let nextCursor = null;

  do {
    const res = await cloudinary.search
      .expression(`resource_type:video AND (asset_folder:"${folderName}" OR folder:"${folderName}")`)
      .max_results(500)
      .next_cursor(nextCursor)
      .execute();

    if (res.resources && res.resources.length > 0) {
      allResources = allResources.concat(res.resources);
      console.log(`  Fetched ${res.resources.length} items (total so far: ${allResources.length})...`);
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);

  console.log(`Completed fetch for "${folderName}": ${allResources.length} total resources.`);
  return allResources;
}

function parseFromPublicId(pubId) {
  let clean = pubId.replace(/^.*\//, ''); // remove folder path if any
  clean = clean.replace(/\.[a-zA-Z0-9]+$/, ''); // remove ext
  clean = clean.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');

  let artistPart = 'Various Artists';
  let titlePart = clean.replace(/_/g, ' ');
  let movie = null;

  if (clean.includes('_-_')) {
    const split = clean.split('_-_');
    artistPart = split[0].replace(/_/g, ' ').replace('Vivek-Mervin', 'Vivek - Mervin').trim();
    titlePart = split.slice(1).join(' - ').replace(/_/g, ' ').trim();
  } else if (clean.includes(' - ')) {
    const split = clean.split(' - ');
    artistPart = split[0].trim();
    titlePart = split.slice(1).join(' - ').trim();
  }

  // Movie detection
  const movieMatch = titlePart.match(/from\s+([a-zA-Z0-9\s]+)$/i) || titlePart.match(/\(from\s+([a-zA-Z0-9\s]+)\)/i);
  if (movieMatch) {
    movie = movieMatch[1].trim();
    titlePart = titlePart.replace(movieMatch[0], '').replace(/[-_()]/g, ' ').trim();
  }

  const artists = artistPart.split(/[,&/]/).map(a => a.trim()).filter(Boolean);

  return {
    title: titlePart || 'Unknown Title',
    artists: artists.length > 0 ? artists : ['Various Artists'],
    movie: movie,
    album: movie || 'Tamil Hits'
  };
}

async function run() {
  console.log('Loading metadata files...');
  const metadataSongs = loadAllMetadata();
  console.log(`Loaded ${metadataSongs.length} metadata entries.`);

  const folders = ['All Songs', 'Sharu', 'Hills'];
  const folderData = {};

  for (const f of folders) {
    folderData[f] = await fetchFolderResources(f);
  }

  console.log('\n--- Summary of fetched Cloudinary folders ---');
  for (const f of folders) {
    console.log(`${f}: ${folderData[f].length} resources`);
  }

  // Statements
  const findExisting = db.prepare('SELECT id, folder, cover_image_url FROM media_file WHERE cloudinary_public_id = ?');
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
      title = ?, artist = ?, artists_json = ?, album = ?,
      duration = ?, size = ?, audio_url = ?, cover_image_url = ?,
      movie = ?, folder = ?, slug = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  db.exec('BEGIN TRANSACTION;');

  let insertedCount = 0;
  let updatedCount = 0;

  for (const f of folders) {
    const list = folderData[f];
    for (const res of list) {
      const pubId = res.public_id;
      const audioUrl = res.secure_url;
      const duration = Math.round(Number(res.duration) || 0);
      const size = Number(res.bytes) || 5000000;
      const format = res.format || 'mp3';

      // Parse metadata
      const parsed = parseFromPublicId(pubId);
      
      // Match against metadata files
      let matchedMeta = null;
      const normClean = normalizeStr(parsed.title);
      for (const m of metadataSongs) {
        if (normalizeStr(m.title) === normClean) {
          matchedMeta = m;
          break;
        }
      }

      const title = matchedMeta ? matchedMeta.title : parsed.title;
      const artists = matchedMeta ? matchedMeta.artists : parsed.artists;
      const artistString = artists.join(', ');
      const movie = matchedMeta ? matchedMeta.movie : parsed.movie;
      const album = matchedMeta ? (matchedMeta.album || movie || 'Tamil Hits') : parsed.album;
      const slug = slugify(title);

      let coverImageUrl = resolveSongCover(title, movie, artists[0]);
      if (!coverImageUrl || coverImageUrl.includes('wikimedia')) {
        coverImageUrl = DEFAULT_COVER;
      }

      const existing = findExisting.get(pubId);
      if (existing) {
        // Keep existing cover if valid and not wikimedia
        if (existing.cover_image_url && !existing.cover_image_url.includes('wikimedia')) {
          coverImageUrl = existing.cover_image_url;
        }
        updateSong.run(
          title, artistString, JSON.stringify(artists), album,
          duration, size, audioUrl, coverImageUrl,
          movie, f, slug,
          existing.id
        );
        updatedCount++;
      } else {
        const id = 'song-' + require('node:crypto').randomUUID();
        insertSong.run(
          id, pubId, title, artistString, 'artist-va', JSON.stringify(artists), album, 'album-tamil', artistString, 'artist-va',
          duration, size, format, 'Tamil', 'Tamil', 2024, 1,
          pubId, audioUrl, coverImageUrl,
          movie, f, slug, `${title} ${artistString} ${album} ${movie || ''}`, `${title} ${artistString}`,
        );
        insertedCount++;
      }
    }
  }

  db.exec('COMMIT;');

  console.log(`\nSync finished! Inserted: ${insertedCount}, Updated: ${updatedCount}`);

  const counts = db.prepare(`
    SELECT folder, is_active, count(*) as count 
    FROM media_file 
    GROUP BY folder, is_active
  `).all();
  console.log('\nFinal database folder counts:');
  console.log(counts);
}

run().catch(e => {
  console.error('Fatal error:', e);
  try { db.exec('ROLLBACK;'); } catch(_) {}
});
