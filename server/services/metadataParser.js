const fs = require('node:fs');
const path = require('node:path');

/**
 * Normalizes a string for fuzzy matching:
 * lowercase, strips punctuation, file extensions, and extra whitespace.
 */
function normalizeStr(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // remove extension like .mp3
    .replace(/[^a-z0-9]/g, '')     // keep alphanumeric only
    .trim();
}

/**
 * Generates a URL-friendly slug from an artist or title name.
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, '-and-')
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses a single raw line of metadata into structured fields.
 * Example formats:
 * - 1. Anirudh Ravichander - Raga of Revenge
 * - 2. Sai Abhyankkar, Nargis Teji, Asma Teji, Vivek, Sai Smriti - Radhimaa - From "Think Indie"
 * - 4. Anirudh Ravichander, Jangi Reddy, Arjun Chandy, Kasarla Shyam - Aaya Sher (From "The Paradise") (Telugu)
 * - 5. Sam C.S., Anirudh Ravichander, Shakthisree Gopalan - Yaanji - From "Vikram Vedha"
 */
function parseMetadataLine(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  let line = rawLine.trim();
  if (!line) return null;

  // 1. Strip leading track numbering: "1. ", "01 - ", "10) "
  line = line.replace(/^\d+[\.\s\-)]+\s*/, '').trim();

  // 2. Extract language if at the end e.g. (Telugu), [TELUGU], (Tamil)
  let language = null;
  const langMatch = line.match(/[\(\[]\s*(Telugu|Tamil|Hindi|Malayalam|Kannada|English|Punjabi)\s*[\)\]]$/i);
  if (langMatch) {
    language = langMatch[1].charAt(0).toUpperCase() + langMatch[1].slice(1).toLowerCase();
    line = line.replace(/[\(\[]\s*(Telugu|Tamil|Hindi|Malayalam|Kannada|English|Punjabi)\s*[\)\]]$/i, '').trim();
  }

  // 3. Extract movie / source: e.g. From "Vikram Vedha", (From "The Paradise"), - From "Think Indie", - From Bachelor
  let movie = null;
  const fromRegexes = [
    /[\(\[]\s*From\s+["']([^"']+)["']\s*[\)\]]/i,
    /[\(\[]\s*From\s+([^()]+)\s*[\)\]]/i,
    /-\s*From\s+["']([^"']+)["']/i,
    /-\s*From\s+([^-\(\)]+)/i,
    /[\(\[]\s*From\s+["']?([^"'\)\]]+)["']?\s*[\)\]]/i
  ];
  for (const r of fromRegexes) {
    const m = line.match(r);
    if (m) {
      movie = m[1].trim();
      line = line.replace(m[0], '').trim();
      break;
    }
  }

  // Clean trailing dashes or spaces
  line = line.replace(/\s*-\s*$/, '').trim();

  // 4. Split artists and title: "Artist1, Artist2 - Title"
  // Protect hyphenated artist duos like Vivek - Mervin
  const protectedLine = line.replace(/Vivek\s*-\s*Mervin/gi, 'Vivek-Mervin');
  const dashIdx = protectedLine.indexOf(' - ');
  let artistsPart = '';
  let titlePart = '';

  if (dashIdx !== -1) {
    artistsPart = protectedLine.slice(0, dashIdx).replace(/Vivek-Mervin/gi, 'Vivek - Mervin').trim();
    titlePart = protectedLine.slice(dashIdx + 3).replace(/Vivek-Mervin/gi, 'Vivek - Mervin').trim();
  } else {
    const singleDash = protectedLine.indexOf('-');
    if (singleDash !== -1) {
      artistsPart = protectedLine.slice(0, singleDash).replace(/Vivek-Mervin/gi, 'Vivek - Mervin').trim();
      titlePart = protectedLine.slice(singleDash + 1).replace(/Vivek-Mervin/gi, 'Vivek - Mervin').trim();
    } else {
      titlePart = line;
      artistsPart = 'Various Artists';
    }
  }

  // Clean up title
  titlePart = titlePart
    .replace(/^["']|["']$/g, '')
    .replace(/\s*-\s*$/, '')
    .trim();

  // 5. Parse artists into individual trimmed strings
  const artists = artistsPart
    .split(',')
    .map(a => a.trim().replace(/^["']|["']$/g, ''))
    .filter(a => a.length > 0 && !/^from\b/i.test(a));

  if (artists.length === 0) {
    artists.push('Various Artists');
  }

  return {
    raw: rawLine,
    title: titlePart,
    artists,
    artistString: artists.join(', '),
    movie: movie || null,
    album: movie || 'Tamil Hits',
    language: language || 'Tamil'
  };
}

/**
 * Parses all metadata files in the Meta Data directory.
 * Automatically deduplicates songs across playlists.
 */
function loadAllMetadata(metadataDir) {
  const targetDir = metadataDir || path.resolve(process.cwd(), 'Meta Data');
  if (!fs.existsSync(targetDir)) {
    console.warn(`[MetadataParser] Meta Data folder not found at: ${targetDir}`);
    return [];
  }

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.txt'));
  const songMap = new Map(); // key: normalized(title + '_' + primaryArtist)

  for (const file of files) {
    const filePath = path.join(targetDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

      for (const line of lines) {
        const parsed = parseMetadataLine(line);
        if (!parsed || !parsed.title) continue;

        const primaryArtist = parsed.artists[0] || '';
        const key = `${normalizeStr(parsed.title)}_${normalizeStr(primaryArtist)}`;

        if (!songMap.has(key)) {
          songMap.set(key, {
            ...parsed,
            sourceFiles: [file]
          });
        } else {
          const existing = songMap.get(key);
          if (!existing.sourceFiles.includes(file)) {
            existing.sourceFiles.push(file);
          }
          // Enrich with movie/album if previous record was missing it
          if (!existing.movie && parsed.movie) {
            existing.movie = parsed.movie;
            existing.album = parsed.movie;
          }
        }
      }
    } catch (err) {
      console.error(`[MetadataParser] Error reading file ${file}:`, err.message);
    }
  }

  const allSongs = Array.from(songMap.values());
  console.log(`[MetadataParser] Parsed ${allSongs.length} unique songs from ${files.length} metadata files.`);
  return allSongs;
}

/**
 * Fallback parser for Cloudinary assets when not found in .txt metadata files
 */
function parseFromPublicId(publicId) {
  if (!publicId) {
    return {
      title: 'Unknown Title',
      artists: ['Various Artists'],
      artistString: 'Various Artists',
      movie: null,
      album: 'Tamil Hits',
      language: 'Tamil'
    };
  }

  const parts = publicId.split('/');
  let filename = parts[parts.length - 1];
  filename = filename.replace(/\.[a-zA-Z0-9]+$/, ''); // remove extension

  // Protect duo names
  filename = filename.replace(/Vivek_-_Mervin/g, 'Vivek-Mervin');

  let artistPart = 'Various Artists';
  let titlePart = filename.replace(/_/g, ' ');
  let movie = null;

  if (filename.includes('_-_')) {
    const split = filename.split('_-_');
    artistPart = split[0].replace(/_/g, ' ').replace('Vivek-Mervin', 'Vivek - Mervin').trim();
    titlePart = split.slice(1).join(' - ').replace(/_/g, ' ').trim();
  } else if (filename.includes(' - ')) {
    const split = filename.split(' - ');
    artistPart = split[0].trim();
    titlePart = split.slice(1).join(' - ').trim();
  }

  // Check for movie in title e.g. "Railin Oligal - From Blue Star" or "Kanimaa From Retro"
  const fromMatch = titlePart.match(/[-_\s]*From\s+([A-Za-z0-9\s&]+)/i);
  if (fromMatch) {
    movie = fromMatch[1].trim();
    titlePart = titlePart.replace(fromMatch[0], '').trim();
  }

  let artists = [];
  if (artistPart.includes(',')) {
    artists = artistPart.split(',').map(a => a.trim()).filter(Boolean);
  } else {
    artists = [artistPart];
  }

  return {
    title: titlePart,
    artists,
    artistString: artists.join(', '),
    movie: movie,
    album: movie || 'Tamil Hits',
    language: 'Tamil'
  };
}

module.exports = {
  normalizeStr,
  slugify,
  parseMetadataLine,
  loadAllMetadata,
  parseFromPublicId
};
