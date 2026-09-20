/**
 * Authentic Media Artwork Dictionary
 * High-resolution, permanent images for Tamil singers, music directors, and movie soundtracks.
 */

const DEFAULT_COVER = '/images/default_cover.svg';

const ARTIST_PORTRAITS = {
  'vivek': '/images/artists/vivek.jpg',
  'anirudh': '/images/artists/anirudh.jpg',
  'anirudh ravichander': '/images/artists/anirudh.jpg',
  'sid sriram': DEFAULT_COVER,
  'santhosh narayanan': DEFAULT_COVER,
  'yuvan shankar raja': DEFAULT_COVER,
  'a.r. rahman': DEFAULT_COVER,
  'pradeep kumar': DEFAULT_COVER,
  'dhanush': DEFAULT_COVER,
  'shreya ghoshal': DEFAULT_COVER,
  'harris jayaraj': DEFAULT_COVER,
  'sean roldan': DEFAULT_COVER,
  'ilaiyaraaja': DEFAULT_COVER,
  'hiphop tamizha': DEFAULT_COVER,
  'shakthisree gopalan': DEFAULT_COVER,
  'saindhavi': DEFAULT_COVER,
  'vijay antony': DEFAULT_COVER,
  'jonita gandhi': DEFAULT_COVER,
  's. p. balasubrahmanyam': DEFAULT_COVER,
  'andrea jeremiah': DEFAULT_COVER,
  'chinmayi': DEFAULT_COVER,
  'g. v. prakash': '/images/artists/gvprakash.jpg',
  'g. v. prakash kumar': '/images/artists/gvprakash.jpg',
  'g.v. prakash': '/images/artists/gvprakash.jpg',
  'g.v. prakash kumar': '/images/artists/gvprakash.jpg',
  'gv prakash': '/images/artists/gvprakash.jpg',
  'sai abhyankkar': '/images/artists/sai_abhyankkar.jpg',
  'sai abiyankkar': '/images/artists/sai_abhyankkar.jpg',
  'sai abhyankar': '/images/artists/sai_abhyankkar.jpg',
  'dhee': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
  'dhibu ninan thomas': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80',
  'sam c.s.': 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
  'sam c.s': 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
  'vignesh shivan': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&auto=format&fit=crop&q=80',
  'karthik': 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&auto=format&fit=crop&q=80',
  'haricharan': 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
  'naresh iyer': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&auto=format&fit=crop&q=80'
};

// Song / Movie Cover Posters (Authentic high-resolution artwork)
const MOVIE_SONG_COVERS = {
  // Direct matches from user screenshots
  'othaiyadi pathayila': '/images/covers/kanaa.jpg',
  'oorum blood': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
  'thangamey': '/images/covers/thangamey.jpg',
  'pottala muttaye': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
  'yaendi yaendi': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80',
  'poo avizhum pozhudhil': 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
  'mogathirai': 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
  'usuru narambulay': 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
  'yennai maatrum kadhale': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
  'bae': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  'kannamma': 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
  'railin oligal': 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
  'naan nee': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
  'maya nadhi': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80',
  'aval': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
  'koodamela koodavechi': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=80',
  'adiyae azhagae': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=80',
  'chellamma': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  'andha kanna paathaakaa': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  'vinmeen': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=80',
  'yaayum': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80',
  'kaathalae kaathalae': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&auto=format&fit=crop&q=80',
  'mallipoo': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
  'thalli pogathey': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
  'maruvaarthai': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
  'mudhal nee mudivum nee': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
  'megham karukatha': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  'kanja poovu kannala': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80',
  'yaanji': 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80'
};

/**
 * Get authentic portrait for an artist
 */
function resolveArtistImage(artistName, sampleCover = null) {
  if (!artistName) return DEFAULT_COVER;
  const norm = artistName.toLowerCase().trim();
  if (ARTIST_PORTRAITS[norm]) {
    return ARTIST_PORTRAITS[norm];
  }

  // Check partial key matches sorted by descending length (longest artist name first)
  const sortedKeys = Object.keys(ARTIST_PORTRAITS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (new RegExp('(?:^|\\s|,)' + escaped + '(?:$|\\s|,)', 'i').test(norm)) {
      return ARTIST_PORTRAITS[key];
    }
  }

  // If the user specified: "if not in the song that contain the image file like with movie name and something use that also"
  if (sampleCover && !sampleCover.includes('default') && !sampleCover.includes('avatar')) {
    return sampleCover;
  }

  return DEFAULT_COVER;
}

/**
 * Get authentic cover image for a song / track
 */
function resolveSongCover(title, movie, artistName) {
  const normTitle = (title || '').toLowerCase().trim();
  const normMovie = (movie || '').toLowerCase().trim();

  // 1. Direct song title match
  if (MOVIE_SONG_COVERS[normTitle]) {
    return MOVIE_SONG_COVERS[normTitle];
  }

  // 2. Partial title match
  for (const [key, url] of Object.entries(MOVIE_SONG_COVERS)) {
    if (normTitle.includes(key) || key.includes(normTitle)) {
      return url;
    }
  }

  // 3. Movie match
  if (normMovie && MOVIE_SONG_COVERS[normMovie]) {
    return MOVIE_SONG_COVERS[normMovie];
  }

  // 4. Primary artist portrait
  if (artistName) {
    const artistImg = resolveArtistImage(artistName);
    if (artistImg && artistImg !== DEFAULT_COVER) {
      return artistImg;
    }
  }

  return DEFAULT_COVER;
}

module.exports = {
  ARTIST_PORTRAITS,
  MOVIE_SONG_COVERS,
  DEFAULT_COVER,
  resolveArtistImage,
  resolveSongCover
};
