# 🎵 Music Rater

> A tool that allows you to see your real preferences in music.

![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20|%20Windows-lightgrey)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **Real-time track detection** — Automatically detects the currently playing track
- **Rate tracks 1-10** — Simple and intuitive rating system
- **Multi-dimensional analysis** — View your preferences by:
  - 🎵 Tracks
  - 🎤 Artists
  - 📀 Albums
  - 🎸 Genres
  - 🌈 Vibes/Moods
- **Bayesian weighted ratings** — Trustworthy ranking that accounts for number of ratings
- **High-resolution artwork** — Fetches album covers from Last.fm API
- **Artist country flags** — Assign and display country flags for artists
- **Custom vibes** — Create your own mood tags with custom colors
- **Beautiful UI** — Modern glassmorphism design with dynamic backgrounds

## 📸 Screenshots

Will be added later...

## ⚠️ Platform Support

| Platform | Status |
|----------|--------|
| **macOS** | ✅ Stable |
| **Windows** | ⚡ Experimental |

> **Note:** The macOS version is the only stable release. Windows support is currently experimental and may have issues with track detection, album covers and overall performance.

## 📥 Installation

### Download

👉 [**Download Latest Release**](https://github.com/worldspawn-web/music_rating/releases)


### Build from Source

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/music_rating.git
cd music_rating

# Install dependencies
npm install

# Run the app
npm start

# Build for macOS
npm run build:mac
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
LASTFM_API_KEY=your_lastfm_api_key_here
```

#### Getting a Last.fm API Key

1. Go to [Last.fm API](https://www.last.fm/api/account/create)
2. Create an API account
3. Copy your API key to the `.env` file

> **Note:** The Last.fm API key is optional but recommended. Without it, album artwork will be limited to low-resolution 150x150 images from the system.

### macOS Requirements

This app requires `nowplaying-cli` to detect the currently playing track:

```bash
brew install nowplaying-cli
```

## 🎯 How It Works

1. **Play any music/media** (for example, Yandex Music)
2. **Open the app** — it automatically detects the current track
3. **Select a genre** and optionally a mood/vibe
4. **Rate the track** from 1 to 10
5. **View your statistics** — explore your music preferences across different dimensions

### Rating System

The app uses a **Bayesian weighted rating** system:
- Tracks with more ratings have more trustworthy scores
- Tracks with fewer ratings are pulled toward the global average
- This prevents a single 10/10 rating from dominating the rankings

### Collaboration Handling

When multiple artists collaborate on a track, each artist receives a modified rating:
- **Formula:** `rating - (number_of_artists - 1) × 0.5`
- **Example:** An 8.0 rating with 3 artists = 7.0 per artist

## 📝 To-Do

- [ ] Improve Windows track detection
- [ ] Add data export/import functionality
- [ ] Add localization (English UI)
- [ ] Exclude other media detection (Videos, Films, etc...)
- [ ] Improve overall performance.
- [ ] Refactoring with TypeScript & FSD.
- [ ] Add keyboard shortcuts for quick rating
- [ ] Add dark/light theme toggle

## 📄 License

MIT License — feel free to use this project however you like.


