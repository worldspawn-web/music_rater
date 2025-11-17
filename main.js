// Load environment variables first
require('dotenv').config();

const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const https = require('https');
const http = require('http');

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  WINDOW: {
    WIDTH: 1600,
    HEIGHT: 900,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600,
  },
  PATHS: {
    COVERS: 'covers',
    RATINGS: 'ratings.json',
    VIBES: 'vibes.json',
  },
  RATING: {
    COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes
  },
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow = null;
let lastTrackCache = null;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sanitizes a string to be used as a filename
 * Handles Cyrillic and special characters properly
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(str) {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(str).digest('hex');
  const safe = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .substring(0, 50);
  return `${safe}_${hash.substring(0, 8)}`;
}

/**
 * Executes a shell command and returns a promise
 * @param {string} command - Command to execute
 * @returns {Promise<string>} Command output
 */
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${error.message}`));
        return;
      }
      if (stderr) {
        console.warn(`Command stderr: ${stderr}`);
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Ensures a directory exists, creates it if it doesn't
 * @param {string} dirPath - Directory path
 */
async function ensureDirectory(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Reads JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {Promise<*>} Parsed JSON or default value
 */
async function readJsonFile(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    throw error;
  }
}

/**
 * Writes JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {*} data - Data to write
 */
async function writeJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================================
// SERVICES
// ============================================================================

/**
 * Service for interacting with nowplaying-cli
 */
class NowPlayingService {
  /**
   * Gets current track information
   * @returns {Promise<Object>} Track information
   */
  static async getCurrentTrack() {
    try {
      const title = await execPromise('nowplaying-cli get title');
      const album = await execPromise('nowplaying-cli get album');
      const artist = await execPromise('nowplaying-cli get artist');

      if (!title || !artist) {
        throw new Error('Invalid track data');
      }

      return { title, album: album || 'Unknown Album', artist };
    } catch (error) {
      console.error('Error getting current track:', error);
      throw new Error('Не удалось получить информацию о треке');
    }
  }

  /**
   * Fetches high-resolution artwork from Last.fm API
   * @param {string} artist - Artist name
   * @param {string} album - Album name
   * @returns {Promise<string|null>} Base64 artwork data or null
   */
  static async fetchHighResArtwork(artist, album) {
    if (!artist || !album) {
      console.log(
        `Skipping Last.fm lookup: artist="${artist}", album="${album}"`
      );
      return null;
    }

    try {
      // Last.fm API endpoint for album info
      const apiKey = process.env.LASTFM_API_KEY;
      if (!apiKey) {
        console.log(
          '⚠️ LASTFM_API_KEY not found in .env file, skipping Last.fm lookup'
        );
        return null;
      }
      const encodedArtist = encodeURIComponent(artist);
      const encodedAlbum = encodeURIComponent(album);
      const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${apiKey}&artist=${encodedArtist}&album=${encodedAlbum}&format=json`;

      console.log(`🔍 Fetching artwork from Last.fm for: ${artist} - ${album}`);

      return new Promise((resolve) => {
        const req = https.get(url, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', async () => {
            try {
              // Check for HTTP errors
              if (res.statusCode !== 200) {
                console.log(
                  `Last.fm API returned status ${
                    res.statusCode
                  }: ${data.substring(0, 200)}`
                );
                resolve(null);
                return;
              }

              const json = JSON.parse(data);

              // Check for Last.fm API errors
              if (json.error) {
                console.log(`Last.fm API error: ${json.message || json.error}`);
                resolve(null);
                return;
              }

              // Last.fm returns images in different sizes, we want the largest (extralarge or mega)
              const images = json?.album?.image || [];

              if (!images || images.length === 0) {
                console.log('No images found in Last.fm response');
                resolve(null);
                return;
              }

              let imageUrl = null;

              // Try to get the largest available image
              for (const size of ['mega', 'extralarge', 'large', 'medium']) {
                const img = images.find((i) => i.size === size);
                if (img && img['#text'] && img['#text'].trim() !== '') {
                  imageUrl = img['#text'].trim();
                  console.log(
                    `Found ${size} image: ${imageUrl.substring(0, 80)}...`
                  );
                  break;
                }
              }

              if (!imageUrl) {
                console.log('No valid image URL found in Last.fm response');
                resolve(null);
                return;
              }

              if (imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                // Last.fm placeholder image
                console.log('Last.fm returned placeholder image, skipping');
                resolve(null);
                return;
              }

              // Download the image
              console.log(
                `Downloading image from: ${imageUrl.substring(0, 80)}...`
              );
              const imageData = await this.downloadImage(imageUrl);
              if (imageData) {
                console.log(
                  '✅ Successfully downloaded high-resolution artwork'
                );
                resolve(imageData);
              } else {
                console.log('Failed to download image from Last.fm');
                resolve(null);
              }
            } catch (error) {
              console.log('Error parsing Last.fm response:', error.message);
              console.log('Response data:', data.substring(0, 500));
              resolve(null);
            }
          });
        });

        req.on('error', (error) => {
          console.log('Network error fetching from Last.fm:', error.message);
          resolve(null);
        });

        // Set timeout (increased to 5 seconds for slower connections)
        req.setTimeout(5000, () => {
          console.log('Last.fm API request timed out');
          req.destroy();
          resolve(null);
        });
      });
    } catch (error) {
      console.log('Error in fetchHighResArtwork:', error.message);
      return null;
    }
  }

  /**
   * Downloads an image from a URL and converts it to base64
   * @param {string} url - Image URL
   * @returns {Promise<string|null>} Base64 image data or null
   */
  static async downloadImage(url) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const base64Data = buffer.toString('base64');
            const contentType = res.headers['content-type'] || 'image/jpeg';
            resolve(`data:${contentType};base64,${base64Data}`);
          } catch (error) {
            console.log('Error processing image:', error.message);
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.log('Error downloading image:', error.message);
        resolve(null);
      });

      // Set timeout
      req.setTimeout(8000, () => {
        console.log('Image download timed out');
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Checks if a high-resolution cover already exists for the album
   * @param {string} album - Album name
   * @returns {Promise<boolean>} True if high-res cover exists
   */
  static async hasHighResCover(album) {
    if (!album) return false;

    try {
      const filename = `${sanitizeFilename(album)}.png`;
      const coverPath = path.join(__dirname, CONSTANTS.PATHS.COVERS, filename);

      if (fsSync.existsSync(coverPath)) {
        const stats = await fs.stat(coverPath);
        // High-res covers are typically > 20KB
        if (stats.size > 20000) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets artwork data for current track
   * Checks for existing high-res cover first, then tries Last.fm, falls back to artworkData
   * @param {string} artist - Artist name (optional, for Last.fm lookup)
   * @param {string} album - Album name (optional, for Last.fm lookup)
   * @returns {Promise<{data: string|null, isHighRes: boolean}>} Artwork data and quality flag
   */
  static async getArtworkData(artist = null, album = null) {
    try {
      // First check if a high-resolution cover already exists
      if (album && (await this.hasHighResCover(album))) {
        console.log(
          '✅ High-resolution cover already exists, skipping API request'
        );
        // Return null data - the cover path will be handled by saveCover
        return { data: null, isHighRes: true };
      }

      // If no high-res cover exists, try to fetch from Last.fm
      if (artist && album) {
        const highResArtwork = await this.fetchHighResArtwork(artist, album);
        if (highResArtwork) {
          console.log('✅ Fetched high-resolution artwork from Last.fm');
          return { data: highResArtwork, isHighRes: true };
        }
      }

      // Fallback to artworkData (150x150 from nowplaying-cli)
      const artworkData = await execPromise('nowplaying-cli get artworkData');

      if (!artworkData || artworkData === 'null' || artworkData === '') {
        return { data: null, isHighRes: false };
      }

      console.log(
        '⚠️ Using low-resolution artwork from nowplaying-cli (150x150)'
      );
      return { data: artworkData, isHighRes: false };
    } catch (error) {
      console.warn('Error getting artwork:', error.message);
      return { data: null, isHighRes: false };
    }
  }
}

/**
 * Service for managing album covers
 */
class CoverService {
  /**
   * Initializes the cover service
   */
  static async initialize() {
    const coversDir = path.join(__dirname, CONSTANTS.PATHS.COVERS);
    await ensureDirectory(coversDir);
  }

  /**
   * Saves album cover to disk
   * @param {string} album - Album name
   * @param {string} artworkData - Base64 artwork data
   * @param {boolean} isHighRes - Whether this is a high-resolution image
   * @returns {Promise<string|null>} Relative path to saved cover or null
   */
  static async saveCover(album, artworkData, isHighRes = false) {
    if (!artworkData) return null;

    try {
      const filename = `${sanitizeFilename(album)}.png`;
      const coverPath = path.join(__dirname, CONSTANTS.PATHS.COVERS, filename);

      // Remove data:image prefix if present
      const base64Data = artworkData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Check if cover already exists
      if (fsSync.existsSync(coverPath)) {
        const existingStats = await fs.stat(coverPath);
        const existingSize = existingStats.size;
        const newSize = buffer.length;

        // If existing cover is low quality (small file size, typically < 20KB for 150x150)
        // and we're trying to save a high-quality one, delete the old one
        if (isHighRes && existingSize < 20000 && newSize > existingSize) {
          console.log(
            `Deleting low-quality cover (${(existingSize / 1024).toFixed(
              2
            )} KB) and replacing with high-quality (${(newSize / 1024).toFixed(
              2
            )} KB)`
          );
          await fs.unlink(coverPath);
        } else if (!isHighRes && existingSize > 20000) {
          // If we have a high-quality cover and are trying to save a low-quality one, skip
          console.log(
            `Skipping low-quality cover - high-quality cover already exists (${(
              existingSize / 1024
            ).toFixed(2)} KB)`
          );
          return `${CONSTANTS.PATHS.COVERS}/${filename}`;
        } else {
          // Same quality or better quality already exists
          console.log(
            `Cover already exists: ${filename} (${(existingSize / 1024).toFixed(
              2
            )} KB)`
          );
          return `${CONSTANTS.PATHS.COVERS}/${filename}`;
        }
      }

      await fs.writeFile(coverPath, buffer);
      console.log(
        `Saved ${
          isHighRes ? 'high-quality' : 'low-quality'
        } cover: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`
      );

      return `${CONSTANTS.PATHS.COVERS}/${filename}`;
    } catch (error) {
      console.error('Error saving cover:', error);
      return null;
    }
  }
}

/**
 * Parses artist string into individual artist names
 * Handles cases where artist names contain commas (e.g., "Tyler, The Creator")
 * @param {string} artistString - Artist string that may contain multiple artists
 * @returns {Array<string>} Array of individual artist names
 */
function parseArtists(artistString) {
  if (!artistString || typeof artistString !== 'string') {
    return [];
  }

  // Common separators for multiple artists (in order of preference)
  // We check for these patterns with spaces around them
  const separators = [
    /\s+feat\.\s+/gi, // "feat." with spaces (check first to avoid splitting "feat." in names)
    /\s+ft\.\s+/gi, // "ft." with spaces
    /\s+featuring\s+/gi, // "featuring" with spaces
    /\s+&\s+/g, // Ampersand with spaces
    /\s+x\s+/g, // "x" with spaces (collaboration)
    /\s+\/\s+/g, // Slash with spaces
    /,\s+/g, // Comma with space (most common, but check last due to names like "Tyler, The Creator")
  ];

  let artists = [artistString.trim()];

  // Try each separator pattern
  for (const separator of separators) {
    const newArtists = [];
    let foundSeparator = false;

    for (const artist of artists) {
      const parts = artist.split(separator);
      if (parts.length > 1) {
        foundSeparator = true;
        // Filter out empty parts and trim
        newArtists.push(
          ...parts.map((p) => p.trim()).filter((p) => p.length > 0)
        );
      } else {
        newArtists.push(artist);
      }
    }

    if (foundSeparator) {
      artists = newArtists;
      break; // Use first separator that finds matches
    }
  }

  // Clean up and filter
  return artists
    .map((artist) => artist.trim())
    .filter((artist) => artist.length > 0);
}

/**
 * Calculates per-artist rating when multiple artists are on a track
 * Uses a modifier formula: rating - (number_of_artists - 1) * 0.5
 * Example: 8.0 rating with 3 artists = 8.0 - (3-1)*0.5 = 7.0 per artist
 * @param {number} trackRating - Original track rating
 * @param {number} artistCount - Number of artists on the track
 * @returns {number} Per-artist rating
 */
function calculatePerArtistRating(trackRating, artistCount) {
  if (artistCount <= 1) {
    return trackRating;
  }
  // Formula: subtract 0.5 for each additional artist beyond the first
  const modifier = (artistCount - 1) * 0.5;
  return Math.max(1, trackRating - modifier); // Ensure minimum rating of 1
}

/**
 * Service for managing ratings
 */
class RatingService {
  /**
   * Calculates Bayesian weighted rating (trustworthy rating system)
   * This balances the item's average rating with the number of ratings
   * Items with more ratings are more trustworthy and maintain their true average
   * Items with fewer ratings are pulled toward the global average
   *
   * Formula: weightedRating = (v / (v + m)) * R + (m / (v + m)) * C
   * Where:
   * - v = number of ratings for the item
   * - m = minimum ratings threshold (confidence requirement)
   * - R = average rating for the item
   * - C = global average rating across all items
   *
   * @param {number} avgRating - Average rating for the item
   * @param {number} count - Number of ratings for the item
   * @param {number} globalAvg - Global average rating across all items
   * @param {number} minRatings - Minimum ratings threshold (default: 3)
   * @returns {number} Weighted rating score
   */
  static calculateWeightedRating(avgRating, count, globalAvg, minRatings = 3) {
    if (count === 0) return 0;

    // Bayesian average formula
    const weight = count / (count + minRatings);
    const weightedRating = weight * avgRating + (1 - weight) * globalAvg;

    return weightedRating;
  }

  /**
   * Calculates global average rating across all items
   * @param {Array} items - Array of items with ratings arrays
   * @returns {number} Global average rating
   */
  static calculateGlobalAverage(items) {
    if (!items || items.length === 0) return 5.5; // Default to middle of 1-10 scale

    let totalSum = 0;
    let totalCount = 0;

    items.forEach((item) => {
      if (item.ratings && item.ratings.length > 0) {
        item.ratings.forEach((rating) => {
          totalSum += rating.rating || rating;
          totalCount += 1;
        });
      }
    });

    return totalCount > 0 ? totalSum / totalCount : 5.5;
  }

  /**
   * Gets all ratings from storage
   * @returns {Promise<Object>} Ratings object with tracks array
   */
  static async getAllRatings() {
    const data = await readJsonFile(CONSTANTS.PATHS.RATINGS, { tracks: [] });
    // Ensure proper structure
    if (Array.isArray(data)) {
      // Old format - convert to new format
      return { tracks: [] };
    }
    return data;
  }

  /**
   * Checks if track was recently rated
   * @param {Object} trackInfo - Track information
   * @returns {Promise<Object|null>} Last rating or null
   */
  static async getLastRating(trackInfo) {
    const data = await this.getAllRatings();
    const cooldownTime = Date.now() - CONSTANTS.RATING.COOLDOWN_MS;

    const track = data.tracks.find(
      (t) => t.title === trackInfo.title && t.artist === trackInfo.artist
    );

    if (!track || track.ratings.length === 0) {
      return null;
    }

    const lastRating = track.ratings[track.ratings.length - 1];
    if (new Date(lastRating.timestamp).getTime() > cooldownTime) {
      return {
        rating: lastRating.rating,
        timestamp: lastRating.timestamp,
        vibes: lastRating.vibes || [],
      };
    }

    return null;
  }

  /**
   * Saves a new rating
   * @param {Object} trackInfo - Track information
   * @param {number} rating - Rating value (1-10)
   * @returns {Promise<Object>} Result object
   */
  static async saveRating(trackInfo, rating) {
    // Validate rating
    const ratingNum = Number.parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10) {
      return { success: false, message: 'Неверное значение рейтинга' };
    }

    // Check for recent rating
    const lastRating = await this.getLastRating(trackInfo);
    if (lastRating) {
      return { success: false, message: 'Этот трек уже был оценён недавно' };
    }

    const data = await this.getAllRatings();

    // Parse individual artists from the artist string
    const artists = parseArtists(trackInfo.artist);
    const artistCount = artists.length;
    const perArtistRating = calculatePerArtistRating(ratingNum, artistCount);

    // Find existing track or create new one (still using full artist string for track lookup)
    let track = data.tracks.find(
      (t) => t.title === trackInfo.title && t.artist === trackInfo.artist
    );

    const newRating = {
      rating: ratingNum,
      vibes: trackInfo.vibe ? [trackInfo.vibe] : [],
      timestamp: new Date().toISOString(),
    };

    if (track) {
      // Add rating to existing track
      track.ratings.push(newRating);
      // Update genre if provided
      if (trackInfo.genre) {
        track.genre = trackInfo.genre;
      }
    } else {
      // Create new track entry
      track = {
        title: trackInfo.title,
        artist: trackInfo.artist,
        album: trackInfo.album,
        genre: trackInfo.genre || null,
        ratings: [newRating],
        flag: null,
        favorite: false,
      };
      data.tracks.push(track);
    }

    // Now save ratings for each individual artist
    // We need to find or create artist entries and add the per-artist rating
    // Since we're storing by track, we'll aggregate artists when getting ratings
    // For now, we'll store the track rating and parse artists when aggregating

    await writeJsonFile(CONSTANTS.PATHS.RATINGS, data);

    console.log(
      `Saved rating: ${
        trackInfo.title
      } - ${ratingNum}/10 (${artistCount} artist(s), ${perArtistRating.toFixed(
        1
      )} per artist)`
    );
    return { success: true };
  }

  /**
   * Gets aggregated track ratings with Bayesian weighted scoring
   * @returns {Promise<Array>} Array of track ratings with weighted averages
   */
  static async getTrackRatings() {
    const data = await this.getAllRatings();

    // Calculate global average across all tracks
    const globalAvg = this.calculateGlobalAverage(data.tracks);
    const minRatings = 3; // Minimum ratings for trustworthy score

    const tracks = data.tracks.map((track) => {
      const totalRating = track.ratings.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = totalRating / track.ratings.length;
      const count = track.ratings.length;

      // Calculate weighted rating (trustworthy score)
      const weightedRating = this.calculateWeightedRating(
        avgRating,
        count,
        globalAvg,
        minRatings
      );

      // Get the most recent vibe from the most recent rating
      const mostRecentRating = track.ratings[track.ratings.length - 1];
      const mood =
        mostRecentRating.vibes && mostRecentRating.vibes.length > 0
          ? mostRecentRating.vibes[0]
          : null;

      return {
        title: track.title,
        artist: track.artist,
        album: track.album,
        avgRating, // Keep original average for display
        weightedRating, // Use this for sorting (more trustworthy)
        count,
        genre: track.genre,
        mood, // Most recent mood/vibe
        flag: track.flag,
        favorite: track.favorite,
        coverPath: `covers/${sanitizeFilename(track.album)}.png`,
      };
    });

    // Sort by weighted rating (trustworthy score), then by count, then by avgRating
    return tracks.sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.count - a.count ||
        b.avgRating - a.avgRating
    );
  }

  /**
   * Gets aggregated artist ratings with Bayesian weighted scoring
   * Parses individual artists from track artist strings and aggregates ratings
   * @returns {Promise<Array>} Array of artist ratings with weighted averages
   */
  static async getArtistRatings() {
    const data = await this.getAllRatings();
    const artistMap = new Map();

    // Process each track and split ratings across individual artists
    data.tracks.forEach((track) => {
      // Parse individual artists from the track's artist string
      const artists = parseArtists(track.artist);
      const artistCount = artists.length;

      // For each rating on this track, distribute it to individual artists
      track.ratings.forEach((rating) => {
        const perArtistRating = calculatePerArtistRating(
          rating.rating,
          artistCount
        );

        // Add this rating to each individual artist
        artists.forEach((artistName) => {
          if (!artistMap.has(artistName)) {
            artistMap.set(artistName, {
              artist: artistName,
              ratings: [],
            });
          }

          artistMap.get(artistName).ratings.push(perArtistRating);
        });
      });
    });

    const artists = Array.from(artistMap.values());

    // Calculate global average across all artists
    const globalAvg = this.calculateGlobalAverage(artists);
    const minRatings = 3; // Minimum ratings for trustworthy score

    // Calculate averages and weighted ratings
    const artistRatings = artists.map((artist) => {
      const avgRating =
        artist.ratings.reduce((sum, r) => sum + r, 0) / artist.ratings.length;
      const count = artist.ratings.length;

      // Calculate weighted rating (trustworthy score)
      const weightedRating = this.calculateWeightedRating(
        avgRating,
        count,
        globalAvg,
        minRatings
      );

      return {
        artist: artist.artist,
        avgRating, // Keep original average for display
        weightedRating, // Use this for sorting (more trustworthy)
        count,
      };
    });

    // Sort by weighted rating (trustworthy score), then by count, then by avgRating
    return artistRatings.sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.count - a.count ||
        b.avgRating - a.avgRating
    );
  }

  /**
   * Gets aggregated genre ratings with Bayesian weighted scoring
   * @returns {Promise<Array>} Array of genre ratings with weighted averages
   */
  static async getGenreRatings() {
    const data = await this.getAllRatings();
    const genreMap = new Map();

    data.tracks.forEach((track) => {
      if (!track.genre) return;

      if (!genreMap.has(track.genre)) {
        genreMap.set(track.genre, {
          genre: track.genre,
          ratings: [],
        });
      }

      track.ratings.forEach((rating) => {
        genreMap.get(track.genre).ratings.push(rating.rating);
      });
    });

    const genres = Array.from(genreMap.values());

    // Calculate global average across all genres
    const globalAvg = this.calculateGlobalAverage(genres);
    const minRatings = 3; // Minimum ratings for trustworthy score

    // Calculate averages and weighted ratings
    const genreRatings = genres.map((genre) => {
      const avgRating =
        genre.ratings.reduce((sum, r) => sum + r, 0) / genre.ratings.length;
      const count = genre.ratings.length;

      // Calculate weighted rating (trustworthy score)
      const weightedRating = this.calculateWeightedRating(
        avgRating,
        count,
        globalAvg,
        minRatings
      );

      return {
        genre: genre.genre,
        avgRating, // Keep original average for display
        weightedRating, // Use this for sorting (more trustworthy)
        count,
      };
    });

    // Sort by weighted rating (trustworthy score), then by count, then by avgRating
    return genreRatings.sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.count - a.count ||
        b.avgRating - a.avgRating
    );
  }

  /**
   * Gets aggregated album ratings with Bayesian weighted scoring
   * @returns {Promise<Array>} Array of album ratings with weighted averages
   */
  static async getAlbumRatings() {
    const data = await this.getAllRatings();
    const albumMap = new Map();

    data.tracks.forEach((track) => {
      if (!track.album) return;

      const albumKey = `${track.album}|||${track.artist}`; // Use album+artist as unique key

      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, {
          album: track.album,
          artist: track.artist,
          ratings: [],
          coverPath: null, // Will be set from track if available
        });
      }

      // Set coverPath from track if not already set
      const albumEntry = albumMap.get(albumKey);
      if (!albumEntry.coverPath && track.coverPath) {
        albumEntry.coverPath = track.coverPath;
      }

      track.ratings.forEach((rating) => {
        albumEntry.ratings.push(rating.rating);
      });
    });

    const albums = Array.from(albumMap.values());

    // Calculate global average across all albums
    const globalAvg = this.calculateGlobalAverage(albums);
    const minRatings = 3; // Minimum ratings for trustworthy score

    const albumRatings = albums.map((album) => {
      const avgRating =
        album.ratings.reduce((sum, r) => sum + r, 0) / album.ratings.length;
      const count = album.ratings.length;

      // Calculate weighted rating (trustworthy score)
      const weightedRating = this.calculateWeightedRating(
        avgRating,
        count,
        globalAvg,
        minRatings
      );

      // Try to find cover path from any track in this album
      let coverPath = album.coverPath;
      if (!coverPath) {
        // Look for a track with this album to get the cover path
        const trackWithCover = data.tracks.find(
          (t) => t.album === album.album && t.artist === album.artist
        );
        if (trackWithCover && trackWithCover.coverPath) {
          coverPath = trackWithCover.coverPath;
        } else {
          coverPath = `covers/${sanitizeFilename(album.album)}.png`;
        }
      }

      return {
        album: album.album,
        artist: album.artist,
        avgRating,
        weightedRating,
        count,
        coverPath,
      };
    });

    // Sort by weighted rating (trustworthy score), then by count, then by avgRating
    return albumRatings.sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.count - a.count ||
        b.avgRating - a.avgRating
    );
  }

  /**
   * Gets aggregated vibe ratings with Bayesian weighted scoring
   * @returns {Promise<Array>} Array of vibe ratings with weighted averages
   */
  static async getVibeRatings() {
    const data = await this.getAllRatings();
    const vibeMap = new Map();

    data.tracks.forEach((track) => {
      track.ratings.forEach((rating) => {
        if (rating.vibes && rating.vibes.length > 0) {
          rating.vibes.forEach((vibe) => {
            if (!vibeMap.has(vibe)) {
              vibeMap.set(vibe, {
                vibe: vibe,
                ratings: [],
              });
            }

            vibeMap.get(vibe).ratings.push(rating.rating);
          });
        }
      });
    });

    const vibes = Array.from(vibeMap.values());

    // Calculate global average across all vibes
    const globalAvg = this.calculateGlobalAverage(vibes);
    const minRatings = 3; // Minimum ratings for trustworthy score

    // Calculate averages and weighted ratings
    const vibeRatings = vibes.map((vibe) => {
      const avgRating =
        vibe.ratings.reduce((sum, r) => sum + r, 0) / vibe.ratings.length;
      const count = vibe.ratings.length;

      // Calculate weighted rating (trustworthy score)
      const weightedRating = this.calculateWeightedRating(
        avgRating,
        count,
        globalAvg,
        minRatings
      );

      return {
        vibe: vibe.vibe,
        avgRating, // Keep original average for display
        weightedRating, // Use this for sorting (more trustworthy)
        count,
      };
    });

    // Sort by weighted rating (trustworthy score), then by count, then by avgRating
    return vibeRatings.sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.count - a.count ||
        b.avgRating - a.avgRating
    );
  }
}

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

