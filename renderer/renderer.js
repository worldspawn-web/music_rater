const { ipcRenderer } = require('electron');
// Make ipcRenderer available globally for flag-utils.js
if (typeof window !== 'undefined') {
  window.ipcRenderer = ipcRenderer;
}

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
    } else if (button.getAttribute('data-tab') === 'album-ratings') {
      loadAlbumRatings();
    } else if (button.getAttribute('data-tab') === 'vibe-ratings') {
      loadVibeRatings();
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

    console.log('Extracted colors:', { primary, secondary, tertiary });

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
let previousTrackKey = null;

/**
 * Приводит строковое значение трека к нормальной форме
 * и определяет, является ли оно валидным
 * @param {string} value
 * @returns {string|null}
 */
function normalizeTrackField(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null') return null;
  if (trimmed === '—') return null;
  return trimmed;
}

/**
 * Parses artist string into individual artist names
 * Matches the logic from main.js
 * @param {string} artistString - Artist string that may contain multiple artists
 * @returns {Array<string>} Array of individual artist names
 */
// Flag utilities are imported from flag-utils.js (loaded via script tag)
// Access them via window.FlagUtils to avoid conflicts
const FlagUtils = window.FlagUtils || {
  getFlagEmoji: (code) => {
    if (!code) return '';
    const codePoints = code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  },
  getCountryName: (code) => code || '',
  searchCountries: () => [],
  getUsedFlagCountries: async () => [],
  ALL_COUNTRIES: [],
  CUSTOM_FLAGS: {}
};

// Create local references to avoid typing FlagUtils. everywhere
const getFlagEmoji = FlagUtils && typeof FlagUtils.getFlagEmoji === 'function' 
  ? FlagUtils.getFlagEmoji.bind(FlagUtils) 
  : (code) => {
      if (!code) return '';
      const codePoints = code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
    };
const getCountryName = FlagUtils && typeof FlagUtils.getCountryName === 'function'
  ? FlagUtils.getCountryName.bind(FlagUtils)
  : (code) => code || '';
const searchCountries = FlagUtils && typeof FlagUtils.searchCountries === 'function'
  ? FlagUtils.searchCountries.bind(FlagUtils)
  : () => [];
const getUsedFlagCountries = FlagUtils && typeof FlagUtils.getUsedFlagCountries === 'function'
  ? FlagUtils.getUsedFlagCountries.bind(FlagUtils)
  : async () => [];
const ALL_COUNTRIES = (FlagUtils && FlagUtils.ALL_COUNTRIES) || [];
const CUSTOM_FLAGS = (FlagUtils && FlagUtils.CUSTOM_FLAGS) || {};

function parseArtists(artistString) {
  if (!artistString || typeof artistString !== 'string') {
    return [];
  }

  const separators = [
    /\s+feat\.\s+/gi,
    /\s+ft\.\s+/gi,
    /\s+featuring\s+/gi,
    /\s+&\s+/g,
    /\s+x\s+/g,
    /\s+\/\s+/g,
    /,\s+/g,
  ];

  let artists = [artistString.trim()];

  for (const separator of separators) {
    const newArtists = [];
    let foundSeparator = false;

    for (const artist of artists) {
      const parts = artist.split(separator);
      if (parts.length > 1) {
        foundSeparator = true;
        newArtists.push(...parts.map(p => p.trim()).filter(p => p.length > 0));
      } else {
        newArtists.push(artist);
      }
    }

    if (foundSeparator) {
      artists = newArtists;
      break;
    }
  }

  return artists
    .map(artist => artist.trim())
    .filter(artist => artist.length > 0);
}

/**
 * Updates the multi-artist display with ratings and dropdown
 * @param {HTMLElement} artistElement - The artist element to update
 * @param {Array<string>} artists - Array of artist names
 * @param {Array} artistRatingData - Array of rating objects for each artist
 */
async function updateMultiArtistDisplay(artistElement, artists, artistRatingData) {
  const avgRating =
    artistRatingData.reduce((sum, r) => sum + r.avgRating, 0) /
    artistRatingData.length;
  const ratingColor = getRatingColor(avgRating);

  // Create or get expand button
  let expandBtn = artistElement.querySelector('.artist-expand-btn');
  if (!expandBtn) {
    expandBtn = document.createElement('button');
    expandBtn.className = 'artist-expand-btn';
    expandBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('visible');
        expandBtn.classList.toggle('expanded');
      }
    });
  }

  // Create or get dropdown
  let dropdown = artistElement.querySelector('.artist-ratings-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'artist-ratings-dropdown';
  }

  // Update dropdown content with flags
  dropdown.innerHTML = await Promise.all(
    artistRatingData.map(async (rating) => {
      const color = getRatingColor(rating.avgRating);
      const artistFlag = await ipcRenderer.invoke('getArtistFlag', rating.artist);
      const flagEmoji = artistFlag ? getFlagEmoji(artistFlag) : '';
      return `<div class="artist-rating-item">
        ${flagEmoji ? `<span class="artist-flag-small">${flagEmoji}</span>` : ''}
        <span class="artist-rating-name">${rating.artist}</span>
        <span class="artist-rating-value" style="color: ${color};">${rating.avgRating.toFixed(1)}</span>
      </div>`;
    })
  ).then(html => html.join(''));

  // Update main display
  artistElement.innerHTML = `
    <span class="artist-names">${artists.join(', ')}</span>
    <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${avgRating.toFixed(
    1
  )}</span>
  `;
  artistElement.appendChild(expandBtn);
  artistElement.appendChild(dropdown);
}

/**
 * Показывает состояние, когда сейчас ничего не играет
 */
function showNoTrackPlaying() {
  previousTrackKey = null;
  currentTrackInfo = null;
  currentRating = null;

  const titleEl = document.getElementById('track-title');
  const artistEl = document.getElementById('track-artist');
  const albumEl = document.getElementById('track-album');
  const albumCover = document.getElementById('album-cover');
  const noCover = document.getElementById('no-cover');
  const background = document.getElementById('dynamic-background');

  if (titleEl) {
    titleEl.textContent = 'Сейчас ничего не играет';
  }
  if (artistEl) {
    artistEl.textContent = '';
  }
  if (albumEl) {
    albumEl.textContent = '';
  }

  if (albumCover && noCover && background) {
    albumCover.style.display = 'none';
    noCover.style.display = 'flex';
    background.classList.remove('active');
  }

  // Сбрасываем состояние рейтинга и выбранных значений
  resetRatingButtons();
}

