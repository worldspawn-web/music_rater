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

/**
 * Extracts dominant colors from an image
 * @param {HTMLImageElement} img - Image element
 * @returns {Object} Object with primary, secondary, and tertiary colors
 */
function extractColorsFromImage(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 300;
  canvas.height = 300;

  ctx.drawImage(img, 0, 0, 300, 300);

  try {
    const imageData = ctx.getImageData(0, 0, 300, 300);
    const data = imageData.data;
    const colorMap = new Map();

    for (let i = 0; i < data.length; i += 4 * 2) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip transparent and very dark/light pixels
      if (
        a < 128 ||
        (r < 20 && g < 20 && b < 20) ||
        (r > 235 && g > 235 && b > 235)
      ) {
        continue;
      }

      const qr = Math.round(r / 12) * 12;
      const qg = Math.round(g / 12) * 12;
      const qb = Math.round(b / 12) * 12;
      const key = `${qr},${qg},${qb}`;

      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map((entry) => entry[0]);

    if (sortedColors.length === 0) {
      return {
        primary: 'rgb(255, 68, 68)',
        secondary: 'rgb(255, 107, 107)',
        tertiary: 'rgb(204, 51, 51)',
      };
    }

    const primary = `rgb(${sortedColors[0]})`;
    const secondary = sortedColors[3]
      ? `rgb(${sortedColors[3]})`
      : sortedColors[1]
      ? `rgb(${sortedColors[1]})`
      : primary;
    const tertiary = sortedColors[6]
      ? `rgb(${sortedColors[6]})`
      : sortedColors[2]
      ? `rgb(${sortedColors[2]})`
      : primary;

    console.log('[v0] Extracted colors:', { primary, secondary, tertiary });

    return { primary, secondary, tertiary };
  } catch (error) {
    console.warn('Could not extract colors from image:', error);
    return {
      primary: 'rgb(255, 68, 68)',
      secondary: 'rgb(255, 107, 107)',
      tertiary: 'rgb(204, 51, 51)',
    };
  }
}

/**
 * Updates the dynamic background with colors from album cover
 * @param {HTMLImageElement} img - Album cover image
 */
function updateDynamicBackground(img) {
  const background = document.getElementById('dynamic-background');
  const colors = extractColorsFromImage(img);

  // Update CSS variables
  document.documentElement.style.setProperty(
    '--dynamic-color-primary',
    colors.primary
  );
  document.documentElement.style.setProperty(
    '--dynamic-color-secondary',
    colors.secondary
  );
  document.documentElement.style.setProperty(
    '--dynamic-color-tertiary',
    colors.tertiary
  );

  // Activate background with fade-in
  background.classList.add('active');
}

// Функция для получения текущего трека
let currentTrackInfo = null;
let currentRating = null;

async function fetchCurrentTrack() {
  try {
    const trackInfo = await ipcRenderer.invoke('getCurrentTrack');
    document.getElementById('track-title').textContent = trackInfo.title;

    const artistElement = document.getElementById('track-artist');
    const artistRatings = await ipcRenderer.invoke('getArtistRatings');
    const artistRating = artistRatings.find(
      (r) => r.artist === trackInfo.artist
    );

    if (artistRating) {
      const ratingColor = getRatingColor(artistRating.avgRating);
      artistElement.innerHTML = `${
        trackInfo.artist
      } <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(
        1
      )}</span>`;
    } else {
      artistElement.textContent = trackInfo.artist;
    }

    document.getElementById('track-album').textContent = trackInfo.album;

    const albumCover = document.getElementById('album-cover');
    const noCover = document.getElementById('no-cover');
    const background = document.getElementById('dynamic-background');

    if (trackInfo.coverPath) {
      albumCover.src = '../' + trackInfo.coverPath;
      albumCover.style.display = 'block';
      noCover.style.display = 'none';

      albumCover.onload = () => {
        updateDynamicBackground(albumCover);
      };
    } else {
      albumCover.style.display = 'none';
      noCover.style.display = 'flex';
      background.classList.remove('active');
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
    button.classList.remove('rated'); // Ensure rated class is removed on reset
  });
}

