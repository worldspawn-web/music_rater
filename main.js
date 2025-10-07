const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;

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
      resolve({ title, album, artist });
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
    rating: parseInt(rating),
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

ipcMain.handle('getGenres', async () => {
  if (!fs.existsSync('ratings.json')) {
    return ['Рок', 'Поп', 'Хип-Хоп', 'Электроника', 'Классика'];
  }

  const ratings = JSON.parse(fs.readFileSync('ratings.json'));
  const genres = new Set();

  ratings.forEach((rating) => {
    if (rating.genre) {
      genres.add(rating.genre);
    }
  });

  return Array.from(genres);
});

ipcMain.handle('addGenre', async (event, genre) => {
  // Жанры добавляются автоматически при сохранении рейтинга
  return { success: true };
});

app.whenReady().then(createWindow);