async function fetchCurrentTrack() {
  try {
    const trackInfo = await ipcRenderer.invoke('getCurrentTrack');

    // Обработка случая, когда ничего не играет или данные некорректны
    const normalizedTitle = normalizeTrackField(trackInfo?.title);
    const normalizedArtist = normalizeTrackField(trackInfo?.artist);
    const normalizedAlbum = normalizeTrackField(trackInfo?.album);

    if (!normalizedTitle || !normalizedArtist) {
      showNoTrackPlaying();
      return;
    }

    const safeTrackInfo = {
      ...trackInfo,
      title: normalizedTitle,
      artist: normalizedArtist,
      album: normalizedAlbum || '',
    };

    const trackKey = `${safeTrackInfo.title}|||${safeTrackInfo.artist}`;

    if (previousTrackKey === trackKey) {
      // Трек не изменился, пропускаем обновление
      return;
    }

    // Трек сменился
    if (previousTrackKey !== null) {
      console.log(
        `Трек сменился: ${safeTrackInfo.artist} - ${safeTrackInfo.title}`
      );
    }

    previousTrackKey = trackKey;

    document.getElementById('track-title').textContent = safeTrackInfo.title;

    const artistElement = document.getElementById('track-artist');
    const artistRatings = await ipcRenderer.invoke('getArtistRatings');
    
    // Parse individual artists
    const artists = parseArtists(safeTrackInfo.artist);
    
    if (artists.length === 1) {
      // Single artist - show rating directly
      const artistRating = artistRatings.find(
        (r) => r.artist === artists[0]
      );
      
      // Get artist flag
      const artistFlag = await ipcRenderer.invoke('getArtistFlag', artists[0]);
      let flagEmoji = '';
      if (artistFlag && typeof getFlagEmoji === 'function') {
        try {
          flagEmoji = getFlagEmoji(artistFlag);
        } catch (e) {
          console.error('Error calling getFlagEmoji:', e);
        }
      }
      
      // Debug logging
      if (artistFlag) {
        console.log('Artist flag found:', { 
          artist: artists[0], 
          flag: artistFlag, 
          emoji: flagEmoji,
          emojiLength: flagEmoji.length,
          FlagUtilsAvailable: !!window.FlagUtils,
          getFlagEmojiType: typeof getFlagEmoji
        });
      }

      if (artistRating) {
        const ratingColor = getRatingColor(artistRating.avgRating);
        artistElement.innerHTML = `
          ${flagEmoji ? `<span class="artist-flag">${flagEmoji}</span>` : ''}
          <span class="artist-name">${artists[0]}</span>
          <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(1)}</span>
          <button class="artist-flag-btn" title="Изменить флаг исполнителя">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </button>
        `;
      } else {
        artistElement.innerHTML = `
          ${flagEmoji ? `<span class="artist-flag">${flagEmoji}</span>` : ''}
          <span class="artist-name">${artists[0]}</span>
          <button class="artist-flag-btn" title="Добавить флаг исполнителя">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </button>
        `;
      }
      
      // Add click handler for flag button
      const flagBtn = artistElement.querySelector('.artist-flag-btn');
      if (flagBtn) {
        flagBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showFlagSelector(artists[0], artistElement);
        });
      }
      
      // Remove any existing multi-artist UI
      const expandBtn = artistElement.querySelector('.artist-expand-btn');
      const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
      if (expandBtn) expandBtn.remove();
      if (dropdown) dropdown.remove();
    } else {
      // Multiple artists - show average rating with expand button
      const artistRatingData = artists.map(artistName => {
        return artistRatings.find(r => r.artist === artistName);
      }).filter(r => r !== undefined);
      
      if (artistRatingData.length > 0) {
        // Calculate average rating
        const avgRating = artistRatingData.reduce((sum, r) => sum + r.avgRating, 0) / artistRatingData.length;
        const ratingColor = getRatingColor(avgRating);
        
        // Create expand button if it doesn't exist
        let expandBtn = artistElement.querySelector('.artist-expand-btn');
        if (!expandBtn) {
          expandBtn = document.createElement('button');
          expandBtn.className = 'artist-expand-btn';
          expandBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
            if (dropdown) {
              dropdown.classList.toggle('visible');
              expandBtn.classList.toggle('expanded');
            }
          });
        }
        
        // Create dropdown if it doesn't exist
        let dropdown = artistElement.querySelector('.artist-ratings-dropdown');
        if (!dropdown) {
          dropdown = document.createElement('div');
          dropdown.className = 'artist-ratings-dropdown';
        }
        
        // Update dropdown content with flags
        dropdown.innerHTML = await Promise.all(
          artistRatingData.map(async (rating) => {
            const color = getRatingColor(rating.avgRating);
            const artistFlag = await ipcRenderer.invoke('getArtistFlag', rating.artist);
            const flagEmoji = artistFlag ? getFlagEmoji(artistFlag) : '';
            return `<div class="artist-rating-item">
              ${flagEmoji ? `<span class="artist-flag-small">${flagEmoji}</span>` : ''}
              <span class="artist-rating-name">${rating.artist}</span>
              <span class="artist-rating-value" style="color: ${color};">${rating.avgRating.toFixed(1)}</span>
            </div>`;
          })
        ).then(html => html.join(''));
        
        // Update main display
        artistElement.innerHTML = `
          <span class="artist-names">${artists.join(', ')}</span>
          <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${avgRating.toFixed(1)}</span>
        `;
        artistElement.appendChild(expandBtn);
        artistElement.appendChild(dropdown);
      } else {
        // No ratings yet, just show artist names
        artistElement.innerHTML = `<span class="artist-names">${artists.join(', ')}</span>`;
        const expandBtn = artistElement.querySelector('.artist-expand-btn');
        const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
        if (expandBtn) expandBtn.remove();
        if (dropdown) dropdown.remove();
      }
    }

    document.getElementById('track-album').textContent =
      safeTrackInfo.album || '';

    const albumCover = document.getElementById('album-cover');
    const noCover = document.getElementById('no-cover');
    const background = document.getElementById('dynamic-background');

    if (safeTrackInfo.coverPath) {
      albumCover.src = '../' + safeTrackInfo.coverPath;
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
      (currentTrackInfo.title !== safeTrackInfo.title ||
        currentTrackInfo.artist !== safeTrackInfo.artist)
    ) {
      resetRatingButtons();
      currentRating = null;
    }

    currentTrackInfo = safeTrackInfo;

    // Проверяем, был ли уже поставлен рейтинг для этого трека
    const lastRating = await ipcRenderer.invoke('getLastRating', safeTrackInfo);
    if (lastRating) {
      currentRating = lastRating.rating;
      blockRatingButtons(lastRating.rating);
      
      // Auto-select and disable mood if track was previously rated
      if (lastRating.vibes && lastRating.vibes.length > 0) {
        const mood = lastRating.vibes[0];
        const moodButton = document.querySelector(
          `.vibe-chip[data-vibe="${mood}"]`
        );
        if (moodButton) {
          // Remove active from all vibes
          document
            .querySelectorAll('.vibe-chip:not(.add-vibe)')
            .forEach((btn) => {
              btn.classList.remove('active');
              btn.disabled = false;
            });
          // Set active and disable
          moodButton.classList.add('active');
          moodButton.disabled = true;
          // Disable all other vibe buttons
          document
            .querySelectorAll('.vibe-chip:not(.add-vibe)')
            .forEach((btn) => {
              if (btn !== moodButton) {
                btn.disabled = true;
              }
            });
        }
      }
    } else {
      resetRatingButtons();
      // Reset vibe buttons
      document
        .querySelectorAll('.vibe-chip:not(.add-vibe)')
        .forEach((btn) => {
          btn.classList.remove('active');
          btn.disabled = false;
        });
    }
  } catch (error) {
    console.error('Ошибка получения текущего трека:', error);
    showNoTrackPlaying();
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
    const trackArtist = currentTrackInfo.artist;
    const trackAlbum = document.getElementById('track-album').textContent;
    const genre = document.getElementById('genre-select').value;
    
    // Check if track was previously rated - if so, use existing vibe, don't allow new selection
    const lastRating = await ipcRenderer.invoke('getLastRating', {
      title: trackTitle,
      artist: trackArtist,
    });
    
    let vibe = null;
    if (lastRating && lastRating.vibes && lastRating.vibes.length > 0) {
      // Use existing vibe from previous rating
      vibe = lastRating.vibes[0];
    } else {
      // Allow new vibe selection
      const vibeButton = document.querySelector('.vibe-chip.active');
      vibe = vibeButton ? vibeButton.getAttribute('data-vibe') : null;
    }

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
        loadGenreDropdown(); // Call loadGenreDropdown to update genre list
        document.getElementById('genre-select').value = genre;

        // Get old ratings before updating
        const artistElement = document.getElementById('track-artist');
        const oldRatingSpan = artistElement.querySelector('.artist-rating');
        const oldRating = oldRatingSpan
          ? Number.parseFloat(oldRatingSpan.textContent)
          : null;

        // Get new artist ratings
        const artistRatings = await ipcRenderer.invoke('getArtistRatings');
        const artists = parseArtists(trackArtist);

        if (artists.length === 1) {
          // Single artist - animate rating change
          const artistRating = artistRatings.find((r) => r.artist === artists[0]);
          
          // Get artist flag
          const artistFlag = await ipcRenderer.invoke('getArtistFlag', artists[0]);
          let flagEmoji = '';
          if (artistFlag && typeof getFlagEmoji === 'function') {
            try {
              flagEmoji = getFlagEmoji(artistFlag);
            } catch (e) {
              console.error('Error calling getFlagEmoji:', e);
            }
          }
          
          if (artistRating) {
            const ratingColor = getRatingColor(artistRating.avgRating);
            const flagHtml = flagEmoji ? `<span class="artist-flag">${flagEmoji}</span>` : '';
            
            if (oldRating !== null && oldRating !== artistRating.avgRating) {
              // Update content with flag first
              artistElement.innerHTML = `
                ${flagHtml}
                <span class="artist-name">${artists[0]}</span>
                <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(1)}</span>
                <button class="artist-flag-btn" title="Изменить флаг исполнителя">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </button>
              `;
              
              // Re-attach flag button handler
              const flagBtn = artistElement.querySelector('.artist-flag-btn');
              if (flagBtn) {
                flagBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  showFlagSelector(artists[0], artistElement);
                });
              }
              
              // Then animate the change
              animateRatingChange(artistElement, oldRating, artistRating.avgRating);
            } else {
              // Just update without animation
              artistElement.innerHTML = `
                ${flagHtml}
                <span class="artist-name">${artists[0]}</span>
                <span class="artist-rating" style="color: ${ratingColor}; font-weight: 700; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(1)}</span>
                <button class="artist-flag-btn" title="Изменить флаг исполнителя">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </button>
              `;
              
              // Re-attach flag button handler
              const flagBtn = artistElement.querySelector('.artist-flag-btn');
              if (flagBtn) {
                flagBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  showFlagSelector(artists[0], artistElement);
                });
              }
            }
          } else {
            // No rating yet, show artist name with flag
            const flagHtml = flagEmoji ? `<span class="artist-flag">${flagEmoji}</span>` : '';
            artistElement.innerHTML = `
              ${flagHtml}
              <span class="artist-name">${artists[0]}</span>
              <button class="artist-flag-btn" title="Добавить флаг исполнителя">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </button>
            `;
            
            // Re-attach flag button handler
            const flagBtn = artistElement.querySelector('.artist-flag-btn');
            if (flagBtn) {
              flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showFlagSelector(artists[0], artistElement);
              });
            }
          }
        } else {
          // Multiple artists - calculate average and animate
          const artistRatingData = artists
            .map((artistName) => {
              return artistRatings.find((r) => r.artist === artistName);
            })
            .filter((r) => r !== undefined);

          if (artistRatingData.length > 0) {
            const newAvgRating =
              artistRatingData.reduce((sum, r) => sum + r.avgRating, 0) /
              artistRatingData.length;

            // First, set up the display structure
            await updateMultiArtistDisplay(artistElement, artists, artistRatingData);

            // Then animate if rating changed
            if (oldRating !== null && oldRating !== newAvgRating) {
              // Small delay to ensure DOM is updated
              setTimeout(() => {
                animateRatingChange(artistElement, oldRating, newAvgRating);
              }, 50);
            }
          } else {
            // No ratings yet, just show artist names
            artistElement.innerHTML = `<span class="artist-names">${artists.join(', ')}</span>`;
            const expandBtn = artistElement.querySelector('.artist-expand-btn');
            const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
            if (expandBtn) expandBtn.remove();
            if (dropdown) dropdown.remove();
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
    let rgbString = '';
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      rgbString = `${r}, ${g}, ${b}`;
    } else if (color.startsWith('rgb')) {
      const rgb = color.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        rgbString = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      }
    }
    if (rgbString) {
      button.style.setProperty('--vibe-color-rgb', rgbString);
    }
  }
});

