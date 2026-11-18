/**
 * Songs API Route
 * =============================================================
 * PRIMARY source: cloudinaryDirectService  (always up-to-date,
 *                 fetches directly from Cloudinary API)
 * SECONDARY use:  SQLite (annotation / likes / play-counts only)
 *
 * This architecture means:
 *   Upload to Cloudinary → webhook fires → cache cleared →
 *   next /api/songs request returns fresh data.
 *   NO code push or redeploy ever needed.
 * =============================================================
 */

const express = require('express');
const db      = require('../db/database');
const cloudinaryService     = require('../services/cloudinary');
const cloudinaryDirect      = require('../services/cloudinaryDirectService');
const { slugify, normalizeStr } = require('../services/metadataParser');

const router = express.Router();

/** Enrich a song list with per-user like status from SQLite */
function enrichWithLikes(songs, userId) {
  if (!songs || songs.length === 0) return songs;
  try {
    // Build a set of liked song IDs for fast lookup
    const likedRows = db.prepare(`
      SELECT item_id FROM annotation
      WHERE user_id = ? AND starred = 1
    `).all(userId);
    const likedSet = new Set(likedRows.map(r => r.item_id));

    return songs.map(s => ({
      ...s,
      is_liked: likedSet.has(s.id)
    }));
  } catch (_) {
    return songs;
  }
}

/**
 * GET /api/songs
 * Returns the full Cloudinary catalog (paginated, filterable).
 */
router.get('/', async (req, res) => {
  try {
    const userId  = (req.user && req.user.id) || 'admin-user-id';
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(2000, Math.max(1, parseInt(req.query.limit) || 1000));
    const offset  = (page - 1) * limit;

    const { genre, language, folder, artist, artistId, albumId } = req.query;

    // 1. Get full catalog from Cloudinary direct service (cached 5 min)
    let allSongs = await cloudinaryDirect.getCachedSongs(false, 'Songs');

    // 2. Apply filters
    if (folder)   allSongs = allSongs.filter(s => s.folder && s.folder.toLowerCase() === folder.toLowerCase());
    if (genre)    allSongs = allSongs.filter(s => s.genre && s.genre.toLowerCase() === genre.toLowerCase());
    if (language) allSongs = allSongs.filter(s => s.language && s.language.toLowerCase() === language.toLowerCase());
    if (artist) {
      const normArtist = artist.toLowerCase();
      allSongs = allSongs.filter(s =>
        s.artist.toLowerCase().includes(normArtist) ||
        (s.artists && s.artists.some(a => a.toLowerCase().includes(normArtist)))
      );
    }
    // artistId / albumId: not applicable in direct mode (no DB foreign keys), skip gracefully

    const totalCount = allSongs.length;
    const paginated  = allSongs.slice(offset, offset + limit);

    // 3. Enrich with like status from SQLite
    const enriched = enrichWithLikes(paginated, userId);

    // 4. ETag for browser caching
    const version   = cloudinaryDirect.getCacheVersion() || `${totalCount}-direct`;
    const etagValue = `"${version}"`;
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && (clientEtag === etagValue || clientEtag === `W/${etagValue}`)) {
      res.setHeader('ETag', etagValue);
      return res.status(304).end();
    }

    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    res.setHeader('ETag', etagValue);

    res.json({
      data: enriched,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages:  Math.ceil(totalCount / limit),
        hasNextPage: page * limit < totalCount
      }
    });
  } catch (err) {
    console.error('[Songs] GET / error:', err.message || err);
    // Fallback to SQLite if Cloudinary is unreachable
    try {
      const userId = (req.user && req.user.id) || 'admin-user-id';
      const page   = Math.max(1, parseInt(req.query.page)  || 1);
      const limit  = Math.min(2000, Math.max(1, parseInt(req.query.limit) || 1000));
      const offset = (page - 1) * limit;

      const total = db.prepare('SELECT COUNT(*) as c FROM media_file WHERE is_active = 1').get().c;
      const rows  = db.prepare(`
        SELECT m.*, EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
        FROM media_file m WHERE m.is_active = 1
        ORDER BY LOWER(TRIM(m.title)) ASC LIMIT ? OFFSET ?
      `).all(userId, limit, offset);

      res.json({
        data: rows.map(m => ({
          ...m,
          artists: (() => { try { return JSON.parse(m.artists_json || '[]'); } catch (_) { return []; } })(),
          audioUrl: m.audio_url, coverImageUrl: m.cover_image_url,
          cloudinaryPublicId: m.cloudinary_public_id, is_liked: Boolean(m.is_liked)
        })),
        pagination: { page, limit, totalCount: total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total }
      });
    } catch (dbErr) {
      res.status(500).json({ error: { code: 'SONGS_UNAVAILABLE', message: err.message } });
    }
  }
});

