const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const db = new DatabaseSync(path.resolve(__dirname, '../../data/navidrome.db'));
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA busy_timeout = 15000;');

async function checkFolder(folder) {
  let allResources = [];
  let nextCursor = null;

  do {
    const res = await cloudinary.search
      .expression(`resource_type:video AND (asset_folder:"${folder}" OR folder:"${folder}")`)
      .max_results(500)
      .next_cursor(nextCursor)
      .execute();

    if (res.resources && res.resources.length > 0) {
      allResources = allResources.concat(res.resources);
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);

  return allResources;
}

async function run() {
  const folders = ['All Songs', 'Sharu', 'Hills'];
  const allCloudinaryPubIds = new Map(); // pubId -> folder

  for (const f of folders) {
    const res = await checkFolder(f);
    console.log(`Cloudinary ${f}: ${res.length} assets`);
    for (const item of res) {
      allCloudinaryPubIds.set(item.public_id, f);
    }
  }

  console.log(`\nTotal unique assets in Cloudinary across 3 folders: ${allCloudinaryPubIds.size}`);

  const dbRows = db.prepare('SELECT id, cloudinary_public_id, folder, is_active FROM media_file').all();
  console.log(`Total rows in media_file: ${dbRows.length}`);

  let orphans = 0;
  let folderMismatches = 0;

  db.exec('BEGIN TRANSACTION;');

  const updateFolder = db.prepare('UPDATE media_file SET folder = ?, is_active = 1 WHERE id = ?');
  const deactivateOrphan = db.prepare('UPDATE media_file SET is_active = 0 WHERE id = ?');

  for (const row of dbRows) {
    if (!allCloudinaryPubIds.has(row.cloudinary_public_id)) {
      console.log(`Orphaned row (not in Cloudinary): [${row.folder}] ${row.cloudinary_public_id}`);
      deactivateOrphan.run(row.id);
      orphans++;
    } else {
      const correctFolder = allCloudinaryPubIds.get(row.cloudinary_public_id);
      if (row.folder !== correctFolder || row.is_active !== 1) {
        updateFolder.run(correctFolder, row.id);
        folderMismatches++;
      }
    }
  }

  db.exec('COMMIT;');

  console.log(`Deactivated ${orphans} orphaned records.`);
  console.log(`Updated ${folderMismatches} folder mismatch / inactive records.`);

  const finalCounts = db.prepare(`
    SELECT folder, is_active, COUNT(*) as count
    FROM media_file
    GROUP BY folder, is_active
  `).all();

  console.log('\nFinal DB counts:');
  console.log(finalCounts);
}

run().catch(console.error);
