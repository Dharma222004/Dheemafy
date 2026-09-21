require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');

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
