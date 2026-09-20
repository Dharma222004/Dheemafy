const express = require('express');
const db = require('../db/database');
const cloudinaryService = require('../services/cloudinary');
const { slugify } = require('../services/metadataParser');
const { ensureFreshCatalog } = require('../services/syncService');

const router = express.Router();

function formatSongRow(m) {
  let artists = [];
  try {
    artists = m.artists_json ? JSON.parse(m.artists_json) : [];
  } catch (_) {
    artists = [];
  }
  if (artists.length === 0 && m.artist) {
    artists = m.artist.split(',').map(a => a.trim()).filter(Boolean);
  }

  return {
    ...m,
    artists,
    cloudinaryPublicId: m.cloudinary_public_id,
    audioUrl: m.audio_url,
    coverImageUrl: m.cover_image_url,
    is_liked: Boolean(m.is_liked)
  };
}

/**
 * List songs with pagination and filtering
 * GET /api/songs?page=1&limit=50&genre=Pop&language=Tamil&artist=Anirudh
 */
router.get('/', async (req, res) => {
  // Ensure catalog is fresh (auto-revalidates in background or on cold-start)
  await ensureFreshCatalog();

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const genre = req.query.genre;
  const language = req.query.language;
  const folder = req.query.folder;
  const artist = req.query.artist;
  const artistId = req.query.artistId;
  const albumId = req.query.albumId;
  const userId = (req.user && req.user.id) || 'admin-user-id';

  // For full catalog requests, check ETag / If-None-Match to save bandwidth & prevent redundant downloads
  const isFullCatalog = limit >= 1000 && !genre && !language && !folder && !artist && !artistId && !albumId && page === 1;
  let catalogEtag = null;
  if (isFullCatalog) {
    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    const meta = db.prepare(`
      SELECT COUNT(*) as count, MAX(updated_at) as last_updated
      FROM media_file
      WHERE (is_active = 1 OR is_active IS NULL)
    `).get();
    const count = (meta && meta.count) || 0;
    const lastUpdated = (meta && meta.last_updated) || '';
    catalogEtag = `"${count}-${Buffer.from(String(lastUpdated)).toString('base64url').slice(0, 12)}"`;

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && (clientEtag === catalogEtag || clientEtag === `W/${catalogEtag}`)) {
      res.setHeader('ETag', catalogEtag);
      return res.status(304).end();
    }
  }

  let whereClauses = ['m.is_active = 1'];
  let countParams = [];
  let selectParams = [userId];

  if (folder) {
    whereClauses.push('LOWER(m.folder) = LOWER(?)');
    countParams.push(folder);
    selectParams.push(folder);
  }

  if (genre) {
    whereClauses.push('LOWER(m.genre) = LOWER(?)');
    countParams.push(genre);
    selectParams.push(genre);
  }
  if (language) {
    whereClauses.push('LOWER(m.language) = LOWER(?)');
    countParams.push(language);
    selectParams.push(language);
  }
  if (artist) {
    const slug = slugify(artist);
    whereClauses.push(`m.id IN (
      SELECT mfa.media_file_id FROM media_file_artists mfa
      JOIN artist a ON mfa.artist_id = a.id
      WHERE LOWER(a.name) = LOWER(?) OR a.slug = ?
    )`);
    countParams.push(artist, slug);
    selectParams.push(artist, slug);
  }
  if (artistId) {
    whereClauses.push(`m.id IN (
      SELECT media_file_id FROM media_file_artists WHERE artist_id = ?
    )`);
    countParams.push(artistId);
    selectParams.push(artistId);
  }
  if (albumId) {
    whereClauses.push('m.album_id = ?');
    countParams.push(albumId);
    selectParams.push(albumId);
  }

  const whereSql = whereClauses.join(' AND ');

  const totalCount = db.prepare(`SELECT COUNT(*) as count FROM media_file m WHERE ${whereSql}`).get(...countParams).count;

  const songsRaw = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.artist_id, m.album, m.album_id, m.album_artist,
      m.movie, m.duration, m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language,
      m.year, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE ${whereSql}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...selectParams, limit, offset);

  // Guarantee that each unique Cloudinary asset is returned exactly once
  const seenSongKeys = new Set();
  const dedupedSongsRaw = [];
  for (const s of songsRaw) {
    const key = s.cloudinary_public_id || s.id;
    if (!seenSongKeys.has(key)) {
      seenSongKeys.add(key);
      dedupedSongsRaw.push(s);
    }
  }

  const songs = dedupedSongsRaw.map(formatSongRow);

  if (catalogEtag) {
    res.setHeader('ETag', catalogEtag);
  }

  res.json({
    data: songs,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNextPage: page * limit < totalCount
    }
  });
});

/**
 * Fast lightweight catalog version & summary endpoint (<1ms SQLite check)
 * GET /api/songs/version
 */
router.get('/version', (req, res) => {
  try {
    const meta = db.prepare(`
      SELECT COUNT(*) as count, MAX(updated_at) as last_updated
      FROM media_file
      WHERE (is_active = 1 OR is_active IS NULL)
    `).get();
    const count = (meta && meta.count) || 0;
    const lastUpdated = (meta && meta.last_updated) || '';
    const version = `v-${count}-${Buffer.from(String(lastUpdated)).toString('base64url').slice(0, 12)}`;

    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    res.json({
      success: true,
      data: {
        count,
        lastUpdated,
        version
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * Alias for version/summary
 * GET /api/songs/summary
 */
router.get('/summary', (req, res) => {
  try {
    const meta = db.prepare(`
      SELECT COUNT(*) as count, MAX(updated_at) as last_updated
      FROM media_file
      WHERE (is_active = 1 OR is_active IS NULL)
    `).get();
    const count = (meta && meta.count) || 0;
    const lastUpdated = (meta && meta.last_updated) || '';
    const version = `v-${count}-${Buffer.from(String(lastUpdated)).toString('base64url').slice(0, 12)}`;

    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    res.json({
      success: true,
      data: {
        count,
        lastUpdated,
        version
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * Get song by ID
 * GET /api/songs/:id
 */
router.get('/:id', (req, res) => {
  const userId = (req.user && req.user.id) || 'admin-user-id';
  const song = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.artist_id, m.album, m.album_id, m.album_artist,
      m.movie, m.duration, m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language,
      m.year, m.folder, m.slug,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE m.id = ?
  `).get(userId, req.params.id);

  if (!song) {
    return res.status(404).json({ error: { code: 'SONG_NOT_FOUND', message: 'Song not found' } });
  }

  res.json({ data: formatSongRow(song) });
});

/**
 * Authorize and get Cloudinary CDN playback stream URL
 * GET /api/songs/:id/play
 */
router.get('/:id/play', (req, res) => {
  const song = db.prepare('SELECT id, title, artist, audio_url, cloudinary_public_id, is_active FROM media_file WHERE id = ?').get(req.params.id);

  if (!song) {
    return res.status(404).json({ error: { code: 'SONG_NOT_FOUND', message: 'Song not found' } });
  }

  if (song.is_active === 0) {
    return res.status(403).json({ error: { code: 'SONG_DISABLED', message: 'This song is currently unavailable' } });
  }

  // Generate direct Cloudinary CDN stream URL
  const streamUrl = song.audio_url || (song.cloudinary_public_id ? cloudinaryService.getAudioStreamUrl(song.cloudinary_public_id) : '');

  res.json({
    data: {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      streamUrl: streamUrl,
      source: 'cloudinary_cdn'
    }
  });
});

module.exports = router;
