const express = require('express');
const db = require('../db/database');
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

router.get('/', async (req, res) => {
  await ensureFreshCatalog();
  const userId = (req.user && req.user.id) || 'admin-user-id';

  // 1. Quick picks / Recently Played
  const recentlyPlayedRaw = db.prepare(`
    SELECT DISTINCT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM scrobbles s
    JOIN media_file m ON s.media_file_id = m.id
    WHERE s.user_id = ? AND (m.is_active = 1 OR m.is_active IS NULL)
    ORDER BY s.submission_time DESC
    LIMIT 8
  `).all(userId, userId);

  const fallbackQuickPicksRaw = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE m.is_active = 1 OR m.is_active IS NULL
    ORDER BY m.created_at DESC
    LIMIT 6
  `).all(userId);

  const quickPicks = (recentlyPlayedRaw.length > 0 ? recentlyPlayedRaw : fallbackQuickPicksRaw).map(formatSongRow);

  // 2. Trending songs
  const trendingRaw = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      COALESCE((SELECT SUM(play_count) FROM annotation WHERE item_id = m.id), 0) AS play_count,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE m.is_active = 1 OR m.is_active IS NULL
    ORDER BY play_count DESC, m.created_at DESC
    LIMIT 10
  `).all(userId);

  const trending = trendingRaw.map(formatSongRow);

  // 3. Tamil Hits
  const tamilHitsRaw = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE (LOWER(m.language) = 'tamil' OR LOWER(m.genre) LIKE '%tamil%')
      AND (m.is_active = 1 OR m.is_active IS NULL)
    LIMIT 10
  `).all(userId);

  const tamilHits = tamilHitsRaw.map(formatSongRow);

  // 4. New Additions
  const newAdditionsRaw = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.album, m.album_artist, m.movie, m.duration,
      m.cover_image_url, m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM media_file m
    WHERE m.is_active = 1 OR m.is_active IS NULL
    ORDER BY m.created_at DESC
    LIMIT 10
  `).all(userId);

  const newAdditions = newAdditionsRaw.map(formatSongRow);

  // 5. Popular Artists (Dynamically derived from media_file_artists)
  const popularArtists = db.prepare(`
    SELECT a.id, a.name, a.slug, a.large_image_url,
      COUNT(mfa.media_file_id) AS song_count
    FROM artist a
    JOIN media_file_artists mfa ON a.id = mfa.artist_id
    GROUP BY a.id
    ORDER BY song_count DESC, a.name ASC
    LIMIT 24
  `).all();

  // 6. Popular Albums
  const popularAlbums = db.prepare(`
    SELECT alb.id, alb.name, alb.album_artist, alb.large_image_url, alb.genre,
      COUNT(m.id) AS song_count
    FROM album alb
    LEFT JOIN media_file m ON alb.id = m.album_id
    GROUP BY alb.id
    ORDER BY song_count DESC
    LIMIT 8
  `).all();

  // 7. Featured Folder Playlists
  const featuredPlaylists = db.prepare(`
    SELECT id, name, comment, duration, song_count, uploaded_image
    FROM playlist
    WHERE public = 1
    ORDER BY song_count DESC
  `).all();

  res.json({
    data: {
      quickPicks,
      trending,
      tamilHits,
      newAdditions,
      popularArtists,
      popularAlbums,
      featuredPlaylists
    }
  });
});

module.exports = router;