// Обработчик для кнопки добавления вайба
document.getElementById('add-vibe-button').addEventListener('click', () => {
  const vibeInput = document.getElementById('vibe-input');
  vibeInput.classList.toggle('hidden');
});

// Обработчик для кнопки сохранения нового вайба
document.getElementById('save-vibe-button').addEventListener('click', async () => {
  const newVibeName = document.getElementById('new-vibe-name').value.trim();
  const newVibeColor = document.getElementById('new-vibe-color').value;

  if (newVibeName) {
    await addVibe(newVibeName, newVibeColor);
    document.getElementById('new-vibe-name').value = '';
    document.getElementById('vibe-input').classList.add('hidden');
  }
});

// Функция для добавления нового вайба
async function addVibe(name, color) {
  // Store custom vibe in vibes.json
  try {
    const result = await ipcRenderer.invoke('saveVibe', { name, color });
    if (result.success) {
      // Clear cache to force reload
      vibeColorsCache = null;
      // Reload vibe buttons to include the new one, passing the newly added vibe name
      await loadVibeButtons(name);
    } else {
      alert(result.message || 'Ошибка при сохранении настроения');
    }
  } catch (e) {
    console.error('Error saving custom vibe:', e);
    alert('Ошибка при сохранении настроения');
  }
}

// Загрузка рейтингов треков
async function loadTrackRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getTrackRatings');
    const topThree = document.getElementById('track-top-three');
    const table = document.getElementById('track-ratings-table');
    const emptyState = document.getElementById('track-ratings-empty');

    topThree.innerHTML = '';
    table.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      topThree.style.display = 'none';
      table.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    topThree.style.display = 'flex';
    table.style.display = 'block';

    const limitedRatings = ratings.slice(0, 100);
    const top3 = limitedRatings.slice(0, 3);
    const rest = limitedRatings.slice(3);

    for (let i = 0; i < top3.length; i++) {
      const card = await createTopThreeCard(top3[i], i + 1, 'track');
      topThree.appendChild(card);
    }

    // Create table for rest
    if (rest.length > 0) {
      table.appendChild(createRatingsTable(rest, 4, 'track'));
    }
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов треков:', error);
  }
}

// Загрузка рейтингов исполнителей
async function loadArtistRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getArtistRatings');
    const allFlags = await ipcRenderer.invoke('getAllArtistFlags');
    const topThree = document.getElementById('artist-top-three');
    const table = document.getElementById('artist-ratings-table');
    const emptyState = document.getElementById('artist-ratings-empty');

    topThree.innerHTML = '';
    table.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      topThree.style.display = 'none';
      table.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    topThree.style.display = 'flex';
    table.style.display = 'block';

    const limitedRatings = ratings.slice(0, 100);
    const top3 = limitedRatings.slice(0, 3);
    const rest = limitedRatings.slice(3);

    for (let i = 0; i < top3.length; i++) {
      const card = await createTopThreeCard(top3[i], i + 1, 'artist', allFlags);
      topThree.appendChild(card);
    }

    // Create table for rest
    if (rest.length > 0) {
      table.appendChild(createRatingsTable(rest, 4, 'artist', allFlags));
    }
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов исполнителей:', error);
  }
}

