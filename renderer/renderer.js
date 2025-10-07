const { ipcRenderer } = require('electron');

// Функция для получения текущего трека
async function fetchCurrentTrack() {
  try {
    const trackInfo = await ipcRenderer.invoke('getCurrentTrack');
    document.getElementById('track-title').textContent = trackInfo.title;
    document.getElementById('track-artist').textContent = trackInfo.artist;
    document.getElementById('track-album').textContent = trackInfo.album;
  } catch (error) {
    console.error(error);
  }
}

// Обработчик для звезд рейтинга
document.querySelectorAll('.star').forEach((star) => {
  star.addEventListener('click', async () => {
    const rating = star.getAttribute('data-rating');
    const trackTitle = document.getElementById('track-title').textContent;
    const trackArtist = document.getElementById('track-artist').textContent;
    const trackAlbum = document.getElementById('track-album').textContent;

    const trackInfo = {
      title: trackTitle,
      artist: trackArtist,
      album: trackAlbum,
    };

    try {
      const result = await ipcRenderer.invoke('saveRating', {
        trackInfo,
        rating,
      });
      if (result.success) {
        alert(`Вы поставили оценку: ${rating} звезд`);
      }
    } catch (error) {
      console.error('Ошибка при сохранении рейтинга:', error);
    }
  });
});

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);
