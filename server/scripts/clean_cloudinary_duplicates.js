/**
 * CLEAN CLOUDINARY DUPLICATES
 * ============================================================
 * Scans your Cloudinary account for duplicate audio uploads
 * (e.g. same song uploaded both at root with 37-_ prefix and in folders).
 *
 * Usage:
 *   node server/scripts/clean_cloudinary_duplicates.js
 *     -> Scans and lists duplicate files (DRY RUN - does NOT delete)
 *
 *   node server/scripts/clean_cloudinary_duplicates.js --delete
 *     -> Scans and PERMANENTLY deletes redundant duplicate files from Cloudinary
 * ============================================================
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { normalizeStr } = require('../services/metadataParser');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const isDeleteMode = process.argv.includes('--delete');

function parseSimple(publicId) {
  const parts = publicId.split('/');
  let filename = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, '');
  filename = filename.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');
  let artist = 'Various Artists';
  let title = filename.replace(/_/g, ' ');

  if (filename.includes('_-_')) {
    const split = filename.split('_-_');
    artist = split[0].replace(/_/g, ' ').trim();
    title = split.slice(1).join(' - ').replace(/_/g, ' ').trim();
  } else if (filename.includes(' - ')) {
    const split = filename.split(' - ');
    artist = split[0].trim();
    title = split.slice(1).join(' - ').trim();
  }

  // Remove "From Movie"
  title = title.replace(/[-_\s]*From\s+.*$/i, '').trim();

  return { title, artist, publicId };
}

function areDuplicate(a, b) {
  const tA = normalizeStr(a.title);
  const tB = normalizeStr(b.title);
  if (!tA || !tB || tA !== tB) return false;

  const wordsA = (a.artist || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const wordsB = (b.artist || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const setB = new Set(wordsB);
  const common = wordsA.filter(w => setB.has(w));
  if (common.length >= 1) return true;

  const fA = a.publicId.toLowerCase().replace(/^\d+[-_]/, '');
  const fB = b.publicId.toLowerCase().replace(/^\d+[-_]/, '');
  return fA === fB || fA.includes(fB) || fB.includes(fA);
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`Cloudinary Duplicates Cleaner`);
  console.log(`Mode: ${isDeleteMode ? '⚡ LIVE DELETE' : '🔍 DRY RUN (Preview only)'}`);
  console.log(`======================================================\n`);

  console.log('[1/3] Scanning all audio resources from Cloudinary...');
  let resources = [];
  let next = null;
  do {
    const opts = { resource_type: 'video', type: 'upload', max_results: 500 };
    if (next) opts.next_cursor = next;
    const r = await cloudinary.api.resources(opts);
    resources.push(...r.resources);
    next = r.next_cursor;
  } while (next);

  console.log(`Found ${resources.length} total audio files in Cloudinary.`);

  // Parse resources
  const parsedList = resources.map(r => ({
    ...parseSimple(r.public_id),
    folder: r.asset_folder || r.folder || null,
    bytes: r.bytes,
    created_at: r.created_at
  }));

  // Group duplicates
  console.log('[2/3] Analyzing duplicates...');
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < parsedList.length; i++) {
    if (assigned.has(i)) continue;
    const group = [parsedList[i]];
    assigned.add(i);

    for (let j = i + 1; j < parsedList.length; j++) {
      if (assigned.has(j)) continue;
      if (areDuplicate(parsedList[i], parsedList[j])) {
        group.push(parsedList[j]);
        assigned.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  console.log(`Found ${groups.length} duplicate groups across ${groups.reduce((acc, g) => acc + g.length, 0)} files.\n`);

  const toKeep = [];
  const toDelete = [];

  for (const group of groups) {
    // Score each file to pick the best one to keep
    group.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      // Prefer organized folder (Sharu, Hills, All Songs)
      if (a.folder) scoreA += 5;
      if (b.folder) scoreB += 5;
      // Penalize leading numbers e.g. "37-_"
      if (!/^\d+[-_]/.test(a.publicId)) scoreA += 4;
      if (!/^\d+[-_]/.test(b.publicId)) scoreB += 4;
      // Prefer larger file size (often higher bitrate)
      if (a.bytes > b.bytes) scoreA += 1;
      else if (b.bytes > a.bytes) scoreB += 1;

      return scoreB - scoreA;
    });

    const keep = group[0];
    const remove = group.slice(1);
    toKeep.push(keep);
    toDelete.push(...remove);

    console.log(`🎵 Song: "${keep.title}"`);
    console.log(`   ✅ KEEP:   ${keep.publicId} (folder: ${keep.folder || 'root'})`);
    remove.forEach(rem => {
      console.log(`   ❌ REMOVE: ${rem.publicId} (folder: ${rem.folder || 'root'})`);
    });
    console.log('');
  }

  console.log(`======================================================`);
  console.log(`Summary:`);
  console.log(`  Total files scanned:    ${resources.length}`);
  console.log(`  Unique songs:           ${resources.length - toDelete.length}`);
  console.log(`  Redundant duplicates:   ${toDelete.length}`);
  console.log(`======================================================\n`);

  if (!isDeleteMode) {
    console.log(`💡 NOTE: This was a DRY RUN. No files were deleted in Cloudinary.`);
    console.log(`   To permanently delete the ${toDelete.length} redundant duplicate files from Cloudinary, run:`);
    console.log(`   node server/scripts/clean_cloudinary_duplicates.js --delete\n`);
    return;
  }

  // Live delete mode
  console.log(`[3/3] Deleting ${toDelete.length} duplicate files from Cloudinary in batches...`);
  const publicIds = toDelete.map(d => d.publicId);
  const BATCH_SIZE = 50;

  for (let i = 0; i < publicIds.length; i += BATCH_SIZE) {
    const batch = publicIds.slice(i, i + BATCH_SIZE);
    try {
      const res = await cloudinary.api.delete_resources(batch, { resource_type: 'video' });
      console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(publicIds.length / BATCH_SIZE)}:`, Object.keys(res.deleted || {}).length, 'files removed.');
    } catch (err) {
      console.error(`Error deleting batch:`, err.message);
    }
  }

  console.log(`\n🎉 Done! Cleaned up ${toDelete.length} duplicate files in Cloudinary.`);
}

run().catch(console.error);
