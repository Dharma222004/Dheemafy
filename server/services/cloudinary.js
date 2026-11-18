require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// Load environment variables
let currentCloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
let currentApiKey = process.env.CLOUDINARY_API_KEY || '';
let currentApiSecret = process.env.CLOUDINARY_API_SECRET || '';
let defaultFolder = process.env.CLOUDINARY_FOLDER || 'music';

if (currentCloudName && currentApiKey && currentApiSecret) {
  cloudinary.config({
    cloud_name: currentCloudName,
    api_key: currentApiKey,
    api_secret: currentApiSecret,
    secure: true
  });
}

function isConfigured() {
  return Boolean(currentCloudName && currentApiKey && currentApiSecret);
}

function updateConfig({ cloudName, apiKey, apiSecret, folder }) {
  if (cloudName) currentCloudName = cloudName.trim();
  if (apiKey) currentApiKey = apiKey.trim();
  if (apiSecret) currentApiSecret = apiSecret.trim();
  if (folder) defaultFolder = folder.trim();

  cloudinary.config({
    cloud_name: currentCloudName,
    api_key: currentApiKey,
    api_secret: currentApiSecret,
    secure: true
  });
  return isConfigured();
}

/**
 * Scan audio resources from Cloudinary with pagination.
 * In Cloudinary, audio files (MP3, AAC, FLAC, WAV, OGG) are categorized under resource_type 'video'.
 */
async function scanAudioResources(folder = null, nextCursor = null) {
  if (!isConfigured()) {
    throw new Error('Cloudinary credentials are not fully configured in environment variables.');
  }

  const options = {
    resource_type: 'video',
    type: 'upload',
    max_results: 500
  };

  if (nextCursor) {
    options.next_cursor = nextCursor;
  }

  // If a specific folder prefix is requested and not 'Songs'
  if (folder && folder !== 'Songs' && folder !== 'music') {
    options.prefix = folder.endsWith('/') ? folder : `${folder}/`;
  }

  const result = await cloudinary.api.resources(options);
  return {
    resources: result.resources || [],
    nextCursor: result.next_cursor || null
  };
}

/**
 * Fetch ALL audio resources from Cloudinary across ALL pages.
 * Handles unlimited songs (500 per page × up to maxPages pages).
 */
async function scanAllAudioResources(folder = null, maxPages = 40) {
  const allResources = [];
  const seenCursors  = new Set();
  let nextCursor     = null;
  let page           = 0;

  console.log(`[Cloudinary] Starting full scan of audio resources...`);

  do {
    page++;
    if (nextCursor && seenCursors.has(nextCursor)) {
      console.warn('[Cloudinary] Duplicate cursor detected — breaking pagination loop.');
      break;
    }
    if (nextCursor) seenCursors.add(nextCursor);

    const res = await scanAudioResources(folder, nextCursor);
    const count = res.resources ? res.resources.length : 0;
    console.log(`[Cloudinary] Page ${page}: fetched ${count} resources (nextCursor: ${res.nextCursor ? 'yes' : 'no'})`);

    if (count > 0) {
      allResources.push(...res.resources);
    }

    nextCursor = res.nextCursor;
  } while (nextCursor && page < maxPages);

  console.log(`[Cloudinary] Full scan complete: ${allResources.length} total resources across ${page} page(s).`);
  return allResources;
}

/**
 * Generate secure direct CDN playback URL
 */
function getAudioStreamUrl(publicId, secureUrl = null) {
  if (secureUrl) return secureUrl;
  if (!publicId) return '';
  if (!isConfigured() && !publicId.startsWith('http')) {
    return `https://res.cloudinary.com/${currentCloudName || 'demo'}/video/upload/${publicId}`;
  }
  return cloudinary.url(publicId, {
    resource_type: 'video',
    secure: true
  });
}

/**
 * Generate optimized artwork URLs with responsive Cloudinary transformations
 */
function getArtworkUrls(publicIdOrUrl) {
  if (!publicIdOrUrl) {
    return {
      thumbnail: '',
      small: '',
      medium: '',
      large: ''
    };
  }

  if (publicIdOrUrl.startsWith('http')) {
    // If it's already a full URL
    return {
      thumbnail: publicIdOrUrl,
      small: publicIdOrUrl,
      medium: publicIdOrUrl,
      large: publicIdOrUrl
    };
  }

  return {
    thumbnail: cloudinary.url(publicIdOrUrl, {
      width: 64,
      height: 64,
      crop: 'fill',
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    }),
    small: cloudinary.url(publicIdOrUrl, {
      width: 160,
      height: 160,
      crop: 'fill',
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    }),
    medium: cloudinary.url(publicIdOrUrl, {
      width: 320,
      height: 320,
      crop: 'fill',
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    }),
    large: cloudinary.url(publicIdOrUrl, {
      width: 640,
      height: 640,
      crop: 'fill',
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    })
  };
}

module.exports = {
  isConfigured,
  updateConfig,
  scanAudioResources,
  scanAllAudioResources,
  getAudioStreamUrl,
  getArtworkUrls,
  defaultFolder
};
