const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

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

function downloadCover(albumName, url) {
  return new Promise((resolve, reject) => {
    const coversDir = path.join(__dirname, 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir);
    }

    const fileName = path.join(
      coversDir,
      `${albumName.replace(/[^a-z0-9]/gi, '_')}.jpg`
    );
    if (fs.existsSync(fileName)) {
      resolve(fileName);
      return;
    }

    const file = fs.createWriteStream(fileName);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(fileName);
        });
      })
      .on('error', (err) => {
        fs.unlink(fileName, () => {});
        reject(err);
      });
  });
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

ipcMain.handle('getCover', async (event, album) => {
  try {
    // Используем placeholder для примера
    const coverUrl = `https://via.placeholder.com/200?text=${encodeURIComponent(
      album
    )}`;
    const coverPath = await downloadCover(album, coverUrl);
    return coverPath;
  } catch (error) {
    console.error('Ошибка при загрузке обложки:', error);
    return null;
  }
});

ipcMain.handle('saveRating', async (event, { trackInfo, rating }) => {
  const data = {
    title: trackInfo.title,
    artist: trackInfo.artist,
    album: trackInfo.album,
    rating: parseInt(rating),
    timestamp: new Date().toISOString(),
  };

  let ratings = [];
  if (fs.existsSync('ratings.json')) {
    ratings = JSON.parse(fs.readFileSync('ratings.json'));
  }

  // Проверяем, что трек не был оценён в течение последних 5 минут
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

app.whenReady().then(createWindow);
