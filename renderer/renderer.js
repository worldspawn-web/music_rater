const { ipcRenderer } = require('electron');

// Переключение вкладок
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.tab-button')
      .forEach((btn) => btn.classList.remove('active'));
    document
      .querySelectorAll('.tab-content')
      .forEach((content) => content.classList.remove('active'));

    button.classList.add('active');
    document
      .getElementById(button.getAttribute('data-tab'))
      .classList.add('active');

    if (button.getAttribute('data-tab') === 'track-ratings') {
      loadTrackRatings();
    } else if (button.getAttribute('data-tab') === 'artist-ratings') {
      loadArtistRatings();
    }
  });
});

// Функция для получения текущего трека
async function fetchCurrentTrack() {
  try {
    const trackInfo = await ipcRenderer.invoke('getCurrentTrack');
    document.getElementById('track-title').textContent = trackInfo.title;
    document.getElementById('track-artist').textContent = trackInfo.artist;
    document.getElementById('track-album').textContent = trackInfo.album;

    // Загрузка обложки альбома (пока заглушка)
    document.getElementById('track-cover').src =
      'https://via.placeholder.com/200';
  } catch (error) {
    console.error(error);
  }
}

// Обработчик для кнопок рейтинга
document.querySelectorAll('.rating-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const rating = button.getAttribute('data-rating');
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
        alert(`Вы поставили оценку: ${rating}`);
      }
    } catch (error) {
      console.error('Ошибка при сохранении рейтинга:', error);
    }
  });
});

// Загрузка рейтингов треков
async function loadTrackRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getTrackRatings');
    const tableBody = document.querySelector('#track-ratings-table tbody');
    tableBody.innerHTML = '';

    ratings.forEach((rating) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${rating.title}</td>
        <td>${rating.artist}</td>
        <td>${rating.avgRating.toFixed(2)}</td>
        <td>${rating.count}</td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов треков:', error);
  }
}

// Загрузка рейтингов исполнителей
async function loadArtistRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getArtistRatings');
    const tableBody = document.querySelector('#artist-ratings-table tbody');
    tableBody.innerHTML = '';

    ratings.forEach((rating) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${rating.artist}</td>
        <td>${rating.count}</td>
        <td>${rating.avgRating.toFixed(2)}</td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов исполнителей:', error);
  }
}

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);