// Загрузка рейтингов жанров
async function loadGenreRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getGenreRatings');
    const topThree = document.getElementById('genre-top-three');
    const table = document.getElementById('genre-ratings-table');
    const emptyState = document.getElementById('genre-ratings-empty');

    topThree.innerHTML = '';
    table.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      topThree.style.display = 'none';
      table.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    topThree.style.display = 'flex';
    table.style.display = 'block';

    const limitedRatings = ratings.slice(0, 100);
    const top3 = limitedRatings.slice(0, 3);
    const rest = limitedRatings.slice(3);

    for (let i = 0; i < top3.length; i++) {
      const card = await createTopThreeCard(top3[i], i + 1, 'genre');
      topThree.appendChild(card);
    }

    // Create table for rest
    if (rest.length > 0) {
      table.appendChild(createRatingsTable(rest, 4, 'genre'));
    }
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов жанров:', error);
  }
}

// Загрузка рейтингов альбомов
async function loadAlbumRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getAlbumRatings');
    const topThree = document.getElementById('album-top-three');
    const table = document.getElementById('album-ratings-table');
    const emptyState = document.getElementById('album-ratings-empty');

    topThree.innerHTML = '';
    table.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      topThree.style.display = 'none';
      table.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    topThree.style.display = 'flex';
    table.style.display = 'block';

    // Show only top 25 albums
    const limitedRatings = ratings.slice(0, 25);
    const top3 = limitedRatings.slice(0, 3);
    const rest = limitedRatings.slice(3);

    for (let i = 0; i < top3.length; i++) {
      const card = await createTopThreeCard(top3[i], i + 1, 'album');
      topThree.appendChild(card);
    }

    if (rest.length > 0) {
      table.appendChild(createRatingsTable(rest, 4, 'album'));
    }
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов альбомов:', error);
  }
}

// Загрузка рейтингов настроений
async function loadVibeRatings() {
  try {
    const ratings = await ipcRenderer.invoke('getVibeRatings');
    const topThree = document.getElementById('vibe-top-three');
    const table = document.getElementById('vibe-ratings-table');
    const emptyState = document.getElementById('vibe-ratings-empty');

    topThree.innerHTML = '';
    table.innerHTML = '';

    if (ratings.length === 0) {
      emptyState.classList.remove('hidden');
      topThree.style.display = 'none';
      table.style.display = 'none';
      return;
    }

    emptyState.classList.add('hidden');
    topThree.style.display = 'flex';
    table.style.display = 'block';

    const limitedRatings = ratings.slice(0, 100);
    const top3 = limitedRatings.slice(0, 3);
    const rest = limitedRatings.slice(3);

    for (let i = 0; i < top3.length; i++) {
      const card = await createTopThreeCard(top3[i], i + 1, 'vibe');
      topThree.appendChild(card);
    }

    // Create table for rest
    if (rest.length > 0) {
      table.appendChild(createRatingsTable(rest, 4, 'vibe'));
    }
  } catch (error) {
    console.error('Ошибка при загрузке рейтингов настроений:', error);
  }
}

/**
 * Creates a top 3 card with special effects and album cover
 * @param {Object} item - Rating item
 * @param {number} rank - Rank (1, 2, or 3)
 * @param {string} type - Type (track, artist, genre)
 * @returns {HTMLElement} Top three card element
 */
async function createTopThreeCard(item, rank, type, allFlags = {}) {
  const card = document.createElement('div');
  card.className = `top-three-card top-three-rank-${rank}`;

  const effects = {
    1: { emoji: '🔥', effect: 'fire', color: '#FFD700' },
    2: { emoji: '❄️', effect: 'ice', color: '#C0C0C0' },
    3: { emoji: '⚡', effect: 'lightning', color: '#CD7F32' },
  };

  const { emoji, effect, color } = effects[rank];

  let content = '';

  if (type === 'track') {
    const artistRatings = await ipcRenderer.invoke('getArtistRatings');
    const genreRatings = await ipcRenderer.invoke('getGenreRatings');

    const artistRating = artistRatings.find((r) => r.artist === item.artist);
    const artistRank =
      artistRatings.findIndex((r) => r.artist === item.artist) + 1;

    // Find genre rating and calculate rank
    // Note: genreRatings is already sorted by weighted rating from backend
    const genreRating = item.genre
      ? genreRatings.find((r) => r.genre === item.genre)
      : null;

    // Calculate rank - genreRatings array is already sorted by weighted rating
    // so findIndex gives us the correct position
    const genreRank =
      item.genre && genreRating
        ? genreRatings.findIndex((r) => r.genre === item.genre) + 1
        : null;

    const coverPath = item.coverPath
      ? `../${item.coverPath}?t=${Date.now()}`
      : '../covers/placeholder.png';

    content = `
      <div class="top-three-effect ${effect}"></div>
      <div class="top-three-rank">${emoji}</div>
      <div class="top-three-cover">
        <img src="${coverPath}" alt="${
      item.title
    }" onerror="this.style.display='none'" />
      </div>
      <div class="top-three-content">
        <div class="top-three-position">#${rank}</div>
        <h3 class="top-three-title">${item.title}</h3>
        <p class="top-three-subtitle">
          ${item.artist}
          ${
            artistRating
              ? `<span class="artist-rating" style="color: ${getRatingColor(
                  artistRating.avgRating
                )}; font-weight: 600; margin-left: 0.5rem;">${artistRating.avgRating.toFixed(
                  1
                )}</span> <span class="artist-ranking" style="color: var(--color-text-tertiary); font-size: 0.75rem;">(#${artistRank})</span>`
              : ''
          }
        </p>
        ${
          item.genre
            ? `<span class="top-three-genre">${item.genre}${
                genreRating
                  ? ` <span class="genre-rating" style="color: ${getRatingColor(
                      genreRating.avgRating
                    )}; font-weight: 600;">${genreRating.avgRating.toFixed(
                      1
                    )}</span> <span class="genre-ranking" style="color: var(--color-text-tertiary); font-size: 0.75rem;">(#${genreRank})</span>`
                  : ''
              }</span>`
            : ''
        }
        ${
          item.mood && vibeColorsCache && vibeColorsCache[item.mood]
            ? (() => {
                const vibeColor = getVibeColor(item.mood);
                let rgbString = '59, 130, 246';
                if (vibeColor.startsWith('#')) {
                  const hex = vibeColor.replace('#', '');
                  const r = parseInt(hex.substring(0, 2), 16);
                  const g = parseInt(hex.substring(2, 4), 16);
                  const b = parseInt(hex.substring(4, 6), 16);
                  rgbString = `${r}, ${g}, ${b}`;
                }
                return `<span class="top-three-mood"><span class="vibe-badge" style="--vibe-color: ${vibeColor}; --vibe-color-rgb: ${rgbString}">${item.mood}</span></span>`;
              })()
            : ''
        }
      </div>
      <div class="top-three-stats">
        <div class="top-three-rating" style="color: ${getRatingColor(
          item.avgRating
        )}">
          ${item.avgRating.toFixed(1)}
        </div>
        <div class="top-three-count">${item.count} ${
      item.count === 1 ? 'оценка' : 'оценок'
    }</div>
      </div>
    `;
  } else if (type === 'album') {
    const coverPath = item.coverPath
      ? `../${item.coverPath}?t=${Date.now()}`
      : '../covers/placeholder.png';

    content = `
      <div class="top-three-effect ${effect}"></div>
      <div class="top-three-rank">${emoji}</div>
      <div class="top-three-cover">
        <img src="${coverPath}" alt="${
      item.album
    }" onerror="this.style.display='none'" />
      </div>
      <div class="top-three-content">
        <div class="top-three-position">#${rank}</div>
        <h3 class="top-three-title">${item.album}</h3>
        <p class="top-three-subtitle">${item.artist}</p>
      </div>
      <div class="top-three-stats">
        <div class="top-three-rating" style="color: ${getRatingColor(
          item.avgRating
        )}">
          ${item.avgRating.toFixed(1)}
        </div>
        <div class="top-three-count">${item.count} ${
      item.count === 1 ? 'трек' : item.count < 5 ? 'трека' : 'треков'
    }</div>
      </div>
    `;
  } else if (type === 'artist') {
    const artistFlag = allFlags[item.artist];
    const flagEmoji = artistFlag ? getFlagEmoji(artistFlag) : '';
    const flagButton = flagEmoji 
      ? `<button class="artist-flag-clickable" data-artist="${item.artist}" title="Изменить флаг">${flagEmoji}</button>`
      : `<button class="artist-flag-btn" data-artist="${item.artist}" title="Добавить флаг исполнителя">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </button>`;
    content = `
      <div class="top-three-effect ${effect}"></div>
      <div class="top-three-rank">${emoji}</div>
      <div class="top-three-content">
        <div class="top-three-position">#${rank}</div>
        <h3 class="top-three-title">
          ${flagButton}
          ${item.artist}
        </h3>
        <p class="top-three-subtitle">${item.count} ${
      item.count === 1 ? 'трек' : item.count < 5 ? 'трека' : 'треков'
    }</p>
      </div>
      <div class="top-three-stats">
        <div class="top-three-rating" style="color: ${getRatingColor(
          item.avgRating
        )}">
          ${item.avgRating.toFixed(1)}
        </div>
      </div>
    `;
  } else if (type === 'genre') {
    content = `
      <div class="top-three-effect ${effect}"></div>
      <div class="top-three-rank">${emoji}</div>
      <div class="top-three-content">
        <div class="top-three-position">#${rank}</div>
        <h3 class="top-three-title">${item.genre}</h3>
        <p class="top-three-subtitle">${item.count} ${
      item.count === 1 ? 'трек' : item.count < 5 ? 'трека' : 'треков'
    }</p>
      </div>
      <div class="top-three-stats">
        <div class="top-three-rating" style="color: ${getRatingColor(
          item.avgRating
        )}">
          ${item.avgRating.toFixed(1)}
        </div>
      </div>
    `;
  } else if (type === 'vibe') {
    content = `
      <div class="top-three-effect ${effect}"></div>
      <div class="top-three-rank">${emoji}</div>
      <div class="top-three-content">
        <div class="top-three-position">#${rank}</div>
        <h3 class="top-three-title">${item.vibe}</h3>
        <p class="top-three-subtitle">${item.count} ${
      item.count === 1 ? 'трек' : item.count < 5 ? 'трека' : 'треков'
    }</p>
      </div>
      <div class="top-three-stats">
        <div class="top-three-rating" style="color: ${getRatingColor(
          item.avgRating
        )}">
          ${item.avgRating.toFixed(1)}
        </div>
      </div>
    `;
  }

  card.innerHTML = content;
  card.style.setProperty('--rank-color', color);

  // Add flag button click handlers for artists
  if (type === 'artist') {
    const flagBtn = card.querySelector('.artist-flag-btn, .artist-flag-clickable');
    if (flagBtn) {
      flagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const artistName = flagBtn.getAttribute('data-artist');
        showFlagSelector(artistName, flagBtn);
      });
    }
  }

  return card;
}

