const express = require('express');
const crypto = require('node:crypto');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function makeId() {
  return `pl-${crypto.randomBytes(8).toString('hex')}`;
}

// Get user playlists
router.get('/', authMiddleware, (req, res) => {
  const userId = req.user ? req.user.id : 'admin-user-id';
  const playlists = db.prepare(`
    SELECT p.id, p.name, p.comment, p.duration, p.song_count, p.public, p.uploaded_image, p.created_at
    FROM playlist p
    WHERE p.owner_id = ? OR p.public = 1
    ORDER BY p.created_at DESC
  `).all(userId);

  res.json({ data: playlists });
});

// Create playlist
router.post('/', authMiddleware, (req, res) => {
  const userId = req.user ? req.user.id : 'admin-user-id';
  const { name, comment } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Playlist name required' } });
  }

  const id = makeId();
  db.prepare(`
    INSERT INTO playlist (id, name, comment, song_count, duration, public, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, 0, 0, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(id, name.trim(), comment || '', userId);

  const created = db.prepare('SELECT * FROM playlist WHERE id = ?').get(id);
  res.status(201).json({ data: created });
});

// Get playlist detail with songs
router.get('/:id', authMiddleware, (req, res) => {
  const userId = req.user ? req.user.id : 'admin-user-id';
  const playlist = db.prepare('SELECT * FROM playlist WHERE id = ? OR LOWER(name) = LOWER(?)').get(req.params.id, req.params.id);

  if (!playlist) {
    return res.status(404).json({ error: { code: 'PLAYLIST_NOT_FOUND', message: 'Playlist not found' } });
  }

  const tracks = db.prepare(`
    SELECT m.id, m.title, m.artist, m.artists_json, m.album, m.movie, m.duration, m.cover_image_url,
      m.audio_url, m.cloudinary_public_id, m.genre, m.language, m.folder, pt.id AS playlist_track_id,
      EXISTS(SELECT 1 FROM annotation a WHERE a.user_id = ? AND a.item_id = m.id AND a.starred = 1) AS is_liked
    FROM playlist_tracks pt
    JOIN media_file m ON pt.media_file_id = m.id
    WHERE pt.playlist_id = ?
    ORDER BY LOWER(TRIM(m.title)) ASC
  `).all(userId, playlist.id);

  res.json({
    data: {
      ...playlist,
      tracks
    }
  });
});

// Add song to playlist
router.post('/:id/songs', authMiddleware, (req, res) => {
  const { songId } = req.body || {};
  if (!songId) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'songId required' } });
  }

  const playlist = db.prepare('SELECT id FROM playlist WHERE id = ?').get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: { code: 'PLAYLIST_NOT_FOUND', message: 'Playlist not found' } });
  }

  db.prepare('INSERT INTO playlist_tracks (playlist_id, media_file_id) VALUES (?, ?)').run(playlist.id, songId);

  // Update count & duration
  db.prepare(`
    UPDATE playlist SET
      song_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?),
      duration = (SELECT COALESCE(SUM(m.duration), 0) FROM playlist_tracks pt JOIN media_file m ON pt.media_file_id = m.id WHERE pt.playlist_id = ?),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(playlist.id, playlist.id, playlist.id);

  res.json({ status: 'added', playlistId: playlist.id, songId });
});

// Remove song from playlist
router.delete('/:id/songs/:songId', authMiddleware, (req, res) => {
  const playlist = db.prepare('SELECT id FROM playlist WHERE id = ?').get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: { code: 'PLAYLIST_NOT_FOUND', message: 'Playlist not found' } });
  }

  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND media_file_id = ?').run(playlist.id, req.params.songId);

  // Update count & duration
  db.prepare(`
    UPDATE playlist SET
      song_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?),
      duration = (SELECT COALESCE(SUM(m.duration), 0) FROM playlist_tracks pt JOIN media_file m ON pt.media_file_id = m.id WHERE pt.playlist_id = ?),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(playlist.id, playlist.id, playlist.id);

  res.json({ status: 'removed', playlistId: playlist.id, songId: req.params.songId });
});

// Delete playlist
router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(req.params.id);
  db.prepare('DELETE FROM playlist WHERE id = ?').run(req.params.id);
  res.json({ status: 'deleted', playlistId: req.params.id });
});

module.exports = router;
