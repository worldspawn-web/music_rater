const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  WINDOW: {
    WIDTH: 1000,
    HEIGHT: 700,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600,
  },
  PATHS: {
    COVERS: 'covers',
    RATINGS: 'ratings.json',
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
   * Gets artwork data for current track
   * @returns {Promise<string|null>} Base64 artwork data or null
   */
  static async getArtworkData() {
    try {
      const artworkData = await execPromise('nowplaying-cli get artworkData');

      if (!artworkData || artworkData === 'null' || artworkData === '') {
        return null;
      }

      return artworkData;
    } catch (error) {
      console.warn('Error getting artwork:', error.message);
      return null;
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
   * @returns {Promise<string|null>} Relative path to saved cover or null
   */
  static async saveCover(album, artworkData) {
    if (!artworkData) return null;

    try {
      const filename = `${sanitizeFilename(album)}.png`;
      const coverPath = path.join(__dirname, CONSTANTS.PATHS.COVERS, filename);

      // Check if cover already exists
      if (fsSync.existsSync(coverPath)) {
        console.log(`Cover already exists: ${filename}`);
        return `${CONSTANTS.PATHS.COVERS}/${filename}`;
      }

      // Remove data:image prefix if present
      const base64Data = artworkData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      await fs.writeFile(coverPath, buffer);
      console.log(
        `Saved cover: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`
      );
      console.log(`Buffer length: ${buffer.length} bytes`);

      return `${CONSTANTS.PATHS.COVERS}/${filename}`;
    } catch (error) {
      console.error('Error saving cover:', error);
      return null;
    }
  }
}

/**
 * Service for managing ratings
 */
class RatingService {
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

    // Find existing track or create new one
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

    await writeJsonFile(CONSTANTS.PATHS.RATINGS, data);

    console.log(`Saved rating: ${trackInfo.title} - ${ratingNum}/10`);
    return { success: true };
  }

  /**
   * Gets aggregated track ratings
   * @returns {Promise<Array>} Array of track ratings with averages
   */
  static async getTrackRatings() {
    const data = await this.getAllRatings();

    return data.tracks
      .map((track) => {
        const totalRating = track.ratings.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = totalRating / track.ratings.length;

        return {
          title: track.title,
          artist: track.artist,
          album: track.album,
          avgRating,
          count: track.ratings.length,
          genre: track.genre,
          flag: track.flag,
          favorite: track.favorite,
          coverPath: `covers/${sanitizeFilename(track.album)}.png`,
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
  }

  /**
   * Gets aggregated artist ratings
   * @returns {Promise<Array>} Array of artist ratings with averages
   */
  static async getArtistRatings() {
    const data = await this.getAllRatings();
    const artistMap = new Map();

    data.tracks.forEach((track) => {
      if (!artistMap.has(track.artist)) {
        artistMap.set(track.artist, {
          artist: track.artist,
          ratings: [],
        });
      }

      track.ratings.forEach((rating) => {
        artistMap.get(track.artist).ratings.push(rating.rating);
      });
    });

    // Calculate averages and sort
    return Array.from(artistMap.values())
      .map((artist) => ({
        artist: artist.artist,
        avgRating:
          artist.ratings.reduce((sum, r) => sum + r, 0) / artist.ratings.length,
        count: artist.ratings.length,
      }))
      .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
  }

  /**
   * Gets aggregated genre ratings
   * @returns {Promise<Array>} Array of genre ratings with averages
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

    // Calculate averages and sort
    return Array.from(genreMap.values())
      .map((genre) => ({
        genre: genre.genre,
        avgRating:
          genre.ratings.reduce((sum, r) => sum + r, 0) / genre.ratings.length,
        count: genre.ratings.length,
      }))
      .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
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

      const artworkData = await NowPlayingService.getArtworkData();
      if (artworkData) {
        console.log(
          `Artwork data received: ${(artworkData.length / 1024).toFixed(2)} KB`
        );
      }

      const coverPath = await CoverService.saveCover(
        trackInfo.album,
        artworkData
      );

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
