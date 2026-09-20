const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { loadAllMetadata, normalizeStr } = require('../services/metadataParser');

const db = new DatabaseSync('data/navidrome.db');
db.exec('PRAGMA busy_timeout = 10000;');

const metadataSongs = loadAllMetadata();

function parseFromPublicId(pubId) {
  let clean = pubId
    .replace(/^Songs\//i, '')
    .replace(/^Tamil Hits\//i, '')
    .replace(/\.[a-z0-9]+$/i, '');

  // Protect hyphenated artists
  clean = clean.replace(/Vivek_-_Mervin/gi, 'Vivek-Mervin');
  clean = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  let artistPart = 'Various Artists';
  let titlePart = clean;
  let movie = null;

  if (clean.includes(' - ')) {
    const split = clean.split(' - ');
    artistPart = split[0].trim().replace(/Vivek-Mervin/gi, 'Vivek - Mervin');
    titlePart = split.slice(1).join(' - ').trim();
  }

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
    album: movie || 'Tamil Hits'
  };
}

function matchResource(pubId) {
  let rawPubId = pubId.replace(/Vivek_-_Mervin/gi, 'Vivek-Mervin');
  let rawTitlePart = rawPubId;
  let rawArtistPart = '';

  if (rawPubId.includes('_-_')) {
    const parts = rawPubId.split('_-_');
    rawArtistPart = parts[0].replace(/Vivek-Mervin/gi, 'Vivek - Mervin');
    rawTitlePart = parts.slice(1).join('_-_');
  } else if (rawPubId.includes(' - ')) {
    const parts = rawPubId.split(' - ');
    rawArtistPart = parts[0].replace(/Vivek-Mervin/gi, 'Vivek - Mervin');
    rawTitlePart = parts.slice(1).join(' - ');
  }

  const cleanTitlePart = rawTitlePart.replace(/_from_.*$/i, '').replace(/ - from .*$/i, '');
  const normTitlePart = normalizeStr(cleanTitlePart);
  const normArtistPart = normalizeStr(rawArtistPart);

  let matchedMeta = null;
  for (const meta of metadataSongs) {
    const normTitle = normalizeStr(meta.title);
    if (!normTitle || normTitle.length < 2) continue;

    // Strict equality on the title part
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

  if (!matchedMeta) {
    matchedMeta = parseFromPublicId(pubId);
  }
  return matchedMeta;
}

function getPrimaryArtist(artistStr) {
  if (!artistStr) return '';
  return artistStr.split(',')[0].split('&')[0].trim();
}

console.log('[Step 1] Fixing all misidentified titles in database...');
const allRows = db.prepare('SELECT id, title, artist, cloudinary_public_id, is_active FROM media_file').all();

const updateStmt = db.prepare(`
  UPDATE media_file 
  SET title = ?, artist = ?, movie = ?, album = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

db.exec('BEGIN TRANSACTION;');
let fixedCount = 0;
for (const row of allRows) {
  const meta = matchResource(row.cloudinary_public_id);
  if (meta && meta.title) {
    const titleChanged = meta.title.toLowerCase().trim() !== row.title.toLowerCase().trim();
    if (titleChanged) {
      console.log(`FIX: [${row.id}] "${row.title}" -> "${meta.title}" (${meta.artistString})`);
      fixedCount++;
    }
    updateStmt.run(meta.title, meta.artistString, meta.movie || null, meta.album || 'Tamil Hits', row.id);
  }
}
db.exec('COMMIT;');
console.log(`Fixed titles count: ${fixedCount}`);

console.log('\n[Step 2] Deduplicating songs so each song displays exactly ONCE...');
const freshRows = db.prepare(`
  SELECT id, title, artist, album, movie, duration, audio_url, cover_image_url, cloudinary_public_id
  FROM media_file
  ORDER BY id ASC
`).all();

const groups = new Map();
for (const row of freshRows) {
  const normTitle = normalizeStr(row.title);
  const primaryArt = getPrimaryArtist(row.artist);
  const normArt = normalizeStr(primaryArt);
  const key = `${normTitle}___${normArt}`;

  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key).push(row);
}

const deactivateStmt = db.prepare('UPDATE media_file SET is_active = 0 WHERE id = ?');
const activateStmt = db.prepare('UPDATE media_file SET is_active = 1 WHERE id = ?');

db.exec('BEGIN TRANSACTION;');
let dupeGroups = 0;
let deactivatedCount = 0;

for (const [key, songList] of groups.entries()) {
  if (songList.length > 1) {
    dupeGroups++;
    // Sort to pick best copy:
    songList.sort((a, b) => {
      const scoreA = (a.movie ? 10 : 0) + (a.cover_image_url ? 5 : 0) + (a.duration > 0 ? 5 : 0);
      const scoreB = (b.movie ? 10 : 0) + (b.cover_image_url ? 5 : 0) + (b.duration > 0 ? 5 : 0);
      return scoreB - scoreA;
    });

    const keep = songList[0];
    const removeList = songList.slice(1);

    activateStmt.run(keep.id);
    for (const rem of removeList) {
      deactivateStmt.run(rem.id);
      deactivatedCount++;
    }
  } else {
    activateStmt.run(songList[0].id);
  }
}
db.exec('COMMIT;');

console.log(`Duplicate groups found & resolved: ${dupeGroups}`);
console.log(`Deactivated duplicates: ${deactivatedCount}`);

const activeSongs = db.prepare(`
  SELECT id, title, artist, cloudinary_public_id 
  FROM media_file 
  WHERE is_active = 1
`).all();

console.log(`Active unique songs remaining: ${activeSongs.length}`);

// Specifically verify Aathi
const aathis = db.prepare(`
  SELECT id, title, artist, cloudinary_public_id, is_active 
  FROM media_file 
  WHERE LOWER(TRIM(title)) = 'aathi' AND is_active = 1
`).all();
console.log('\nVerification - Active "Aathi" tracks:', JSON.stringify(aathis, null, 2));

// Verify Vaathi Kabaddi and Vaathi Raid
const vaathis = db.prepare(`
  SELECT id, title, artist, cloudinary_public_id, is_active 
  FROM media_file 
  WHERE LOWER(TRIM(title)) LIKE '%vaathi%' AND is_active = 1
`).all();
console.log('\nVerification - Active "Vaathi" tracks:', JSON.stringify(vaathis, null, 2));