/**
 * GET /api/songs/version
 * Lightweight version check for frontend polling.
 * Returns count + version string — frontend compares and re-fetches if changed.
 */
router.get('/version', async (req, res) => {
  try {
    // Use cached count (no network call) for ultra-fast response
    const cachedCount = cloudinaryDirect.getCachedCount();
    const version     = cloudinaryDirect.getCacheVersion();

    // If cache is cold, return a minimal DB-based version
    if (!version && cachedCount === 0) {
      try {
        const meta = db.prepare(`
          SELECT COUNT(*) as count, MAX(updated_at) as last_updated
          FROM media_file WHERE (is_active = 1 OR is_active IS NULL)
        `).get();
        const count       = (meta && meta.count)       || 0;
        const lastUpdated = (meta && meta.last_updated) || '';
        const dbVersion   = `db-${count}-${Buffer.from(String(lastUpdated)).toString('base64url').slice(0, 12)}`;
        return res.set('Cache-Control', 'private, no-cache').json({
          success: true, data: { count, lastUpdated, version: dbVersion, source: 'db' }
        });
      } catch (_) {}
    }

    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    res.json({
      success: true,
      data: {
        count:       cachedCount,
        lastUpdated: new Date(_fetchedAtApprox()).toISOString(),
        version:     version || `cld-${cachedCount}-${Date.now()}`,
        source:      'cloudinary-direct'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

function _fetchedAtApprox() {
  // Not exported from the service but we can approximate from version
  const v = cloudinaryDirect.getCacheVersion();
  if (v) {
    const parts = v.split('-');
    const ts = parseInt(parts[parts.length - 1]);
    if (!isNaN(ts) && ts > 1000000000000) return ts;
  }
  return Date.now();
}

/** Alias: GET /api/songs/summary */
router.get('/summary', (req, res) => { res.redirect('/api/songs/version'); });

/**
 * GET /api/songs/:id
 * Get a single song by its ID.
 */
router.get('/:id', async (req, res) => {
  const userId = (req.user && req.user.id) || 'admin-user-id';
  const { id }  = req.params;

  // 1. Try Cloudinary direct cache first
  try {
    const songs    = cloudinaryDirect.getInMemorySongs();
    const fromCld  = songs.find(s => s.id === id);
    if (fromCld) {
      const enriched = enrichWithLikes([fromCld], userId);
      return res.json({ data: enriched[0] });
    }
  } catch (_) {}

  // 2. Fall back to SQLite
  try {
    const song = db.prepare(`
      SELECT m.*,
        EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
      FROM media_file m WHERE m.id = ?
    `).get(userId, id);

    if (!song) {
      return res.status(404).json({ error: { code: 'SONG_NOT_FOUND', message: 'Song not found' } });
    }
    return res.json({
      data: {
        ...song,
        artists: (() => { try { return JSON.parse(song.artists_json || '[]'); } catch (_) { return []; } })(),
        audioUrl: song.audio_url, coverImageUrl: song.cover_image_url,
        cloudinaryPublicId: song.cloudinary_public_id, is_liked: Boolean(song.is_liked)
      }
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/**
 * GET /api/songs/:id/play
 * Returns the direct Cloudinary stream URL for a song.
 */
router.get('/:id/play', async (req, res) => {
  const { id } = req.params;

  // 1. Try Cloudinary direct cache
  try {
    const songs   = cloudinaryDirect.getInMemorySongs();
    const fromCld = songs.find(s => s.id === id);
    if (fromCld) {
      return res.json({
        data: {
          songId:    fromCld.id,
          title:     fromCld.title,
          artist:    fromCld.artist,
          streamUrl: fromCld.audio_url,
          source:    'cloudinary_cdn'
        }
      });
    }
  } catch (_) {}

  // 2. Fall back to SQLite
  try {
    const song = db.prepare('SELECT id, title, artist, audio_url, cloudinary_public_id, is_active FROM media_file WHERE id = ?').get(id);
    if (!song) {
      return res.status(404).json({ error: { code: 'SONG_NOT_FOUND', message: 'Song not found' } });
    }
    if (song.is_active === 0) {
      return res.status(403).json({ error: { code: 'SONG_DISABLED', message: 'This song is currently unavailable' } });
    }
    const streamUrl = song.audio_url || (song.cloudinary_public_id ? cloudinaryService.getAudioStreamUrl(song.cloudinary_public_id) : '');
    return res.json({
      data: { songId: song.id, title: song.title, artist: song.artist, streamUrl, source: 'cloudinary_cdn' }
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

module.exports = router;
