# Spotkify 🎵

> Authentic Spotify Web Player interface powered by a **metadata-driven music library engine** and Cloudinary audio streaming.

---

## 🌟 Highlights

- **Zero Hardcoding**: Artists, songs, albums, and categories are dynamically extracted and synthesized from metadata text files (`Meta Data/`) and synced with Cloudinary (`Songs/` folder).
- **Multi-Artist Indexing**: Every credited artist in a song's credits belongs to the song, and a song belongs to every relevant artist.
- **Dynamic Artist Discography Pages**: Immersive hero banners, verified badges, song counts, "Play All", and full track tables.
- **Clickable Multi-Artist Chips**: Clicking any artist name anywhere across the UI opens their dynamic artist page.
- **Dynamic Search**: Instant search matching song titles, partial artist names, and multi-artist combinations.
- **Authentic Spotify UI/UX**:
  - 3-panel isolated layout with 8px gutters
  - Ambient mesh gradients
  - Greeting cards with hover play
  - Now Playing & Queue side drawer
  - Fullscreen ambient player
  - Bottom player bar with seeking, volume, shuffle, and repeat
- **Security Gate**: Protected login screen (`sharu` / `sharu@123`).
- **Cloudinary CDN Integration**: High-bitrate audio streamed securely from Cloudinary.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ (tested on Node 22)
- npm

### 2. Installation
```bash
git clone https://github.com/Dharma222004/Spotkfiy.git
cd Spotkfiy
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env` and fill in your Cloudinary credentials:
```env
PORT=4534
DATABASE_PATH=./data/navidrome.db
JWT_SECRET=spotkify_super_secret_jwt_key_2026_prod

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=Songs
```

### 4. Run the Application
```bash
npm start
```
Open **`http://localhost:4534`** in your browser.


## ☁️ Deploy to Vercel

Spotkify is fully configured for zero-configuration serverless deployment on [Vercel](https://vercel.com):

### 1. Import Repository
Import `https://github.com/Dharma222004/Spotkfiy.git` into your Vercel dashboard.

### 2. Environment Variables
Add the following Environment Variables in your Vercel Project Settings:

| Key | Example Value | Description |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | `apkdo69e` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | `983152558873187` | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | `lk8N0sEuiAPkKdB49YvP4CM5uvk` | Your private API secret (kept secure server-side) |
| `CLOUDINARY_FOLDER` | `Songs` | Folder in Cloudinary containing master tracks |
| `JWT_SECRET` | `spotkify_super_secret_jwt_key_2026_prod` | Encryption key for auth tokens |

### 3. Deploy
Click **Deploy**. Vercel will build and launch your serverless streaming web application!

---

## 🔄 Automatic Song Synchronization

Whenever you upload new audio files to your Cloudinary `Songs/` folder:
1. **Zero Frontend Edits**: You never need to touch the frontend code when uploading new songs.
2. **Auto-Discovery**: The API automatically revalidates and scans Cloudinary every 2 minutes in the background, as well as on cold start.
3. **Live Sync Webhook**: You can also trigger an instant sync anytime by calling `GET /api/sync` or clicking the sync icon in the top navigation bar.
4. **Live UI Updates**: The Spotkify web app automatically checks for new library songs every 30 seconds and whenever the browser tab becomes active, updating song counts and shelves seamlessly.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/songs` | List songs with parsed `artists` array & Cloudinary IDs (auto-syncs) |
| `GET` | `/api/artists` | Dynamic unique artists sorted by song count |
| `GET` | `/api/artists/:slugOrId` | Artist discography and all featured songs |
| `GET` | `/api/search?q=:query` | Search across songs, albums, and artists |
| `GET` | `/api/songs/:id/play` | Direct Cloudinary audio streaming URL |
| `GET/POST`| `/api/sync` | Re-sync Cloudinary library with metadata files on demand |
| `GET/POST`| `/api/revalidate` | Alias for on-demand cache revalidation |

---

## 📄 License
MIT License

