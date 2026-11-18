const express = require('express');
const db = require('../db/database');
const cloudinaryDirect = require('../services/cloudinaryDirectService');
const { slugify } = require('../services/metadataParser');

const router = express.Router();

// -----------------------------------------------------------------------
// SEARCH ROUTE
// PRIMARY source: cloudinaryDirectService in-memory songs for song search
// SECONDARY:      SQLite for artists and albums (DB-derived entities)
// -----------------------------------------------------------------------

/**
 * Dynamic Multi-Entity Search (Songs, Artists, Albums)
 * GET /api/search?q=anirudh
 */
router.get('/', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    const userId = (req.user && req.user.id) || 'admin-user-id';

    if (!query) {
      return res.json({ data: { songs: [], artists: [], albums: [] } });
    }

    const q = query.toLowerCase();
    const cleanQuery = query.replace(/['\"*]/g, '').trim();
    const likePattern = `%${cleanQuery}%`;

    // --- 1. Search songs in Cloudinary direct cache ---
    let allSongs = cloudinaryDirect.getInMemorySongs();
    if (allSongs.length === 0) {
      try {
        allSongs = await cloudinaryDirect.getCachedSongs(false);
      } catch (_) {
        allSongs = [];
      }
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    let songs = allSongs.filter(s => {
      const title = (s.title || '').toLowerCase();
      const artist = (s.artist || '').toLowerCase();
      const album = (s.album || '').toLowerCase();
      const movie = (s.movie || '').toLowerCase();
      const folder = (s.folder || '').toLowerCase();
      let artArr = [];
      if (Array.isArray(s.artists)) artArr = s.artists.map(a => a.toLowerCase());
      else {
        try { artArr = JSON.parse(s.artists_json || '[]').map(a => a.toLowerCase()); } catch (_) {}
      }
      const fullText = `${title} ${artist} ${album} ${movie} ${folder} ${artArr.join(' ')}`;
      return tokens.every(token => fullText.includes(token));
    }).sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      if (titleA === q) return -1;
      if (titleB === q) return 1;
      if (titleA.startsWith(q) && !titleB.startsWith(q)) return -1;
      if (!titleA.startsWith(q) && titleB.startsWith(q)) return 1;
      return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
    }).slice(0, 100);

    // Enrich is_liked from SQLite
    let likedSet = new Set();
    try {
      const likedRows = db.prepare(
        `SELECT item_id FROM annotation WHERE user_id = ? AND starred = 1`
      ).all(userId);
      likedSet = new Set(likedRows.map(r => r.item_id));
    } catch (_) { /* ignore */ }

    songs = songs.map(s => ({ ...s, is_liked: likedSet.has(s.id) }));

    // --- 2. Search Artists (SQLite — derived from media_file_artists) ---
    let artists = [];
    try {
      artists = db.prepare(`
        SELECT a.id, a.name, a.slug, a.large_image_url,
          COUNT(mfa.media_file_id) AS song_count
        FROM artist a
        JOIN media_file_artists mfa ON a.id = mfa.artist_id
        WHERE a.name LIKE ? OR a.slug LIKE ?
        GROUP BY a.id
        ORDER BY song_count DESC, a.name ASC
        LIMIT 8
      `).all(likePattern, `%${slugify(cleanQuery)}%`);
    } catch (_) { /* SQLite may be empty */ }

    // --- 3. Search Albums (SQLite) ---
    let albums = [];
    try {
      albums = db.prepare(`
        SELECT alb.id, alb.name, alb.album_artist, alb.large_image_url, alb.genre,
          COUNT(m.id) AS song_count
        FROM album alb
        LEFT JOIN media_file m ON alb.id = m.album_id
        WHERE alb.name LIKE ? OR alb.album_artist LIKE ?
        GROUP BY alb.id
        ORDER BY song_count DESC
        LIMIT 6
      `).all(likePattern, likePattern);
    } catch (_) { /* SQLite may be empty */ }

    res.json({ data: { query, songs, artists, albums } });
  } catch (err) {
    console.error('[Search] Error:', err.message || err);
    res.status(500).json({ error: { message: 'Search failed', detail: err.message } });
  }
});

/**
 * Instant Search Suggestions / Autocomplete
 * GET /api/search/suggestions?q=an
 */
router.get('/suggestions', (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query || query.length < 2) {
      return res.json({ data: [] });
    }

    const q = query.toLowerCase();
    const likePattern = `%${query}%`;

    // Song suggestions from in-memory Cloudinary cache
    const allSongs = cloudinaryDirect.getInMemorySongs();
    const songSuggestions = allSongs
      .filter(s => s.title.toLowerCase().includes(q))
      .slice(0, 4)
      .map(s => ({ text: s.title, type: 'song' }));

    // Artist and album suggestions from SQLite
    let artistSuggestions = [];
    let albumSuggestions = [];
    try {
      artistSuggestions = db.prepare(`
        SELECT DISTINCT a.name AS text, 'artist' AS type
        FROM artist a
        JOIN media_file_artists mfa ON a.id = mfa.artist_id
        WHERE a.name LIKE ?
        LIMIT 4
      `).all(likePattern);

      albumSuggestions = db.prepare(`
        SELECT DISTINCT name AS text, 'album' AS type FROM album
        WHERE name LIKE ?
        LIMIT 3
      `).all(likePattern);
    } catch (_) { /* SQLite may be empty */ }

    res.json({ data: [...songSuggestions, ...artistSuggestions, ...albumSuggestions] });
  } catch (err) {
    console.error('[Search/Suggestions] Error:', err.message || err);
    res.json({ data: [] });
  }
});

module.exports = router;
