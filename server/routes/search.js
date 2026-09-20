const express = require('express');
const db = require('../db/database');
const { slugify } = require('../services/metadataParser');

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
 * Dynamic Multi-Entity Search (Songs, Artists, Albums)
 * GET /api/search?q=anirudh
 */
router.get('/', (req, res) => {
  const query = (req.query.q || '').trim();
  const userId = (req.user && req.user.id) || 'admin-user-id';

  if (!query) {
    return res.json({
      data: {
        songs: [],
        artists: [],
        albums: []
      }
    });
  }

  const cleanQuery = query.replace(/['"*]/g, '').trim();
  const likePattern = `%${cleanQuery}%`;

  // 1. Search Artists (Derived dynamically through media_file_artists)
  const artists = db.prepare(`
    SELECT a.id, a.name, a.slug, a.large_image_url,
      COUNT(mfa.media_file_id) AS song_count
    FROM artist a
    JOIN media_file_artists mfa ON a.id = mfa.artist_id
    WHERE a.name LIKE ? OR a.slug LIKE ?
    GROUP BY a.id
    ORDER BY song_count DESC, a.name ASC
    LIMIT 8
  `).all(likePattern, `%${slugify(cleanQuery)}%`);

  // 2. Search Songs (By title, any credited artist, album, movie)
  const songsRaw = db.prepare(`
    SELECT DISTINCT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE (
      m.title LIKE ?
      OR m.artist LIKE ?
      OR m.album LIKE ?
      OR m.movie LIKE ?
      OR m.id IN (
        SELECT mfa.media_file_id
        FROM media_file_artists mfa
        JOIN artist a ON mfa.artist_id = a.id
        WHERE a.name LIKE ? OR a.slug LIKE ?
      )
    ) AND (m.is_active = 1 OR m.is_active IS NULL)
    ORDER BY m.created_at DESC
    LIMIT 40
  `).all(userId, likePattern, likePattern, likePattern, likePattern, likePattern, `%${slugify(cleanQuery)}%`);

  const songs = songsRaw.map(formatSongRow);

  // 3. Search Albums
  const albums = db.prepare(`
    SELECT alb.id, alb.name, alb.album_artist, alb.large_image_url, alb.genre,
      COUNT(m.id) AS song_count
    FROM album alb
    LEFT JOIN media_file m ON alb.id = m.album_id
    WHERE alb.name LIKE ? OR alb.album_artist LIKE ?
    GROUP BY alb.id
    ORDER BY song_count DESC
    LIMIT 6
  `).all(likePattern, likePattern);

  res.json({
    data: {
      query,
      songs,
      artists,
      albums
    }
  });
});

/**
 * Instant Search Suggestions / Autocomplete
 * GET /api/search/suggestions?q=an
 */
router.get('/suggestions', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) {
    return res.json({ data: [] });
  }

  const likePattern = `%${query}%`;
  const songSuggestions = db.prepare(`
    SELECT DISTINCT title AS text, 'song' AS type FROM media_file
    WHERE title LIKE ? AND (is_active = 1 OR is_active IS NULL)
    LIMIT 4
  `).all(likePattern);

  const artistSuggestions = db.prepare(`
    SELECT DISTINCT a.name AS text, 'artist' AS type
    FROM artist a
    JOIN media_file_artists mfa ON a.id = mfa.artist_id
    WHERE a.name LIKE ?
    LIMIT 4
  `).all(likePattern);

  const albumSuggestions = db.prepare(`
    SELECT DISTINCT name AS text, 'album' AS type FROM album
    WHERE name LIKE ?
    LIMIT 3
  `).all(likePattern);

  res.json({
    data: [...songSuggestions, ...artistSuggestions, ...albumSuggestions]
  });
});

module.exports = router;
