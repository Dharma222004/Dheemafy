const { DatabaseSync } = require('node:sqlite');

const dbSpot = new DatabaseSync('data/navidrome.db');
const dbNew = new DatabaseSync('C:/Users/chics/OneDrive/Desktop/new/data/navidrome.db');
dbSpot.exec('PRAGMA busy_timeout = 10000;');

// 1. Get 229 Sharu public_ids from new database
const sharuRows = dbNew.prepare(`
  SELECT cloudinary_public_id 
  FROM media_file 
  WHERE folder IS NOT NULL AND folder != 'All Songs'
`).all();
const sharuPubIds = new Set(sharuRows.map(r => r.cloudinary_public_id));
console.log('Sharu pubIds found in new db:', sharuPubIds.size);

// 2. Identify Hills songs in Spotkify
const hillsRows = dbSpot.prepare(`
  SELECT id, cloudinary_public_id 
  FROM media_file 
  WHERE LOWER(folder) LIKE '%hills%' OR LOWER(cloudinary_public_id) LIKE '%hills%'
`).all();
const hillsPubIds = new Set(hillsRows.map(r => r.cloudinary_public_id));
console.log('Hills pubIds found in Spotkify db:', hillsPubIds.size);

// 3. Update Spotkify database
dbSpot.exec('BEGIN TRANSACTION;');

// Set Hills folder
const setHills = dbSpot.prepare("UPDATE media_file SET folder = 'Hills' WHERE id = ?");
for (const h of hillsRows) {
  setHills.run(h.id);
}

// Set Sharu folder for the 229 songs
const setSharu = dbSpot.prepare("UPDATE media_file SET folder = 'Sharu' WHERE id = ?");
const spotRows = dbSpot.prepare('SELECT id, cloudinary_public_id, folder FROM media_file').all();
let sharuUpdated = 0;

for (const s of spotRows) {
  if (hillsPubIds.has(s.cloudinary_public_id)) {
    // Keep Hills
    continue;
  }
  if (sharuPubIds.has(s.cloudinary_public_id) || (s.folder && s.folder.toLowerCase().includes('sharu'))) {
    setSharu.run(s.id);
    sharuUpdated++;
  }
}

dbSpot.exec('COMMIT;');
console.log(`Updated ${sharuUpdated} songs to folder 'Sharu'`);
console.log(`Updated ${hillsRows.length} songs to folder 'Hills'`);

const summary = dbSpot.prepare(`
  SELECT folder, is_active, COUNT(*) as cnt 
  FROM media_file 
  GROUP BY folder, is_active
`).all();
console.log('\nFinal folder summary in Spotkify:');
console.log(summary);
