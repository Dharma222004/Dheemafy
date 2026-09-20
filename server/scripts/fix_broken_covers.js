const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '..', '..', 'data', 'navidrome.db');
console.log('Connecting to database at:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA busy_timeout = 10000;');

const DEFAULT_COVER = '/images/default_cover.svg';

// 1. Update media_file
const mfCount = db.prepare(`
  SELECT count(*) as cnt FROM media_file 
  WHERE cover_image_url LIKE '%wikimedia%' 
     OR cover_image_url LIKE '%wikipedia%'
     OR cover_image_url IS NULL 
     OR cover_image_url = ''
`).all()[0].cnt;

console.log(`Found ${mfCount} media_file records needing fallback cover.`);

if (mfCount > 0) {
  const stmt = db.prepare(`
    UPDATE media_file 
    SET cover_image_url = ? 
    WHERE cover_image_url LIKE '%wikimedia%' 
       OR cover_image_url LIKE '%wikipedia%'
       OR cover_image_url IS NULL 
       OR cover_image_url = ''
  `);
  stmt.run(DEFAULT_COVER);
  console.log(`Updated ${mfCount} media_file records to ${DEFAULT_COVER}`);
}

// 2. Update artist table
try {
  const artCount = db.prepare(`
    SELECT count(*) as cnt FROM artist 
    WHERE large_image_url LIKE '%wikimedia%' 
       OR large_image_url LIKE '%wikipedia%'
       OR large_image_url IS NULL 
       OR large_image_url = ''
  `).all()[0].cnt;
  console.log(`Found ${artCount} artist records with wikimedia/null image.`);
  if (artCount > 0) {
    db.prepare(`
      UPDATE artist 
      SET large_image_url = ? 
      WHERE large_image_url LIKE '%wikimedia%' 
         OR large_image_url LIKE '%wikipedia%'
         OR large_image_url IS NULL 
         OR large_image_url = ''
    `).run(DEFAULT_COVER);
    console.log(`Updated ${artCount} artist records to ${DEFAULT_COVER}`);
  }
} catch (e) {
  console.log('Artist update note:', e.message);
}

// 3. Update album table
try {
  const albCount = db.prepare(`
    SELECT count(*) as cnt FROM album 
    WHERE large_image_url LIKE '%wikimedia%' 
       OR large_image_url LIKE '%wikipedia%'
       OR large_image_url IS NULL 
       OR large_image_url = ''
  `).all()[0].cnt;
  console.log(`Found ${albCount} album records with wikimedia/null image.`);
  if (albCount > 0) {
    db.prepare(`
      UPDATE album 
      SET large_image_url = ? 
      WHERE large_image_url LIKE '%wikimedia%' 
         OR large_image_url LIKE '%wikipedia%'
         OR large_image_url IS NULL 
         OR large_image_url = ''
    `).run(DEFAULT_COVER);
    console.log(`Updated ${albCount} album records to ${DEFAULT_COVER}`);
  }
} catch (e) {
  console.log('Album update note:', e.message);
}

console.log('Done!');
