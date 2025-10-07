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

ipcMain.handle('saveRating', async (event, { trackInfo, rating }) => {
  const data = {
    title: trackInfo.title,
    artist: trackInfo.artist,
    album: trackInfo.album,
    rating: rating,
    timestamp: new Date().toISOString(),
  };

  let ratings = [];
  if (fs.existsSync('ratings.json')) {
    ratings = JSON.parse(fs.readFileSync('ratings.json'));
  }
  ratings.push(data);
  fs.writeFileSync('ratings.json', JSON.stringify(ratings, null, 2));
  return { success: true };
});

app.whenReady().then(createWindow);