/**
 * Creates the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONSTANTS.WINDOW.WIDTH,
    height: CONSTANTS.WINDOW.HEIGHT,
    minWidth: CONSTANTS.WINDOW.MIN_WIDTH,
    minHeight: CONSTANTS.WINDOW.MIN_HEIGHT,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  mainWindow.loadFile('renderer/index.html');

  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

/**
 * Registers all IPC handlers
 */
function registerIpcHandlers() {
  // Get current track with cover
  ipcMain.handle('getCurrentTrack', async () => {
    try {
      const trackInfo = await NowPlayingService.getCurrentTrack();
      const trackKey = `${trackInfo.title}|||${trackInfo.artist}`;

      if (lastTrackCache && lastTrackCache.key === trackKey) {
        // Track hasn't changed - return cached data without logging
        return lastTrackCache.data;
      }

      console.log(`🎵 Track changed: ${trackInfo.title} - ${trackInfo.artist}`);

      const artworkResult = await NowPlayingService.getArtworkData(
        trackInfo.artist,
        trackInfo.album
      );
      if (artworkResult.data) {
        console.log(
          `Artwork data received: ${(artworkResult.data.length / 1024).toFixed(
            2
          )} KB (${artworkResult.isHighRes ? 'high-res' : 'low-res'})`
        );
      }

      // If we have high-res cover but no data (already exists), get the path directly
      let coverPath;
      if (artworkResult.isHighRes && !artworkResult.data) {
        // High-res cover exists, get the path without saving
        const filename = `${sanitizeFilename(trackInfo.album)}.png`;
        coverPath = `${CONSTANTS.PATHS.COVERS}/${filename}`;
      } else {
        // Save the cover (or skip if already exists)
        coverPath = await CoverService.saveCover(
          trackInfo.album,
          artworkResult.data,
          artworkResult.isHighRes
        );
      }

      const result = {
        ...trackInfo,
        coverPath,
      };

      lastTrackCache = {
        key: trackKey,
        data: result,
      };

      return result;
    } catch (error) {
      console.error('IPC Error - getCurrentTrack:', error);
      throw error;
    }
  });

  // Get last rating for track
  ipcMain.handle('getLastRating', async (event, trackInfo) => {
    try {
      return await RatingService.getLastRating(trackInfo);
    } catch (error) {
      console.error('IPC Error - getLastRating:', error);
      return null;
    }
  });

  // Save rating
  ipcMain.handle('saveRating', async (event, { trackInfo, rating }) => {
    try {
      return await RatingService.saveRating(trackInfo, rating);
    } catch (error) {
      console.error('IPC Error - saveRating:', error);
      return { success: false, message: 'Ошибка при сохранении рейтинга' };
    }
  });

  // Get track ratings
  ipcMain.handle('getTrackRatings', async () => {
    try {
      return await RatingService.getTrackRatings();
    } catch (error) {
      console.error('IPC Error - getTrackRatings:', error);
      return [];
    }
  });

  // Get artist ratings
  ipcMain.handle('getArtistRatings', async () => {
    try {
      return await RatingService.getArtistRatings();
    } catch (error) {
      console.error('IPC Error - getArtistRatings:', error);
      return [];
    }
  });

  // Get genre ratings
  ipcMain.handle('getGenreRatings', async () => {
    try {
      return await RatingService.getGenreRatings();
    } catch (error) {
      console.error('IPC Error - getGenreRatings:', error);
      return [];
    }
  });

  // Get album ratings
  ipcMain.handle('getAlbumRatings', async () => {
    try {
      return await RatingService.getAlbumRatings();
    } catch (error) {
      console.error('IPC Error - getAlbumRatings:', error);
      return [];
    }
  });

  // Get vibe ratings
  ipcMain.handle('getVibeRatings', async () => {
    try {
      return await RatingService.getVibeRatings();
    } catch (error) {
      console.error('IPC Error - getVibeRatings:', error);
      return [];
    }
  });

  // Get recently used vibes
  ipcMain.handle('getRecentVibes', async () => {
    try {
      const data = await RatingService.getAllRatings();
      const vibeTimestamps = [];

      data.tracks.forEach((track) => {
        track.ratings.forEach((rating) => {
          if (rating.vibes && rating.vibes.length > 0) {
            rating.vibes.forEach((vibe) => {
              vibeTimestamps.push({
                vibe: vibe,
                timestamp: rating.timestamp,
              });
            });
          }
        });
      });

      // Sort by timestamp (most recent first)
      vibeTimestamps.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      // Get unique vibes in order of most recent use
      const uniqueVibes = [];
      const seenVibes = new Set();
      for (const item of vibeTimestamps) {
        if (!seenVibes.has(item.vibe)) {
          seenVibes.add(item.vibe);
          uniqueVibes.push(item.vibe);
        }
      }

      return uniqueVibes.slice(0, 5); // Return 5 most recently used
    } catch (error) {
      console.error('IPC Error - getRecentVibes:', error);
      return [];
    }
  });

  // Get all vibes from vibes.json
  ipcMain.handle('getVibes', async () => {
    try {
      const vibes = await readJsonFile(CONSTANTS.PATHS.VIBES, {});
      return vibes;
    } catch (error) {
      console.error('IPC Error - getVibes:', error);
      return {};
    }
  });

  // Save vibe to vibes.json
  ipcMain.handle('saveVibe', async (event, { name, color }) => {
    try {
      const vibes = await readJsonFile(CONSTANTS.PATHS.VIBES, {});
      vibes[name] = color;
      await writeJsonFile(CONSTANTS.PATHS.VIBES, vibes);
      return { success: true };
    } catch (error) {
      console.error('IPC Error - saveVibe:', error);
      return { success: false, message: 'Ошибка при сохранении настроения' };
    }
  });
}

// ============================================================================
// APPLICATION LIFECYCLE
// ============================================================================

/**
 * Initializes the application
 */
async function initialize() {
  try {
    await CoverService.initialize();
    registerIpcHandlers();
    createWindow();
  } catch (error) {
    console.error('Initialization error:', error);
    app.quit();
  }
}

// App event handlers
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