/**
 * Creates a table for ratings beyond top 3
 * @param {Array} items - Rating items
 * @param {number} startRank - Starting rank number
 * @param {string} type - Type (track, artist, genre)
 * @returns {HTMLElement} Table element
 */
function createRatingsTable(items, startRank, type, allFlags = {}) {
  const table = document.createElement('table');
  table.className = 'ratings-table';

  let headerHTML = '';
  if (type === 'track') {
    headerHTML = `
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="title-col">Трек</th>
          <th class="artist-col">Исполнитель</th>
          <th class="genre-col">Жанр</th>
          <th class="vibe-col">Настроение</th>
          <th class="rating-col">Рейтинг</th>
          <th class="weighted-rating-col" title="Взвешенный рейтинг (учитывает количество оценок)">Взвешенный</th>
          <th class="count-col">Оценок</th>
        </tr>
      </thead>
    `;
  } else if (type === 'artist') {
    headerHTML = `
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="artist-col">Исполнитель</th>
          <th class="rating-col">Рейтинг</th>
          <th class="weighted-rating-col" title="Взвешенный рейтинг (учитывает количество оценок)">Взвешенный</th>
          <th class="count-col">Треков</th>
        </tr>
      </thead>
    `;
  } else if (type === 'genre') {
    headerHTML = `
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="genre-col">Жанр</th>
          <th class="rating-col">Рейтинг</th>
          <th class="weighted-rating-col" title="Взвешенный рейтинг (учитывает количество оценок)">Взвешенный</th>
          <th class="count-col">Треков</th>
        </tr>
      </thead>
    `;
  } else if (type === 'album') {
    headerHTML = `
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="album-cover-col">Обложка</th>
          <th class="album-col">Альбом</th>
          <th class="artist-col">Исполнитель</th>
          <th class="rating-col">Рейтинг</th>
          <th class="weighted-rating-col" title="Взвешенный рейтинг (учитывает количество оценок)">Взвешенный</th>
          <th class="count-col">Треков</th>
        </tr>
      </thead>
    `;
  } else if (type === 'vibe') {
    headerHTML = `
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="vibe-col">Настроение</th>
          <th class="rating-col">Рейтинг</th>
          <th class="weighted-rating-col" title="Взвешенный рейтинг (учитывает количество оценок)">Взвешенный</th>
          <th class="count-col">Треков</th>
        </tr>
      </thead>
    `;
  }

  const tbody = document.createElement('tbody');
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    const rank = startRank + index;

    if (type === 'track') {
      let vibeBadge = '—';
      if (item.mood && item.mood.trim() !== '') {
        const vibeColor = getVibeColor(item.mood);
        // Convert hex color to RGB
        let rgbString = '59, 130, 246'; // Default blue
        if (vibeColor.startsWith('#')) {
          const hex = vibeColor.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          rgbString = `${r}, ${g}, ${b}`;
        } else if (vibeColor.startsWith('rgb')) {
          const rgb = vibeColor.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            rgbString = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
          }
        }
        vibeBadge = `<span class="vibe-badge" style="--vibe-color: ${vibeColor}; --vibe-color-rgb: ${rgbString}">${item.mood}</span>`;
      }
      row.innerHTML = `
        <td class="rank-col">${rank}</td>
        <td class="title-col">${item.title}</td>
        <td class="artist-col">${item.artist}</td>
        <td class="genre-col">${item.genre || '—'}</td>
        <td class="vibe-col">${vibeBadge}</td>
        <td class="rating-col" style="color: ${getRatingColor(item.avgRating)}">
          ${item.avgRating.toFixed(1)}
        </td>
        <td class="weighted-rating-col" style="color: ${getRatingColor(
          item.weightedRating || item.avgRating
        )}">
          ${
            item.weightedRating !== undefined
              ? item.weightedRating.toFixed(1)
              : '—'
          }
        </td>
        <td class="count-col">${item.count}</td>
      `;
    } else if (type === 'artist') {
      const artistFlag = allFlags[item.artist];
      const flagEmoji = artistFlag ? getFlagEmoji(artistFlag) : '';
      const flagButton = flagEmoji 
        ? `<button class="artist-flag-clickable-small" data-artist="${item.artist}" title="Изменить флаг">${flagEmoji}</button>`
        : `<button class="artist-flag-btn-small" data-artist="${item.artist}" title="Добавить флаг исполнителя">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </button>`;
      row.innerHTML = `
        <td class="rank-col">${rank}</td>
        <td class="artist-col">
          ${flagButton}
          ${item.artist}
        </td>
        <td class="rating-col" style="color: ${getRatingColor(item.avgRating)}">
          ${item.avgRating.toFixed(1)}
        </td>
        <td class="weighted-rating-col" style="color: ${getRatingColor(
          item.weightedRating || item.avgRating
        )}">
          ${
            item.weightedRating !== undefined
              ? item.weightedRating.toFixed(1)
              : '—'
          }
        </td>
        <td class="count-col">${item.count}</td>
      `;
    } else if (type === 'genre') {
      row.innerHTML = `
        <td class="rank-col">${rank}</td>
        <td class="genre-col">${item.genre}</td>
        <td class="rating-col" style="color: ${getRatingColor(item.avgRating)}">
          ${item.avgRating.toFixed(1)}
        </td>
        <td class="weighted-rating-col" style="color: ${getRatingColor(
          item.weightedRating || item.avgRating
        )}">
          ${
            item.weightedRating !== undefined
              ? item.weightedRating.toFixed(1)
              : '—'
          }
        </td>
        <td class="count-col">${item.count}</td>
      `;
    } else if (type === 'album') {
      const coverPath = item.coverPath
        ? `../${item.coverPath}?t=${Date.now()}`
        : '../covers/placeholder.png';
      row.innerHTML = `
        <td class="rank-col">${rank}</td>
        <td class="album-cover-col">
          <img src="${coverPath}" alt="${item.album}" class="album-cover-thumb" onerror="this.src='../covers/placeholder.png'" />
        </td>
        <td class="album-col">${item.album}</td>
        <td class="artist-col">${item.artist}</td>
        <td class="rating-col" style="color: ${getRatingColor(item.avgRating)}">
          ${item.avgRating.toFixed(1)}
        </td>
        <td class="weighted-rating-col" style="color: ${getRatingColor(
          item.weightedRating || item.avgRating
        )}">
          ${
            item.weightedRating !== undefined
              ? item.weightedRating.toFixed(1)
              : '—'
          }
        </td>
        <td class="count-col">${item.count}</td>
      `;
    } else if (type === 'vibe') {
      const vibeColor = getVibeColor(item.vibe);
      // Convert hex color to RGB
      let rgbString = '59, 130, 246'; // Default blue
      if (vibeColor.startsWith('#')) {
        const hex = vibeColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        rgbString = `${r}, ${g}, ${b}`;
      } else if (vibeColor.startsWith('rgb')) {
        const rgb = vibeColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          rgbString = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
        }
      }
      row.innerHTML = `
        <td class="rank-col">${rank}</td>
        <td class="vibe-col"><span class="vibe-badge" style="--vibe-color: ${vibeColor}; --vibe-color-rgb: ${rgbString}">${item.vibe}</span></td>
        <td class="rating-col" style="color: ${getRatingColor(item.avgRating)}">
          ${item.avgRating.toFixed(1)}
        </td>
        <td class="weighted-rating-col" style="color: ${getRatingColor(
          item.weightedRating || item.avgRating
        )}">
          ${
            item.weightedRating !== undefined
              ? item.weightedRating.toFixed(1)
              : '—'
          }
        </td>
        <td class="count-col">${item.count}</td>
      `;
    }

    tbody.appendChild(row);
  });

  table.innerHTML = headerHTML;
  table.appendChild(tbody);

  // Add flag button click handlers for artists in table
  if (type === 'artist') {
    tbody.querySelectorAll('.artist-flag-btn-small, .artist-flag-clickable-small').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const artistName = btn.getAttribute('data-artist');
        showFlagSelector(artistName, btn);
      });
    });
  }

  return table;
}