// Блокировка кнопок рейтинга
function blockRatingButtons(rating) {
  document.querySelectorAll('.rating-button').forEach((button) => {
    const buttonRating = Number.parseInt(button.getAttribute('data-rating'));
    if (buttonRating === rating) {
      button.classList.add('rated');
    } else {
      button.disabled = true;
    }
  });
}

// Обработчик для кнопок рейтинга
document.querySelectorAll('.rating-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const rating = Number.parseInt(button.getAttribute('data-rating'));
    const trackTitle = document.getElementById('track-title').textContent;
    const trackArtistElement = document.getElementById('track-artist');
    const trackArtist =
      trackArtistElement.textContent.split(' ').slice(0, -1).join(' ').trim() ||
      trackArtistElement.textContent;
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

        const artistRatings = await ipcRenderer.invoke('getArtistRatings');
        const artistRating = artistRatings.find(
          (r) => r.artist === trackArtist
        );
        if (artistRating) {
          const oldRatingElement =
            trackArtistElement.querySelector('.artist-rating');
          const oldRating = oldRatingElement
            ? Number.parseFloat(oldRatingElement.textContent)
            : 0;

          if (oldRating > 0 && oldRating !== artistRating.avgRating) {
            animateRatingChange(
              trackArtistElement,
              oldRating,
              artistRating.avgRating
            );
          } else {
            const ratingColor = getRatingColor(artistRating.avgRating);
            trackArtistElement.innerHTML = `${trackArtist} <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(
              1
            )}</span>`;
          }
        }
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

  // Extract RGB values from color for glassmorphism effect
  const color = button.style.getPropertyValue('--vibe-color');
  if (color) {
    const rgb = color.match(/\d+/g);
    if (rgb && rgb.length === 3) {
      button.style.setProperty('--vibe-color-rgb', rgb.join(', '));
    }
  }
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

  // Extract RGB values for glassmorphism
  const rgb = color.match(/\d+/g);
  if (rgb && rgb.length === 3) {
    newVibeButton.style.setProperty('--vibe-color-rgb', rgb.join(', '));
  }

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

// Функция для получения цвета рейтинга на основе значения
/**
 * Gets color for rating based on value
 * @param {number} rating - Rating value
 * @returns {string} CSS color value
 */
function getRatingColor(rating) {
  if (rating < 5.5) {
    // Red for poor ratings
    return '#ef4444';
  } else if (rating >= 5.5 && rating <= 7.0) {
    // Gray for average ratings
    return '#9ca3af';
  } else {
    // Green for good ratings
    return '#10b981';
  }
}

// Функция для анимации изменения рейтинга с отображением дельты
/**
 * Animates rating change with delta display
 * @param {HTMLElement} element - Element to animate
 * @param {number} oldRating - Previous rating
 * @param {number} newRating - New rating
 */
function animateRatingChange(element, oldRating, newRating) {
  const delta = newRating - oldRating;
  const ratingSpan = element.querySelector('.artist-rating');

  if (!ratingSpan) return;

  const deltaElement = document.createElement('span');
  deltaElement.className = 'rating-delta';
  deltaElement.textContent =
    delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
  deltaElement.style.color = delta > 0 ? '#10b981' : '#ef4444';

  ratingSpan.appendChild(deltaElement);

  // Animate delta
  setTimeout(() => {
    deltaElement.style.opacity = '0';
    deltaElement.style.transform = 'translateY(-10px)';
  }, 100);

  // Remove delta and update rating
  setTimeout(() => {
    deltaElement.remove();
    animateNumber(element, oldRating, newRating);
  }, 1000);
}

/**
 * Animates number change with smooth transition
 * @param {HTMLElement} element - Element containing the number
 * @param {number} start - Start value
 * @param {number} end - End value
 */
function animateNumber(element, start, end) {
  const duration = 800;
  const startTime = performance.now();
  const startColor = getRatingColor(start);
  const endColor = getRatingColor(end);

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function (ease-out)
    const eased = 1 - Math.pow(1 - progress, 3);

    const current = start + (end - start) * eased;
    const ratingSpan = element.querySelector('.artist-rating');
    if (ratingSpan) {
      ratingSpan.textContent = current.toFixed(1);

      // Interpolate color if rating crosses thresholds
      if (startColor !== endColor) {
        ratingSpan.style.color = progress < 0.5 ? startColor : endColor;
      }
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadGenres();
  fetchCurrentTrack();
});
