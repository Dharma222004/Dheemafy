const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(path.resolve(__dirname, '../../data/navidrome.db'));
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA busy_timeout = 15000;');

db.exec('BEGIN TRANSACTION;');

// 1. Clean old playlist and playlist_tracks
db.exec('DELETE FROM playlist_tracks;');
db.exec('DELETE FROM playlist;');

const insertPlaylist = db.prepare(`
  INSERT INTO playlist (id, name, comment, song_count, duration, public, owner_id, uploaded_image, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, 'admin-user-id', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const insertPlaylistTrack = db.prepare(`
  INSERT INTO playlist_tracks (playlist_id, media_file_id)
  VALUES (?, ?)
`);

// Playlists to establish:
// All Songs: All songs unified in alphabetical order
const allSongs = db.prepare("SELECT id, duration FROM media_file WHERE is_active = 1 ORDER BY LOWER(TRIM(title)) ASC").all();
const allDur = allSongs.reduce((acc, s) => acc + (s.duration || 0), 0);
insertPlaylist.run('pl-all-songs', 'All Songs', 'Complete library with all songs in alphabetical order', allSongs.length, allDur, '/images/playlists/all_songs.svg');
for (const s of allSongs) {
  insertPlaylistTrack.run('pl-all-songs', s.id);
}

db.exec('COMMIT;');

console.log('Synchronized Playlists:');
console.log(db.prepare('SELECT id, name, song_count, duration, uploaded_image FROM playlist').all());