// Функция для получения цвета вайба
// Cache for vibe colors
let vibeColorsCache = null;

// Load vibe colors from JSON file
async function loadVibeColors() {
  if (vibeColorsCache) {
    return vibeColorsCache;
  }
  
  try {
    vibeColorsCache = await ipcRenderer.invoke('getVibes');
    return vibeColorsCache;
  } catch (e) {
    console.error('Error reading vibes:', e);
    return {};
  }
}

function getVibeColor(vibe) {
  // Use cached colors if available
  if (vibeColorsCache && vibeColorsCache[vibe]) {
    return vibeColorsCache[vibe];
  }
  
  return '#e0e0e0'; // Default fallback
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

// Close artist ratings dropdown when clicking outside
document.addEventListener('click', (e) => {
  const artistElement = document.getElementById('track-artist');
  if (artistElement && !artistElement.contains(e.target)) {
    const dropdown = artistElement.querySelector('.artist-ratings-dropdown');
    const expandBtn = artistElement.querySelector('.artist-expand-btn');
    if (dropdown && dropdown.classList.contains('visible')) {
      dropdown.classList.remove('visible');
      if (expandBtn) expandBtn.classList.remove('expanded');
    }
  }
});

// Обновляем информацию о треке каждые 5 секунд
setInterval(fetchCurrentTrack, 5000);

// Track if all vibes are expanded
let vibesExpanded = false;

// Load vibe buttons with recently used vibes
async function loadVibeButtons(newlyAddedVibe = null, showAll = false) {
  try {
    // Refresh vibe colors cache
    vibeColorsCache = await ipcRenderer.invoke('getVibes');
    
    const recentVibes = await ipcRenderer.invoke('getRecentVibes');
    const vibeGrid = document.getElementById('vibe-buttons');
    const addButton = document.getElementById('add-vibe-button');
    const expandBtn = document.getElementById('vibe-expand-btn');
    
    // Clear existing vibe buttons (except the add button)
    const existingButtons = vibeGrid.querySelectorAll('.vibe-chip:not(.add-vibe)');
    existingButtons.forEach(btn => btn.remove());
    
    // Get all available vibes
    const allAvailableVibes = [];
    if (vibeColorsCache) {
      Object.keys(vibeColorsCache).forEach(vibeName => {
        allAvailableVibes.push({ name: vibeName, color: vibeColorsCache[vibeName] });
      });
    }
    
    // Show/hide expand button based on number of vibes
    if (allAvailableVibes.length > 5) {
      expandBtn.classList.remove('hidden');
    } else {
      expandBtn.classList.add('hidden');
    }
    
    let vibesToShow = [];
    const shownVibeNames = new Set();
    
    if (showAll || vibesExpanded) {
      // Show all vibes
      vibesToShow = allAvailableVibes;
      expandBtn.classList.add('expanded');
      expandBtn.setAttribute('title', 'Скрыть лишние настроения');
    } else {
      // Show up to 5 vibes: newly added first (if provided), then recently used, then fill with other available vibes
      
      // If a vibe was just added, prioritize it first
      if (newlyAddedVibe && vibeColorsCache[newlyAddedVibe]) {
        vibesToShow.push({ name: newlyAddedVibe, color: vibeColorsCache[newlyAddedVibe] });
        shownVibeNames.add(newlyAddedVibe);
      }
      
      // Add recent vibes (up to remaining slots, but skip if it's the newly added one)
      const remainingSlots = 5 - vibesToShow.length;
      recentVibes.slice(0, remainingSlots).forEach(vibeName => {
        if (vibeColorsCache[vibeName] && !shownVibeNames.has(vibeName)) {
          vibesToShow.push({ name: vibeName, color: vibeColorsCache[vibeName] });
          shownVibeNames.add(vibeName);
        }
      });
      
      // If we have less than 5, fill with other available vibes from vibes.json
      // This ensures newly added moods appear even if they haven't been used yet
      if (vibesToShow.length < 5 && vibeColorsCache) {
        const allVibeNames = Object.keys(vibeColorsCache);
        for (const vibeName of allVibeNames) {
          if (vibesToShow.length >= 5) break;
          if (!shownVibeNames.has(vibeName)) {
            vibesToShow.push({ name: vibeName, color: vibeColorsCache[vibeName] });
            shownVibeNames.add(vibeName);
          }
        }
      }
      
      expandBtn.classList.remove('expanded');
      expandBtn.setAttribute('title', 'Показать все настроения');
    }
    
    // Create buttons for vibes to show
    vibesToShow.forEach(({ name, color }) => {
      const vibeButton = document.createElement('button');
      vibeButton.className = 'vibe-chip';
      vibeButton.textContent = name;
      vibeButton.setAttribute('data-vibe', name);
      vibeButton.style.setProperty('--vibe-color', color);
      
      // Extract RGB values for glassmorphism - convert hex to RGB
      let rgbString = '';
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        rgbString = `${r}, ${g}, ${b}`;
      } else if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          rgbString = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
        }
      }
      if (rgbString) {
        vibeButton.style.setProperty('--vibe-color-rgb', rgbString);
      }
      
      vibeButton.addEventListener('click', () => {
        document
          .querySelectorAll('.vibe-chip:not(.add-vibe)')
          .forEach((btn) => btn.classList.remove('active'));
        vibeButton.classList.add('active');
      });
      
      vibeGrid.insertBefore(vibeButton, addButton);
    });
  } catch (error) {
    console.error('Ошибка при загрузке настроений:', error);
  }
}

