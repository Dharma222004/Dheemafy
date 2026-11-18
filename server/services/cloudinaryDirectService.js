/**
 * CLOUDINARY DIRECT SERVICE
 * ============================================================
 * Fetches the song catalog directly from Cloudinary API.
 * This is the PRIMARY source of truth for all song data.
 *
 * Why: Vercel serverless functions have ephemeral /tmp storage,
 * so SQLite writes don't persist across cold starts. This service
 * fetches directly from Cloudinary so new uploads always appear
 * automatically — no code push or redeploy needed ever.
 *
 * Cache: Module-level in-memory cache with 5-minute TTL.
 * Invalidation: Called by the /api/cloudinary-webhook endpoint.
 * ============================================================
 */

const crypto = require('node:crypto');
const cloudinaryService = require('./cloudinary');
const { parseFromPublicId, normalizeStr, loadAllMetadata } = require('./metadataParser');
const { resolveSongCover } = require('./mediaArtwork');

// ----------------------------------------------------------------
// MODULE-LEVEL CACHE  (survives across requests in same instance)
// ----------------------------------------------------------------
let _songs      = [];      // cached song array
let _fetchedAt  = 0;       // timestamp of last successful fetch
let _version    = null;    // version string (count-timestamp)
let _fetchPromise = null;  // in-flight deduplication promise
let _metadataCache = null; // parsed .txt metadata files (read once)

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/** Invalidate cache — next getCachedSongs() will re-fetch Cloudinary */
function invalidateCache() {
  _songs     = [];
  _fetchedAt = 0;
  _version   = `invalidated-${Date.now()}`;
  _fetchPromise = null;
  console.log('[CloudinaryDirect] Cache invalidated — will re-fetch on next request.');
}

/** Returns current version string for the /api/songs/version endpoint */
function getCacheVersion() { return _version; }

/** Returns current cached song count without triggering a fetch */
function getCachedCount()   { return _songs.length; }

/** Returns the cached songs without fetching (may be empty) */
function getInMemorySongs() { return _songs; }

/**
 * Main entry point.
 * Returns the song catalog from cache or fetches fresh from Cloudinary.
 * @param {boolean} forceRefresh - bypass TTL and re-fetch now
 * @param {string}  folder       - Cloudinary folder name (default "Songs")
 */
async function getCachedSongs(forceRefresh = false, folder = 'Songs') {
  const now = Date.now();
  const isFresh = _songs.length > 0 && (now - _fetchedAt) < CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return _songs;
  }

  // Deduplicate concurrent in-flight requests
  if (_fetchPromise) {
    return _fetchPromise;
  }

  _fetchPromise = _doFetch(folder)
    .then(songs => {
      _songs     = songs;
      _fetchedAt = Date.now();
      _version   = `cld-${songs.length}-${_fetchedAt}`;
      _fetchPromise = null;
      return songs;
    })
    .catch(err => {
      _fetchPromise = null;
      console.error('[CloudinaryDirect] Fetch error:', err.message || err);
      // Return stale cache if available rather than crashing
      if (_songs.length > 0) {
        console.warn('[CloudinaryDirect] Returning stale cache due to fetch error.');
        return _songs;
      }
      throw err;
    });

  return _fetchPromise;
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/** Stable, URL-safe song ID derived from Cloudinary public_id */
function _makeId(publicId) {
  return 'cld-' + crypto.createHash('sha1').update(publicId).digest('hex').slice(0, 20);
}

/** Load metadata .txt files once per process lifetime */
function _getMetadata() {
  if (_metadataCache !== null) return _metadataCache;
  try {
    _metadataCache = loadAllMetadata();
    console.log(`[CloudinaryDirect] Loaded ${_metadataCache.length} metadata entries.`);
  } catch (e) {
    console.warn('[CloudinaryDirect] Could not load metadata files:', e.message);
    _metadataCache = [];
  }
  return _metadataCache;
}

