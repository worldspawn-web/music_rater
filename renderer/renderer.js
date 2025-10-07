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
    } else if (button.getAttribute('data-tab') === 'genre-ratings') {
      loadGenreRatings();
    }
  });
});

// Функция для получения текущего трека
let currentTrackInfo = null;
let currentRating = null;

async function fetchCurrentTrack() {
  try {
    const trackInfo = await ipcRenderer.invoke('getCurrentTrack');
    document.getElementById('track-title').textContent = trackInfo.title;
    document.getElementById('track-artist').textContent = trackInfo.artist;
    document.getElementById('track-album').textContent = trackInfo.album;

    // Сбрасываем состояние кнопок рейтинга при смене трека
    if (
      currentTrackInfo &&
      (currentTrackInfo.title !== trackInfo.title ||
        currentTrackInfo.artist !== trackInfo.artist)
    ) {
      resetRatingButtons();
      currentRating = null;
    }

    currentTrackInfo = trackInfo;

    // Проверяем, был ли уже поставлен рейтинг для этого трека
    const lastRating = await ipcRenderer.invoke('getLastRating', trackInfo);
    if (lastRating) {
      currentRating = lastRating.rating;
      blockRatingButtons(lastRating.rating);
    } else {
      resetRatingButtons();
    }
  } catch (error) {
    console.error(error);
  }
}

// Сброс состояния кнопок рейтинга
function resetRatingButtons() {
  document.querySelectorAll('.rating-button').forEach((button) => {
    button.style.backgroundColor = '';
    button.disabled = false;
  });
}

// Блокировка кнопок рейтинга
function blockRatingButtons(rating) {
  document.querySelectorAll('.rating-button').forEach((button) => {
    const buttonRating = parseInt(button.getAttribute('data-rating'));
    if (buttonRating === rating) {
      button.style.backgroundColor = '#4CAF50';
    } else {
      button.style.backgroundColor = '#cccccc';
      button.disabled = true;
    }
  });
}

// Обработчик для кнопок рейтинга
document.querySelectorAll('.rating-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const rating = parseInt(button.getAttribute('data-rating'));
    const trackTitle = document.getElementById('track-title').textContent;
    const trackArtist = document.getElementById('track-artist').textContent;
    const trackAlbum = document.getElementById('track-album').textContent;
    const genre = document.getElementById('genre-select').value;
    const vibeButton = document.querySelector('.vibe-button.active');
    const vibe = vibeButton ? vibeButton.getAttribute('data-vibe') : null;

    const trackInfo = {
      title: trackTitle,
      artist: trackArtist,
      album: trackAlbum,
      genre: genre,
      vibe: vibe,
    };

    try {
      const result = await ipcRenderer.invoke('saveRating', {
        trackInfo,
        rating,
      });
      if (result.success) {
        currentRating = rating;
        blockRatingButtons(rating);
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Ошибка при сохранении рейтинга:', error);
    }
  });
});

// Обработчик для кнопок вайбов
document.querySelectorAll('.vibe-button').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.vibe-button')
      .forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
  });
});

// Загрузка рейтингов треков
async function loadTrackRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getTrackRatings');
    const tableBody = document.querySelector('#track-ratings-table tbody');
    tableBody.innerHTML = '';

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      if (index < 3) {
        row.classList.add('top-three');
      }
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${rating.title}</td>
        <td>${rating.artist}</td>
        <td>${rating.avgRating.toFixed(2)}</td>
        <td>${rating.count}</td>
        <td>${rating.genre || ''}</td>
        <td><div class="vibe-indicator" style="background-color: ${getVibeColor(
          rating.vibe
        )};"></div></td>
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

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      if (index < 3) {
        row.classList.add('top-three');
      }
      row.innerHTML = `
        <td>${index + 1}</td>
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

// Загрузка рейтингов жанров
async function loadGenreRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getGenreRatings');
    const tableBody = document.querySelector('#genre-ratings-table tbody');
    tableBody.innerHTML = '';

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      if (index < 3) {
        row.classList.add('top-three');
      }
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${rating.genre}</td>
        <td>${rating.count}</td>
        <td>${rating.avgRating.toFixed(2)}</td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов жанров:', error);
  }
}

// Функция для получения цвета вайба
function getVibeColor(vibe) {
  const vibeColors = {
    Спокойное: '#aed581',
    Грустное: '#81d4fa',
    Агрессивное: '#ff8a80',
    Веселое: '#ffd54f',
    Романтичное: '#ce93d8',
  };
  return vibeColors[vibe] || '#e0e0e0';
}

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);

// Загрузка жанров в выпадающий список
async function loadGenres() {
  const genres = await ipcRenderer.invoke('getGenres');
  const genreSelect = document.getElementById('genre-select');
  genreSelect.innerHTML = '';
  const defaultGenres = ['Рок', 'Поп', 'Хип-Хоп', 'Электроника', 'Классика'];
  defaultGenres.forEach((genre) => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    genreSelect.appendChild(option);
  });
  genres.forEach((genre) => {
    if (!defaultGenres.includes(genre)) {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      genreSelect.appendChild(option);
    }
  });
}

// Добавление нового жанра
document
  .getElementById('add-genre-button')
  .addEventListener('click', async () => {
    const newGenre = prompt('Введите название нового жанра:');
    if (newGenre) {
      await ipcRenderer.invoke('addGenre', newGenre);
      loadGenres();
    }
  });

// Обработчик для кнопок вайбов
document.querySelectorAll('.vibe-button').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.vibe-button')
      .forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
  });
});

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadGenres();
  fetchCurrentTrack();
});
