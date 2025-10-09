const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;

const coversDir = path.join(__dirname, 'covers');
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

ipcMain.handle('getCurrentTrack', async () => {
  return new Promise((resolve, reject) => {
    exec('nowplaying-cli get title album artist', (error, stdout, stderr) => {
      if (error) {
        reject(`Ошибка: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`Ошибка в stderr: ${stderr}`);
        return;
      }
      const [title, album, artist] = stdout.trim().split('\n');

      exec(
        'nowplaying-cli get artworkData',
        (artError, artStdout, artStderr) => {
          let coverPath = null;

          if (!artError && artStdout) {
            const artworkData = artStdout.trim();

            if (artworkData && artworkData !== 'null') {
              // Generate unique filename based on artist and title
              const filename = `${sanitizeFilename(artist)}_${sanitizeFilename(
                title
              )}.jpg`;
              coverPath = path.join(coversDir, filename);

              // Save artwork if it doesn't exist
              if (!fs.existsSync(coverPath)) {
                try {
                  // Remove data:image prefix if present
                  const base64Data = artworkData.replace(
                    /^data:image\/\w+;base64,/,
                    ''
                  );
                  const buffer = Buffer.from(base64Data, 'base64');
                  fs.writeFileSync(coverPath, buffer);
                  console.log(`Saved cover: ${filename}`);
                } catch (saveError) {
                  console.error('Error saving artwork:', saveError);
                  coverPath = null;
                }
              }
            }
          }

          resolve({
            title,
            album,
            artist,
            coverPath: coverPath ? `covers/${path.basename(coverPath)}` : null,
          });
        }
      );
    });
  });
});

ipcMain.handle('getLastRating', async (event, trackInfo) => {
  if (!fs.existsSync('ratings.json')) {
    return null;
  }

  const ratings = JSON.parse(fs.readFileSync('ratings.json'));
  const lastRating = ratings.find(
    (r) =>
      r.title === trackInfo.title &&
      r.artist === trackInfo.artist &&
      new Date(r.timestamp) > new Date(Date.now() - 5 * 60 * 1000)
  );

  return lastRating || null;
});

ipcMain.handle('saveRating', async (event, { trackInfo, rating }) => {
  const data = {
    title: trackInfo.title,
    artist: trackInfo.artist,
    album: trackInfo.album,
    rating: Number.parseInt(rating),
    genre: trackInfo.genre,
    vibe: trackInfo.vibe,
    timestamp: new Date().toISOString(),
  };

  let ratings = [];
  if (fs.existsSync('ratings.json')) {
    ratings = JSON.parse(fs.readFileSync('ratings.json'));
  }

  const lastRating = ratings.find(
    (r) =>
      r.title === data.title &&
      r.artist === data.artist &&
      new Date(r.timestamp) > new Date(Date.now() - 5 * 60 * 1000)
  );

  if (lastRating) {
    return { success: false, message: 'Этот трек уже был оценён.' };
  }

  ratings.push(data);
  fs.writeFileSync('ratings.json', JSON.stringify(ratings, null, 2));
  return { success: true };
});

ipcMain.handle('getTrackRatings', async () => {
  if (!fs.existsSync('ratings.json')) {
    return [];
  }

  const ratings = JSON.parse(fs.readFileSync('ratings.json'));
  const trackRatings = {};

  ratings.forEach((rating) => {
    const key = `${rating.title}-${rating.artist}`;
    if (!trackRatings[key]) {
      trackRatings[key] = {
        title: rating.title,
        artist: rating.artist,
        ratings: [],
        genre: rating.genre,
        vibe: rating.vibe,
      };
    }
    trackRatings[key].ratings.push(rating.rating);
  });

  return Object.values(trackRatings)
    .map((track) => ({
      title: track.title,
      artist: track.artist,
      avgRating:
        track.ratings.reduce((sum, r) => sum + r, 0) / track.ratings.length,
      count: track.ratings.length,
      genre: track.genre,
      vibe: track.vibe,
    }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
});

ipcMain.handle('getArtistRatings', async () => {
  if (!fs.existsSync('ratings.json')) {
    return [];
  }

  const ratings = JSON.parse(fs.readFileSync('ratings.json'));
  const artistRatings = {};

  ratings.forEach((rating) => {
    if (!artistRatings[rating.artist]) {
      artistRatings[rating.artist] = {
        artist: rating.artist,
        ratings: [],
      };
    }
    artistRatings[rating.artist].ratings.push(rating.rating);
  });

  return Object.values(artistRatings)
    .map((artist) => ({
      artist: artist.artist,
      avgRating:
        artist.ratings.reduce((sum, r) => sum + r, 0) / artist.ratings.length,
      count: artist.ratings.length,
    }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
});

ipcMain.handle('getGenreRatings', async () => {
  if (!fs.existsSync('ratings.json')) {
    return [];
  }

  const ratings = JSON.parse(fs.readFileSync('ratings.json'));
  const genreRatings = {};

  ratings.forEach((rating) => {
    if (rating.genre) {
      if (!genreRatings[rating.genre]) {
        genreRatings[rating.genre] = {
          genre: rating.genre,
          ratings: [],
        };
      }
      genreRatings[rating.genre].ratings.push(rating.rating);
    }
  });

  return Object.values(genreRatings)
    .map((genre) => ({
      genre: genre.genre,
      avgRating:
        genre.ratings.reduce((sum, r) => sum + r, 0) / genre.ratings.length,
      count: genre.ratings.length,
    }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
});

app.whenReady().then(createWindow);
