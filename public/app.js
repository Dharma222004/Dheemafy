// ==========================================================================
// SPOTKIFY – AUTHENTIC SPOTIFY WEB PLAYER ENGINE
// ==========================================================================
(function () {
  'use strict';

  // Default Fallback Cover
  const DEFAULT_SONG_COVER = '/images/default_cover.svg';

  // State
  let allSongs = [];
  let homeData = null;

  // currentPlaylist = the playlist currently being BROWSED (shown in playlist view / row highlighting)
  // activePlaybackPlaylist = the playlist actually DRIVING PLAYBACK (next/prev/auto-advance)
  // These are kept separate so that browsing a new playlist does not hijack the active queue.
  let currentPlaylist = [];       // browsing context
  let activePlaybackPlaylist = []; // playback engine context

  let currentTrackIndex = -1;     // index within activePlaybackPlaylist
  let isPlaying = false;
  let isShuffle = false;

  // repeatMode: 'off' | 'all' | 'one'
  // 'off' → stop at end of playlist (or fallback to Autoplay radio)
  // 'all' → loop the playlist continuously (default for uninterrupted mobile listening)
  // 'one' → replay the current song
  let repeatMode = 'all';

  let currentRoute = 'home';
  let queue = [];
  let isRightPanelOpen = false;
  let shuffleQueue = [];
  let shuffleIndex = 0;
  // Version counter incremented each time the activePlaybackPlaylist changes.
  // Prevents shuffle queue from regenerating on trivial length matches.
  let shufflePlaylistVersion = 0;
  let shuffleQueueVersion = -1;   // version when shuffleQueue was last generated

  // Stall watchdog: tracks the last time audio.timeupdate fired while playing
  let _lastTimeUpdateAt = 0;
  let _stallWatchdogTimer = null;

  function generateShuffleOrder(length, currentIdx = 0) {
    if (length <= 1) return [0];
    const indices = [];
    for (let i = 0; i < length; i++) {
      if (i !== currentIdx) indices.push(i);
    }
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return [currentIdx, ...indices];
  }

  // Audio Engine
  const audio = document.getElementById('spotifyAudioEngine');
  if (audio) {
    audio.preload = 'auto';
  }

  // ==========================================================================
  // SCREEN WAKE LOCK ENGINE
  // Keeps mobile screen & CPU active while music is playing, preventing the OS
  // from suspending JavaScript execution or halting track transitions after 2 songs.
  // ==========================================================================
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock && !document.hidden && isPlaying) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
        console.log('[Player] Screen wake lock active (screen will not sleep during playback)');
      }
    } catch (_) {}
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (_) {}
      wakeLock = null;
      console.log('[Player] Screen wake lock released');
    }
  }

  // ==========================================================================
  // SPOTKIFY HIGH-SPEED AUDIO PRELOADER & QUEUE PREFETCH ENGINE
  // Uses direct Cloudinary HTTPS MP3 streaming URLs to ensure 100% compatibility
  // with mobile background playback, lock-screen MediaSession, and OS media daemons.
  // Pre-warms upcoming connections natively without heavy in-memory blobs.
  // ==========================================================================
  const audioPreloader = (() => {
    // Return direct Cloudinary stream URL to ensure 100% compatibility
    // with mobile background playback, lock-screen MediaSession, and OS media daemons.
    function getPlaybackUrl(song) {
      if (!song) return null;
      return song.audio_url || song.audioUrl || null;
    }

    // Pre-warm upcoming track connections natively via link prefetch
    function preloadTrack(song) {
      if (!song) return;
      const directUrl = song.audio_url || song.audioUrl;
      if (!directUrl) return;
      try {
        const existing = document.querySelector(`link[rel="prefetch"][href="${directUrl}"]`);
        if (!existing) {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.href = directUrl;
          link.as = 'audio';
          document.head.appendChild(link);
        }
      } catch (_) { }
    }

    // Pre-warms upcoming songs in the current queue sequentially
    function preloadUpcoming(currentIndex, playlist, count = 5) {
      if (!playlist || playlist.length <= 1 || currentIndex < 0) return;
      try {
        const len = playlist.length;
        for (let i = 1; i <= Math.min(count, len - 1); i++) {
          const nextIdx = (currentIndex + i) % len;
          if (playlist[nextIdx]) {
            preloadTrack(playlist[nextIdx]);
          }
        }
      } catch (_) { }
    }

    return {
      getPlaybackUrl,
      preloadTrack,
      preloadUpcoming,
      getCacheCount: () => 0
    };
  })();

  // DOM Navigation & Views
  const viewHome = document.getElementById('viewHome');
  const viewPlaylist = document.getElementById('viewPlaylist');
  const viewSearch = document.getElementById('viewSearch');
  const viewArtist = document.getElementById('viewArtist');
  const mainScrollView = document.getElementById('mainScrollView');
  const topbar = document.getElementById('topbar');
  const ambientMesh = document.getElementById('ambientMesh');

  // Artist View DOM
  const artistHeroBackdrop = document.getElementById('artistHeroBackdrop');
  const artistViewName = document.getElementById('artistViewName');
  const artistViewStats = document.getElementById('artistViewStats');
  const btnArtistPlayAll = document.getElementById('btnArtistPlayAll');
  const btnArtistFollow = document.getElementById('btnArtistFollow');
  const artistTrackRows = document.getElementById('artistTrackRows');
  let currentArtistSongs = [];
  let currentArtist = null;

  // Sidebar & Shelves
  const greetingTitle = document.getElementById('greetingTitle');
  const quickPicksGrid = document.getElementById('quickPicksGrid');
  const trendingShelf = document.getElementById('trendingShelf');
  const artistsShelf = document.getElementById('artistsShelf');
  const albumsShelf = document.getElementById('albumsShelf');
  const libraryShelf = document.getElementById('libraryShelf');
  const featuredPlaylistsShelf = document.getElementById('featuredPlaylistsShelf');
  const dynamicLibraryList = document.getElementById('dynamicLibraryList');
  const libLikedCount = document.getElementById('libLikedCount');
  const libAllTracksCount = document.getElementById('libAllTracksCount');

  // Mobile Spotify DOM
  const btnMobileUserAvatar = document.getElementById('btnMobileUserAvatar');
  const mobileHeaderChips = document.getElementById('mobileHeaderChips');
  const startListeningList = document.getElementById('startListeningList');
  const favouriteArtistsShelf = document.getElementById('favouriteArtistsShelf');
  const spotifyPlayerBar = document.getElementById('spotifyPlayerBar');
  const mobilePlayerTopLabel = document.getElementById('mobilePlayerTopLabel');
  const mobilePlayerTopText = document.getElementById('mobilePlayerTopText') || mobilePlayerTopLabel;
  const mobileMiniPrevBtn = document.getElementById('mobileMiniPrevBtn');
  const mobileMiniPlayBtn = document.getElementById('mobileMiniPlayBtn');

  // Mobile Home Flow DOM Elements
  const mobileAllSongsCarousel = document.getElementById('mobileAllSongsCarousel');
  const mobileBtnShowAllSongs = document.getElementById('mobileBtnShowAllSongs');
  const mobilePlaylistsCarousel = document.getElementById('mobilePlaylistsCarousel');
  const mobileBtnShowAllPlaylists = document.getElementById('mobileBtnShowAllPlaylists');
  const mobileDirectorsCarousel = document.getElementById('mobileDirectorsCarousel');
  const mobileBtnShowAllDirectors = document.getElementById('mobileBtnShowAllDirectors');
  const mobileArtistsShelf = document.getElementById('mobileArtistsShelf');
  const mobileTrendingCarousel = document.getElementById('mobileTrendingCarousel');
  const mobileBtnShowAllTrending = document.getElementById('mobileBtnShowAllTrending');

  // ==========================================================================
  // NEW FIXED PLAYLIST ORDER (as per app requirements)
  // 1. All Songs – entire library alphabetically
  // 2. Sharu – songs matching artist "Sharu"
  // 3. Hills – songs matching artist/folder "Hills"
  // 4. Anirudh – songs by Anirudh Ravichander
  // 5. A.R Rahman – songs by A.R. Rahman
  // 6. Sid Sriram – songs by Sid Sriram
  // 7. Other Artists – songs not matched by the above 5 specific artists
  // After these, KNOWN_MUSIC_DIRECTORS artist playlists follow dynamically.
  // ==========================================================================
  const PLAYLIST_DEFINITIONS = [
    { id: 'pl-all-songs', name: 'All Songs', type: 'all', cover: '/images/playlists/all_songs.svg' },
    { id: 'pl-sharu', name: 'Sharu', type: 'folder', folder: 'sharu', cover: '/images/playlists/sharu.svg' },
    { id: 'pl-hills', name: 'Hills', type: 'folder', folder: 'hills', cover: '/images/playlists/hills.svg' },
    { id: 'pl-anirudh', name: 'Anirudh', type: 'artist', cover: '/images/artists/anirudh.jpg', aliases: ['anirudh ravichander', 'anirudh'] },
    { id: 'pl-arrahman', name: 'A.R Rahman', type: 'artist', cover: DEFAULT_SONG_COVER, aliases: ['a.r. rahman', 'a. r. rahman', 'ar rahman', 'rahman'] },
    { id: 'pl-sidsriram', name: 'Sid Sriram', type: 'artist', cover: DEFAULT_SONG_COVER, aliases: ['sid sriram'] },
    { id: 'pl-other', name: 'Other Artists', type: 'other', cover: DEFAULT_SONG_COVER }
  ];

  const KNOWN_MUSIC_DIRECTORS = [
    { name: 'A.R. Rahman', aliases: ['a.r. rahman', 'a. r. rahman', 'ar rahman', 'rahman'], cover: DEFAULT_SONG_COVER },
    { name: 'Anirudh Ravichander', aliases: ['anirudh ravichander', 'anirudh'], cover: '/images/artists/anirudh.jpg' },
    { name: 'D. Imman', aliases: ['d. imman', 'd imman', 'imman'], cover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=80' },
    { name: 'Darbuka Siva', aliases: ['darbuka siva'], cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
    { name: 'Deva', aliases: ['deva', 'thenisai thendral deva'], cover: DEFAULT_SONG_COVER },
    { name: 'Devi Sri Prasad', aliases: ['devi sri prasad', 'dsp'], cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
    { name: 'Dhibu Ninan Thomas', aliases: ['dhibu ninan thomas'], cover: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80' },
    { name: 'G. V. Prakash Kumar', aliases: ['g. v. prakash kumar', 'g. v. prakash', 'g.v. prakash', 'gv prakash'], cover: '/images/artists/gvprakash.jpg' },
    { name: 'Ghibran', aliases: ['ghibran'], cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { name: 'Govind Vasantha', aliases: ['govind vasantha'], cover: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&auto=format&fit=crop&q=80' },
    { name: 'Harris Jayaraj', aliases: ['harris jayaraj'], cover: DEFAULT_SONG_COVER },
    { name: 'Hiphop Tamizha', aliases: ['hiphop tamizha', 'hiphop thamizha'], cover: DEFAULT_SONG_COVER },
    { name: 'Ilaiyaraaja', aliases: ['ilaiyaraaja', 'ilayaraja'], cover: DEFAULT_SONG_COVER },
    { name: 'Leon James', aliases: ['leon james'], cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { name: 'Sam C.S.', aliases: ['sam c.s.', 'sam cs'], cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' },
    { name: 'Santhosh Narayanan', aliases: ['santhosh narayanan'], cover: DEFAULT_SONG_COVER },
    { name: 'Sean Roldan', aliases: ['sean roldan'], cover: DEFAULT_SONG_COVER },
    { name: 'Siddhu Kumar', aliases: ['siddhu kumar'], cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { name: 'Stephen Zechariah', aliases: ['stephen zechariah'], cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { name: 'Vidyasagar', aliases: ['vidyasagar'], cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { name: 'Vivek - Mervin', aliases: ['vivek - mervin', 'vivek-mervin'], cover: '/images/artists/vivek.jpg' },
    { name: 'Yuvan Shankar Raja', aliases: ['yuvan shankar raja', 'yuvan'], cover: DEFAULT_SONG_COVER }
  ];

  function deduplicateSongList(songs) {
    if (!Array.isArray(songs)) return [];
    const seen = new Set();
    const result = [];
    for (const s of songs) {
      if (!s || !s.title) continue;
      const key = s.cloudinary_public_id || s.id || ((s.title || '').trim().toLowerCase() + '___' + (s.artist || '').trim().toLowerCase());
      if (!seen.has(key)) {
        seen.add(key);
        result.push(s);
      }
    }
    return result;
  }

  function getAlphabeticalSongs() {
    return deduplicateSongList([...allSongs]).sort((a, b) => {
      const titleA = (a.title || '').trim();
      const titleB = (b.title || '').trim();
      return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
    });
  }

  function getDirectorSongs(director, songs) {
    const aliases = director.aliases || [director.name.toLowerCase()];
    return songs.filter(s => {
      const artStr = (s.artist || '').toLowerCase();
      const albumArt = (s.album_artist || '').toLowerCase();
      let artArr = [];
      if (Array.isArray(s.artists)) artArr = s.artists.map(a => a.toLowerCase());
      else {
        try { artArr = JSON.parse(s.artists_json || '[]').map(a => a.toLowerCase()); } catch (e) { }
      }
      return aliases.some(alias => artStr.includes(alias) || albumArt.includes(alias) || artArr.some(a => a.includes(alias)));
    });
  }

  // Returns the set of songs belonging to a given PLAYLIST_DEFINITION entry.
  // type 'all'    → entire library sorted alphabetically by title (All Songs + Sharu + Hills)
  // type 'folder' → songs whose folder matches (e.g. 'sharu' or 'hills')
  // type 'artist' → songs whose artist/album_artist/artists_json matches any alias
  // type 'other'  → songs NOT matched by ANY of the fixed artist playlists
  function getPlaylistSongs(pl) {
    const fixedArtistPlaylists = PLAYLIST_DEFINITIONS.filter(p => p.type === 'artist');

    function songMatchesAliases(song, aliases) {
      const artStr = (song.artist || '').toLowerCase();
      const albumArt = (song.album_artist || '').toLowerCase();
      const folderStr = (song.folder || '').toLowerCase();
      let artArr = [];
      if (Array.isArray(song.artists)) artArr = song.artists.map(a => a.toLowerCase());
      else {
        try { artArr = JSON.parse(song.artists_json || '[]').map(a => a.toLowerCase()); } catch (e) { }
      }
      return aliases.some(alias =>
        artStr.includes(alias) ||
        albumArt.includes(alias) ||
        folderStr.includes(alias) ||
        artArr.some(a => a.includes(alias))
      );
    }

    const sortAlpha = arr => deduplicateSongList(arr).sort((a, b) =>
      (a.title || '').trim().localeCompare((b.title || '').trim(), undefined, { sensitivity: 'base', numeric: true })
    );

    if (pl.type === 'all') {
      return sortAlpha(allSongs);
    }

    if (pl.type === 'folder') {
      const target = (pl.folder || '').toLowerCase();
      return sortAlpha(allSongs.filter(s => (s.folder || '').toLowerCase().includes(target)));
    }

    if (pl.type === 'artist') {
      return sortAlpha(allSongs.filter(s => songMatchesAliases(s, pl.aliases)));
    }

    if (pl.type === 'other') {
      // Songs not matched by any fixed artist playlist
      const matched = new Set();
      for (const fixedPl of fixedArtistPlaylists) {
        allSongs.forEach(s => {
          if (songMatchesAliases(s, fixedPl.aliases)) matched.add(s.id);
        });
      }
      return sortAlpha(allSongs.filter(s => !matched.has(s.id)));
    }

    return [];
  }
  const mobileMiniNextBtn = document.getElementById('mobileMiniNextBtn');
  const mobileBarPlaySvg = document.getElementById('mobileBarPlaySvg');
  const mobileBarPauseSvg = document.getElementById('mobileBarPauseSvg');
  const mobileMiniProgressFill = document.getElementById('mobileMiniProgressFill');
  const mobileConnectBtn = document.getElementById('mobileConnectBtn');
  const mobileAddBtn = document.getElementById('mobileAddBtn');
  const mobileAddSvgPlus = document.getElementById('mobileAddSvgPlus');
  const mobileAddSvgCheck = document.getElementById('mobileAddSvgCheck');
  const mobileDeviceBadge = document.getElementById('mobileDeviceBadge');
  const mobileDeviceName = document.getElementById('mobileDeviceName');

  // Mobile Bottom Sheets & Modals
  const devicePickerSheet = document.getElementById('devicePickerSheet');
  const btnCloseDeviceSheet = document.getElementById('btnCloseDeviceSheet');
  const deviceSheetBackdrop = document.getElementById('deviceSheetBackdrop');
  const deviceListGroup = document.getElementById('deviceListGroup');

  const premiumSheet = document.getElementById('premiumSheet');
  const btnClosePremiumSheet = document.getElementById('btnClosePremiumSheet');
  const premiumSheetBackdrop = document.getElementById('premiumSheetBackdrop');
  const btnGetPremium = document.getElementById('btnGetPremium');

  const createSheet = document.getElementById('createSheet');
  const btnCloseCreateSheet = document.getElementById('btnCloseCreateSheet');
  const createSheetBackdrop = document.getElementById('createSheetBackdrop');
  const btnCreateNewPlaylist = document.getElementById('btnCreateNewPlaylist');
  const btnCreateBlend = document.getElementById('btnCreateBlend');

  const trackContextSheet = document.getElementById('trackContextSheet');
  const contextSheetBackdrop = document.getElementById('contextSheetBackdrop');
  const contextTrackCover = document.getElementById('contextTrackCover');
  const contextTrackTitle = document.getElementById('contextTrackTitle');
  const contextTrackArtist = document.getElementById('contextTrackArtist');
  const btnContextLike = document.getElementById('btnContextLike');
  const btnContextLikeText = document.getElementById('btnContextLikeText');
  const btnContextAddToPlaylist = document.getElementById('btnContextAddToPlaylist');
  const btnContextViewArtist = document.getElementById('btnContextViewArtist');
  const btnContextShare = document.getElementById('btnContextShare');
  let currentContextSong = null;

  // Playlist View DOM
  const playlistTitle = document.getElementById('playlistTitle');
  const playlistDesc = document.getElementById('playlistDesc');
  const playlistCoverImg = document.getElementById('playlistCoverImg');
  const playlistTrackCount = document.getElementById('playlistTrackCount');
  const playlistTotalDuration = document.getElementById('playlistTotalDuration');
  const playlistTrackRows = document.getElementById('playlistTrackRows');
  const btnBigPlay = document.getElementById('btnBigPlay');
  const btnPlaylistHeart = document.getElementById('btnPlaylistHeart');
  const btnShufflePlaylist = document.getElementById('btnShufflePlaylist');

  // Search DOM
  const mainSearchWrap = document.getElementById('mainSearchWrap');
  const searchInput = document.getElementById('spotifySearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const searchBrowseTiles = document.getElementById('searchBrowseTiles');
  const searchResultsSection = document.getElementById('searchResultsSection');
  const topResultCard = document.getElementById('topResultCard');
  const searchMiniRows = document.getElementById('searchMiniRows');
  const searchTableRows = document.getElementById('searchTableRows');

  // Right Panel DOM
  const rightSidebar = document.getElementById('rightSidebar');
  const spotifyApp = document.querySelector('.spotify-app');
  const btnCloseRightPanel = document.getElementById('btnCloseRightPanel');
  const nowPlayingView = document.getElementById('nowPlayingView');
  const queueView = document.getElementById('queueView');
  const rightCoverImg = document.getElementById('rightCoverImg');
  const rightTrackName = document.getElementById('rightTrackName');
  const rightArtistName = document.getElementById('rightArtistName');
  const rightArtistCardName = document.getElementById('rightArtistCardName');
  const rightArtistBio = document.getElementById('rightArtistBio');
  const nextQueueRow = document.getElementById('nextQueueRow');
  const queueNowPlayingRow = document.getElementById('queueNowPlayingRow');
  const queueUpcomingRows = document.getElementById('queueUpcomingRows');
  const btnOpenFullQueue = document.getElementById('btnOpenFullQueue');

  // Bottom Player Bar DOM
  const barThumb = document.getElementById('barThumb');
  const barTitle = document.getElementById('barTitle');
  const barArtist = document.getElementById('barArtist');
  const barHeartBtn = document.getElementById('barHeartBtn');
  const soundwaveIndicator = document.getElementById('soundwaveIndicator');

  const barBtnPlayPause = document.getElementById('barBtnPlayPause');
  const barPlaySvg = document.getElementById('barPlaySvg');
  const barPauseSvg = document.getElementById('barPauseSvg');
  const barBtnPrev = document.getElementById('barBtnPrev');
  const barBtnNext = document.getElementById('barBtnNext');
  const barBtnShuffle = document.getElementById('barBtnShuffle');
  const barBtnRepeat = document.getElementById('barBtnRepeat');

  const barCurrentTime = document.getElementById('barCurrentTime');
  const barTotalTime = document.getElementById('barTotalTime');
  const seekBar = document.getElementById('seekBar');
  const progressFillBar = document.getElementById('progressFillBar');
  const progressHandle = document.getElementById('progressHandle');

  const barBtnMute = document.getElementById('barBtnMute');
  const volSvgHigh = document.getElementById('volSvgHigh');
  const volSvgMute = document.getElementById('volSvgMute');
  const volBar = document.getElementById('volBar');
  const volumeFillBar = document.getElementById('volumeFillBar');
  const volumeHandle = document.getElementById('volumeHandle');
  let currentVolume = 0.8;
  let currentSong = null;
  let currentRightPanelTab = null;
  let isSeeking = false;
  let isVolDragging = false;
  let _lastMsUpdate = 0; // Throttle for MediaSession position updates in timeupdate

  const btnToggleNowPlaying = document.getElementById('btnToggleNowPlaying');
  const btnToggleQueue = document.getElementById('btnToggleQueue');
  const btnFullscreen = document.getElementById('btnFullscreen');

  // Fullscreen Modal DOM (1:1 Match to Spotify Mobile App - Image 2)
  const fullscreenModal = document.getElementById('fullscreenModal');
  const fsBackdrop = document.getElementById('fsBackdrop');
  const fsCoverImg = document.getElementById('fsCoverImg');
  const fsThumbImg = document.getElementById('fsThumbImg');
  const fsTrackTitle = document.getElementById('fsTrackTitle');
  const fsArtistName = document.getElementById('fsArtistName');
  const btnCloseFullscreen = document.getElementById('btnCloseFullscreen');
  const fsHeaderContextSub = document.getElementById('fsHeaderContextSub');
  const fsHeaderPlaylistName = document.getElementById('fsHeaderPlaylistName');
  const fsBtnMore = document.getElementById('fsBtnMore');
  const fsBtnAdd = document.getElementById('fsBtnAdd');
  const fsAddSvgPlus = document.getElementById('fsAddSvgPlus');
  const fsAddSvgCheck = document.getElementById('fsAddSvgCheck');
  const fsProgressBar = document.getElementById('fsProgressBar');
  const fsProgressFill = document.getElementById('fsProgressFill');
  const fsProgressThumb = document.getElementById('fsProgressThumb');
  const fsCurrentTime = document.getElementById('fsCurrentTime');
  const fsTotalTime = document.getElementById('fsTotalTime');
  const fsBtnShuffle = document.getElementById('fsBtnShuffle');
  const fsShuffleDot = document.getElementById('fsShuffleDot');
  const fsBtnPrev = document.getElementById('fsBtnPrev');
  const fsBtnPlayPause = document.getElementById('fsBtnPlayPause');
  const fsPlaySvg = document.getElementById('fsPlaySvg');
  const fsPauseSvg = document.getElementById('fsPauseSvg');
  const fsBtnNext = document.getElementById('fsBtnNext');
  const fsBtnTimer = document.getElementById('fsBtnTimer');
  const fsDeviceBadge = document.getElementById('fsDeviceBadge');
  const fsDeviceName = document.getElementById('fsDeviceName');
  const fsBtnShare = document.getElementById('fsBtnShare');
  const fsBtnQueue = document.getElementById('fsBtnQueue');
  const fsFloatingLyric = null;    // removed — lyrics section removed from Now Playing
  const fsLyricsPeekCard = null;    // removed — lyrics section removed from Now Playing
  const fsLyricsPeekText = null;    // removed — lyrics section removed from Now Playing

  // Ensure all main player image elements seamlessly fallback to DEFAULT_SONG_COVER
  [barThumb, rightCoverImg, playlistCoverImg, fsCoverImg, fsThumbImg, contextTrackCover].forEach(img => {
    if (img) {
      img.addEventListener('error', function () {
        if (!this.src.endsWith(DEFAULT_SONG_COVER)) {
          this.src = DEFAULT_SONG_COVER;
        }
      });
    }
  });

  // getLyricsForSong removed — lyrics section has been removed from Now Playing page.


  // W3C MediaSession API for Continuous Background Playback (Android / iOS lockscreen & earbuds)
  function updateMediaSession(song) {
    if (!song || !('mediaSession' in navigator)) return;
    const coverUrl = song.cover_image_url || '/images/covers/enna_solla.jpg';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'Dheemafy Track',
        artist: song.artist || 'Dheemafy Artist',
        album: song.movie ? `From "${song.movie}"` : (song.album || 'Dheemafy'),
        artwork: [
          { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } catch (e) {
      console.warn('MediaSession metadata warning:', e);
    }
    updateMediaSessionPlaybackState();
  }

  function updateMediaSessionPlaybackState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      if (audio && audio.duration && !isNaN(audio.duration) && isFinite(audio.currentTime)) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, audio.duration),
          playbackRate: audio.playbackRate || 1,
          position: Math.min(Math.max(0, audio.currentTime), audio.duration)
        });
      }
    } catch (e) { }
  }

  function initMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = [
      ['play', () => {
        console.log('[MediaSession] Play action triggered from lockscreen / headset');
        resumePlayback();
      }],
      ['pause', () => {
        console.log('[MediaSession] Pause action triggered from lockscreen / headset');
        pausePlayback();
      }],
      ['previoustrack', () => {
        console.log('[MediaSession] Previous track action triggered');
        playPrevTrack();
      }],
      ['nexttrack', () => {
        console.log('[MediaSession] Next track action triggered');
        playNextTrack();
      }],
      ['seekto', (details) => {
        if (details.seekTime !== undefined && audio.duration) {
          audio.currentTime = Math.min(Math.max(0, details.seekTime), audio.duration);
          updateMediaSessionPlaybackState();
        }
      }],
      ['seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        audio.currentTime = Math.max(audio.currentTime - offset, 0);
        updateMediaSessionPlaybackState();
      }],
      ['seekforward', (details) => {
        const offset = details.seekOffset || 10;
        audio.currentTime = Math.min(audio.currentTime + offset, audio.duration || 0);
        updateMediaSessionPlaybackState();
      }],
      ['stop', () => {
        console.log('[MediaSession] Stop action triggered');
        pausePlayback();
        audio.currentTime = 0;
      }]
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) { }
    }
  }

  // Fast Touch Helper (Eliminates mobile click latency and missed touches)
  function addFastTouchListener(elem, handler) {
    if (!elem) return;
    let touchFired = false;
    elem.addEventListener('touchend', (e) => {
      touchFired = true;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
      setTimeout(() => { touchFired = false; }, 300);
    }, { passive: false });

    elem.addEventListener('click', (e) => {
      if (!touchFired) {
        e.stopPropagation();
        handler(e);
      }
    });
  }

  // Library & Sync Buttons
  const btnSyncCloudinary = document.getElementById('btnSyncCloudinary');
  const toastContainer = document.getElementById('toastContainer');

  // Format seconds to mm:ss
  function formatDuration(sec) {
    if (isNaN(sec) || sec === null || sec === undefined || sec <= 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Toast Notification
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'spotify-toast';
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // Dynamic Time Greeting
  function updateGreeting() {
    if (!greetingTitle) return;
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      greetingTitle.textContent = 'Good morning';
    } else if (hour >= 12 && hour < 18) {
      greetingTitle.textContent = 'Good afternoon';
    } else {
      greetingTitle.textContent = 'Good evening';
    }
  }

  // Ambient mesh color palettes based on songs
  const ambientGradients = [
    'linear-gradient(180deg, #1b4d2e 0%, rgba(18, 18, 18, 0) 100%)',
    'linear-gradient(180deg, #4c1d68 0%, rgba(18, 18, 18, 0) 100%)',
    'linear-gradient(180deg, #1e3a68 0%, rgba(18, 18, 18, 0) 100%)',
    'linear-gradient(180deg, #6b2d18 0%, rgba(18, 18, 18, 0) 100%)',
    'linear-gradient(180deg, #1a4f5c 0%, rgba(18, 18, 18, 0) 100%)',
    'linear-gradient(180deg, #594d1b 0%, rgba(18, 18, 18, 0) 100%)'
  ];

  function setAmbientColor(seed) {
    const idx = Math.abs((seed || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % ambientGradients.length;
    ambientMesh.style.background = ambientGradients[idx];
  }

  // Multi-artist parsing and clickable links
  function getSongArtists(song) {
    if (Array.isArray(song.artists) && song.artists.length > 0) return song.artists;
    if (typeof song.artists === 'string') {
      try {
        const parsed = JSON.parse(song.artists);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { }
    }
    if (song.artist) {
      return song.artist.split(',').map(a => a.trim()).filter(Boolean);
    }
    return ['Artist'];
  }

  function renderArtistLinksHtml(song) {
    const artists = getSongArtists(song);
    return artists.map(art => {
      const safe = art.replace(/"/g, '&quot;');
      return `<span class="artist-link-item" data-artist="${safe}">${art}</span>`;
    }).join(', ');
  }

  function attachArtistLinkListeners(container) {
    if (!container) return;
    container.querySelectorAll('.artist-link-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const art = el.getAttribute('data-artist');
        if (art) openArtistView(art);
      });
    });
  }

  // ==========================================================================
  // SHARED SONG CATALOG STORE (SINGLETON)
  // Provides a single, unified source of truth for all components (Player, Home,
  // Search, Library, Playlists) with in-flight promise deduplication and memory caching.
  // Prevents redundant /api/songs?limit=1000 requests during normal app usage.
  // ==========================================================================
  const SongCatalogStore = (() => {
    let catalog = [];
    let catalogVersion = null;
    let catalogLastUpdated = null;
    let inFlightFetchPromise = null;
    let isCatalogLoaded = false;
    let lastFetchedTime = 0;

    async function fetchCatalogFromServer(force = false) {
      try {
        const headers = {};
        if (catalogVersion && !force) {
          headers['If-None-Match'] = `"${catalogVersion}"`;
        }
        const res = await fetch('/api/songs?limit=1000', { headers });
        if (res.status === 304 && catalog.length > 0) {
          console.log('[CatalogStore] 304 Not Modified - Shared catalog is fresh.');
          lastFetchedTime = Date.now();
          return catalog;
        }
        if (!res.ok) {
          throw new Error(`Catalog fetch failed with HTTP ${res.status}`);
        }
        const json = await res.json();
        const rawSongs = (json && json.data) || [];
        const songs = deduplicateSongList(rawSongs);
        if (songs.length > 0 || !isCatalogLoaded) {
          catalog = songs;
          isCatalogLoaded = true;
          allSongs = catalog;
          lastFetchedTime = Date.now();

          // Extract ETag or version
          const etag = res.headers.get('ETag');
          if (etag) {
            catalogVersion = etag.replace(/"/g, '');
          }
        }
        return catalog;
      } finally {
        inFlightFetchPromise = null;
      }
    }

    async function getSongs(forceRefresh = false) {
      if (!forceRefresh && isCatalogLoaded && catalog.length > 0) {
        return catalog;
      }
      if (inFlightFetchPromise) {
        return inFlightFetchPromise;
      }
      inFlightFetchPromise = fetchCatalogFromServer(forceRefresh);
      return inFlightFetchPromise;
    }

    async function checkVersionAndSyncIfNeeded() {
      // Lightweight check (<1ms SQLite check, ~50 bytes JSON response)
      try {
        const res = await fetch('/api/songs/version');
        if (!res.ok) return false;
        const json = await res.json();
        const vData = json && json.data;
        if (!vData) return false;

        const serverCount = vData.count;
        const serverVersion = vData.version;
        const serverLastUpdated = vData.lastUpdated;

        const countChanged = serverCount !== catalog.length;
        const versionChanged = catalogVersion && serverVersion && catalogVersion !== serverVersion;
        const timeChanged = catalogLastUpdated && serverLastUpdated && catalogLastUpdated !== serverLastUpdated;

        if (!isCatalogLoaded || countChanged || versionChanged || timeChanged) {
          console.log(`[CatalogStore] Catalog change detected: ${catalog.length} -> ${serverCount} songs. Refreshing...`);
          catalogVersion = serverVersion;
          catalogLastUpdated = serverLastUpdated;
          const updatedSongs = await getSongs(true);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('[CatalogStore] Version check warning:', err.message);
        return false;
      }
    }

    function getCachedSongs() {
      return catalog;
    }

    function isLoaded() {
      return isCatalogLoaded;
    }

    return {
      getSongs,
      checkVersionAndSyncIfNeeded,
      getCachedSongs,
      isLoaded
    };
  })();
  window.spotkifyCatalog = SongCatalogStore;

  // ==========================================================================
  // API LOADERS
  // ==========================================================================
  let isAppInitialized = false;
  let isPlayerBootstrapped = false;
  let initAppPromise = null;

  async function initAppData(forceRefresh = false) {
    if (!forceRefresh && isAppInitialized) return;
    if (initAppPromise) return initAppPromise;

    initAppPromise = (async () => {
      if (greetingTitle) updateGreeting();
      try {
        // 1. Fetch Home Feed & Songs concurrently with in-flight deduplication
        const [homeRes, songs] = await Promise.all([
          fetch('/api/home').then(r => r.json()).catch(() => null),
          SongCatalogStore.getSongs(forceRefresh)
        ]);

        if (homeRes && homeRes.data) {
          homeData = homeRes.data;
        }
        allSongs = songs || [];
        if (libAllTracksCount) libAllTracksCount.textContent = allSongs.length;

        // 2. Safe Player Bootstrap (ONLY RUNS ONCE ON INITIAL BOOTSTRAP)
        if (!isPlayerBootstrapped) {
          isPlayerBootstrapped = true;
          currentPlaylist = [...allSongs];
          activePlaybackPlaylist = [...allSongs]; // Initial playback context = full library

          if (allSongs.length > 0) {
            // FIX-1: Pick a random song on every initial page open so the default is never the same.
            const randomIdx = Math.floor(Math.random() * allSongs.length);
            const initialSong = allSongs[randomIdx];
            currentTrackIndex = randomIdx;
            try {
              loadTrackIntoPlayerBar(initialSong);
            } catch (loadErr) {
              console.warn('Initial track load warning:', loadErr);
            }

            // Immediately pre-cache the initial song and next 5 upcoming songs
            audioPreloader.preloadTrack(initialSong, 'high');
            audioPreloader.preloadUpcoming(currentTrackIndex, activePlaybackPlaylist, 5);
          }
          try {
            updateVolumeUI(currentVolume);
          } catch (volErr) {
            console.warn('Volume UI warning:', volErr);
          }
        } else {
          // Non-destructive update: Maintain currently active track & playlist without resetting playback!
          const activeTrack = activePlaybackPlaylist[currentTrackIndex] || (audio && audio.src ? allSongs.find(s => s.audio_url === audio.src) : null);
          if (activeTrack) {
            const newIdx = activePlaybackPlaylist.findIndex(s => s.id === activeTrack.id);
            if (newIdx !== -1) {
              currentTrackIndex = newIdx;
            }
          }
          // Update browsing context but leave activePlaybackPlaylist untouched
          currentPlaylist = [...allSongs];
        }

        try {
          renderHomeView();
        } catch (homeErr) {
          console.error('Render home view error:', homeErr);
        }

        try {
          renderSidebarPlaylists();
        } catch (sideErr) {
          console.warn('Sidebar playlists warning:', sideErr);
        }

        isAppInitialized = true;
      } catch (err) {
        console.error('Failed to load initial Spotify data:', err);
        showToast(`Error loading songs: ${err.message || 'Check server connection'}`);
      } finally {
        initAppPromise = null;
      }
    })();

    return initAppPromise;
  }
  window.spotkifyInitApp = initAppData;

  // ==========================================================================
  // RENDER HOME VIEW
  // ==========================================================================
  function renderHomeView() {
    const quickPicks = (homeData && homeData.quickPicks && homeData.quickPicks.length > 0)
      ? homeData.quickPicks.slice(0, 6)
      : allSongs.slice(0, 6);

    // ========================================================================
    // MOBILE HOME FLOW: 4-TIER HIERARCHY
    // 1. ALL SONGS (Alphabetical by title, Show all)
    // 2. FIXED PLAYLISTS: All Songs, Sharu, Hills, Anirudh, A.R Rahman, Sid Sriram, Other Artists
    // 3. MUSIC DIRECTOR-WISE PLAYLISTS (Dynamic from KNOWN_MUSIC_DIRECTORS)
    // 4. OTHER EXISTING HOME SECTIONS (Popular Artists, Trending)
    // ========================================================================

    // 1. ALL SONGS (FIRST SECTION ON MOBILE)
    const alphabeticalSongs = getAlphabeticalSongs();
    if (mobileAllSongsCarousel) {
      const initialCards = alphabeticalSongs.slice(0, 16);
      mobileAllSongsCarousel.innerHTML = initialCards.map(song => createSpotifyCardHtml(song)).join('');
      attachCardListeners(mobileAllSongsCarousel, alphabeticalSongs);
    }
    if (mobileBtnShowAllSongs) {
      mobileBtnShowAllSongs.onclick = () => {
        const sorted = getAlphabeticalSongs();
        openPlaylistView(
          'All Songs',
          `Complete library with ${sorted.length} songs in alphabetical order`,
          sorted[0] ? sorted[0].cover_image_url : null,
          sorted
        );
      };
    }

    // 2. NEW FIXED PLAYLISTS (SECOND SECTION) – replaces old Cloudinary folder playlists
    if (mobilePlaylistsCarousel) {
      const renderedPlaylists = PLAYLIST_DEFINITIONS.map(pl => {
        const songs = getPlaylistSongs(pl);
        return { ...pl, song_count: songs.length, tracks: songs };
      });

      mobilePlaylistsCarousel.innerHTML = renderedPlaylists.map(pl => `
        <div class="spotify-card playlist-card" data-playlist-id="${pl.id}" data-playlist-name="${pl.name}">
          <div class="card-img-wrap">
            <img class="card-img" src="${pl.cover || DEFAULT_SONG_COVER}" alt="${pl.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
            <button class="card-play-btn" title="Play ${pl.name}">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <span class="card-title" title="${pl.name}">${pl.name}</span>
          <span class="card-desc">Playlist • ${pl.song_count} songs</span>
        </div>
      `).join('');

      mobilePlaylistsCarousel.querySelectorAll('.playlist-card').forEach(card => {
        card.addEventListener('click', () => {
          const plName = card.getAttribute('data-playlist-name');
          const plDef = PLAYLIST_DEFINITIONS.find(p => p.name === plName);
          if (!plDef) return;
          const tracks = getPlaylistSongs(plDef);
          const desc = plDef.type === 'all'
            ? `Complete library with ${tracks.length} songs `
            : plDef.type === 'folder'
              ? `Songs from folder "${plDef.name}" • ${tracks.length} songs`
              : plDef.type === 'other'
                ? `All songs not in the main artist playlists • ${tracks.length} songs`
                : `Songs by ${plDef.name} • ${tracks.length} songs`;
          openPlaylistView(plDef.name, desc, plDef.cover, tracks);
        });
      });
    }

    if (mobileBtnShowAllPlaylists) {
      mobileBtnShowAllPlaylists.onclick = () => {
        const sorted = getAlphabeticalSongs();
        openPlaylistView('All Songs', `Complete library with ${sorted.length} songs in alphabetical order`, sorted[0]?.cover_image_url || DEFAULT_SONG_COVER, sorted);
      };
    }

    // 3. MUSIC DIRECTOR-WISE PLAYLISTS (THIRD SECTION)
    if (mobileDirectorsCarousel) {
      const directorsWithSongs = KNOWN_MUSIC_DIRECTORS.map(dir => {
        const songs = getDirectorSongs(dir, allSongs);
        return {
          ...dir,
          songs,
          count: songs.length
        };
      }).filter(d => d.count > 0);

      mobileDirectorsCarousel.innerHTML = directorsWithSongs.map(dir => `
        <div class="spotify-card director-card" data-director="${dir.name}">
          <div class="card-img-wrap">
            <img class="card-img" src="${dir.cover || (dir.songs[0] && dir.songs[0].cover_image_url) || DEFAULT_SONG_COVER}" alt="${dir.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
            <button class="card-play-btn" title="Play ${dir.name}">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <span class="card-title" title="${dir.name}">${dir.name}</span>
          <span class="card-desc">Composer • ${dir.count} songs</span>
        </div>
      `).join('');

      mobileDirectorsCarousel.querySelectorAll('.director-card').forEach(card => {
        card.addEventListener('click', () => {
          const dirName = card.getAttribute('data-director');
          const dirObj = directorsWithSongs.find(d => d.name === dirName);
          if (dirObj && dirObj.songs.length > 0) {
            openPlaylistView(
              dirObj.name,
              `Original compositions and hits by ${dirObj.name} • ${dirObj.songs.length} songs`,
              dirObj.cover || dirObj.songs[0]?.cover_image_url,
              dirObj.songs
            );
          }
        });
      });
    }

    if (mobileBtnShowAllDirectors) {
      mobileBtnShowAllDirectors.onclick = () => {
        const allDirectorSongs = [];
        const seen = new Set();
        KNOWN_MUSIC_DIRECTORS.forEach(d => {
          const sList = getDirectorSongs(d, allSongs);
          sList.forEach(s => {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              allDirectorSongs.push(s);
            }
          });
        });
        openPlaylistView('Music Directors Collection', `Original soundtracks & compositions by legendary music directors (${allDirectorSongs.length} songs)`, '/images/artists/anirudh.jpg', allDirectorSongs);
      };
    }

    // 4. OTHER EXISTING HOME SECTIONS (Popular Artists & Trending)
    if (mobileArtistsShelf) {
      const allArtists = (homeData && homeData.popularArtists && homeData.popularArtists.length > 0)
        ? homeData.popularArtists
        : [];

      const priorityOrder = ['Anirudh Ravichander', 'A.R. Rahman', 'Yuvan Shankar Raja', 'Harris Jayaraj', 'Sid Sriram', 'Santhosh Narayanan', 'G. V. Prakash', 'Pradeep Kumar', 'Sai Abhyankkar', 'Vivek', 'Dhanush', 'Shreya Ghoshal', 'Ilaiyaraaja'];
      const favList = [];
      for (const p of priorityOrder) {
        const found = allArtists.find(a => a.name.toLowerCase() === p.toLowerCase() || a.name.toLowerCase().includes(p.toLowerCase()));
        if (found && !favList.some(fa => fa.name === found.name)) {
          favList.push(found);
        }
      }
      for (const a of allArtists) {
        if (!favList.some(fa => fa.name === a.name)) favList.push(a);
      }

      mobileArtistsShelf.innerHTML = favList.slice(0, 12).map(art => `
        <div class="favourite-artist-card" data-slug="${art.slug || art.name}" data-artist="${art.name}">
          <img class="favourite-artist-img" src="${art.large_image_url || DEFAULT_SONG_COVER}" alt="${art.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <span class="favourite-artist-name">${art.name}</span>
        </div>
      `).join('');

      mobileArtistsShelf.querySelectorAll('.favourite-artist-card').forEach(card => {
        card.addEventListener('click', () => {
          const slug = card.getAttribute('data-slug') || card.getAttribute('data-artist');
          openArtistView(slug);
        });
      });
    }

    if (mobileTrendingCarousel) {
      const trending = (homeData && homeData.trending && homeData.trending.length > 0)
        ? homeData.trending
        : allSongs.slice(0, 8);

      mobileTrendingCarousel.innerHTML = trending.map(song => createSpotifyCardHtml(song)).join('');
      attachCardListeners(mobileTrendingCarousel, trending);
    }

    if (mobileBtnShowAllTrending) {
      mobileBtnShowAllTrending.onclick = () => {
        openPlaylistView('Trending Master Hits', `Trending master recordings (${allSongs.length} songs available)`, allSongs[0]?.cover_image_url || DEFAULT_SONG_COVER, allSongs);
      };
    }

    // 1. Quick Picks Grid (6 items matching Image 1)
    const staticQuickPicksConfig = [
      { key: 'jailer', title: 'Jailer (Original Motion Picture Soundtrack)', cover: '/images/covers/jailer.jpg' },
      { key: 'anirudh', title: 'Anirudh Only Rock Songs 🤘', cover: '/images/playlists/rock_anirudh.jpg' },
      { key: 'enna solla', title: 'Enna Solla Pogirai', cover: '/images/covers/enna_solla.jpg' },
      { key: 'vadachennai', title: 'VadaChennai', cover: '/images/covers/vadachennai.svg' },
      { key: 'leo', title: 'Leo (Badass)', cover: '/images/covers/leo.svg' },
      { key: 'blue star', title: 'Blue Star (Railin Oligal)', cover: '/images/covers/blue_star.svg' }
    ];

    const curatedQuickPicks = staticQuickPicksConfig.map(cfg => {
      const match = allSongs.find(s =>
        (s.title || '').toLowerCase().includes(cfg.key) ||
        (s.movie || '').toLowerCase().includes(cfg.key) ||
        (s.album || '').toLowerCase().includes(cfg.key) ||
        (s.artist || '').toLowerCase().includes(cfg.key)
      );
      if (match) {
        return {
          ...match,
          displayTitle: cfg.title,
          displayCover: cfg.cover
        };
      }
      return {
        id: 'qp-' + cfg.key,
        title: cfg.title,
        artist: 'Various Artists',
        cover_image_url: cfg.cover,
        audio_url: allSongs[0] ? allSongs[0].audio_url : '',
        displayTitle: cfg.title,
        displayCover: cfg.cover
      };
    });

    if (quickPicksGrid) {
      quickPicksGrid.innerHTML = curatedQuickPicks.map(song => `
        <div class="quick-pick-card" data-song-id="${song.id}">
          <img class="qp-cover" src="${song.displayCover || song.cover_image_url || DEFAULT_SONG_COVER}" alt="${song.displayTitle || song.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <span class="qp-title">${song.displayTitle || song.title}</span>
          <button class="qp-play-btn" title="Play ${song.displayTitle || song.title}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      `).join('');

      quickPicksGrid.querySelectorAll('.quick-pick-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-song-id');
          const found = allSongs.find(s => s.id === id) || curatedQuickPicks.find(s => s.id === id);
          if (found) {
            playTrackById(found.id, allSongs.length > 0 ? allSongs : curatedQuickPicks);
          }
        });
      });
    }

    // Connect Made For You & Miniplayer promo
    const cardDiscoverWeekly = document.getElementById('cardDiscoverWeekly');
    if (cardDiscoverWeekly) {
      cardDiscoverWeekly.onclick = () => {
        openPlaylistView('Discover Weekly', 'Your shortcut to hidden gems, deep cuts and new releases updated every Monday.', '/images/playlists/discover_weekly.jpg', allSongs);
      };
    }
    const cardDailyMix1 = document.getElementById('cardDailyMix1');
    if (cardDailyMix1) {
      cardDailyMix1.onclick = () => {
        openPlaylistView('Daily Mix 1', 'A.R. Rahman, Harris Jayaraj, Anirudh Ravichander and more.', '/images/playlists/daily_mix_1.jpg', allSongs);
      };
    }
    const btnTryMiniplayer = document.getElementById('btnTryMiniplayer');
    if (btnTryMiniplayer) {
      btnTryMiniplayer.onclick = () => {
        showToast('Miniplayer enabled! Control playback without interruptions.');
      };
    }

    // Recommended for today shelf (Image 1)
    const recommendedShelf = document.getElementById('recommendedShelf');
    if (recommendedShelf) {
      const recList = [
        { title: 'Enna Solla Pogirai', artist: 'Shankar Mahadevan', cover: '/images/covers/enna_solla.jpg', query: 'enna solla' },
        { title: 'Badass (Leo)', artist: 'Anirudh Ravichander', cover: '/images/covers/leo.svg', query: 'badass' },
        { title: 'OG Sambavam', artist: 'Original Soundtrack', cover: '/images/covers/og_sambavam.svg', query: 'sambavam' },
        { title: 'Hukum (Jailer)', artist: 'Anirudh Ravichander', cover: '/images/covers/jailer.jpg', query: 'hukum' },
        { title: 'VadaChennai', artist: 'Santhosh Narayanan', cover: '/images/covers/vadachennai.svg', query: 'vadachennai' },
        { title: 'Railin Oligal (Blue Star)', artist: 'Govind Vasantha, Pradeep Kumar', cover: '/images/covers/blue_star.svg', query: 'railin' }
      ];

      recommendedShelf.innerHTML = recList.map(item => {
        const matched = allSongs.find(s => (s.title || '').toLowerCase().includes(item.query) || (s.movie || '').toLowerCase().includes(item.query));
        const songId = matched ? matched.id : ('rec-' + item.query);
        return `
          <div class="spotify-card" data-song-id="${songId}">
            <div class="card-img-wrap">
              <img class="card-img" src="${item.cover || DEFAULT_SONG_COVER}" alt="${item.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
              <button class="card-play-btn" title="Play ${item.title}">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <span class="card-title">${item.title}</span>
            <span class="card-desc">${item.artist}</span>
          </div>
        `;
      }).join('');

      recommendedShelf.querySelectorAll('.spotify-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-song-id');
          const found = allSongs.find(s => s.id === id);
          if (found) {
            playTrackById(found.id, allSongs);
          } else if (allSongs[0]) {
            playTrackById(allSongs[0].id, allSongs);
          }
        });
      });
    }

    // 1.5 Featured Playlists Shelf (New Fixed Playlists - replaces old DB folder playlists)
    if (featuredPlaylistsShelf) {
      featuredPlaylistsShelf.innerHTML = PLAYLIST_DEFINITIONS.map(pl => {
        const songs = getPlaylistSongs(pl);
        return `
          <div class="spotify-card playlist-card" data-playlist-name="${pl.name}">
            <div class="card-img-wrap">
              <img class="card-img" src="${pl.cover || DEFAULT_SONG_COVER}" alt="${pl.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
              <button class="card-play-btn" title="Play ${pl.name}">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <span class="card-title" title="${pl.name}">${pl.name}</span>
            <span class="card-desc">Playlist • ${songs.length} songs</span>
          </div>
        `;
      }).join('');

      featuredPlaylistsShelf.querySelectorAll('.playlist-card').forEach(card => {
        card.addEventListener('click', () => {
          const plName = card.getAttribute('data-playlist-name');
          const plDef = PLAYLIST_DEFINITIONS.find(p => p.name === plName);
          if (!plDef) return;
          const tracks = getPlaylistSongs(plDef);
          const desc = plDef.type === 'all'
            ? `Complete library with ${tracks.length} songs `
            : plDef.type === 'folder'
              ? `Songs from folder "${plDef.name}" • ${tracks.length} songs`
              : plDef.type === 'other'
                ? `All songs not in the main artist playlists • ${tracks.length} songs`
                : `Songs by ${plDef.name} • ${tracks.length} songs`;
          openPlaylistView(plDef.name, desc, plDef.cover, tracks);
        });
      });
    }

    // 2. Trending Shelf
    const trending = (homeData && homeData.trending && homeData.trending.length > 0)
      ? homeData.trending
      : allSongs.slice(0, 8);

    trendingShelf.innerHTML = trending.map(song => createSpotifyCardHtml(song)).join('');
    attachCardListeners(trendingShelf, trending);

    // 3. Popular Artists Shelf (Dynamically derived from Metadata & Cloudinary)
    const artists = (homeData && homeData.popularArtists && homeData.popularArtists.length > 0)
      ? homeData.popularArtists
      : [];

    artistsShelf.innerHTML = artists.map(art => `
      <div class="spotify-card artist-card" data-slug="${art.slug || art.name}" data-artist="${art.name}">
        <div class="card-img-wrap">
          <img class="card-img" src="${art.large_image_url || DEFAULT_SONG_COVER}" alt="${art.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <button class="card-play-btn" title="Play ${art.name}">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <span class="card-title">${art.name}</span>
        <span class="card-desc">Artist • ${art.song_count ? `${art.song_count} songs` : 'Artist'}</span>
      </div>
    `).join('');

    artistsShelf.querySelectorAll('.artist-card').forEach(card => {
      card.addEventListener('click', () => {
        const slug = card.getAttribute('data-slug') || card.getAttribute('data-artist');
        openArtistView(slug);
      });
    });

    // 4. Featured Soundtracks & Albums Shelf
    const albums = (homeData && homeData.popularAlbums && homeData.popularAlbums.length > 0)
      ? homeData.popularAlbums
      : [
        { name: 'VadaChennai', album_artist: 'Santhosh Narayanan', large_image_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300' },
        { name: 'Blue Star', album_artist: 'Govind Vasantha', large_image_url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300' },
        { name: 'Retro Soundtrack', album_artist: 'Santhosh Narayanan', large_image_url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300' },
        { name: 'Bachelor', album_artist: 'Dhibu Ninan Thomas', large_image_url: 'https://images.unsplash.com/photo-1520523839898-5071282543e1?w=300' }
      ];

    albumsShelf.innerHTML = albums.map(alb => `
      <div class="spotify-card album-card" data-album="${alb.name}">
        <div class="card-img-wrap">
          <img class="card-img" src="${alb.large_image_url || DEFAULT_SONG_COVER}" alt="${alb.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <button class="card-play-btn" title="Play ${alb.name}">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <span class="card-title">${alb.name}</span>
        <span class="card-desc">${alb.album_artist || 'Soundtrack'}</span>
      </div>
    `).join('');

    albumsShelf.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', () => {
        const albumName = card.getAttribute('data-album');
        filterByAlbumAndOpenPlaylist(albumName);
      });
    });

    // 5. Library Shelf
    libraryShelf.innerHTML = allSongs.slice(8, 16).map(s => createSpotifyCardHtml(s)).join('');
    attachCardListeners(libraryShelf, allSongs);
  }

  function createSpotifyCardHtml(song) {
    return `
      <div class="spotify-card" data-song-id="${song.id}">
        <div class="card-img-wrap">
          <img class="card-img" src="${song.cover_image_url || DEFAULT_SONG_COVER}" alt="${song.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';" loading="lazy">
          <button class="card-play-btn" title="Play ${song.title}">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <span class="card-title" title="${song.title}">${song.title}</span>
        <span class="card-desc" title="${song.artist}">${song.artist}</span>
      </div>
    `;
  }

  function attachCardListeners(container, playlistContext) {
    container.querySelectorAll('.spotify-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-song-id');
        playTrackById(id, playlistContext);
      });
    });
  }

  // ==========================================================================
  // SIDEBAR PLAYLISTS & ARTISTS
  // ==========================================================================
  async function renderSidebarPlaylists() {
    const likedSongs = allSongs.filter(s => s.is_liked);
    if (libLikedCount) libLikedCount.textContent = likedSongs.length;
    if (libAllTracksCount) libAllTracksCount.textContent = allSongs.length;

    if (!dynamicLibraryList) return;

    // Build sidebar list: fixed playlists first, then dynamic music director playlists
    const fixedPlaylistItems = PLAYLIST_DEFINITIONS.map(pl => {
      const songs = getPlaylistSongs(pl);
      const coverUrl = pl.cover || DEFAULT_SONG_COVER;
      const sub = pl.type === 'all' ? `Playlist • ${songs.length} songs` :
        pl.type === 'other' ? `Playlist • ${songs.length} songs` :
          `Playlist • ${songs.length} songs`;
      return `
        <div class="library-item" data-type="playlist" data-playlist-id="${pl.id}" data-playlist-name="${pl.name}">
          <img class="library-item-img" src="${coverUrl}" alt="${pl.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <div class="library-item-meta">
            <span class="library-item-title">${pl.name}</span>
            <span class="library-item-sub">${sub}</span>
          </div>
        </div>
      `;
    }).join('');

    // Dynamic music director playlists (only those with songs, excluding already-fixed artists)
    const fixedAliases = PLAYLIST_DEFINITIONS
      .filter(p => p.type === 'artist')
      .flatMap(p => p.aliases);

    const directorItems = KNOWN_MUSIC_DIRECTORS.map(dir => {
      // Skip if this director is already covered by a fixed playlist
      const isFixed = fixedAliases.some(alias =>
        dir.aliases.some(da => da.includes(alias) || alias.includes(da))
      );
      if (isFixed) return '';
      const songs = getDirectorSongs(dir, allSongs);
      if (songs.length === 0) return '';
      const coverUrl = dir.cover || DEFAULT_SONG_COVER;
      return `
        <div class="library-item" data-type="director" data-director="${dir.name}">
          <img class="library-item-img circle" src="${coverUrl}" alt="${dir.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <div class="library-item-meta">
            <span class="library-item-title">${dir.name}</span>
            <span class="library-item-sub">Artist • ${songs.length} songs</span>
          </div>
        </div>
      `;
    }).join('');

    dynamicLibraryList.innerHTML = fixedPlaylistItems + directorItems;

    // Fixed playlist click handlers
    dynamicLibraryList.querySelectorAll('.library-item[data-type="playlist"]').forEach(item => {
      item.addEventListener('click', () => {
        dynamicLibraryList.querySelectorAll('.library-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const plName = item.getAttribute('data-playlist-name');
        const plDef = PLAYLIST_DEFINITIONS.find(p => p.name === plName);
        if (!plDef) return;
        const tracks = getPlaylistSongs(plDef);
        const desc = plDef.type === 'all'
          ? `Complete library with ${tracks.length} songs`
          : plDef.type === 'folder'
            ? `Songs from folder "${plDef.name}" • ${tracks.length} songs`
            : plDef.type === 'other'
              ? `All songs not in the main artist playlists • ${tracks.length} songs`
              : `Songs by ${plDef.name} • ${tracks.length} songs`;
        openPlaylistView(plDef.name, desc, plDef.cover, tracks);
      });
    });

    // Music director playlist click handlers
    dynamicLibraryList.querySelectorAll('.library-item[data-type="director"]').forEach(item => {
      item.addEventListener('click', () => {
        dynamicLibraryList.querySelectorAll('.library-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const dirName = item.getAttribute('data-director');
        const dirObj = KNOWN_MUSIC_DIRECTORS.find(d => d.name === dirName);
        if (!dirObj) return;
        const songs = getDirectorSongs(dirObj, allSongs);
        if (songs.length > 0) {
          openPlaylistView(
            dirObj.name,
            `Songs by ${dirObj.name} • ${songs.length} songs`,
            dirObj.cover || songs[0]?.cover_image_url,
            songs
          );
        }
      });
    });

    // Static sidebar items (Liked Songs, All Tracks) - wire up if they exist
    document.querySelectorAll('.library-items-list .library-item[data-target]').forEach(item => {
      item.onclick = async () => {
        document.querySelectorAll('.library-items-list .library-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        if (target === 'liked') {
          openPlaylistView('Liked Songs', 'Songs you have liked on Dheemafy', '/images/playlists/liked_songs.svg', allSongs.filter(s => s.is_liked));
        } else if (target === 'all') {
          const sorted = getAlphabeticalSongs();
          openPlaylistView('All Songs', `Complete library with ${sorted.length} songs in alphabetical order`, '/images/playlists/all_songs.svg', sorted);
        }
      };
    });
  }

  async function openFolderPlaylist(folderName, plId) {
    if (!folderName) return;
    const norm = folderName.toLowerCase().trim();
    let tracks = [];
    let desc = '';
    let cover = '';

    if (norm === 'all songs' || norm === 'all') {
      tracks = getAlphabeticalSongs();
      desc = `Complete library with ${tracks.length} songs in alphabetical order`;
      cover = '/images/playlists/all_songs.svg';
    } else {
      tracks = allSongs.filter(s => (s.folder || '').toLowerCase().includes(norm));
      desc = `Songs from folder "${folderName}" • ${tracks.length} songs`;
      const slug = norm.replace(/[^a-z0-9]+/g, '_');
      cover = `/images/playlists/${slug}.svg`;
    }

    if (tracks.length === 0 && plId) {
      try {
        const res = await fetch(`/api/playlists/${encodeURIComponent(plId)}`);
        const json = await res.json();
        if (json && json.data && json.data.tracks) {
          tracks = json.data.tracks;
          desc = json.data.comment || desc;
          cover = json.data.uploaded_image || cover;
        }
      } catch (e) {
        console.warn('Error fetching playlist detail:', e);
      }
    }

    openPlaylistView(folderName, desc, cover, tracks);
  }

  // ==========================================================================
  // PLAYLIST / TRACK TABLE VIEW
  // ==========================================================================
  function openPlaylistView(title, desc, coverUrl, trackList) {
    const uniqueTrackList = deduplicateSongList(trackList);
    // FIX-2: Only update the BROWSING context here.
    // The active playback queue (activePlaybackPlaylist) is ONLY replaced when the user
    // explicitly presses Play / Play All on this playlist — NOT by merely opening it.
    currentPlaylist = uniqueTrackList;
    currentRoute = 'playlist';

    playlistTitle.textContent = title;
    playlistDesc.textContent = desc;
    playlistCoverImg.src = coverUrl || DEFAULT_SONG_COVER;
    playlistTrackCount.textContent = `${uniqueTrackList.length} songs`;

    const totalSeconds = uniqueTrackList.reduce((acc, s) => acc + (s.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    playlistTotalDuration.textContent = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

    setAmbientColor(title);
    renderTrackTableRows(uniqueTrackList);

    // Switch view
    exitSearchView();
    viewHome.classList.remove('active');
    viewSearch.classList.remove('active');
    viewArtist.classList.remove('active');
    viewPlaylist.classList.add('active');

    mainScrollView.scrollTop = 0;
  }

  function renderTrackTableRows(tracks) {
    playlistTrackRows.innerHTML = tracks.map((song, idx) => {
      const isCurrent = currentTrackIndex >= 0 && currentPlaylist[currentTrackIndex] && currentPlaylist[currentTrackIndex].id === song.id;
      const rowClass = `table-row ${isCurrent ? 'playing' : ''}`;
      const cover = song.cover_image_url || DEFAULT_SONG_COVER;
      const albumOrMovie = song.movie ? `From "${song.movie}"` : (song.album || 'Single');

      return `
        <div class="${rowClass}" data-song-id="${song.id}" data-index="${idx}">
          <div class="row-num">
            <span class="row-index-num">${idx + 1}</span>
            <span class="row-play-icon">
              ${isCurrent && isPlaying ? `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ` : `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              `}
            </span>
          </div>
          <div class="row-title-col">
            <img class="row-thumb" src="${cover}" alt="${song.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';" loading="lazy">
            <div class="row-text">
              <span class="row-song-title" title="${song.title}">${song.title}</span>
              <span class="row-artist-name">${renderArtistLinksHtml(song)}</span>
            </div>
          </div>
          <div class="row-album-col" title="${albumOrMovie}">${albumOrMovie}</div>
          <div class="row-date-col">${song.language || 'Master'}</div>
          <div class="row-time-col">
            <button class="row-heart-btn ${song.is_liked ? 'liked' : ''}" data-id="${song.id}" title="${song.is_liked ? 'Unlike' : 'Like'}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="${song.is_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
            <span class="row-dur-span" data-song-id="${song.id}">${formatDuration(song.duration)}</span>
          </div>
        </div>
      `;
    }).join('');

    playlistTrackRows.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-heart-btn') || e.target.closest('.artist-link-item')) return;
        const index = parseInt(row.getAttribute('data-index'), 10);
        // FIX-2: Clicking a row commits the browsing playlist to the active playback queue
        const isAlreadyActivePlaylist = (activePlaybackPlaylist === currentPlaylist ||
          (activePlaybackPlaylist.length === currentPlaylist.length &&
            activePlaybackPlaylist[0] && currentPlaylist[0] &&
            activePlaybackPlaylist[0].id === currentPlaylist[0].id));
        if (!isAlreadyActivePlaylist) {
          // Commit browsing playlist to active playback
          activePlaybackPlaylist = [...currentPlaylist];
          shufflePlaylistVersion++; // invalidate shuffle queue
        }
        if (currentTrackIndex === index && activePlaybackPlaylist[index] &&
          currentSong && currentSong.id === activePlaybackPlaylist[index].id) {
          togglePlayPause();
        } else {
          playTrackAtIndex(index);
        }
      });
    });

    playlistTrackRows.querySelectorAll('.row-heart-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        await toggleLikeSong(id);
      });
    });

    attachArtistLinkListeners(playlistTrackRows);
  }

  function filterByArtistAndOpenPlaylist(artistName) {
    openArtistView(artistName);
  }

  function filterByAlbumAndOpenPlaylist(albumName) {
    const matched = allSongs.filter(s => (s.album || '').toLowerCase().includes(albumName.toLowerCase()));
    openPlaylistView(
      albumName,
      `Soundtrack album streamed from Cloudinary`,
      matched[0] ? matched[0].cover_image_url : null,
      matched.length > 0 ? matched : allSongs
    );
  }

  // ==========================================================================
  // DYNAMIC ARTIST PAGE & TRACKS
  // ==========================================================================
  async function openArtistView(artistNameOrSlug) {
    if (!artistNameOrSlug) return;
    currentRoute = 'artist';

    // Switch view to Artist
    exitSearchView();
    viewHome.classList.remove('active');
    viewPlaylist.classList.remove('active');
    viewSearch.classList.remove('active');
    viewArtist.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    mainScrollView.scrollTop = 0;

    // Loading state
    artistViewName.textContent = artistNameOrSlug;
    artistViewStats.textContent = 'Loading songs...';
    artistTrackRows.innerHTML = '<div style="padding: 24px; color: #b3b3b3;">Loading artist discography...</div>';

    try {
      const res = await fetch(`/api/artists/${encodeURIComponent(artistNameOrSlug)}`);
      const json = await res.json();

      const artist = (json && json.data && (json.data.artist || json.data));
      const songs = (json && json.data && json.data.songs) || [];

      if (!artist || !artist.name) {
        showToast(`Artist not found`);
        return;
      }

      currentArtist = artist;
      currentArtistSongs = songs;

      artistViewName.textContent = artist.name;
      const count = songs.length;
      artistViewStats.textContent = `${count} ${count === 1 ? 'song' : 'songs'} credited in Dheemafy library`;

      const heroImg = artist.large_image_url || (songs[0] && songs[0].cover_image_url) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200';
      artistHeroBackdrop.style.backgroundImage = `url("${heroImg}")`;
      setAmbientColor(artist.name);

      renderArtistTrackRows(songs);
    } catch (err) {
      console.error('Failed to open artist view:', err);
      showToast('Error loading artist details');
    }
  }

  function renderArtistTrackRows(tracks) {
    artistTrackRows.innerHTML = tracks.map((song, idx) => {
      const isCurrent = currentTrackIndex >= 0 && currentPlaylist[currentTrackIndex] && currentPlaylist[currentTrackIndex].id === song.id;
      const rowClass = `table-row ${isCurrent ? 'playing' : ''}`;
      const cover = song.cover_image_url || DEFAULT_SONG_COVER;
      const albumOrMovie = song.movie ? `From "${song.movie}"` : (song.album || 'Single');

      return `
        <div class="${rowClass}" data-song-id="${song.id}" data-index="${idx}">
          <div class="row-num">
            <span class="row-index-num">${idx + 1}</span>
            <span class="row-play-icon">
              ${isCurrent && isPlaying ? `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ` : `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              `}
            </span>
          </div>
          <div class="row-title-col">
            <img class="row-thumb" src="${cover}" alt="${song.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';" loading="lazy">
            <div class="row-text">
              <span class="row-song-title" title="${song.title}">${song.title}</span>
              <span class="row-artist-name">${renderArtistLinksHtml(song)}</span>
            </div>
          </div>
          <div class="row-album-col" title="${albumOrMovie}">${albumOrMovie}</div>
          <div class="row-date-col">${song.language || 'Master'}</div>
          <div class="row-time-col">
            <button class="row-heart-btn ${song.is_liked ? 'liked' : ''}" data-id="${song.id}" title="${song.is_liked ? 'Unlike' : 'Like'}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="${song.is_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
            <span class="row-dur-span" data-song-id="${song.id}">${formatDuration(song.duration)}</span>
          </div>
        </div>
      `;
    }).join('');

    artistTrackRows.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-heart-btn') || e.target.closest('.artist-link-item')) return;
        const index = parseInt(row.getAttribute('data-index'), 10);
        playTrackById(tracks[index].id, tracks);
      });
    });

    artistTrackRows.querySelectorAll('.row-heart-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        await toggleLikeSong(id);
      });
    });

    attachArtistLinkListeners(artistTrackRows);
  }

  btnArtistPlayAll.addEventListener('click', () => {
    if (currentArtistSongs && currentArtistSongs.length > 0) {
      playTrackById(currentArtistSongs[0].id, currentArtistSongs);
    }
  });

  btnArtistFollow.addEventListener('click', () => {
    const isFollowing = btnArtistFollow.textContent === 'Following';
    btnArtistFollow.textContent = isFollowing ? 'Follow' : 'Following';
    showToast(isFollowing ? 'Unfollowed artist' : 'Following artist');
  });

  // ==========================================================================
  // SEARCH LOGIC
  function exitSearchView() {
    const topbar = document.getElementById('spotifyGlobalTopbar');
    if (topbar) topbar.classList.remove('search-route-active');
    if (mainSearchWrap) mainSearchWrap.classList.remove('search-route-active');
    if (mobileHeaderChips) mobileHeaderChips.style.display = '';
  }

  // ==========================================================================
  function openSearchView() {
    currentRoute = 'search';
    viewHome.classList.remove('active');
    viewPlaylist.classList.remove('active');
    viewArtist.classList.remove('active');
    viewSearch.classList.add('active');

    const topbar = document.getElementById('spotifyGlobalTopbar');
    if (topbar) topbar.classList.add('search-route-active');
    if (mainSearchWrap) mainSearchWrap.classList.add('search-route-active');
    if (mobileHeaderChips) mobileHeaderChips.style.display = 'none';

    searchInput.focus();
    mainScrollView.scrollTop = 0;
  }

  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    const rawQuery = (searchInput.value || '').trim();
    btnClearSearch.classList.toggle('hidden', !rawQuery);

    if (!rawQuery) {
      searchBrowseTiles.classList.remove('hidden');
      searchResultsSection.classList.add('hidden');
      return;
    }

    searchBrowseTiles.classList.add('hidden');
    searchResultsSection.classList.remove('hidden');

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(rawQuery)}`);
        const json = await res.json();
        const results = (json && json.data) || { songs: [], artists: [] };
        const songs = results.songs || [];
        const artists = results.artists || [];

        if (songs.length === 0 && artists.length === 0) {
          topResultCard.innerHTML = `<p style="color: #b3b3b3; padding: 24px;">No results found for "${rawQuery}"</p>`;
          searchMiniRows.innerHTML = '';
          searchTableRows.innerHTML = '';
          return;
        }

        // Top Result determination
        const queryLower = rawQuery.toLowerCase();
        const matchedArtist = artists.find(a => a.name.toLowerCase() === queryLower) || artists[0];
        const isArtistTop = matchedArtist && (!songs[0] || songs[0].title.toLowerCase() !== queryLower);

        if (isArtistTop && matchedArtist) {
          topResultCard.innerHTML = `
            <img class="top-result-img" style="border-radius: 50%;" src="${matchedArtist.large_image_url || DEFAULT_SONG_COVER}" alt="${matchedArtist.name}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
            <h2 class="top-result-title">${matchedArtist.name}</h2>
            <p class="top-result-sub">Artist • ${matchedArtist.song_count || songs.length} songs</p>
            <span class="top-result-badge">Artist</span>
            <button class="card-play-btn" style="opacity: 1; transform: none; right: 20px; bottom: 20px;" title="View ${matchedArtist.name}">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          `;
          topResultCard.onclick = () => openArtistView(matchedArtist.slug || matchedArtist.name);
        } else if (songs.length > 0) {
          const top = songs[0];
          topResultCard.innerHTML = `
            <img class="top-result-img" src="${top.cover_image_url || DEFAULT_SONG_COVER}" alt="${top.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
            <h2 class="top-result-title">${top.title}</h2>
            <p class="top-result-sub">${top.artist} • <span style="color:#fff;">${top.movie ? `From "${top.movie}"` : (top.album || 'Single')}</span></p>
            <span class="top-result-badge">Song</span>
            <button class="card-play-btn" style="opacity: 1; transform: none; right: 20px; bottom: 20px;" title="Play ${top.title}">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          `;
          topResultCard.onclick = () => playTrackById(top.id, songs);
        }

        // Mini rows (top 4)
        searchMiniRows.innerHTML = songs.slice(0, 4).map((s, idx) => `
          <div class="table-row ${currentSong && currentSong.id === s.id ? 'playing' : ''}" data-song-id="${s.id}" data-index="${idx}">
            <div class="row-title-col">
              <img class="row-thumb" src="${s.cover_image_url || DEFAULT_SONG_COVER}" alt="${s.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
              <div class="row-text">
                <span class="row-song-title">${s.title}</span>
                <span class="row-artist-name">${renderArtistLinksHtml(s)}</span>
              </div>
            </div>
            <div class="row-time-col">
              <span class="row-dur-span" data-song-id="${s.id}">${formatDuration(s.duration)}</span>
            </div>
          </div>
        `).join('');

        searchMiniRows.querySelectorAll('.table-row').forEach(r => {
          r.addEventListener('click', (e) => {
            if (e.target.closest('.artist-link-item')) return;
            const id = r.getAttribute('data-song-id');
            playTrackById(id, songs);
          });
        });
        attachArtistLinkListeners(searchMiniRows);

        // Full table: Render all matching songs in order
        searchTableRows.innerHTML = songs.map((song, idx) => `
          <div class="table-row ${currentSong && currentSong.id === song.id ? 'playing' : ''}" data-song-id="${song.id}" data-index="${idx}">
            <div class="row-num"><span class="row-index-num">${idx + 1}</span></div>
            <div class="row-title-col">
              <img class="row-thumb" src="${song.cover_image_url || DEFAULT_SONG_COVER}" alt="${song.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
              <div class="row-text">
                <span class="row-song-title">${song.title}</span>
                <span class="row-artist-name">${renderArtistLinksHtml(song)}</span>
              </div>
            </div>
            <div class="row-album-col">${song.movie ? `From "${song.movie}"` : (song.album || 'Single')}</div>
            <div class="row-date-col">${song.language || 'Master'}</div>
            <div class="row-time-col">
              <button class="row-heart-btn ${song.is_liked ? 'liked' : ''}" data-id="${song.id}" title="${song.is_liked ? 'Unlike' : 'Like'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="${song.is_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
              <span class="row-dur-span" data-song-id="${song.id}">${formatDuration(song.duration)}</span>
            </div>
          </div>
        `).join('');

        searchTableRows.querySelectorAll('.table-row').forEach(r => {
          r.addEventListener('click', (e) => {
            if (e.target.closest('.artist-link-item') || e.target.closest('.row-heart-btn')) return;
            const id = r.getAttribute('data-song-id');
            playTrackById(id, songs);
          });
        });

        searchTableRows.querySelectorAll('.row-heart-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            await toggleLikeSong(id);
          });
        });

        attachArtistLinkListeners(searchTableRows);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 150);
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.classList.add('hidden');
    searchBrowseTiles.classList.remove('hidden');
    searchResultsSection.classList.add('hidden');
    searchInput.focus();
  });

  // Browse tile clicks
  document.querySelectorAll('.genre-card').forEach(tile => {
    tile.addEventListener('click', () => {
      const term = tile.getAttribute('data-search');
      searchInput.value = term;
      searchInput.dispatchEvent(new Event('input'));
    });
  });

  // ==========================================================================
  // PLAYBACK LOGIC & AUDIO STREAMING ENGINE
  // ==========================================================================
  let _isTransitioning = false;
  let _lastEndedTrackId = null;
  let _lastEndedTimestamp = 0;
  // Timestamp of the last audio.src change — used to suppress spurious 'pause' events
  // that mobile browsers fire when the src is swapped during an auto-advance transition.
  let _lastSrcChangedAt = 0;

  function updateAllPlayerUI(song) {
    if (!song) return;

    // 1. Update Bottom Player UI
    if (barTitle) barTitle.textContent = song.title || '';
    if (barArtist) {
      barArtist.innerHTML = renderArtistLinksHtml(song);
      attachArtistLinkListeners(barArtist);
    }
    if (barThumb) barThumb.src = song.cover_image_url || DEFAULT_SONG_COVER;
    if (barHeartBtn) barHeartBtn.classList.toggle('liked', Boolean(song.is_liked));
    if (barTotalTime) barTotalTime.textContent = formatDuration(song.duration);

    // 2. Update Right Panel UI (Now Playing View)
    if (rightTrackName) rightTrackName.textContent = song.title || '';
    if (rightArtistName) {
      rightArtistName.innerHTML = renderArtistLinksHtml(song);
      attachArtistLinkListeners(rightArtistName);
    }
    if (rightCoverImg) rightCoverImg.src = song.cover_image_url || DEFAULT_SONG_COVER;
    if (rightArtistCardName) {
      const firstArtist = song.artist ? song.artist.split(',')[0].trim() : 'Artist';
      rightArtistCardName.textContent = firstArtist;
      rightArtistCardName.style.cursor = 'pointer';
      rightArtistCardName.onclick = () => openArtistView(firstArtist);
    }
    const rightHeaderTitle = document.getElementById('rightHeaderTitle');
    if (rightHeaderTitle) {
      rightHeaderTitle.textContent = song.movie ? `From "${song.movie}"` : (song.album || song.title || 'Now Playing');
    }
    const rightBtnFollow = document.getElementById('rightBtnFollow');
    if (rightBtnFollow) {
      rightBtnFollow.onclick = (e) => {
        e.stopPropagation();
        const isFollowing = rightBtnFollow.textContent === 'Following';
        rightBtnFollow.textContent = isFollowing ? 'Follow' : 'Following';
        showToast(isFollowing ? 'Unfollowed artist' : 'Following artist');
      };
    }

    // 3. Update Fullscreen UI
    if (fsTrackTitle) fsTrackTitle.textContent = song.title || '';
    if (fsArtistName) fsArtistName.textContent = song.artist || '';
    if (fsHeaderContextSub) fsHeaderContextSub.textContent = 'Playing from Dheemafy';
    if (fsHeaderPlaylistName) {
      const searchKey = song.movie || song.title || 'Dheemafy';
      fsHeaderPlaylistName.textContent = `"${searchKey.toLowerCase()}"`;
    }
    const coverArt = song.cover_image_url || DEFAULT_SONG_COVER;
    if (fsCoverImg) fsCoverImg.src = coverArt;
    if (fsThumbImg) fsThumbImg.src = coverArt;
    if (fsBackdrop) fsBackdrop.style.backgroundImage = `url('${coverArt}')`;
    if (fsTotalTime) fsTotalTime.textContent = formatDuration(song.duration);
    if (fsAddSvgPlus && fsAddSvgCheck) {
      fsAddSvgPlus.classList.toggle('hidden', Boolean(song.is_liked));
      fsAddSvgCheck.classList.toggle('hidden', !Boolean(song.is_liked));
    }

    // 5. Update Mobile Mini Player UI
    const topLabel = mobilePlayerTopText || mobilePlayerTopLabel;
    if (topLabel) {
      topLabel.textContent = `Similar to ${song.movie || song.album || 'the album you chose'}`;
    }
    if (mobileAddSvgPlus && mobileAddSvgCheck) {
      mobileAddSvgPlus.classList.toggle('hidden', Boolean(song.is_liked));
      mobileAddSvgCheck.classList.toggle('hidden', !Boolean(song.is_liked));
    }

    // 6. Update Queue Next Row Preview (FIX-2: read from activePlaybackPlaylist)
    if (activePlaybackPlaylist && activePlaybackPlaylist.length > 0) {
      const nextIdx = (currentTrackIndex + 1) % activePlaybackPlaylist.length;
      const nextSong = activePlaybackPlaylist[nextIdx];
      if (nextSong && nextQueueRow) {
        nextQueueRow.innerHTML = `
          <img class="row-thumb" src="${nextSong.cover_image_url || DEFAULT_SONG_COVER}" alt="${nextSong.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <div class="row-text">
            <span class="row-song-title">${nextSong.title}</span>
            <span class="row-artist-name">${renderArtistLinksHtml(nextSong)}</span>
          </div>
        `;
        attachArtistLinkListeners(nextQueueRow);
      }
    }

    if (ambientMesh) setAmbientColor(song.title);

    // 7. Refresh row highlighting in active views
    if (currentRoute === 'playlist') {
      renderTrackTableRows(currentPlaylist);
    } else if (currentRoute === 'artist' && currentArtistSongs.length > 0) {
      renderArtistTrackRows(currentArtistSongs);
    }
  }

  // Pre-load track into UI on startup without playing (dynamic default song)
  function loadTrackIntoPlayerBar(song) {
    if (!song) return;
    currentSong = song;

    const directUrl = song.audio_url || song.audioUrl;
    if (audio && directUrl) {
      audio.dataset.currentSongId = song.id;
      if (audio.src !== directUrl) {
        audio.src = directUrl;
      }
    }

    updateMediaSession(song);
    updateAllPlayerUI(song);
  }

  function playTrackById(songId, playlistContext) {
    // FIX-2: playTrackById always commits the given context to the ACTIVE PLAYBACK queue.
    // This is the correct place to do so — a direct play action by the user.
    if (playlistContext && playlistContext.length > 0) {
      activePlaybackPlaylist = deduplicateSongList(playlistContext);
      shufflePlaylistVersion++; // invalidate shuffle queue for new playlist
    }
    const idx = activePlaybackPlaylist.findIndex(s => s.id === songId);
    if (idx !== -1) {
      playTrackAtIndex(idx);
    } else {
      const fallback = allSongs.find(s => s.id === songId);
      if (fallback) {
        activePlaybackPlaylist = deduplicateSongList([fallback, ...allSongs.filter(s => s.id !== songId)]);
        shufflePlaylistVersion++;
        playTrackAtIndex(0);
      }
    }
  }

  // Central Authoritative Play Function
  // Always reads from activePlaybackPlaylist — the engine's queue.
  // Internal: resolve song index with guard
  function _doPlayTrack(song, index, directStreamUrl) {
    const trackLabel = `"${song.title}" [${index + 1}/${activePlaybackPlaylist.length}] id=${song.id}`;
    console.log(`[Player] ▶ PLAY: ${trackLabel}`);
    console.log(`[Player]   URL: ${directStreamUrl}`);
    console.log(`[Player]   audio.src BEFORE: ${audio.src ? audio.src.substring(0, 80) : 'empty'}`);
    console.log(`[Player]   audio.readyState BEFORE: ${audio.readyState}`);
    console.log(`[Player]   audio.networkState BEFORE: ${audio.networkState}`);
    console.log(`[Player]   audio.error BEFORE: ${audio.error ? audio.error.code : 'none'}`);
    console.log(`[Player]   _isTransitioning: ${_isTransitioning}, isPlaying: ${isPlaying}`);

    // KEY FIX 1: Always set src and call load() before play().
    // On mobile WebKit/Chrome, omitting audio.load() after src change
    // causes play() to fail silently on the 3rd+ track because the audio
    // element is stuck in NETWORK_LOADING state from the previous stream abort.
    _lastSrcChangedAt = Date.now();
    audio.src = directStreamUrl;
    audio.dataset.currentSongId = song.id;
    audio.load(); // ← CRITICAL: resets decoder and network state for new src
    _lastTimeUpdateAt = Date.now();

    console.log(`[Player]   audio.src AFTER load(): ${audio.src ? audio.src.substring(0, 80) : 'empty'}`);

    // Update MediaSession for lock screen immediately
    updateMediaSession(song);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    // KEY FIX 2: Trigger play(). If AbortError (browser aborted prior stream),
    // keep _isTransitioning=true through the retry so watchdog cannot interfere.
    function _attemptPlay(retryCount) {
      if (currentSong && currentSong.id !== song.id) {
        // Another track was requested before we could play — bail cleanly
        console.log(`[Player] ✗ Aborted stale play for ${trackLabel} (superseded)`);
        _isTransitioning = false;
        return;
      }

      console.log(`[Player]   audio.play() attempt #${retryCount + 1} for ${trackLabel}`);
      const p = audio.play();
      if (p === undefined) {
        // Older browser — synchronous
        _isTransitioning = false;
        setPlayingState(true);
        console.log(`[Player] ✓ Play (sync) confirmed: ${trackLabel}`);
        return;
      }
      p.then(() => {
        _isTransitioning = false;
        setPlayingState(true);
        console.log(`[Player] ✓ Play promise resolved: ${trackLabel}`);
      }).catch(err => {
        console.warn(`[Player] ✗ Play error for ${trackLabel}: [${err.name}] ${err.message}`);
        console.warn(`[Player]   audio.readyState: ${audio.readyState}, audio.networkState: ${audio.networkState}, audio.error: ${audio.error ? audio.error.code : 'none'}`);

        if (err.name === 'AbortError') {
          // AbortError: The browser aborted the previous src load when we changed src.
          // This is NORMAL. Keep _isTransitioning=true and retry after the browser
          // has settled. This is the key fix for the Song 3 deterministic failure.
          console.log(`[Player]   AbortError — retrying in 300ms (retry #${retryCount + 1}, _isTransitioning stays true)`);
          if (retryCount < 3) {
            setTimeout(() => _attemptPlay(retryCount + 1), 300);
          } else {
            console.error(`[Player]   AbortError: exhausted retries for ${trackLabel}`);
            _isTransitioning = false;
            setPlayingState(false);
          }
        } else if (err.name === 'NotAllowedError') {
          // Mobile browser requires user gesture. The audio session was interrupted.
          console.warn(`[Player]   NotAllowedError — user gesture required for ${trackLabel}`);
          _isTransitioning = false;
          // Keep isPlaying=true visually so user knows audio WANTS to play
          // but the OS paused it (lock screen, call, etc.)
          setPlayingState(true); // optimistic — MediaSession will reflect real state
          if (!document.hidden) {
            showToast('Tap play to resume audio');
          }
        } else if (err.name === 'NotSupportedError') {
          // Codec or URL error — try loading again once
          console.warn(`[Player]   NotSupportedError — re-loading src for ${trackLabel}`);
          if (retryCount < 1) {
            audio.load();
            setTimeout(() => _attemptPlay(retryCount + 1), 500);
          } else {
            _isTransitioning = false;
            setPlayingState(false);
          }
        } else {
          _isTransitioning = false;
          setPlayingState(false);
        }
      });
    }

    try {
      _attemptPlay(0);
    } catch (err) {
      _isTransitioning = false;
      console.error('[Player] Audio play exception:', err);
      setPlayingState(false);
    }
  }

  function playTrackAtIndex(index) {
    console.log(`[Player] playTrackAtIndex(${index}) called — queue length: ${activePlaybackPlaylist.length}, currentTrackIndex was: ${currentTrackIndex}`);

    if (index < 0 || index >= activePlaybackPlaylist.length) {
      console.error(`[Player] ✗ Index ${index} out of bounds (queue: ${activePlaybackPlaylist.length})`);
      return;
    }

    _isTransitioning = true;
    currentTrackIndex = index;
    const song = activePlaybackPlaylist[index];
    if (!song) {
      console.error(`[Player] ✗ No song at index ${index}`);
      _isTransitioning = false;
      return;
    }
    currentSong = song;

    const directStreamUrl = song.audio_url || song.audioUrl;
    if (!directStreamUrl) {
      console.error('[Player] ✗ No audio URL for track:', song.title, song);
      _isTransitioning = false;
      return;
    }

    // Update UI first (non-blocking)
    try {
      updateAllPlayerUI(song);
    } catch (uiErr) {
      console.warn('[Player] UI update warning:', uiErr);
    }

    // Pre-warm next tracks
    if (audioPreloader && audioPreloader.preloadUpcoming) {
      audioPreloader.preloadUpcoming(currentTrackIndex, activePlaybackPlaylist, 5);
    }

    // Start playback (with load + play)
    _doPlayTrack(song, index, directStreamUrl);

    // Record analytics (non-blocking, fire-and-forget)
    try {
      fetch('/api/playback/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id, durationPlayed: 32, completed: false })
      }).catch(() => { });
    } catch (_) { }
  }

  function setPlayingState(playing) {
    isPlaying = playing;
    if (barBtnPlayPause) barBtnPlayPause.title = playing ? 'Pause' : 'Play';
    if (barPlaySvg) barPlaySvg.classList.toggle('hidden', playing);
    if (barPauseSvg) barPauseSvg.classList.toggle('hidden', !playing);
    if (soundwaveIndicator) soundwaveIndicator.classList.toggle('hidden', !playing);
    if (mobileBarPlaySvg) mobileBarPlaySvg.classList.toggle('hidden', playing);
    if (mobileBarPauseSvg) mobileBarPauseSvg.classList.toggle('hidden', !playing);
    if (fsPlaySvg) fsPlaySvg.classList.toggle('hidden', playing);
    if (fsPauseSvg) fsPauseSvg.classList.toggle('hidden', !playing);

    // Keep mobile screen alive while playing, release when paused
    if (playing) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Sync lockscreen / Bluetooth playback state
    updateMediaSessionPlaybackState();

    // Synchronize play icons across table rows
    if (currentSong) {
      document.querySelectorAll('.table-row').forEach(row => {
        const id = row.getAttribute('data-song-id');
        if (id === currentSong.id) {
          row.classList.toggle('playing', playing);
          const iconSpan = row.querySelector('.row-play-icon');
          if (iconSpan) {
            iconSpan.innerHTML = playing ? `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ` : `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            `;
          }
        } else {
          row.classList.remove('playing');
        }
      });

      // Synchronize playing indicator on mobile track rows
      document.querySelectorAll('.mobile-track-row').forEach(row => {
        const id = row.getAttribute('data-song-id');
        const isCurrent = id === currentSong.id;
        const titleEl = row.querySelector('.mobile-track-title');
        if (titleEl) {
          titleEl.classList.toggle('active', isCurrent);
          const dot = titleEl.querySelector('.playing-dot-prefix');
          if (isCurrent && playing) {
            if (!dot) {
              titleEl.insertAdjacentHTML('afterbegin', '<span class="playing-dot-prefix" style="color:#1ed760; font-weight:800; margin-right:4px;">...</span>');
            }
          } else {
            if (dot) dot.remove();
          }
        }
      });
    }
  }

  function resumePlayback() {
    if (!currentSong) {
      // FIX-2: Fall back to activePlaybackPlaylist, then allSongs
      if (activePlaybackPlaylist.length > 0) {
        playTrackAtIndex(0);
      } else if (allSongs.length > 0) {
        activePlaybackPlaylist = [...allSongs];
        shufflePlaylistVersion++;
        playTrackAtIndex(0);
      }
      return;
    }

    const directUrl = currentSong.audio_url || currentSong.audioUrl;
    if (!audio.src || audio.src === '' || audio.src === window.location.href) {
      audio.src = directUrl;
    }

    console.log(`[Player] Resuming playback: "${currentSong.title}"`);
    audio.play().then(() => {
      setPlayingState(true);
    }).catch(err => {
      console.warn('[Player] Resume error, re-triggering track:', err);
      playTrackAtIndex(currentTrackIndex);
    });
  }

  function pausePlayback() {
    console.log(`[Player] Pausing playback: "${currentSong ? currentSong.title : 'Unknown'}"`);
    _isTransitioning = false;
    audio.pause();
    setPlayingState(false);
  }

  function togglePlayPause() {
    // FIX-2: use activePlaybackPlaylist for safety checks
    if (activePlaybackPlaylist.length === 0 && allSongs.length > 0) {
      activePlaybackPlaylist = [...allSongs];
      shufflePlaylistVersion++;
    }
    if (currentTrackIndex < 0 || !activePlaybackPlaylist[currentTrackIndex]) {
      if (activePlaybackPlaylist.length > 0) {
        playTrackAtIndex(0);
      }
      return;
    }

    if (audio.paused) {
      resumePlayback();
    } else {
      pausePlayback();
    }

    if (currentRoute === 'playlist') {
      renderTrackTableRows(currentPlaylist);
    } else if (currentRoute === 'artist' && currentArtistSongs.length > 0) {
      renderArtistTrackRows(currentArtistSongs);
    }
  }

  function playNextTrack(isAutoAdvance = false) {
    // FIX-2: Use activePlaybackPlaylist (the engine queue), not currentPlaylist (browsing)
    if (!activePlaybackPlaylist || activePlaybackPlaylist.length === 0) {
      if (allSongs && allSongs.length > 0) {
        activePlaybackPlaylist = [...allSongs];
        shufflePlaylistVersion++;
      } else return;
    }

    let nextIdx;
    if (isShuffle) {
      // Version-based identity guard
      if (shuffleQueueVersion !== shufflePlaylistVersion) {
        shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, currentTrackIndex >= 0 ? currentTrackIndex : 0);
        shuffleQueueVersion = shufflePlaylistVersion;
        shuffleIndex = 0;
      }
      shuffleIndex++;
      if (shuffleIndex >= shuffleQueue.length) {
        if (repeatMode === 'one') {
          nextIdx = currentTrackIndex;
        } else {
          // Continuous Shuffle: Loop back or re-shuffle so music never shuts off
          shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, currentTrackIndex >= 0 ? currentTrackIndex : 0);
          shuffleIndex = 0;
          nextIdx = shuffleQueue[0];
          console.log('[Player] Shuffle queue finished. Looping continuously with new shuffle order.');
        }
      } else {
        nextIdx = shuffleQueue[shuffleIndex];
      }
    } else {
      const isAtEnd = currentTrackIndex + 1 >= activePlaybackPlaylist.length;
      if (isAtEnd && isAutoAdvance) {
        if (repeatMode === 'one') {
          nextIdx = currentTrackIndex; // stay on current song
        } else if (repeatMode === 'all' || activePlaybackPlaylist.length <= 5) {
          // Repeat All or small playlist: seamlessly loop back to track 1
          nextIdx = 0;
          console.log('[Player] End of playlist reached. Looping continuously from track 1.');
        } else {
          // Autoplay Continuous Radio: append unplayed songs from library so music NEVER dies
          const candidateSongs = (allSongs && allSongs.length > 0) ? allSongs : activePlaybackPlaylist;
          const unplayed = candidateSongs.filter(s => !activePlaybackPlaylist.some(q => q.id === s.id));
          if (unplayed.length > 0) {
            const nextAuto = unplayed[Math.floor(Math.random() * unplayed.length)];
            activePlaybackPlaylist.push(nextAuto);
            nextIdx = activePlaybackPlaylist.length - 1;
            console.log(`[Player] Autoplay continuous radio: Queued "${nextAuto.title}" from library.`);
          } else {
            nextIdx = 0; // wrap around
          }
        }
      } else {
        nextIdx = (currentTrackIndex + 1) % activePlaybackPlaylist.length;
      }
    }

    const nextSong = activePlaybackPlaylist[nextIdx];
    console.log(`[Player] Next song: "${nextSong ? nextSong.title : 'Unknown'}" (Index ${nextIdx + 1}/${activePlaybackPlaylist.length}, autoAdvance=${isAutoAdvance})`);
    playTrackAtIndex(nextIdx);
  }

  function playPrevTrack() {
    // FIX-2: Use activePlaybackPlaylist
    if (!activePlaybackPlaylist || activePlaybackPlaylist.length === 0) {
      if (allSongs && allSongs.length > 0) {
        activePlaybackPlaylist = [...allSongs];
        shufflePlaylistVersion++;
      } else return;
    }

    // Standard streaming player rule:
    // If > 3 seconds into the track, restart current song.
    // If <= 3 seconds into the track, navigate to previous song.
    if (audio && audio.currentTime > 3) {
      console.log('[Player] Previous action: restarting current song from beginning');
      audio.currentTime = 0;
      if (audio.paused && isPlaying) {
        audio.play().then(() => setPlayingState(true)).catch(console.warn);
      }
      return;
    }

    let prevIdx;
    if (isShuffle) {
      // FIX-3: Version-based guard
      if (shuffleQueueVersion !== shufflePlaylistVersion) {
        shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, currentTrackIndex >= 0 ? currentTrackIndex : 0);
        shuffleQueueVersion = shufflePlaylistVersion;
        shuffleIndex = 0;
      }
      shuffleIndex = (shuffleIndex - 1 + shuffleQueue.length) % shuffleQueue.length;
      prevIdx = shuffleQueue[shuffleIndex];
    } else {
      prevIdx = (currentTrackIndex - 1 + activePlaybackPlaylist.length) % activePlaybackPlaylist.length;
    }

    const prevSong = activePlaybackPlaylist[prevIdx];
    console.log(`[Player] Previous song: "${prevSong ? prevSong.title : 'Unknown'}" (Index ${prevIdx + 1}/${activePlaybackPlaylist.length})`);
    playTrackAtIndex(prevIdx);
  }

  // Audio Event Listeners
  audio.addEventListener('play', () => {
    console.log('[Player] Audio event: play');
    setPlayingState(true);
  });
  audio.addEventListener('playing', () => {
    console.log('[Player] Audio event: playing');
    _isTransitioning = false;
    setPlayingState(true);
    setLoadingState(false);
  });
  audio.addEventListener('pause', () => {
    const srcAgeMs = Date.now() - _lastSrcChangedAt;
    console.log(`[Player] Audio event: pause — ended=${audio.ended}, transitioning=${_isTransitioning}, srcAge=${srcAgeMs}ms, currentTime=${audio.currentTime.toFixed(2)}`);

    // GUARD 1: Song just finished naturally — browser fires pause right after ended.
    if (audio.ended) {
      console.log('[Player] Pause suppressed — track ended (auto-advance in progress).');
      return;
    }

    // GUARD 2: We are actively transitioning between tracks (load+play in progress).
    if (_isTransitioning) {
      console.log('[Player] Pause suppressed — track transition in progress.');
      return;
    }

    // GUARD 3: Src was just changed — mobile browsers fire a spurious pause when
    // audio.src changes and audio.load() is called. Window is 800ms (tightened
    // from 2000ms) because audio.load() + canplay fires within ~100-200ms on mobile.
    if (srcAgeMs < 800) {
      console.log(`[Player] Pause suppressed — src changed ${srcAgeMs}ms ago (mobile load transient).`);
      return;
    }

    // Genuine user pause or OS-forced pause — update state.
    console.log('[Player] Genuine pause detected — setting isPlaying=false');
    if (audio.paused) {
      setPlayingState(false);
    }
  });

  audio.addEventListener('error', () => {
    const err = audio.error;
    const code = err ? err.code : 'unknown';
    // MEDIA_ERR_ABORTED (code 1) is completely normal when changing track sources.
    // NEVER abort or skip when a previous stream was cleanly aborted!
    if (code === 1 || code === '1') {
      console.log('[Player] Normal track transition abort (code 1). Ignored.');
      return;
    }
    if (_isTransitioning) {
      console.log('[Player] Ignored error event during track transition.');
      return;
    }

    const msg = err ? (err.message || 'Audio decoding error') : 'Unknown audio error';
    console.error(`[Player] Genuine Audio error [code=${code}]:`, msg);
    setPlayingState(false);
    if (barBtnPlayPause) barBtnPlayPause.classList.remove('loading');
    if (fsBtnPlayPause) fsBtnPlayPause.classList.remove('loading');
    if (currentSong && !document.hidden) {
      showToast(`⚠ Could not play "${currentSong.title}". Skipping...`);
    }
    // Auto-advance to next song after short delay if queue or library has tracks
    const availableCount = (activePlaybackPlaylist && activePlaybackPlaylist.length) || (allSongs && allSongs.length) || 0;
    if (availableCount > 1) {
      setTimeout(() => playNextTrack(true), 1500);
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    const total = audio.duration;
    if (total && !isNaN(total) && total > 0) {
      const rounded = Math.round(total);
      barTotalTime.textContent = formatDuration(rounded);
      if (fsTotalTime) fsTotalTime.textContent = formatDuration(rounded);
      if (currentSong) {
        currentSong.duration = rounded;
        document.querySelectorAll(`.row-dur-span[data-song-id="${currentSong.id}"]`).forEach(el => {
          el.textContent = formatDuration(rounded);
        });
      }
      updateMediaSessionPlaybackState();
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (isSeeking) return;
    _lastTimeUpdateAt = Date.now();
    const current = audio.currentTime || 0;
    const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
      ? audio.duration
      : (currentSong && currentSong.duration ? currentSong.duration : 0);

    barCurrentTime.textContent = formatDuration(current);
    if (fsCurrentTime) fsCurrentTime.textContent = formatDuration(current);
    if (total > 0) {
      barTotalTime.textContent = formatDuration(total);
      if (fsTotalTime) fsTotalTime.textContent = formatDuration(total);
      const pct = (current / total) * 100;
      progressFillBar.style.width = `${pct}%`;
      progressHandle.style.left = `${pct}%`;
      if (mobileMiniProgressFill) {
        mobileMiniProgressFill.style.width = `${pct}%`;
      }
      if (fsProgressFill) fsProgressFill.style.width = `${pct}%`;
      if (fsProgressThumb) fsProgressThumb.style.left = `${pct}%`;

      // Fallback: If audio reached end of stream (within 0.5s of total) and has paused,
      // but browser somehow missed firing the native 'ended' event:
      if (total > 10 && current >= (total - 0.5) && audio.paused && isPlaying) {
        console.log('[Player] Audio stream reached end and paused. Advancing to next track.');
        handleSongEnded();
        return;
      }
    }
    const now = Date.now();
    if (now - _lastMsUpdate > 1000) {
      _lastMsUpdate = now;
      updateMediaSessionPlaybackState();
    }
  });

  // Dedicated Ended Event Handler for Continuous Playback
  function handleSongEnded() {
    const now = Date.now();
    const songTitle = currentSong ? currentSong.title : 'Unknown track';
    const songId = currentSong ? currentSong.id : 'unknown';
    console.log(`[Player] ═══ SONG ENDED: "${songTitle}" (id=${songId}) ═══`);
    console.log(`[Player]   currentTrackIndex: ${currentTrackIndex}, queueLength: ${activePlaybackPlaylist.length}`);
    console.log(`[Player]   audio.currentTime: ${audio.currentTime.toFixed(2)}, audio.duration: ${isNaN(audio.duration) ? 'NaN' : audio.duration.toFixed(2)}`);
    console.log(`[Player]   audio.ended: ${audio.ended}, audio.paused: ${audio.paused}`);
    console.log(`[Player]   repeatMode: ${repeatMode}, isShuffle: ${isShuffle}`);
    console.log(`[Player]   timeSinceLastEnded: ${now - _lastEndedTimestamp}ms`);

    // Debounce rapid duplicate ended events within 800ms
    if ((now - _lastEndedTimestamp) < 800) {
      console.warn(`[Player]   DEBOUNCED — duplicate ended event (${now - _lastEndedTimestamp}ms after last). Ignoring.`);
      return;
    }
    _lastEndedTimestamp = now;
    if (currentSong) {
      _lastEndedTrackId = currentSong.id;
    }

    // 3-state repeat
    if (repeatMode === 'one') {
      console.log(`[Player]   Repeat One: replaying "${songTitle}"`);
      audio.currentTime = 0;
      audio.play().catch(err => console.warn('[Player] Repeat play error:', err));
    } else {
      const nextIdx = (currentTrackIndex + 1) % activePlaybackPlaylist.length;
      const nextSong = activePlaybackPlaylist[nextIdx];
      console.log(`[Player]   Auto-advance → nextIdx=${nextIdx}, nextSong="${nextSong ? nextSong.title : 'NONE'}", nextUrl=${nextSong ? (nextSong.audio_url || nextSong.audioUrl || 'MISSING').substring(0, 60) : 'N/A'}`);
      playNextTrack(true);
    }
  }

  audio.addEventListener('ended', handleSongEnded);

  // Network stall watchdog:
  // If audio is supposed to be playing but timeupdate hasn't fired for 8+ seconds,
  // attempt recovery by re-seeking.
  setInterval(() => {
    if (!isPlaying || audio.paused || isSeeking || _isTransitioning) return;
    const current = audio.currentTime || 0;
    const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
      ? audio.duration
      : (currentSong && currentSong.duration ? currentSong.duration : 0);

    // Only force auto-advance if the song has genuinely played (> 15s) and is within 1.5s of total
    if (total > 20 && current > 15 && current >= (total - 1.5)) {
      console.warn('[Player] Track stalled at genuine end of stream. Forcing auto-advance...');
      handleSongEnded();
      return;
    }

    if (audio.readyState >= 3) return; // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA — all good
    const stallDuration = Date.now() - _lastTimeUpdateAt;
    if (_lastTimeUpdateAt > 0 && stallDuration > 8000) {
      console.warn('[Player] Stall detected! readyState=' + audio.readyState + ', stalled for ' + Math.round(stallDuration / 1000) + 's. Attempting recovery...');
      try {
        const currentTime = audio.currentTime;
        audio.currentTime = currentTime; // Re-seek to same position to kick the decoder
        audio.play().catch(() => {});
      } catch (e) {}
    }
  }, 2000);

  // FIX-8: Loading / buffering state management.
  // Shows a 'loading' CSS class on the play buttons during network stalls so users
  // know the player is working, not frozen.
  function setLoadingState(loading) {
    if (barBtnPlayPause) barBtnPlayPause.classList.toggle('loading', loading);
    if (fsBtnPlayPause) fsBtnPlayPause.classList.toggle('loading', loading);
  }
  audio.addEventListener('loadstart', () => setLoadingState(true));
  audio.addEventListener('waiting', () => setLoadingState(true));
  audio.addEventListener('stalled', () => setLoadingState(true));
  audio.addEventListener('canplay', () => setLoadingState(false));
  audio.addEventListener('canplaythrough', () => setLoadingState(false));

  // Seekbar Click & Drag
  function handleSeek(e) {
    const rect = seekBar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
      ? audio.duration
      : (currentSong && currentSong.duration ? currentSong.duration : 0);
    const targetTime = pos * total;

    progressFillBar.style.width = `${pos * 100}%`;
    progressHandle.style.left = `${pos * 100}%`;
    if (mobileMiniProgressFill) {
      mobileMiniProgressFill.style.width = `${pos * 100}%`;
    }
    barCurrentTime.textContent = formatDuration(targetTime);
    return targetTime;
  }

  seekBar.addEventListener('mousedown', (e) => {
    isSeeking = true;
    const targetTime = handleSeek(e);
    if (audio.duration && !isNaN(audio.duration) && isFinite(targetTime)) {
      audio.currentTime = targetTime;
    }
  });

  seekBar.addEventListener('touchstart', (e) => {
    isSeeking = true;
    const targetTime = handleSeek(e);
    if (audio.duration && !isNaN(audio.duration) && isFinite(targetTime)) {
      audio.currentTime = targetTime;
    }
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (!isSeeking) return;
    handleSeek(e);
  });

  window.addEventListener('touchmove', (e) => {
    if (!isSeeking) return;
    handleSeek(e);
  }, { passive: true });

  window.addEventListener('mouseup', (e) => {
    if (!isSeeking) return;
    isSeeking = false;
    const targetTime = handleSeek(e);
    if (audio.duration && !isNaN(audio.duration) && isFinite(targetTime)) {
      audio.currentTime = targetTime;
    }
  });

  window.addEventListener('touchend', (e) => {
    if (!isSeeking) return;
    isSeeking = false;
    // FIX-5+6: On touchend, e.touches is always empty. Must use e.changedTouches to get
    // the final finger position, then commit the seek to audio.currentTime.
    if (e.changedTouches && e.changedTouches.length > 0) {
      const rect = seekBar.getBoundingClientRect();
      if (rect.width > 0) {
        const pos = Math.max(0, Math.min(1, (e.changedTouches[0].clientX - rect.left) / rect.width));
        const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
          ? audio.duration
          : (currentSong && currentSong.duration ? currentSong.duration : 0);
        const targetTime = pos * total;
        if (total > 0 && isFinite(targetTime)) {
          audio.currentTime = targetTime;
          progressFillBar.style.width = `${pos * 100}%`;
          progressHandle.style.left = `${pos * 100}%`;
          if (mobileMiniProgressFill) mobileMiniProgressFill.style.width = `${pos * 100}%`;
          barCurrentTime.textContent = formatDuration(targetTime);
          updateMediaSessionPlaybackState();
        }
      }
    }
  });

  // Volume Bar Click & Drag
  function updateVolumeUI(val) {
    const pct = val * 100;
    if (volumeFillBar) volumeFillBar.style.width = `${pct}%`;
    if (volumeHandle) volumeHandle.style.left = `${pct}%`;

    if (val === 0) {
      if (volSvgHigh) volSvgHigh.classList.add('hidden');
      if (volSvgMute) volSvgMute.classList.remove('hidden');
      if (barBtnMute) barBtnMute.title = 'Unmute';
    } else {
      if (volSvgHigh) volSvgHigh.classList.remove('hidden');
      if (volSvgMute) volSvgMute.classList.add('hidden');
      if (barBtnMute) barBtnMute.title = 'Mute';
    }
  }

  function handleVolume(e) {
    const rect = volBar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const val = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    currentVolume = val;
    audio.volume = val;
    updateVolumeUI(val);
  }

  volBar.addEventListener('mousedown', (e) => {
    isVolDragging = true;
    handleVolume(e);
  });

  volBar.addEventListener('touchstart', (e) => {
    isVolDragging = true;
    handleVolume(e);
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (!isVolDragging) return;
    handleVolume(e);
  });

  window.addEventListener('touchmove', (e) => {
    if (!isVolDragging) return;
    handleVolume(e);
  }, { passive: true });

  window.addEventListener('mouseup', () => {
    isVolDragging = false;
  });

  window.addEventListener('touchend', () => {
    isVolDragging = false;
  });

  barBtnMute.addEventListener('click', () => {
    if (audio.volume > 0) {
      audio.volume = 0;
      updateVolumeUI(0);
    } else {
      audio.volume = currentVolume > 0 ? currentVolume : 0.8;
      updateVolumeUI(audio.volume);
    }
  });

  // Heart / Like Toggling
  async function toggleLikeSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    const nextState = !song.is_liked;
    song.is_liked = nextState;

    if (currentSong && currentSong.id === songId) {
      if (barHeartBtn) barHeartBtn.classList.toggle('liked', nextState);
      if (mobileAddSvgPlus && mobileAddSvgCheck) {
        mobileAddSvgPlus.classList.toggle('hidden', nextState);
        mobileAddSvgCheck.classList.toggle('hidden', !nextState);
      }
    }

    renderSidebarPlaylists();
    if (currentRoute === 'playlist') {
      renderTrackTableRows(currentPlaylist);
    }

    try {
      const method = nextState ? 'POST' : 'DELETE';
      await fetch(`/api/library/liked/${songId}`, { method });
      showToast(nextState ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch (err) {
      console.warn('Like toggle err:', err);
    }
  }

  if (barHeartBtn) {
    barHeartBtn.addEventListener('click', () => {
      if (currentSong) {
        toggleLikeSong(currentSong.id);
      } else if (currentTrackIndex >= 0 && activePlaybackPlaylist[currentTrackIndex]) {
        toggleLikeSong(activePlaybackPlaylist[currentTrackIndex].id);
      }
    });
  }

  if (mobileAddBtn) {
    mobileAddBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentSong) {
        toggleLikeSong(currentSong.id);
      } else if (currentTrackIndex >= 0 && activePlaybackPlaylist[currentTrackIndex]) {
        toggleLikeSong(activePlaybackPlaylist[currentTrackIndex].id);
      }
    });
  }

  // ==========================================================================
  // BUTTONS & CONTROLS EVENT WIRING
  // ==========================================================================
  barBtnPlayPause.addEventListener('click', togglePlayPause);
  barBtnNext.addEventListener('click', playNextTrack);
  barBtnPrev.addEventListener('click', playPrevTrack);

  barBtnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    if (isShuffle && activePlaybackPlaylist.length > 0) {
      // FIX-3: Generate shuffle and update version so next/prev use the fresh order
      shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, currentTrackIndex >= 0 ? currentTrackIndex : 0);
      shuffleQueueVersion = shufflePlaylistVersion;
      shuffleIndex = 0;
    }
    barBtnShuffle.classList.toggle('active', isShuffle);
    barBtnShuffle.title = isShuffle ? 'Disable shuffle' : 'Enable shuffle';
    showToast(isShuffle ? 'Shuffle is ON' : 'Shuffle is OFF');
  });

  // FIX-1: 3-state repeat cycle: off → all → one → off
  function updateRepeatUI() {
    if (repeatMode === 'off') {
      barBtnRepeat.classList.remove('active', 'repeat-one');
      barBtnRepeat.title = 'Enable repeat all';
    } else if (repeatMode === 'all') {
      barBtnRepeat.classList.add('active');
      barBtnRepeat.classList.remove('repeat-one');
      barBtnRepeat.title = 'Repeat all — click for repeat one';
    } else { // 'one'
      barBtnRepeat.classList.add('active', 'repeat-one');
      barBtnRepeat.title = 'Repeat one — click to disable';
    }
  }

  barBtnRepeat.addEventListener('click', () => {
    if (repeatMode === 'off') repeatMode = 'all';
    else if (repeatMode === 'all') repeatMode = 'one';
    else repeatMode = 'off';
    updateRepeatUI();
    const messages = { off: 'Repeat is OFF', all: 'Repeat All is ON', one: 'Repeat One is ON' };
    showToast(messages[repeatMode]);
  });
  // Initialize Repeat UI state (default: 'all')
  updateRepeatUI();

  btnBigPlay.addEventListener('click', () => {
    // FIX-2: Big Play commits the browsing playlist to the active playback queue
    if (currentPlaylist.length > 0) {
      activePlaybackPlaylist = [...currentPlaylist];
      shufflePlaylistVersion++;
      playTrackAtIndex(0);
    }
  });

  btnShufflePlaylist.addEventListener('click', () => {
    if (currentPlaylist.length > 0) {
      // FIX-2: Shuffle Play also commits browsing playlist to active playback queue
      activePlaybackPlaylist = [...currentPlaylist];
      shufflePlaylistVersion++;
      isShuffle = true;
      barBtnShuffle.classList.add('active');
      shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, 0);
      shuffleQueueVersion = shufflePlaylistVersion;
      shuffleIndex = 0;
      playTrackAtIndex(shuffleQueue[0]);
    }
  });

  // Spacebar Play/Pause Shortcut
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      togglePlayPause();
    }
  });

  // Topbar Navigation Buttons
  document.getElementById('btnNavHome').addEventListener('click', () => {
    currentRoute = 'home';
    exitSearchView();
    viewPlaylist.classList.remove('active');
    viewSearch.classList.remove('active');
    viewArtist.classList.remove('active');
    viewHome.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnNavHome').classList.add('active');
  });

  const btnNavBrandHome = document.getElementById('btnNavBrandHome');
  if (btnNavBrandHome) {
    btnNavBrandHome.addEventListener('click', () => {
      document.getElementById('btnNavHome').click();
    });
  }

  document.getElementById('btnNavSearch').addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnNavSearch').classList.add('active');
    openSearchView();
  });

  document.getElementById('btnNavLibrary').addEventListener('click', () => {
    openPlaylistView(
      'Your Library: All Master Recordings',
      `All ${allSongs.length} songs imported from Cloudinary apkdo69e`,
      allSongs[0] ? allSongs[0].cover_image_url : null,
      allSongs
    );
  });

  document.getElementById('itemLikedSongs').addEventListener('click', () => {
    const liked = allSongs.filter(s => s.is_liked);
    openPlaylistView(
      'Liked Songs',
      `${liked.length} favorite songs stored in your library`,
      'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600',
      liked.length > 0 ? liked : allSongs
    );
  });

  const _itemAllTracks = document.getElementById('itemAllTracks');
  if (_itemAllTracks) {
    _itemAllTracks.addEventListener('click', () => {
      const sorted = getAlphabeticalSongs();
      openPlaylistView(
        'All Songs',
        `Complete library with ${sorted.length} songs in alphabetical order`,
        sorted[0] ? sorted[0].cover_image_url : null,
        sorted
      );
    });
  }

  // "Show All" / Category Pills
  document.querySelectorAll('.show-all-link').forEach(link => {
    link.addEventListener('click', () => {
      openPlaylistView(
        'Cloudinary Audio Tracks',
        `High-bitrate master tracks (${allSongs.length} songs) streamed via Cloudinary CDN`,
        allSongs[0] ? allSongs[0].cover_image_url : null,
        allSongs
      );
    });
  });

  document.querySelectorAll('.category-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.getAttribute('data-cat');
      if (cat === 'tamil') {
        const tamil = allSongs.filter(s => (s.language || '').toLowerCase() === 'tamil');
        openPlaylistView('Tamil Cinema Hits', 'Authentic Tamil movie soundtracks and singles', null, tamil.length > 0 ? tamil : allSongs);
      } else if (cat === 'soundtrack') {
        const ost = allSongs.filter(s => s.movie || (s.album && s.album !== 'Tamil Hits' && s.album !== 'Singles'));
        openPlaylistView('Movie Soundtracks', 'Original film compositions and soundtracks', null, ost.length > 0 ? ost : allSongs);
      } else if (cat === 'artists') {
        const firstArtist = (homeData && homeData.popularArtists && homeData.popularArtists[0]) || null;
        if (firstArtist) {
          openArtistView(firstArtist.slug || firstArtist.name);
        } else {
          document.getElementById('artistsShelf').scrollIntoView({ behavior: 'smooth' });
        }
      } else if (cat === 'all') {
        openPlaylistView('All Master Recordings', `Complete library with ${allSongs.length} songs`, null, allSongs);
      }
    });
  });

  // Right Panel Toggle
  function toggleRightPanel(viewName = 'now_playing') {
    if (isRightPanelOpen && currentRightPanelTab === viewName) {
      spotifyApp.classList.add('hide-right');
      isRightPanelOpen = false;
      currentRightPanelTab = null;
      btnToggleNowPlaying.classList.remove('active');
      btnToggleQueue.classList.remove('active');
      return;
    }

    spotifyApp.classList.remove('hide-right');
    isRightPanelOpen = true;
    currentRightPanelTab = viewName;

    const rightPanelTitle = document.getElementById('rightPanelTitle');
    if (viewName === 'queue') {
      if (nowPlayingView) nowPlayingView.classList.add('hidden');
      if (queueView) queueView.classList.remove('hidden');
      if (rightPanelTitle) rightPanelTitle.textContent = 'Queue';
      btnToggleQueue.classList.add('active');
      btnToggleNowPlaying.classList.remove('active');
      renderQueueView();
    } else {
      if (queueView) queueView.classList.add('hidden');
      if (nowPlayingView) nowPlayingView.classList.remove('hidden');
      if (rightPanelTitle) rightPanelTitle.textContent = 'Now playing';
      btnToggleNowPlaying.classList.add('active');
      btnToggleQueue.classList.remove('active');
    }
  }

  function renderQueueView() {
    // FIX-2: Use activePlaybackPlaylist (what actually plays) not currentPlaylist (browsing)
    if (currentTrackIndex >= 0 && activePlaybackPlaylist[currentTrackIndex] && queueNowPlayingRow) {
      const cur = activePlaybackPlaylist[currentTrackIndex];
      queueNowPlayingRow.innerHTML = `
        <div class="next-track-row" style="margin-bottom: 16px;">
          <img class="row-thumb" src="${cur.cover_image_url || DEFAULT_SONG_COVER}" alt="${cur.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <div class="row-text">
            <span class="row-song-title" style="color: #1db954;">${cur.title}</span>
            <span class="row-artist-name">${cur.artist}</span>
          </div>
        </div>
      `;
    }

    if (queueUpcomingRows) {
      const upcoming = activePlaybackPlaylist.slice(currentTrackIndex + 1);
      queueUpcomingRows.innerHTML = upcoming.map((s, i) => `
        <div class="next-track-row" style="margin-bottom: 10px; cursor: pointer;" data-offset="${i + 1}">
          <img class="row-thumb" src="${s.cover_image_url || DEFAULT_SONG_COVER}" alt="${s.title}" onerror="this.onerror=null; this.src='${DEFAULT_SONG_COVER}';">
          <div class="row-text">
            <span class="row-song-title">${s.title}</span>
            <span class="row-artist-name">${s.artist}</span>
          </div>
        </div>
      `).join('');

      queueUpcomingRows.querySelectorAll('.next-track-row').forEach(r => {
        r.addEventListener('click', () => {
          const offset = parseInt(r.getAttribute('data-offset'), 10);
          playTrackAtIndex(currentTrackIndex + offset);
        });
      });
    }
  }

  if (btnToggleNowPlaying) btnToggleNowPlaying.addEventListener('click', () => toggleRightPanel('now_playing'));
  if (btnToggleQueue) btnToggleQueue.addEventListener('click', () => toggleRightPanel('queue'));
  if (btnOpenFullQueue) btnOpenFullQueue.addEventListener('click', () => toggleRightPanel('queue'));

  if (btnCloseRightPanel) {
    btnCloseRightPanel.addEventListener('click', () => {
      if (spotifyApp) spotifyApp.classList.add('hide-right');
      isRightPanelOpen = false;
      currentRightPanelTab = null;
      if (btnToggleNowPlaying) btnToggleNowPlaying.classList.remove('active');
      if (btnToggleQueue) btnToggleQueue.classList.remove('active');
    });
  }

  // Sleep Timer Management
  let sleepTimerId = null;
  let sleepTimerMinutes = 0;
  function toggleSleepTimer() {
    const options = [0, 15, 30, 45, 60];
    const curIdx = options.indexOf(sleepTimerMinutes);
    const nextIdx = (curIdx + 1) % options.length;
    sleepTimerMinutes = options[nextIdx];
    if (sleepTimerId) {
      clearTimeout(sleepTimerId);
      sleepTimerId = null;
    }
    if (sleepTimerMinutes > 0) {
      if (fsBtnTimer) fsBtnTimer.classList.add('active');
      showToast(`⏱ Sleep timer set: audio will pause in ${sleepTimerMinutes} minutes`);
      sleepTimerId = setTimeout(() => {
        audio.pause();
        setPlayingState(false);
        sleepTimerMinutes = 0;
        if (fsBtnTimer) fsBtnTimer.classList.remove('active');
        showToast('⏱ Sleep timer expired. Dheemafy audio paused.');
      }, sleepTimerMinutes * 60 * 1000);
    } else {
      if (fsBtnTimer) fsBtnTimer.classList.remove('active');
      showToast('⏱ Sleep timer turned off');
    }
  }

  // Fullscreen Mode (Now Playing page)
  function openFullscreen() {
    fullscreenModal.classList.remove('hidden');
    if (btnFullscreen) btnFullscreen.classList.add('active');

    // Sync current playback state to fullscreen controls
    if (fsPlaySvg && fsPauseSvg) {
      fsPlaySvg.classList.toggle('hidden', isPlaying);
      fsPauseSvg.classList.toggle('hidden', !isPlaying);
    }
    if (fsBtnShuffle) fsBtnShuffle.classList.toggle('active', isShuffle);
    if (fsShuffleDot) fsShuffleDot.style.display = isShuffle ? 'block' : 'none';
    if (fsBtnTimer) fsBtnTimer.classList.toggle('active', sleepTimerMinutes > 0);

    if (currentSong) {
      const coverArt = currentSong.cover_image_url || DEFAULT_SONG_COVER;
      // Artwork: updates both the large center image and the small meta-row thumbnail
      if (fsCoverImg) fsCoverImg.src = coverArt;
      if (fsThumbImg) fsThumbImg.src = coverArt;
      if (fsBackdrop) fsBackdrop.style.backgroundImage = `url('${coverArt}')`;
      if (fsTrackTitle) fsTrackTitle.textContent = currentSong.title || '';
      if (fsArtistName) fsArtistName.textContent = currentSong.artist || '';
      if (fsHeaderContextSub) fsHeaderContextSub.textContent = 'Playing from Dheemafy';
      if (fsHeaderPlaylistName) {
        const key = currentSong.movie || currentSong.title || 'Dheemafy';
        fsHeaderPlaylistName.textContent = `"${key.toLowerCase()}"`;
      }
      if (fsAddSvgPlus && fsAddSvgCheck) {
        fsAddSvgPlus.classList.toggle('hidden', Boolean(currentSong.is_liked));
        fsAddSvgCheck.classList.toggle('hidden', !Boolean(currentSong.is_liked));
      }
      updateMediaSession(currentSong);
    }
  }

  function closeFullscreen() {
    fullscreenModal.classList.add('hidden');
    if (btnFullscreen) btnFullscreen.classList.remove('active');
  }

  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (fullscreenModal.classList.contains('hidden')) {
        openFullscreen();
      } else {
        closeFullscreen();
      }
    });
  }

  if (btnCloseFullscreen) {
    addFastTouchListener(btnCloseFullscreen, closeFullscreen);
  }
  if (fsBackdrop) {
    fsBackdrop.addEventListener('click', closeFullscreen);
  }

  // Fullscreen Modal Playback Controls Wiring (Instant Mobile Touch)
  if (fsBtnPrev) {
    addFastTouchListener(fsBtnPrev, () => {
      playPrevTrack();
    });
  }

  if (fsBtnNext) {
    addFastTouchListener(fsBtnNext, () => {
      playNextTrack();
    });
  }

  if (fsBtnPlayPause) {
    addFastTouchListener(fsBtnPlayPause, () => {
      togglePlayPause();
    });
  }

  if (fsBtnShuffle) {
    addFastTouchListener(fsBtnShuffle, () => {
      isShuffle = !isShuffle;
      if (isShuffle && activePlaybackPlaylist.length > 0) {
        shuffleQueue = generateShuffleOrder(activePlaybackPlaylist.length, currentTrackIndex >= 0 ? currentTrackIndex : 0);
        shuffleQueueVersion = shufflePlaylistVersion; // FIX-3
        shuffleIndex = 0;
      }
      fsBtnShuffle.classList.toggle('active', isShuffle);
      if (fsShuffleDot) fsShuffleDot.style.display = isShuffle ? 'block' : 'none';
      if (barBtnShuffle) barBtnShuffle.classList.toggle('active', isShuffle);
      showToast(isShuffle ? 'Shuffle is ON' : 'Shuffle is OFF');
    });
  }

  if (fsBtnTimer) {
    addFastTouchListener(fsBtnTimer, () => {
      toggleSleepTimer();
    });
  }

  if (fsBtnAdd) {
    addFastTouchListener(fsBtnAdd, () => {
      if (currentSong) {
        toggleLikeSong(currentSong.id);
      }
    });
  }

  if (fsBtnMore) {
    addFastTouchListener(fsBtnMore, () => {
      if (currentSong) {
        openTrackContextSheet(currentSong);
      }
    });
  }

  if (fsDeviceBadge) {
    addFastTouchListener(fsDeviceBadge, () => {
      openDevicePickerSheet();
    });
  }

  if (fsBtnShare) {
    addFastTouchListener(fsBtnShare, () => {
      if (currentSong) {
        showToast(`Track "${currentSong.title}" link copied to clipboard!`);
      }
    });
  }

  if (fsBtnQueue) {
    addFastTouchListener(fsBtnQueue, () => {
      toggleRightPanel('queue');
      if (window.innerWidth <= 850) {
        closeFullscreen();
      }
    });
  }

  // fsLyricsPeekCard listener removed — lyrics section removed from Now Playing page.

  // Interactive seek and drag on Fullscreen Scrubber
  let isFsSeeking = false;
  function handleFsSeek(e) {
    if (!fsProgressBar) return;
    const rect = fsProgressBar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
      ? audio.duration
      : (currentSong && currentSong.duration ? currentSong.duration : 0);

    if (fsProgressFill) fsProgressFill.style.width = `${pos * 100}%`;
    if (fsProgressThumb) fsProgressThumb.style.left = `${pos * 100}%`;
    if (fsCurrentTime) fsCurrentTime.textContent = formatDuration(pos * total);

    return pos * total;
  }

  if (fsProgressBar) {
    fsProgressBar.addEventListener('mousedown', (e) => {
      isFsSeeking = true;
      const targetTime = handleFsSeek(e);
      if (audio.duration && isFinite(targetTime)) {
        audio.currentTime = targetTime;
        updateMediaSessionPlaybackState();
      }
    });

    fsProgressBar.addEventListener('touchstart', (e) => {
      isFsSeeking = true;
      const targetTime = handleFsSeek(e);
      if (audio.duration && isFinite(targetTime)) {
        audio.currentTime = targetTime;
        updateMediaSessionPlaybackState();
      }
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      if (!isFsSeeking) return;
      handleFsSeek(e);
    });

    window.addEventListener('touchmove', (e) => {
      if (!isFsSeeking) return;
      handleFsSeek(e);
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      if (!isFsSeeking) return;
      isFsSeeking = false;
      const targetTime = handleFsSeek(e);
      if (audio.duration && isFinite(targetTime)) {
        audio.currentTime = targetTime;
        updateMediaSessionPlaybackState();
      }
    });

    window.addEventListener('touchend', () => {
      if (!isFsSeeking) return;
      isFsSeeking = false;
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!fullscreenModal.classList.contains('hidden')) {
        closeFullscreen();
      }
    }
  });

  // Cloudinary Catalog Sync Trigger (works on both local and Vercel)
  if (btnSyncCloudinary) {
    btnSyncCloudinary.addEventListener('click', async () => {
      btnSyncCloudinary.classList.add('spinning');
      showToast('Scanning Cloudinary "Songs" folder...');

      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'Songs' })
        });
        const data = await res.json();
        const r = data.data;

        showToast(`Cloudinary Synced: ${r.discovered} discovered (${r.added} added, ${r.updated} updated).`);
        await initAppData(true);
      } catch (err) {
        console.error('Sync failed:', err);
        showToast('Sync error occurred');
      } finally {
        btnSyncCloudinary.classList.remove('spinning');
      }
    });
  }

  // Automatic Background Library Updates (discovers newly uploaded songs automatically)
  // Uses lightweight version endpoint (<1ms SQLite check) instead of downloading entire 1000-song catalog.
  setInterval(async () => {
    if (document.hidden || !isAuthenticated()) return;
    try {
      const didUpdate = await SongCatalogStore.checkVersionAndSyncIfNeeded();
      if (didUpdate) {
        console.log(`[Dheemafy AutoUpdate] Discovered library updates: ${allSongs.length} songs available`);
        const homeRes = await fetch('/api/home');
        const homeJson = await homeRes.json();
        homeData = (homeJson && homeJson.data) || {};
        renderHomeView();
        renderSidebarPlaylists();
      }
    } catch (e) { }
  }, 30000);

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      releaseWakeLock();
      console.log('[Player] Page hidden / screen locked — keeping audio active');
      // Ensure MediaSession is up-to-date so lock screen shows correct song
      if (currentSong) {
        try { updateMediaSession(currentSong); } catch (_) {}
      }
      return;
    }

    // Screen unlocked / page visible again: Synchronize UI with actual playback state
    console.log('[Player] Page visible / screen unlocked — synchronizing UI');
    if (isPlaying) {
      requestWakeLock();
      // If audio paused while screen was off/locked, auto-resume or advance if at end
      if (audio && audio.paused) {
        const total = (audio.duration && !isNaN(audio.duration) && audio.duration > 0)
          ? audio.duration
          : (currentSong && currentSong.duration ? currentSong.duration : 0);
        if (total > 0 && audio.currentTime >= (total - 1.5)) {
          console.log('[Player] Track ended while phone was locked. Advancing to next track...');
          playNextTrack(true);
        } else {
          console.log('[Player] Resuming playback after phone screen unlock...');
          audio.play().then(() => setPlayingState(true)).catch(() => {});
        }
      }
    }

    if (currentSong) {
      try {
        updateAllPlayerUI(currentSong);
        setPlayingState(!audio.paused);
        updateMediaSession(currentSong);
      } catch (_) { }
    }

    if (!document.hidden && isAuthenticated()) {
      try {
        const didUpdate = await SongCatalogStore.checkVersionAndSyncIfNeeded();
        if (didUpdate) {
          const homeRes = await fetch('/api/home');
          const homeJson = await homeRes.json();
          homeData = (homeJson && homeJson.data) || {};
          renderHomeView();
          renderSidebarPlaylists();
        }
      } catch (e) { }
    }
  });

  // FIX-4: Page Lifecycle API handlers (Android Chrome background freezing/thawing)
  // 'freeze' fires when the browser freezes the page to save resources.
  // 'resume' fires when the page is brought back to life.
  document.addEventListener('freeze', () => {
    console.log('[Player] Page lifecycle: freeze — ensuring MediaSession is active');
    if (currentSong && isPlaying) {
      try { updateMediaSession(currentSong); } catch (_) {}
    }
  });

  document.addEventListener('resume', () => {
    console.log('[Player] Page lifecycle: resume — re-syncing player state');
    if (currentSong) {
      try {
        updateAllPlayerUI(currentSong);
        setPlayingState(!audio.paused);
        updateMediaSession(currentSong);
      } catch (_) {}
    }
  });

  // Topbar scroll background effect
  if (mainScrollView) {
    const topbarEl = document.getElementById('topbar') || document.getElementById('spotifyGlobalTopbar');
    if (topbarEl) {
      mainScrollView.addEventListener('scroll', () => {
        if (mainScrollView.scrollTop > 30) {
          topbarEl.classList.add('scrolled');
        } else {
          topbarEl.classList.remove('scrolled');
        }
      });
    }
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault();
      playNextTrack();
    } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault();
      playPrevTrack();
    } else if (e.key.toLowerCase() === 'm') {
      barBtnMute.click();
    } else if (e.key.toLowerCase() === 'f') {
      if (fullscreenModal.classList.contains('hidden')) {
        fullscreenModal.classList.remove('hidden');
      } else {
        fullscreenModal.classList.add('hidden');
      }
    }
  });

  // Bottom Sheet Helpers
  function openDevicePickerSheet() {
    if (devicePickerSheet) devicePickerSheet.classList.remove('hidden');
  }

  function closeDevicePickerSheet() {
    if (devicePickerSheet) devicePickerSheet.classList.add('hidden');
  }

  function openPremiumSheet() {
    if (premiumSheet) premiumSheet.classList.remove('hidden');
  }

  function closePremiumSheet() {
    if (premiumSheet) premiumSheet.classList.add('hidden');
  }

  function openCreateSheet() {
    if (createSheet) createSheet.classList.remove('hidden');
  }

  function closeCreateSheet() {
    if (createSheet) createSheet.classList.add('hidden');
  }

  function openTrackContextSheet(song) {
    if (!trackContextSheet || !song) return;
    currentContextSong = song;
    if (contextTrackCover) contextTrackCover.src = song.cover_image_url || DEFAULT_SONG_COVER;
    if (contextTrackTitle) contextTrackTitle.textContent = song.title;
    if (contextTrackArtist) contextTrackArtist.textContent = song.artist;
    if (btnContextLikeText) {
      btnContextLikeText.textContent = song.is_liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
    }
    trackContextSheet.classList.remove('hidden');
  }

  function closeTrackContextSheet() {
    if (trackContextSheet) trackContextSheet.classList.add('hidden');
    currentContextSong = null;
  }

  // Mobile Bottom Nav Switching (5 Items matching Spotify)
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.getAttribute('data-route');
      if (route === 'premium') {
        openPremiumSheet();
        return;
      }
      if (route === 'create') {
        openCreateSheet();
        return;
      }
      document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      if (route === 'home') document.getElementById('btnNavHome').click();
      else if (route === 'search') document.getElementById('btnNavSearch').click();
      else if (route === 'library') document.getElementById('btnNavLibrary').click();
    });
  });

  // Mobile Mini Player Playback Controls (Fast Touch)
  if (mobileMiniPrevBtn) {
    addFastTouchListener(mobileMiniPrevBtn, () => {
      playPrevTrack();
    });
  }

  if (mobileMiniPlayBtn) {
    addFastTouchListener(mobileMiniPlayBtn, () => {
      togglePlayPause();
    });
  }

  if (mobileMiniNextBtn) {
    addFastTouchListener(mobileMiniNextBtn, () => {
      playNextTrack();
    });
  }

  // Floating Mini Player: Touch Swipe (Left = Next, Right = Prev) & Click = Fullscreen
  let miniTouchStartX = 0;
  let miniTouchStartY = 0;
  let miniTouchStartTime = 0;
  let miniHasSwiped = false;

  if (spotifyPlayerBar) {
    spotifyPlayerBar.addEventListener('touchstart', (e) => {
      if (window.innerWidth > 850) return;
      miniTouchStartX = e.changedTouches[0].screenX;
      miniTouchStartY = e.changedTouches[0].screenY;
      miniTouchStartTime = Date.now();
      miniHasSwiped = false;
    }, { passive: true });

    spotifyPlayerBar.addEventListener('touchend', (e) => {
      if (window.innerWidth > 850) return;
      const diffX = e.changedTouches[0].screenX - miniTouchStartX;
      const diffY = e.changedTouches[0].screenY - miniTouchStartY;
      const elapsed = Date.now() - miniTouchStartTime;

      // Horizontal swipe detected
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.4 && elapsed < 500) {
        miniHasSwiped = true;
        if (diffX < 0) {
          playNextTrack();
        } else {
          playPrevTrack();
        }
      }
    }, { passive: true });

    spotifyPlayerBar.addEventListener('click', (e) => {
      if (miniHasSwiped) {
        miniHasSwiped = false;
        return;
      }
      if (e.target.closest('#barHeartBtn') ||
        e.target.closest('#mobileMiniPrevBtn') ||
        e.target.closest('#mobileMiniPlayBtn') ||
        e.target.closest('#mobileMiniNextBtn') ||
        e.target.closest('#mobileConnectBtn') ||
        e.target.closest('#mobileAddBtn') ||
        e.target.closest('#mobileDeviceBadge') ||
        e.target.closest('.player-center') ||
        e.target.closest('.player-right')) {
        return;
      }
      if (window.innerWidth <= 850 && btnFullscreen) {
        btnFullscreen.click();
      }
    });
  }

  // Mobile Device Picker Wiring
  if (mobileConnectBtn) {
    mobileConnectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDevicePickerSheet();
    });
  }
  if (mobileDeviceBadge) {
    mobileDeviceBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      openDevicePickerSheet();
    });
  }
  if (btnCloseDeviceSheet) btnCloseDeviceSheet.addEventListener('click', closeDevicePickerSheet);
  if (deviceSheetBackdrop) deviceSheetBackdrop.addEventListener('click', closeDevicePickerSheet);

  if (deviceListGroup) {
    deviceListGroup.querySelectorAll('.device-item').forEach(item => {
      item.addEventListener('click', () => {
        deviceListGroup.querySelectorAll('.device-item').forEach(d => {
          d.classList.remove('active');
          const chk = d.querySelector('.device-check');
          if (chk) chk.classList.add('hidden');
        });
        item.classList.add('active');
        const chk = item.querySelector('.device-check');
        if (chk) chk.classList.remove('hidden');

        const devName = item.getAttribute('data-device');
        if (mobileDeviceName) mobileDeviceName.textContent = devName;
        closeDevicePickerSheet();
        showToast(`Connected to ${devName}`);
      });
    });
  }

  // Premium Sheet Wiring
  if (btnClosePremiumSheet) btnClosePremiumSheet.addEventListener('click', closePremiumSheet);
  if (premiumSheetBackdrop) premiumSheetBackdrop.addEventListener('click', closePremiumSheet);
  if (btnGetPremium) {
    btnGetPremium.addEventListener('click', () => {
      closePremiumSheet();
      showToast('🎉 Dheemafy Premium Individual Activated! High-fidelity master streaming enabled.');
    });
  }

  // Create Sheet Wiring
  if (btnCloseCreateSheet) btnCloseCreateSheet.addEventListener('click', closeCreateSheet);
  if (createSheetBackdrop) createSheetBackdrop.addEventListener('click', closeCreateSheet);
  if (btnCreateNewPlaylist) {
    btnCreateNewPlaylist.addEventListener('click', () => {
      closeCreateSheet();
      const pName = prompt('Enter playlist name:', 'My Playlist #1') || 'My Playlist #1';
      openPlaylistView(pName, `Created by sharu • 0 songs`, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600', []);
      showToast(`Created playlist "${pName}"`);
    });
  }
  if (btnCreateBlend) {
    btnCreateBlend.addEventListener('click', () => {
      closeCreateSheet();
      showToast('Blend invitation link copied to clipboard!');
    });
  }

  // Track Context Sheet Wiring
  if (contextSheetBackdrop) contextSheetBackdrop.addEventListener('click', closeTrackContextSheet);
  if (btnContextLike) {
    btnContextLike.addEventListener('click', async () => {
      if (currentContextSong) {
        await toggleLikeSong(currentContextSong.id);
        closeTrackContextSheet();
      }
    });
  }
  if (btnContextAddToPlaylist) {
    btnContextAddToPlaylist.addEventListener('click', () => {
      if (currentContextSong) {
        showToast(`Added "${currentContextSong.title}" to Your Library`);
      }
      closeTrackContextSheet();
    });
  }
  if (btnContextViewArtist) {
    btnContextViewArtist.addEventListener('click', () => {
      if (currentContextSong) {
        const first = currentContextSong.artist ? currentContextSong.artist.split(',')[0].trim() : '';
        closeTrackContextSheet();
        if (first) openArtistView(first);
      }
    });
  }
  if (btnContextShare) {
    btnContextShare.addEventListener('click', () => {
      closeTrackContextSheet();
      showToast('Track link copied to clipboard!');
    });
  }

  // Mobile Topbar User Avatar Bubble Click
  if (btnMobileUserAvatar) {
    btnMobileUserAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (profileDropdown) {
        const isHidden = profileDropdown.classList.contains('hidden');
        const backdrop = document.getElementById('profileDropdownBackdrop');
        const container = document.getElementById('profileMenuContainer');
        if (isHidden) {
          profileDropdown.classList.remove('hidden');
          if (backdrop) backdrop.classList.remove('hidden');
          if (container) container.classList.add('open');
        } else {
          profileDropdown.classList.add('hidden');
          if (backdrop) backdrop.classList.add('hidden');
          if (container) container.classList.remove('open');
        }
      }
    });
  }

  // Mobile Topbar Filter Chips Interaction
  if (mobileHeaderChips) {
    mobileHeaderChips.querySelectorAll('.m-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        mobileHeaderChips.querySelectorAll('.m-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const cat = chip.getAttribute('data-cat');
        if (cat === 'music') {
          const el = document.getElementById('sectionStartListening');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else if (cat === 'podcasts') {
          showToast('Podcasts coming soon to Dheemafy!');
        } else {
          mainScrollView.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // ==========================================================================
  // SPOTKIFY AUTHENTICATION & LOGIN GATE (sharu / sharu@123)
  // ==========================================================================
  const loginGate = document.getElementById('spotkifyLoginGate');
  const loginForm = document.getElementById('spotkifyLoginForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginAlertBox = document.getElementById('loginAlertBox');
  const loginAlertText = document.getElementById('loginAlertText');
  const btnTogglePw = document.getElementById('btnTogglePw');
  const chkRememberMe = document.getElementById('chkRememberMe');
  const btnLoginSubmit = document.getElementById('btnLoginSubmit');
  const btnProfileMenu = document.getElementById('btnProfileMenu');
  const profileDropdown = document.getElementById('profileDropdown');
  const profileDropdownBackdrop = document.getElementById('profileDropdownBackdrop');
  const profileMenuContainer = document.getElementById('profileMenuContainer');
  const btnLogout = document.getElementById('btnLogout');

  function isAuthenticated() {
    const isAuth = localStorage.getItem('spotkify_auth') === 'true' || sessionStorage.getItem('spotkify_auth') === 'true';
    const user = (localStorage.getItem('spotkify_user') || sessionStorage.getItem('spotkify_user') || '').trim().toLowerCase();
    return isAuth && (user === 'sharu' || user === 'you');
  }

  function getLoggedInUser() {
    const user = (localStorage.getItem('spotkify_user') || sessionStorage.getItem('spotkify_user') || '').trim().toLowerCase();
    if (user === 'you') return 'You';
    if (user === 'sharu') return 'Sharu';
    return user || 'Sharu';
  }

  function updateUserProfileDisplay(username) {
    const name = username || getLoggedInUser();
    document.querySelectorAll('.profile-name-text').forEach(el => el.textContent = name);
    document.querySelectorAll('.user-handle').forEach(el => el.textContent = name);
  }

  function setupAuthentication() {
    // Check URL parameters (in case user submitted via GET or arrived with query params in URL)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const qUser = (urlParams.get('username') || '').trim();
      const qPass = (urlParams.get('password') || '').trim();
      if (qUser.toLowerCase() === 'sharu' && (qPass === 'sharu@123' || qPass === 'Sharu@123')) {
        localStorage.setItem('spotkify_auth', 'true');
        localStorage.setItem('spotkify_user', 'sharu');
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { }
      } else if (qUser && loginUsername) {
        loginUsername.value = qUser;
      }
    } catch (err) { }

    if (isAuthenticated()) {
      document.documentElement.classList.add('spotkify-unlocked');
      document.body.classList.remove('locked');
      if (loginGate) {
        loginGate.style.display = 'none';
      }
      updateUserProfileDisplay();
      initAppData();
    } else {
      document.documentElement.classList.remove('spotkify-unlocked');
      document.body.classList.add('locked');
      if (loginGate) {
        loginGate.classList.remove('fade-out');
        loginGate.style.display = 'flex';
      }
      if (loginUsername) {
        setTimeout(() => loginUsername.focus(), 150);
      }
    }

    // Input highlight & error reset
    [loginUsername, loginPassword].forEach(input => {
      if (!input) return;
      input.addEventListener('focus', () => {
        const wrap = input.closest('.input-container');
        if (wrap) {
          wrap.classList.add('focused');
          wrap.classList.remove('error');
        }
        if (loginAlertBox) loginAlertBox.classList.add('hidden');
      });
      input.addEventListener('blur', () => {
        const wrap = input.closest('.input-container');
        if (wrap) wrap.classList.remove('focused');
      });
    });

    // Password visibility toggle
    if (btnTogglePw && loginPassword) {
      btnTogglePw.addEventListener('click', () => {
        const isPw = loginPassword.getAttribute('type') === 'password';
        loginPassword.setAttribute('type', isPw ? 'text' : 'password');
        btnTogglePw.innerHTML = isPw
          ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`
          : `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
      });
    }

    function showLoginError(msg) {
      if (loginAlertText) {
        loginAlertText.textContent = msg || 'Incorrect username or password. Please try again.';
      }
      if (loginAlertBox) {
        loginAlertBox.classList.remove('hidden');
      }
      const card = loginGate ? loginGate.querySelector('.login-card') : null;
      if (card) {
        card.classList.remove('shake');
        void card.offsetWidth; // Force reflow
        card.classList.add('shake');
      }
      const passWrap = loginPassword ? loginPassword.closest('.input-container') : null;
      if (passWrap) passWrap.classList.add('error');
      if (loginPassword) {
        loginPassword.select();
      }
    }

    // Unified Secure Login Handler
    let isLoggingIn = false;
    async function doLogin() {
      if (isLoggingIn) return;

      const enteredUser = (loginUsername ? loginUsername.value : '').trim();
      const enteredPass = (loginPassword ? loginPassword.value : '').trim();

      if (!enteredUser || !enteredPass) {
        showLoginError('Please enter username and password.');
        return;
      }

      isLoggingIn = true;
      if (btnLoginSubmit) btnLoginSubmit.classList.add('loading');

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: enteredUser, password: enteredPass })
        });

        const resData = await response.json();

        if (!response.ok || !resData || !resData.data) {
          showLoginError('Incorrect username or password. Please try again.');
          return;
        }

        const authUser = resData.data.user;
        const normalizedUser = (authUser.userName || enteredUser).toLowerCase();
        const displayName = authUser.name || (normalizedUser === 'you' ? 'You' : 'Sharu');
        const token = resData.data.token;
        const remember = chkRememberMe ? chkRememberMe.checked : true;

        if (remember) {
          localStorage.setItem('spotkify_auth', 'true');
          localStorage.setItem('spotkify_user', normalizedUser);
          if (token) localStorage.setItem('spotkify_token', token);
        } else {
          sessionStorage.setItem('spotkify_auth', 'true');
          sessionStorage.setItem('spotkify_user', normalizedUser);
          if (token) sessionStorage.setItem('spotkify_token', token);
        }

        document.documentElement.classList.add('spotkify-unlocked');
        document.body.classList.remove('locked');
        if (loginAlertBox) loginAlertBox.classList.add('hidden');
        if (loginGate) {
          loginGate.classList.add('fade-out');
          setTimeout(() => {
            loginGate.style.display = 'none';
          }, 300);
        }

        updateUserProfileDisplay(displayName);
        showToast(`Welcome to Dheemafy, ${displayName}!`);
        initAppData();
      } catch (err) {
        console.warn('Login request failed:', err);
        showLoginError('Incorrect username or password. Please try again.');
      } finally {
        isLoggingIn = false;
        if (btnLoginSubmit) btnLoginSubmit.classList.remove('loading');
      }
    }

    // Attach to form submit
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        doLogin();
      });
    }

    // Direct button click & touch handlers
    if (btnLoginSubmit) {
      addFastTouchListener(btnLoginSubmit, (e) => {
        e.preventDefault();
        e.stopPropagation();
        doLogin();
      });
      btnLoginSubmit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        doLogin();
      });
    }

    // Enter key triggers on both inputs
    [loginUsername, loginPassword].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          doLogin();
        }
      });
    });

    // Profile Dropdown Toggle & Outside-Touch/Click Dismissal
    function isProfileMenuOpen() {
      return profileDropdown && !profileDropdown.classList.contains('hidden');
    }

    function openProfileMenu() {
      if (!profileDropdown) return;
      profileDropdown.classList.remove('hidden');
      if (profileDropdownBackdrop) profileDropdownBackdrop.classList.remove('hidden');
      if (profileMenuContainer) profileMenuContainer.classList.add('open');
    }

    function closeProfileMenu() {
      if (!profileDropdown) return;
      profileDropdown.classList.add('hidden');
      if (profileDropdownBackdrop) profileDropdownBackdrop.classList.add('hidden');
      if (profileMenuContainer) profileMenuContainer.classList.remove('open');
    }

    function toggleProfileMenu(e) {
      if (e) {
        if (e.stopPropagation) e.stopPropagation();
      }
      if (isProfileMenuOpen()) {
        closeProfileMenu();
      } else {
        openProfileMenu();
      }
    }

    window.spotkifyToggleProfile = toggleProfileMenu;

    if (btnProfileMenu && profileDropdown) {
      addFastTouchListener(btnProfileMenu, (e) => {
        toggleProfileMenu(e);
      });
    }

    // Tapping the full-screen transparent backdrop closes the dropdown
    if (profileDropdownBackdrop) {
      addFastTouchListener(profileDropdownBackdrop, (e) => {
        closeProfileMenu();
      });
    }

    // Dismiss dropdown when clicking outside on desktop
    document.addEventListener('click', (e) => {
      if (!isProfileMenuOpen()) return;
      if (profileDropdown && profileDropdown.contains(e.target)) return;
      if (btnProfileMenu && btnProfileMenu.contains(e.target)) return;
      closeProfileMenu();
    });

    // Escape key closes the dropdown
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isProfileMenuOpen()) {
        closeProfileMenu();
      }
    });

    // Logout Button Action
    function doLogout(e) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      closeProfileMenu();

      localStorage.removeItem('spotkify_auth');
      localStorage.removeItem('spotkify_user');
      localStorage.removeItem('spotkify_token');
      sessionStorage.removeItem('spotkify_auth');
      sessionStorage.removeItem('spotkify_user');
      sessionStorage.removeItem('spotkify_token');

      // Stop audio immediately
      if (audio && !audio.paused) {
        audio.pause();
        isPlaying = false;
        setPlayingState(false);
      }

      // Lock screen and display login gate
      document.documentElement.classList.remove('spotkify-unlocked');
      document.body.classList.add('locked');
      if (loginGate) {
        loginGate.classList.remove('fade-out');
        loginGate.style.display = 'flex';
      }
      if (loginPassword) loginPassword.value = '';
      if (loginAlertBox) loginAlertBox.classList.add('hidden');
      if (loginUsername) {
        loginUsername.value = '';
        loginUsername.focus();
      }
      showToast('Logged out of Dheemafy');
    }

    window.spotkifyDoLogout = doLogout;

    if (btnLogout) {
      addFastTouchListener(btnLogout, doLogout);
    }
  }

  function initMobileAudioUnlock() {
    const unlock = (e) => {
      // If user directly tapped a playable element, that gesture directly initiates playback
      if (e.target && e.target.closest && e.target.closest('.spotify-card, .table-row, .btn-play-pause, .bar-play-btn, #barBtnPlayPause, #mobileBarBtnPlayPause, #fsBtnPlayPause, .mobile-track-row')) {
        window.removeEventListener('touchstart', unlock, true);
        window.removeEventListener('click', unlock, true);
        return;
      }

      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('click', unlock, true);
      if (!audio) return;
      const hasSrc = audio.src && audio.src !== '' && audio.src !== window.location.href;
      if (hasSrc && audio.paused && !isPlaying && !_isTransitioning) {
        audio.play().then(() => {
          if (!isPlaying && !_isTransitioning) audio.pause();
        }).catch(() => { });
      }
    };
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('click', unlock, { capture: true });
  }

  // Initialize Mobile Audio Unlock, MediaSession background handlers & Auth Gate
  initMobileAudioUnlock();
  initMediaSessionHandlers();
  setupAuthentication();

  // ==========================================================================
  // DYNAMIC AUDIO OUTPUT DEVICE DETECTION
  // Reads the real connected audio device from the browser, picks the right
  // icon (Bluetooth / wired headphone / speaker / phone / computer / tablet)
  // and updates the mini-player badge, fullscreen badge, and device picker sheet.
  // Re-runs automatically when the user plugs/unplugs headphones (devicechange).
  // ==========================================================================

  // --- SVG icon sets (12px for badge, 20px for picker, 18px for fullscreen) ---
  const _DICONS = {
    bluetooth: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>`,
      md: `<svg class="device-item-icon green" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1ed760" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>`,
      label: 'Bluetooth'
    },
    headphone: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`,
      md: `<svg class="device-item-icon green" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1ed760" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`,
      label: 'Wired'
    },
    phone: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,
      md: `<svg class="device-item-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#1ed760"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,
      label: 'Built-in speaker'
    },
    tablet: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zm-7 1H10v1h4v-1z"/></svg>`,
      md: `<svg class="device-item-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zm-7 1H10v1h4v-1z"/></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#1ed760"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zm-7 1H10v1h4v-1z"/></svg>`,
      label: 'Built-in speaker'
    },
    computer: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
      md: `<svg class="device-item-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#1ed760"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
      label: 'Built-in speakers'
    },
    speaker: {
      sm: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`,
      md: `<svg class="device-item-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`,
      lg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#1ed760"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`,
      label: 'Speaker'
    }
  };

  /** Classify a device label string into one of our icon keys */
  function _classifyAudioDevice(label) {
    const l = (label || '').toLowerCase();
    // Bluetooth wireless
    if (/bluetooth|wireless|buds|airpod|galaxy bud|bose|sony wh|sony wf|jbl|jabra|beats|sennheiser|plantronics|anker|soundcore|earphone|tws|neckband|realme buds|nothing ear|oneplus buds|pixel buds|mi true|redmi buds/.test(l)) {
      return 'bluetooth';
    }
    // Wired headphones
    if (/headphone|headset|wired|3\.5mm|aux|analog|in-ear|earphone|plugged/.test(l)) {
      return 'headphone';
    }
    // Everything else → built-in (will be further refined by UA)
    return null; // defer to UA-based fallback
  }

  /** Return the device type key based on user-agent for built-in speaker cases */
  function _getDeviceTypeFromUA() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua)) return 'tablet';
    if (/iPhone|iPod/.test(ua)) return 'phone';
    if (/Android/.test(ua)) {
      // Android tablet heuristic: typically no 'Mobile' in UA
      return /Mobile/.test(ua) ? 'phone' : 'tablet';
    }
    return 'computer';
  }

  /** Return a friendly display name for the current device when no audio label is found */
  function _getDefaultDeviceName() {
    const ua = navigator.userAgent;
    // Try to extract device model from Android UA
    const androidModel = ua.match(/;\s*([^;]+)\sBuild\//);
    if (androidModel) return androidModel[1].trim();
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Macintosh|Mac OS/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    return 'This Device';
  }

  /** Main detection function — async, safe to call at any time */
  async function detectAudioOutput() {
    let deviceName = '';
    let deviceType = null;

    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');

        for (const dev of outputs) {
          // Skip 'default' and 'communications' virtual devices, focus on real ones
          if (!dev.label || dev.deviceId === 'default' || dev.deviceId === 'communications') continue;
          const classified = _classifyAudioDevice(dev.label);
          if (classified) {
            deviceName = dev.label;
            deviceType = classified;
            break;
          } else if (!deviceName) {
            // Store first labelled device even if not BT/wired — may be speaker
            deviceName = dev.label;
            deviceType = 'speaker';
          }
        }
      }
    } catch (_) { }

    // Fallback: no labelled device found (privacy restrictions or no permission)
    if (!deviceName) {
      deviceType = _getDeviceTypeFromUA();
      deviceName = _getDefaultDeviceName();
    } else if (!deviceType) {
      deviceType = _getDeviceTypeFromUA();
    }

    _applyDeviceUI(deviceType, deviceName);
  }

  /** Push detected device info to all UI surfaces */
  function _applyDeviceUI(type, name) {
    const icons = _DICONS[type] || _DICONS.phone;
    const statusLabel = icons.label;

    // --- Mini player badge ---
    const miniIconEl = document.getElementById('mobileDeviceIcon');
    if (miniIconEl) miniIconEl.innerHTML = icons.sm;
    if (mobileDeviceName) mobileDeviceName.textContent = name;

    // --- Fullscreen badge ---
    const fsIconEl = document.getElementById('fsDeviceIcon');
    if (fsIconEl) fsIconEl.innerHTML = icons.lg;
    if (fsDeviceName) fsDeviceName.textContent = name;

    // --- Device picker sheet: first (current device) row ---
    const pickerItem = document.getElementById('currentDeviceItem');
    const pickerIconEl = document.getElementById('currentDeviceItemIcon');
    const pickerNameEl = document.getElementById('currentDeviceItemName');
    const pickerStatusEl = document.getElementById('currentDeviceItemStatus');

    if (pickerItem) pickerItem.setAttribute('data-device', name);
    if (pickerIconEl) pickerIconEl.innerHTML = icons.md;
    if (pickerNameEl) pickerNameEl.textContent = name;
    if (pickerStatusEl) {
      if (type === 'bluetooth') {
        pickerStatusEl.textContent = 'Connected \u2022 Bluetooth';
        pickerStatusEl.style.color = '#1ed760';
      } else if (type === 'headphone') {
        pickerStatusEl.textContent = 'Connected \u2022 Wired';
        pickerStatusEl.style.color = '#1ed760';
      } else {
        pickerStatusEl.textContent = `This device \u2022 ${statusLabel}`;
        pickerStatusEl.style.color = '#b3b3b3';
      }
    }
  }

  // Run once on load, then auto-update whenever headphones are plugged/unplugged
  detectAudioOutput();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      // Small delay so the browser has time to update the device list
      setTimeout(detectAudioOutput, 300);
    });
  }

})();