/** Parse a Cloudinary resource into a structured song object */
function _parseResource(res, metadataSongs) {
  const pubId = res.public_id;

  // ---- Folder extraction ----
  const rawFolder = res.asset_folder || res.folder || '';
  let folderName = null;
  if (rawFolder.startsWith('Songs/')) {
    folderName = rawFolder.replace(/^Songs\//, '').trim();
  } else if (rawFolder && rawFolder !== 'Songs') {
    folderName = rawFolder.trim();
  }

  // ---- Title / artist extraction from public_id ----
  let rawPubId     = pubId.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');
  let rawTitlePart = rawPubId;
  let rawArtistPart = '';

  if (rawPubId.includes('_-_')) {
    const parts  = rawPubId.split('_-_');
    rawArtistPart = parts[0].replace('Vivek-Mervin', 'Vivek - Mervin');
    rawTitlePart  = parts.slice(1).join('_-_');
  } else if (rawPubId.includes(' - ')) {
    const parts  = rawPubId.split(' - ');
    rawArtistPart = parts[0].replace('Vivek-Mervin', 'Vivek - Mervin');
    rawTitlePart  = parts.slice(1).join(' - ');
  }

  const cleanTitlePart = rawTitlePart
    .replace(/_from_.*$/i, '')
    .replace(/ - from .*$/i, '');
  const normTitlePart  = normalizeStr(cleanTitlePart);
  const normArtistPart = normalizeStr(rawArtistPart);

  // ---- Match against structured metadata files ----
  let matchedMeta = null;
  for (const meta of metadataSongs) {
    const normTitle = normalizeStr(meta.title);
    if (!normTitle || normTitle.length < 2) continue;
    if (normTitlePart === normTitle) {
      if (rawArtistPart) {
        const hasMatch = meta.artists.some(a => {
          const normA = normalizeStr(a);
          return normA.length >= 3 && normArtistPart.includes(normA);
        });
        if (hasMatch) { matchedMeta = meta; break; }
      } else {
        matchedMeta = meta;
        break;
      }
    }
  }

  // ---- Fallback: parse from public_id filename ----
  if (!matchedMeta) {
    matchedMeta = parseFromPublicId(pubId);
  }

  const title        = matchedMeta.title  || pubId.split('/').pop() || pubId;
  const artists      = (matchedMeta.artists && matchedMeta.artists.length > 0)
                        ? matchedMeta.artists
                        : ['Various Artists'];
  const artistString = artists.join(', ');
  const movie        = matchedMeta.movie  || null;
  const album        = matchedMeta.album  || movie || 'Tamil Hits';
  const language     = matchedMeta.language || 'Tamil';

  const audioUrl      = res.secure_url || cloudinaryService.getAudioStreamUrl(pubId);
  const duration      = Math.round(Number(res.duration) || 0);
  const coverImageUrl = resolveSongCover(title, movie, artists[0]);
  const year          = res.created_at
                          ? new Date(res.created_at).getFullYear()
                          : new Date().getFullYear();
  const songId        = _makeId(pubId);

  return {
    // Core fields
    id:                  songId,
    path:                pubId,
    title,
    artist:              artistString,
    artists,
    artists_json:        JSON.stringify(artists),
    artist_id:           null,
    album,
    album_id:            null,
    album_artist:        artists[0],
    album_artist_id:     null,
    movie,
    duration,
    size:                Number(res.bytes) || 5000000,
    suffix:              res.format || 'mp3',
    genre:               'Soundtrack',
    language,
    year,
    has_cover_art:       1,
    // URL fields (both naming conventions for frontend compatibility)
    cover_image_url:     coverImageUrl,
    coverImageUrl,
    audio_url:           audioUrl,
    audioUrl,
    cloudinary_public_id: pubId,
    cloudinaryPublicId:  pubId,
    // Organisational
    folder:              folderName,
    is_active:           1,
    is_liked:            false,
    created_at:          res.created_at || new Date().toISOString(),
    updated_at:          res.created_at || new Date().toISOString()
  };
}

/** Check whether two parsed song objects are duplicates of each other */
function areSongsDuplicate(a, b) {
  const titleA = normalizeStr(a.title);
  const titleB = normalizeStr(b.title);
  if (!titleA || !titleB) return false;
  if (titleA !== titleB) return false;

  // Same normalized title.
  // Check if same movie
  if (a.movie && b.movie && normalizeStr(a.movie) === normalizeStr(b.movie)) {
    return true;
  }

  // Check artist word overlap
  const wordsA = (a.artist || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const wordsB = (b.artist || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const setB = new Set(wordsB);
  const common = wordsA.filter(w => setB.has(w));
  if (common.length >= 1) {
    return true;
  }

  // Check filename overlap
  const fileA = (a.cloudinary_public_id || '').toLowerCase().replace(/^\d+[-_]/, '');
  const fileB = (b.cloudinary_public_id || '').toLowerCase().replace(/^\d+[-_]/, '');
  if (fileA === fileB || fileA.includes(fileB) || fileB.includes(fileA)) {
    return true;
  }

  // If both artists are generic (empty or Various Artists) and title is identical
  if ((wordsA.length === 0 || wordsB.length === 0) && titleA === titleB) {
    return true;
  }

  return false;
}

/** Deduplicate songs keeping the highest-quality version of each track */
function deduplicateCatalog(songs) {
  const uniqueSongs = [];
  for (const song of songs) {
    const existingIdx = uniqueSongs.findIndex(s => areSongsDuplicate(s, song));
    if (existingIdx === -1) {
      uniqueSongs.push(song);
    } else {
      const existing = uniqueSongs[existingIdx];
      const existingHasNum = /^\d+[-_]/.test(existing.cloudinary_public_id);
      const newHasNum = /^\d+[-_]/.test(song.cloudinary_public_id);
      // Prefer: has folder ('Sharu', 'Hills', 'All Songs') > no folder
      // Prefer: clean public_id without leading numbers like '37-_'
      // Prefer: has movie metadata
      // Prefer: longer duration
      const preferNew = (!existing.folder && song.folder) ||
                        (existingHasNum && !newHasNum) ||
                        (!existing.movie && song.movie) ||
                        ((song.duration || 0) > (existing.duration || 0));
      if (preferNew) {
        uniqueSongs[existingIdx] = song;
      }
    }
  }
  return uniqueSongs;
}

/** Fetch, parse, deduplicate, and sort all Cloudinary audio resources */
async function _doFetch(folder = 'Songs') {
  if (!cloudinaryService.isConfigured()) {
    throw new Error('Cloudinary credentials are not configured.');
  }

  console.log(`[CloudinaryDirect] Fetching all audio resources from Cloudinary (folder="${folder}")...`);
  const resources = await cloudinaryService.scanAllAudioResources(folder);
  console.log(`[CloudinaryDirect] Cloudinary returned ${resources.length} resources.`);

  const metadataSongs = _getMetadata();
  const rawSongs      = [];
  const seenPubIds    = new Set();

  for (const res of resources) {
    try {
      const pubId = res.public_id;
      if (!pubId || seenPubIds.has(pubId)) continue;
      seenPubIds.add(pubId);

      const song = _parseResource(res, metadataSongs);
      rawSongs.push(song);
    } catch (err) {
      console.warn(`[CloudinaryDirect] Skipping ${res.public_id}:`, err.message);
    }
  }

  // Deduplicate songs (removes duplicate uploads across folders or numeric prefixes)
  const songs = deduplicateCatalog(rawSongs);

  // Sort alphabetically (same as DB ORDER BY LOWER(TRIM(title)))
  songs.sort((a, b) =>
    a.title.toLowerCase().localeCompare(b.title.toLowerCase(), 'en', { sensitivity: 'base' })
  );

  console.log(`[CloudinaryDirect] Parsed ${rawSongs.length} raw resources -> ${songs.length} unique deduplicated songs.`);
  return songs;
}

module.exports = {
  getCachedSongs,
  invalidateCache,
  getCacheVersion,
  getCachedCount,
  getInMemorySongs
};
