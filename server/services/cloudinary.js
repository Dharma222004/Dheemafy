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
 * Scan audio resources from Cloudinary with pagination
 * In Cloudinary, audio files (MP3, AAC, FLAC, WAV, OGG) are categorized under resource_type 'video'.
 */
async function scanAudioResources(folder = defaultFolder, nextCursor = null) {
  if (!isConfigured()) {
    throw new Error('Cloudinary credentials are not fully configured in environment variables.');
  }

  // 1. Try Cloudinary Search API first (Cloudinary Search returns duration and comprehensive metadata)
  try {
    let expression = 'resource_type:video';
    if (folder) {
      expression += ` AND (folder:${folder}* OR asset_folder:${folder}* OR folder:"${folder}" OR asset_folder:"${folder}")`;
    }
    const searchReq = cloudinary.search
      .expression(expression)
      .max_results(500);

    if (nextCursor) {
      searchReq.next_cursor(nextCursor);
    }

    const searchResult = await searchReq.execute();
    if (searchResult && searchResult.resources && searchResult.resources.length > 0) {
      return {
        resources: searchResult.resources,
        nextCursor: searchResult.next_cursor || null
      };
    }
  } catch (searchErr) {
    const errorMsg = searchErr?.error?.message || searchErr?.message || String(searchErr);
    const isRateLimit = searchErr?.error?.http_code === 420 || searchErr?.http_code === 420 || errorMsg.includes('Rate Limit');
    if (isRateLimit) {
      throw searchErr;
    }
    console.warn('[Cloudinary] Search API note, falling back to Admin API:', errorMsg);
  }

  // 2. Try resources_by_asset_folder if a folder is specified
  if (folder) {
    try {
      const assetOptions = { max_results: 500 };
      if (nextCursor) assetOptions.next_cursor = nextCursor;
      const assetResult = await cloudinary.api.resources_by_asset_folder(folder, assetOptions);
      if (assetResult && assetResult.resources && assetResult.resources.length > 0) {
        return {
          resources: assetResult.resources,
          nextCursor: assetResult.next_cursor || null
        };
      }
    } catch (err) {
      const isRateLimit = err?.error?.http_code === 420 || err?.http_code === 420 || (err?.error?.message && err.error.message.includes('Rate Limit'));
      if (isRateLimit) throw err;
      console.warn(`[Cloudinary] Note on asset_folder scan for "${folder}":`, err?.error?.message || err?.message || err);
    }
  }

  // 3. Try prefix-based scanning
  const options = {
    resource_type: 'video',
    type: 'upload',
    prefix: folder ? (folder.endsWith('/') ? folder : `${folder}/`) : '',
    max_results: 500
  };

  if (nextCursor) {
    options.next_cursor = nextCursor;
  }

  const result = await cloudinary.api.resources(options);

  // 4. If prefix returned 0 resources, try scanning video resources directly
  if ((!result.resources || result.resources.length === 0) && folder) {
    try {
      const allRes = await cloudinary.api.resources({
        resource_type: 'video',
        type: 'upload',
        max_results: 500
      });
      if (allRes && allRes.resources && allRes.resources.length > 0) {
        const filtered = allRes.resources.filter(r => 
          r.asset_folder === folder || r.folder === folder || (r.public_id && r.public_id.includes(folder))
        );
        return {
          resources: filtered.length > 0 ? filtered : allRes.resources,
          nextCursor: allRes.next_cursor || null
        };
      }
    } catch (err) {
      console.warn('[Cloudinary] Fallback scan note:', err.message);
    }
  }

  return {
    resources: result.resources || [],
    nextCursor: result.next_cursor || null
  };
}

/**
 * Scan all audio resources across multiple pages (handles 1,000+ songs)
 */
async function scanAllAudioResources(folder = defaultFolder, maxPages = 20) {
  const allResources = [];
  let nextCursor = null;
  let page = 0;

  do {
    page++;
    const res = await scanAudioResources(folder, nextCursor);
    if (res.resources && res.resources.length > 0) {
      allResources.push(...res.resources);
    }
    nextCursor = res.nextCursor;
  } while (nextCursor && page < maxPages);

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
