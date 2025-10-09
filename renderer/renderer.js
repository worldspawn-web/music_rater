const { ipcRenderer } = require('electron');

// Переключение вкладок
document.querySelectorAll('.nav-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.nav-tab')
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

    const albumCover = document.getElementById('album-cover');
    const noCover = document.getElementById('no-cover');

    if (trackInfo.coverPath) {
      albumCover.src = '../' + trackInfo.coverPath;
      albumCover.style.display = 'block';
      noCover.style.display = 'none';
    } else {
      albumCover.style.display = 'none';
      noCover.style.display = 'flex';
    }

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
    const buttonRating = Number.parseInt(button.getAttribute('data-rating'));
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
    const rating = Number.parseInt(button.getAttribute('data-rating'));
    const trackTitle = document.getElementById('track-title').textContent;
    const trackArtist = document.getElementById('track-artist').textContent;
    const trackAlbum = document.getElementById('track-album').textContent;
    const genre = document.getElementById('genre-select').value;
    const vibeButton = document.querySelector('.vibe-chip.active');
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
        addGenreToStorage(genre);
        loadGenres();
        document.getElementById('genre-select').value = genre;
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Ошибка при сохранении рейтинга:', error);
    }
  });
});

// Обработчик для кнопок вайбов
document.querySelectorAll('.vibe-chip:not(.add-vibe)').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.vibe-chip:not(.add-vibe)')
      .forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
  });
});

// Обработчик для кнопки добавления жанра
document.getElementById('add-genre-button').addEventListener('click', () => {
  const genreInput = document.getElementById('genre-input');
  genreInput.classList.toggle('hidden');
});

// Обработчик для кнопки сохранения нового жанра
document.getElementById('save-genre-button').addEventListener('click', () => {
  const newGenre = document.getElementById('new-genre-input').value;
  if (newGenre) {
    addGenreToStorage(newGenre);
    loadGenres();
    document.getElementById('genre-select').value = newGenre;
    document.getElementById('new-genre-input').value = '';
    document.getElementById('genre-input').classList.add('hidden');
  }
});

// Функция для добавления жанра в localStorage
function addGenreToStorage(genre) {
  const genres = JSON.parse(localStorage.getItem('genres') || '[]');
  if (!genres.includes(genre)) {
    genres.push(genre);
    localStorage.setItem('genres', JSON.stringify(genres));
  }
}

// Загрузка жанров в выпадающий список
function loadGenres() {
  const genres = JSON.parse(localStorage.getItem('genres') || '[]');
  const genreSelect = document.getElementById('genre-select');
  genreSelect.innerHTML = '<option value="">Выберите жанр</option>';
  genres.forEach((genre) => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    genreSelect.appendChild(option);
  });
}

// Обработчик для кнопки добавления вайба
document.getElementById('add-vibe-button').addEventListener('click', () => {
  const vibeInput = document.getElementById('vibe-input');
  vibeInput.classList.toggle('hidden');
});

// Обработчик для кнопки сохранения нового вайба
document.getElementById('save-vibe-button').addEventListener('click', () => {
  const newVibeName = document.getElementById('new-vibe-name').value;
  const newVibeColor = document.getElementById('new-vibe-color').value;

  if (newVibeName) {
    addVibe(newVibeName, newVibeColor);
    document.getElementById('new-vibe-name').value = '';
    document.getElementById('vibe-input').classList.add('hidden');
  }
});

// Функция для добавления нового вайба
function addVibe(name, color) {
  const vibeGrid = document.getElementById('vibe-buttons');
  const addButton = document.getElementById('add-vibe-button');

  const newVibeButton = document.createElement('button');
  newVibeButton.className = 'vibe-chip';
  newVibeButton.textContent = name;
  newVibeButton.setAttribute('data-vibe', name);
  newVibeButton.style.setProperty('--vibe-color', color);

  newVibeButton.addEventListener('click', () => {
    document
      .querySelectorAll('.vibe-chip:not(.add-vibe)')
      .forEach((btn) => btn.classList.remove('active'));
    newVibeButton.classList.add('active');
  });

  vibeGrid.insertBefore(newVibeButton, addButton);
}

// Загрузка рейтингов треков
async function loadTrackRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getTrackRatings');
    const tableBody = document.getElementById('track-ratings-tbody');
    const emptyState = document.getElementById('track-ratings-empty');

    tableBody.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="rank-cell">${index + 1}</td>
        <td class="title-cell">${rating.title}</td>
        <td>${rating.artist}</td>
        <td class="rating-cell">
          <span class="rating-badge">${rating.avgRating.toFixed(1)}</span>
        </td>
        <td class="count-cell">${rating.count}</td>
        <td>${rating.genre || '—'}</td>
        <td class="vibe-cell">
          ${
            rating.vibe
              ? `<span class="vibe-badge" style="--vibe-color: ${getVibeColor(
                  rating.vibe
                )}">${rating.vibe}</span>`
              : '—'
          }
        </td>
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
    const tableBody = document.getElementById('artist-ratings-tbody');
    const emptyState = document.getElementById('artist-ratings-empty');

    tableBody.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="rank-cell">${index + 1}</td>
        <td class="title-cell">${rating.artist}</td>
        <td class="count-cell">${rating.count}</td>
        <td class="rating-cell">
          <span class="rating-badge">${rating.avgRating.toFixed(1)}</span>
        </td>
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
    const tableBody = document.getElementById('genre-ratings-tbody');
    const emptyState = document.getElementById('genre-ratings-empty');

    tableBody.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    ratings.forEach((rating, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="rank-cell">${index + 1}</td>
        <td class="title-cell">${rating.genre}</td>
        <td class="count-cell">${rating.count}</td>
        <td class="rating-cell">
          <span class="rating-badge">${rating.avgRating.toFixed(1)}</span>
        </td>
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
    Веселое: '#ffd54f',
  };
  return vibeColors[vibe] || '#e0e0e0';
}

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadGenres();
  fetchCurrentTrack();
});
