require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');

// Cloudinary direct service (PRIMARY catalog source — bypasses SQLite)
const cloudinaryDirect = require('./services/cloudinaryDirectService');

// Initialize database
require('./db/database');

const authRoutes = require('./routes/auth');
const homeRoutes = require('./routes/home');
const searchRoutes = require('./routes/search');
const songsRoutes = require('./routes/songs');
const playbackRoutes = require('./routes/playback');
const artistsRoutes = require('./routes/artists');
const albumsRoutes = require('./routes/albums');
const playlistsRoutes = require('./routes/playlists');
const libraryRoutes = require('./routes/library');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4534;

// Disable etags and caching for dynamic API responses to guarantee reliable JSON payloads
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Structured Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/api/health')) {
      console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Dheemafy Music Streaming API',
    version: '1.0.0'
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/artists', artistsRoutes);
app.use('/api/albums', albumsRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/history', libraryRoutes);
app.use('/api/admin', adminRoutes);

// Public Dynamic Sync & Revalidate endpoints (accessible for webhooks/crons/frontend)
app.all('/api/sync', async (req, res) => {
  try {
    const { syncCloudinaryCatalog } = require('./services/syncService');
    const folder = (req.body && req.body.folder) || req.query.folder || 'Songs';
    const result = await syncCloudinaryCatalog(folder);
    res.json({ success: true, data: result });
  } catch (err) {
    const msg = (err && (err.message || (err.error && err.error.message))) || 'Sync operation failed';
    const httpCode = (err && (err.http_code || (err.error && err.error.http_code))) || 500;
    res.status(httpCode >= 400 && httpCode < 600 ? httpCode : 500).json({
      success: false,
      error: {
        message: msg,
        httpCode
      }
    });
  }
});

app.all('/api/revalidate', async (req, res) => {
  try {
    const { syncCloudinaryCatalog } = require('./services/syncService');
    const result = await syncCloudinaryCatalog('Songs');
    res.json({ revalidated: true, data: result });
  } catch (err) {
    const msg = (err && (err.message || (err.error && err.error.message))) || 'Revalidation failed';
    const httpCode = (err && (err.http_code || (err.error && err.error.http_code))) || 500;
    res.status(httpCode >= 400 && httpCode < 600 ? httpCode : 500).json({
      revalidated: false,
      error: {
        message: msg,
        httpCode
      }
    });
  }
});

// ==========================================================================
// CLOUDINARY WEBHOOK — Auto-sync when you upload/delete/update songs in Cloudinary.
// Configure this URL in your Cloudinary dashboard:
//   Dashboard → Settings → Webhooks → Add Notification URL:
//   https://<your-domain>/api/cloudinary-webhook
// Events to subscribe: upload, delete, rename, eager
// ==========================================================================
app.post('/api/cloudinary-webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const notificationType = body.notification_type || body.type || '';
    const resourceType = body.resource_type || '';
    const folder = body.asset_folder || body.folder || 'Songs';

    console.log(`[Webhook] Cloudinary notification received: type="${notificationType}", resource_type="${resourceType}", folder="${folder}"`);

    // Only react to audio (video resource_type in Cloudinary) upload/delete/rename events
    const isAudioEvent = resourceType === 'video' || !resourceType;
    const isRelevantEvent = ['upload', 'delete', 'rename', 'eager', 'destroy'].includes(notificationType);

    if (!isAudioEvent || !isRelevantEvent) {
      console.log(`[Webhook] Ignoring non-audio or non-relevant event: type="${notificationType}", resource_type="${resourceType}"`);
      return res.json({ received: true, synced: false, reason: 'Non-audio or non-relevant event' });
    }

    // 1. Immediately invalidate the in-memory Cloudinary catalog cache
    //    so the VERY NEXT request to /api/songs, /api/home etc. gets fresh data
    cloudinaryDirect.invalidateCache();

    // Trigger background sync (non-blocking — respond immediately so Cloudinary doesn't retry)
    res.json({ received: true, synced: true, message: 'Cache invalidated + sync triggered in background' });

    // 2. Also run the SQLite sync in background (kept for consistency but not required)
    setImmediate(async () => {
      try {
        const syncFolder = (typeof folder === 'string' && folder.startsWith('Songs')) ? 'Songs' : 'Songs';
        console.log(`[Webhook] Pre-warming Cloudinary direct cache for folder "${syncFolder}"...`);
        const songs = await cloudinaryDirect.getCachedSongs(true, syncFolder);
        console.log(`[Webhook] Cache pre-warm complete: ${songs.length} songs loaded.`);
      } catch (syncErr) {
        console.error('[Webhook] Cache pre-warm error:', syncErr.message || syncErr);
      }
    });
  } catch (err) {
    console.error('[Webhook] Handler error:', err.message || err);
    res.status(500).json({ received: false, error: err.message || 'Webhook processing failed' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  });
});

const HOST = process.env.HOST || '0.0.0.0';
let server = null;
if (require.main === module && !process.env.VERCEL) {
  server = app.listen(PORT, HOST, () => {
    console.log(`[Server] Dheemafy API server listening on http://${HOST}:${PORT} (and http://localhost:${PORT})`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