// Toggle expand/collapse all vibes
document.getElementById('vibe-expand-btn').addEventListener('click', () => {
  vibesExpanded = !vibesExpanded;
  loadVibeButtons(null, vibesExpanded);
});

// Flag selector modal
async function showFlagSelector(artistName, artistElement) {
  // Remove existing modal if any
  const existingModal = document.getElementById('flag-selector-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Get current flag and used flags
  const [currentFlag, usedCountries] = await Promise.all([
    ipcRenderer.invoke('getArtistFlag', artistName),
    getUsedFlagCountries()
  ]);

  const modal = document.createElement('div');
  modal.id = 'flag-selector-modal';
  modal.className = 'flag-selector-modal';
  
  modal.innerHTML = `
    <div class="flag-selector-overlay"></div>
    <div class="flag-selector-content">
      <div class="flag-selector-header">
        <h3>Выберите флаг для "${artistName}"</h3>
        <button class="flag-selector-close" title="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="flag-selector-grid">
        <button class="flag-option ${!currentFlag ? 'selected' : ''}" data-code="">
          <span class="flag-emoji">🚫</span>
          <span class="flag-label">Удалить</span>
        </button>
        ${usedCountries.map(country => `
          <button class="flag-option ${currentFlag === country.code ? 'selected' : ''}" data-code="${country.code}">
            <span class="flag-emoji">${getFlagEmoji(country.code)}</span>
            <span class="flag-label">${country.name}</span>
          </button>
        `).join('')}
        <button class="flag-option flag-option-other" id="flag-other-btn">
          <span class="flag-emoji">➕</span>
          <span class="flag-label">Другое</span>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeBtn = modal.querySelector('.flag-selector-close');
  const overlay = modal.querySelector('.flag-selector-overlay');
  const closeModal = () => modal.remove();
  
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  
  // Flag selection handlers
  modal.querySelectorAll('.flag-option:not(.flag-option-other)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const flagCode = btn.getAttribute('data-code') || null;
      const result = await ipcRenderer.invoke('saveArtistFlag', {
        artistName,
        flagCode: flagCode || undefined
      });
      
      if (result.success) {
        closeModal();
        // Refresh the artist display
        setTimeout(() => {
          fetchCurrentTrack();
          // Also refresh Artists tab if it's currently active
          const artistsTab = document.querySelector('.nav-tab[data-tab="artist-ratings"]');
          if (artistsTab && artistsTab.classList.contains('active')) {
            loadArtistRatings();
          }
        }, 100);
      }
    });
  });

  // "Other" button handler - opens search modal
  const otherBtn = modal.querySelector('#flag-other-btn');
  otherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
    showFlagSearchModal(artistName);
  });
}

// Flag search modal for selecting new flags
function showFlagSearchModal(artistName) {
  // Remove existing modal if any
  const existingModal = document.getElementById('flag-search-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'flag-search-modal';
  modal.className = 'flag-selector-modal';
  
  modal.innerHTML = `
    <div class="flag-selector-overlay"></div>
    <div class="flag-selector-content flag-search-content">
      <div class="flag-selector-header">
        <h3>Поиск флага для "${artistName}"</h3>
        <button class="flag-selector-close" title="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="flag-search-input-wrapper">
        <input type="text" id="flag-search-input" class="flag-search-input" placeholder="Введите название страны..." autofocus>
      </div>
      <div class="flag-selector-grid" id="flag-search-results">
        ${ALL_COUNTRIES.map(country => `
          <button class="flag-option" data-code="${country.code}">
            <span class="flag-emoji">${getFlagEmoji(country.code)}</span>
            <span class="flag-label">${country.name}</span>
          </button>
        `).join('')}
        ${Object.keys(CUSTOM_FLAGS).map(code => `
          <button class="flag-option" data-code="${code}">
            <span class="flag-emoji">${getFlagEmoji(code)}</span>
            <span class="flag-label">${getCountryName(code)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeBtn = modal.querySelector('.flag-selector-close');
  const overlay = modal.querySelector('.flag-selector-overlay');
  const closeModal = () => modal.remove();
  
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  
  // Search functionality
  const searchInput = modal.querySelector('#flag-search-input');
  const resultsGrid = modal.querySelector('#flag-search-results');
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    const results = searchCountries(query);
    const customResults = Object.keys(CUSTOM_FLAGS).filter(code => 
      getCountryName(code).toLowerCase().includes(query.toLowerCase())
    );
    
    resultsGrid.innerHTML = [
      ...results.map(country => `
        <button class="flag-option" data-code="${country.code}">
          <span class="flag-emoji">${getFlagEmoji(country.code)}</span>
          <span class="flag-label">${country.name}</span>
        </button>
      `),
      ...customResults.map(code => `
        <button class="flag-option" data-code="${code}">
          <span class="flag-emoji">${getFlagEmoji(code)}</span>
          <span class="flag-label">${getCountryName(code)}</span>
        </button>
      `)
    ].join('');
    
    // Re-attach click handlers
    attachFlagSelectionHandlers(modal, artistName, closeModal);
  });
  
  // Initial handlers
  attachFlagSelectionHandlers(modal, artistName, closeModal);
}

// Helper function to attach flag selection handlers
function attachFlagSelectionHandlers(modal, artistName, closeModal) {
  modal.querySelectorAll('.flag-option').forEach(btn => {
    // Remove existing listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async () => {
      const flagCode = newBtn.getAttribute('data-code');
      const result = await ipcRenderer.invoke('saveArtistFlag', {
        artistName,
        flagCode: flagCode || undefined
      });
      
      if (result.success) {
        closeModal();
        // Refresh the artist display
        setTimeout(() => {
          fetchCurrentTrack();
          // Also refresh Artists tab if it's currently active
          const artistsTab = document.querySelector('.nav-tab[data-tab="artist-ratings"]');
          if (artistsTab && artistsTab.classList.contains('active')) {
            loadArtistRatings();
          }
        }, 100);
      }
    });
  });
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  // Verify FlagUtils is loaded
  if (!window.FlagUtils) {
    console.error('FlagUtils not loaded! Check flag-utils.js');
  } else {
    console.log('FlagUtils loaded:', Object.keys(window.FlagUtils));
  }
  
  // Load vibe colors cache first
  await loadVibeColors();
  await loadVibeButtons();
  fetchCurrentTrack();
});

let currentGenreSort = 'count'; // 'count' or 'alpha'
let selectedGenre = '';

// Toggle genre dropdown
document.getElementById('genre-trigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const panel = document.getElementById('genre-panel');
  const backdrop = document.getElementById('genre-backdrop');
  const trigger = document.getElementById('genre-trigger');
  const isHidden = panel.classList.contains('hidden');

  if (isHidden) {
    backdrop.classList.remove('hidden');
    panel.classList.remove('hidden');

    // Position the panel relative to the trigger button
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = 400; // Fixed width for the panel
    const panelHeight = 400; // Max height
    const spacing = 8; // Spacing between trigger and panel

    // Calculate position - center horizontally relative to trigger, below it
    let left = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
    let top = triggerRect.bottom + spacing;

    // Ensure panel doesn't go off-screen to the left
    if (left < 16) {
      left = 16;
    }

    // Ensure panel doesn't go off-screen to the right
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }

    // If panel would go off-screen at bottom, show it above the trigger instead
    if (top + panelHeight > window.innerHeight - 16) {
      top = triggerRect.top - panelHeight - spacing;
    }

    // Apply positioning
    panel.style.position = 'fixed';
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.width = `${panelWidth}px`;

    loadGenreDropdown();
  } else {
    backdrop.classList.add('hidden');
    panel.classList.add('hidden');
  }
});

document.getElementById('genre-backdrop').addEventListener('click', () => {
  document.getElementById('genre-panel').classList.add('hidden');
  document.getElementById('genre-backdrop').classList.add('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('genre-dropdown');
  const panel = document.getElementById('genre-panel');
  const backdrop = document.getElementById('genre-backdrop');

  // Only close if click is outside both the dropdown trigger AND the panel
  if (
    !dropdown.contains(e.target) &&
    !panel.contains(e.target) &&
    !panel.classList.contains('hidden')
  ) {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
  }
});

// Genre search
document.getElementById('genre-search').addEventListener('input', (e) => {
  loadGenreDropdown(e.target.value);
});

// Genre sort buttons
document.querySelectorAll('.genre-sort-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing modal
    document
      .querySelectorAll('.genre-sort-btn')
      .forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentGenreSort = btn.getAttribute('data-sort');
    loadGenreDropdown(document.getElementById('genre-search').value);
  });
});

// Add new genre button
document.getElementById('genre-add-btn').addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent closing modal
  const input = document.getElementById('genre-add-input');
  input.classList.toggle('hidden');
});

// Save new genre
document.getElementById('save-new-genre').addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent closing modal
  const newGenre = document.getElementById('new-genre-name').value.trim();
  if (newGenre) {
    addGenreToStorage(newGenre);
    selectGenre(newGenre);
    document.getElementById('new-genre-name').value = '';
    document.getElementById('genre-add-input').classList.add('hidden');
    loadGenreDropdown(); // Call loadGenreDropdown to update genre list
  }
});

// Load and display genres in dropdown
async function loadGenreDropdown(searchQuery = '') {
  const genreList = document.getElementById('genre-list');
  genreList.innerHTML = '';

  // Get all genres from storage
  const storedGenres = JSON.parse(localStorage.getItem('genres') || '[]');

  // Get genre ratings to show stats
  const genreRatings = await ipcRenderer.invoke('getGenreRatings');

  // Get suggested genre based on current artist
  let suggestedGenre = null;
  if (currentTrackInfo && currentTrackInfo.artist) {
    const trackRatings = await ipcRenderer.invoke('getTrackRatings');
    const artistTracks = trackRatings.filter(
      (t) => t.artist === currentTrackInfo.artist && t.genre
    );

    if (artistTracks.length > 0) {
      // Find most common genre for this artist
      const genreCounts = {};
      artistTracks.forEach((t) => {
        genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1;
      });
      suggestedGenre = Object.keys(genreCounts).reduce((a, b) =>
        genreCounts[a] > genreCounts[b] ? a : b
      );
    }
  }

  // Combine stored genres with genres from ratings
  const allGenres = new Set([
    ...storedGenres,
    ...genreRatings.map((g) => g.genre),
  ]);

  // Create genre objects with stats
  let genres = Array.from(allGenres).map((genre) => {
    const rating = genreRatings.find((g) => g.genre === genre);
    return {
      name: genre,
      rating: rating ? rating.avgRating : null,
      count: rating ? rating.count : 0,
      rank: rating
        ? genreRatings.findIndex((g) => g.genre === genre) + 1
        : null,
    };
  });

  // Filter by search query
  if (searchQuery) {
    genres = genres.filter((g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Sort genres
  if (currentGenreSort === 'count') {
    genres.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  } else {
    genres.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Show suggested genre first if exists
  if (suggestedGenre && !searchQuery) {
    const suggested = genres.find((g) => g.name === suggestedGenre);
    if (suggested) {
      genres = genres.filter((g) => g.name !== suggestedGenre);

      const suggestedItem = createGenreItem(suggested, true);
      genreList.appendChild(suggestedItem);

      // Add divider
      const divider = document.createElement('div');
      divider.className = 'genre-divider';
      genreList.appendChild(divider);
    }
  }

  // Show all genres
  if (genres.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'genre-empty';
    emptyState.textContent = searchQuery ? 'Жанр не найден' : 'Нет жанров';
    genreList.appendChild(emptyState);
  } else {
    genres.forEach((genre) => {
      const item = createGenreItem(genre, false);
      genreList.appendChild(item);
    });
  }
}

// Create genre item element
function createGenreItem(genre, isSuggested) {
  const item = document.createElement('button');
  item.className = 'genre-item';
  if (isSuggested) {
    item.classList.add('suggested');
  }
  if (selectedGenre === genre.name) {
    item.classList.add('selected');
  }

  let content = `
    <div class="genre-item-content">
      <div class="genre-item-name">
        ${genre.name}
        ${
          isSuggested
            ? '<span class="genre-suggested-badge">Предложено</span>'
            : ''
        }
      </div>
      ${
        genre.count > 0
          ? `<div class="genre-item-count">${genre.count} ${
              genre.count === 1 ? 'трек' : genre.count < 5 ? 'трека' : 'треков'
            }</div>`
          : ''
      }
    </div>
  `;

  if (genre.rating !== null) {
    content += `
      <div class="genre-item-stats">
        <div class="genre-item-rating" style="color: ${getRatingColor(
          genre.rating
        )}">
          ${genre.rating.toFixed(1)}
        </div>
        ${genre.rank ? `<div class="genre-item-rank">#${genre.rank}</div>` : ''}
      </div>
    `;
  }

  item.innerHTML = content;

  item.addEventListener('click', () => {
    selectGenre(genre.name);
  });

  return item;
}

// Select genre
function selectGenre(genre) {
  selectedGenre = genre;
  document.getElementById('genre-select').value = genre;
  document.getElementById('genre-trigger-text').textContent = genre;
  document.getElementById('genre-panel').classList.add('hidden');
  document.getElementById('genre-backdrop').classList.add('hidden');

  // Update selected state in list
  document.querySelectorAll('.genre-item').forEach((item) => {
    item.classList.remove('selected');
  });
  const selectedItem = Array.from(
    document.querySelectorAll('.genre-item')
  ).find((item) =>
    item.querySelector('.genre-item-name').textContent.includes(genre)
  );
  if (selectedItem) {
    selectedItem.classList.add('selected');
  }
}

// Функция для добавления жанра в localStorage
function addGenreToStorage(genre) {
  const genres = JSON.parse(localStorage.getItem('genres') || '[]');
  if (!genres.includes(genre)) {
    genres.push(genre);
    localStorage.setItem('genres', JSON.stringify(genres));
  }
}
