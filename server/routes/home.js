const express = require('express');
const db = require('../db/database');
const cloudinaryDirect = require('../services/cloudinaryDirectService');

const router = express.Router();

// -----------------------------------------------------------------------
// HOME ROUTE
// PRIMARY source: cloudinaryDirectService (always up-to-date, no SQLite writes)
// SECONDARY:      SQLite for user-specific data (likes, play counts, artists, albums, playlists)
// -----------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const userId = (req.user && req.user.id) || 'admin-user-id';

    // Fetch ALL songs from Cloudinary direct cache (or fresh if cache expired/invalidated)
    const allSongs = await cloudinaryDirect.getCachedSongs(false, 'Songs');

    // Enrich is_liked from SQLite annotation table
    let likedSet = new Set();
    try {
      const likedRows = db.prepare(
        `SELECT item_id FROM annotation WHERE user_id = ? AND starred = 1`
      ).all(userId);
      likedSet = new Set(likedRows.map(r => r.item_id));
    } catch (_) { /* ignore — SQLite may be empty on cold start */ }

    function enrichLiked(song) {
      return { ...song, is_liked: likedSet.has(song.id) };
    }

    // 1. Quick picks — recently played from scrobbles, fallback to newest songs
    let quickPicks = [];
    try {
      const recentIds = db.prepare(`
        SELECT DISTINCT s.media_file_id
        FROM scrobbles s
        WHERE s.user_id = ?
        ORDER BY s.submission_time DESC
        LIMIT 8
      `).all(userId).map(r => r.media_file_id);

      if (recentIds.length > 0) {
        const recentSet = new Set(recentIds);
        quickPicks = allSongs.filter(s => recentSet.has(s.id)).slice(0, 8).map(enrichLiked);
      }
    } catch (_) { /* scrobbles table might be empty */ }

    if (quickPicks.length === 0) {
      // Fallback: 8 newest by created_at
      quickPicks = [...allSongs]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 8)
        .map(enrichLiked);
    }

    // 2. Trending — sort by play count from SQLite annotation, fallback to newest
    let trendingMap = {};
    try {
      const playCounts = db.prepare(
        `SELECT item_id, SUM(play_count) AS total FROM annotation GROUP BY item_id`
      ).all();
      playCounts.forEach(r => { trendingMap[r.item_id] = Number(r.total) || 0; });
    } catch (_) { /* ignore */ }

    const trending = [...allSongs]
      .sort((a, b) => (trendingMap[b.id] || 0) - (trendingMap[a.id] || 0))
      .slice(0, 10)
      .map(enrichLiked);

    // 3. Tamil Hits — filter by language
    const tamilHits = allSongs
      .filter(s => s.language && s.language.toLowerCase() === 'tamil')
      .slice(0, 10)
      .map(enrichLiked);

    // 4. New Additions — sort by created_at desc
    const newAdditions = [...allSongs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(enrichLiked);

    // 5. Popular Artists (from SQLite — derived from media_file_artists)
    let popularArtists = [];
    try {
      popularArtists = db.prepare(`
        SELECT a.id, a.name, a.slug, a.large_image_url,
          COUNT(mfa.media_file_id) AS song_count
        FROM artist a
        JOIN media_file_artists mfa ON a.id = mfa.artist_id
        GROUP BY a.id
        ORDER BY song_count DESC, a.name ASC
        LIMIT 24
      `).all();
    } catch (_) { /* SQLite may be empty */ }

    // 6. Popular Albums (from SQLite)
    let popularAlbums = [];
    try {
      popularAlbums = db.prepare(`
        SELECT alb.id, alb.name, alb.album_artist, alb.large_image_url, alb.genre,
          COUNT(m.id) AS song_count
        FROM album alb
        LEFT JOIN media_file m ON alb.id = m.album_id
        GROUP BY alb.id
        ORDER BY song_count DESC
        LIMIT 8
      `).all();
    } catch (_) { /* SQLite may be empty */ }

    // 7. Featured Playlists (from SQLite)
    let featuredPlaylists = [];
    try {
      featuredPlaylists = db.prepare(`
        SELECT id, name, comment, duration, song_count, uploaded_image
        FROM playlist
        WHERE public = 1
        ORDER BY song_count DESC
      `).all();
    } catch (_) { /* SQLite may be empty */ }

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
  } catch (err) {
    console.error('[Home] Error:', err.message || err);
    res.status(500).json({ error: { message: 'Failed to load home data', detail: err.message } });
  }
});

module.exports = router;
