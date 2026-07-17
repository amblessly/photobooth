# 📸 Snapcrate Photobooth

A browser-based photobooth app with filters, stickers, layouts, and a community feedback wall. No installs needed — just open and shoot.

---

## ✨ Features

### Camera
- Live camera feed with real-time filter preview
- Front/rear camera flip + mirror toggle
- Self-timer (3s / 5s / 10s)
- Screen flash effect on capture
- Fullscreen camera mode (mobile-friendly)
- Per-photo retake without losing other shots

### Filters
Six pixel-accurate filters applied on capture:
| Filter | Effect |
|---|---|
| Original | No filter |
| Cartoon | Posterized colors + ink edge outline |
| Comic B&W | High-contrast grayscale |
| Sepia | Warm vintage tone |
| Color Pop | Boosted saturation |
| Dreamy | Soft blur + warm glow |

### Layouts
| Layout | Size | Shots |
|---|---|---|
| Classic Strip | 480 × dynamic | 3–4 |
| 4-Grid Collage | 1200 × 1200 | 4 |
| Polaroid Style | 1200 × 1500 | 1 |

### Decorate
- Image stickers (auto-scanned from `/assets/stickers/`)
- Drag, resize, and rotate sticker/text layers
- 10 frame themes: Plain, Kawaii, Pastel, Ribbon, Scrapbook, Doodle, Heart, Sparkle, Polaroid, Sticker Bomb
- Frame color picker + caption banner
- Fullscreen decorate mode

### Themes & Ambience
Four color themes: **Cute**, **Comic**, **Anime**, **Retro**

The ambient system slowly breathes subtle color variation around the active theme palette — lighter, darker, warmer, cooler — using native CSS typed `<color>` property transitions. No canvas, no JS animation loop.

### Gallery
Saves finished strips to localStorage. Filter by All or Favorites.

### Feedback Wall
Community review wall powered by Firebase Firestore — star ratings, messages, and heart reactions. Paginated with load-more.

### Preview Modal
After all shots are captured, tap the 👁 eye button in the camera controls to float a live preview of the final layout over the screen before decorating.

---

## 🗂 File Structure

```
/
├── index.html              # App shell + all screens
├── app.js                  # Main app logic & state
├── ui.js                   # Layout templates, frame themes, editor
├── camera.js               # getUserMedia / WebRTC wrapper
├── filters.js              # Canvas pixel filter engine
├── ambient.js              # Slow palette breathing effect
├── feedback.js             # Firebase feedback wall
├── whatsnew.js             # "What's New" popup (version-gated)
├── style.css               # Design tokens + all core styles
├── style-v2.css            # Fullscreen camera + decorate overlay styles
├── feedback.css            # Feedback section styles
├── whatsnew.css            # What's New modal styles
├── assets/
│   ├── stickers/
│   │   ├── stickers.json   # Auto-generated sticker manifest
│   │   └── *.png / *.webp  # Sticker image files
│   └── music/
│       └── background-music.mp3
├── generate-stickers.js    # Node script: scans stickers folder → stickers.json
├── trim-stickers.js        # Node script: trims transparent padding from PNGs
├── reset-hearts.js         # Admin script: resets heart counts in Firestore
└── firestore.rules         # Firestore security rules
```

---

## 🚀 Getting Started

### 1. Clone and open

This is a static site — no build step required.

```bash
git clone <your-repo-url>
cd snapcrate
```

Open `index.html` in a browser, or serve it locally:

```bash
npx serve .
# or
python3 -m http.server 8080
```

> ⚠️ Camera access requires either `localhost` or HTTPS. Opening `index.html` directly as a `file://` URL will block `getUserMedia`.

### 2. Add stickers

Drop any `.png` or `.webp` files into `/assets/stickers/`, then run:

```bash
node generate-stickers.js
```

To auto-trim excess transparent padding from PNGs first:

```bash
npm install sharp
node trim-stickers.js
node generate-stickers.js
```

### 3. Add background music

Drop an `.mp3` into `/assets/music/` and name it `background-music.mp3`, or update the `MUSIC_SRC` path in `app.js`.

---

## 🔥 Firebase Setup (Feedback Wall)

The feedback wall requires a Firebase project with Firestore enabled.

1. Go to [Firebase Console](https://console.firebase.google.com/) → create a project
2. Enable **Firestore Database**
3. Copy your Firebase config into `feedback.js`
4. Deploy `firestore.rules` from the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

### Reset heart counts (admin utility)

```bash
npm install firebase-admin
# Download your service account key from Firebase Console → Project Settings → Service Accounts
# Save as serviceAccountKey.json next to reset-hearts.js (never commit this file)

node reset-hearts.js          # dry run — shows what would change
node reset-hearts.js --apply  # actually writes to Firestore
```

---

## 🛠 Customization

### Announce new features
Edit the `FEATURES` array in `whatsnew.js` and bump `APP_VERSION` — the popup will show again for all users on next visit.

### Add a layout
Define a new layout object in the `LAYOUTS` map in `ui.js`. Each layout needs `id`, `name`, `desc`, `defaultShots`, `minShots`, `maxShots`, `exportW`, `exportH`, `size()`, and `draw()`.

### Add a frame theme
Add an entry to the `FRAME_THEMES` array in `ui.js` and implement its drawing logic in `applyFrameTheme()`.

### Change themes
Edit the `data-theme` values and corresponding CSS variable blocks in `style.css`. The four built-in themes are `cute`, `comic`, `anime`, and `retro`.

---

## 🧰 Tech Stack

| | |
|---|---|
| **Language** | Vanilla JS (ES2020+), no framework |
| **Styling** | CSS custom properties, `@property` typed colors |
| **Camera** | `getUserMedia` / WebRTC |
| **Canvas** | Native 2D Canvas API |
| **Fonts** | Baloo 2 + Plus Jakarta Sans (Google Fonts) |
| **Backend** | Firebase Firestore v8 (feedback wall only) |
| **Build** | None — fully static |

---

## 📝 License

MIT — do whatever you want with it.
