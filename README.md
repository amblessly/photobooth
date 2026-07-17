# Snapcrate Photobooth

A browser-based photobooth app with filters, stickers, layouts, and a community feedback wall. No installs needed — just open and shoot.

---

## Features

### Camera

- Live camera feed with real-time filter preview
- Front/rear camera flip and mirror toggle
- Self-timer (3s / 5s / 10s)
- Screen flash effect on capture
- Fullscreen camera mode (mobile-friendly)
- Per-photo retake without losing other shots

### Filters

Six pixel-accurate filters applied on capture:

| Filter | Effect |
| --- | --- |
| Original | No filter |
| Cartoon | Posterized colors with ink edge outline |
| Comic B&W | High-contrast grayscale |
| Sepia | Warm vintage tone |
| Color Pop | Boosted saturation |
| Dreamy | Soft blur with warm glow |

### Layouts

| Layout | Size | Shots |
| --- | --- | --- |
| Classic Strip | 480 × dynamic | 3–4 |
| 4-Grid Collage | 1200 × 1200 | 4 |
| Polaroid Style | 1200 × 1500 | 1 |

### Decorate

- Image and SVG stickers (auto-scanned from `public/assets/stickers/`)
- Drag, resize, and rotate sticker and text layers
- Random sticker button — drops a random sticker at a random edge with a random tilt
- 10 frame themes: Plain, Kawaii, Pastel, Ribbon, Scrapbook, Doodle, Heart, Sparkle, Polaroid, Sticker Bomb
- Frame color picker and caption banner
- Fullscreen decorate mode

### Themes and Ambience

Four color themes: Cute, Comic, Anime, Retro. The active theme auto-cycles every 10 seconds with a smooth crossfade across the whole page.

The ambient system slowly breathes subtle color variation around the active theme palette using native CSS typed `<color>` property transitions. No canvas and no JS animation loop are used.

### Gallery

Saves finished strips to localStorage. Filter by All or Favorites.

### Feedback Wall

Community review wall powered by Firebase Firestore — star ratings, messages, and heart reactions. Paginated with load-more.

### Preview Modal

After all shots are captured, tap the eye button in the camera controls to float a live preview of the final layout over the screen before decorating.

---

## File Structure

```
/
├── landing.html            # Marketing / info page (route "/")
├── start.html              # Username setup page (route "/start")
├── index.html              # Photobooth app shell + all screens (route "/booth")
├── vite.config.js          # Vite config: port 5000, clean URLs, Tailwind
├── src/
│   ├── main.css            # Tailwind import + legacy style.css
│   ├── landing.js          # Landing page logic
│   ├── start.js            # Username setup logic
│   ├── guard.js            # Synchronous booth access guard
│   └── theme-cycle.js      # Shared 10s theme auto-cycle
├── public/                 # Served as-is at the site root
│   ├── app.js              # Main app logic and state
│   ├── ui.js               # Layout templates, frame themes, editor
│   ├── camera.js           # getUserMedia / WebRTC wrapper
│   ├── filters.js          # Canvas pixel filter engine
│   ├── ambient.js          # Slow palette breathing effect
│   ├── feedback.js          # Firebase feedback wall
│   ├── whatsnew.js         # "What's New" popup (version-gated)
│   ├── assets/
│   │   ├── stickers/
│   │   │   ├── stickers.json   # Auto-generated sticker manifest
│   │   │   └── *.png            # Sticker image files
│   │   └── music/
│   │       └── background-music.mp3
│   ├── coverflow.js        # Strip coverflow view
│   └── whatsnew.css        # What's New modal styles
├── build-assets.cjs        # Node script: scans stickers folder into stickers.json
├── reset-hearts.cjs        # Admin script: resets heart counts in Firestore
└── firestore.rules         # Firestore security rules
```

---

## Getting Started

### 1. Install dependencies and run

This project uses Vite and Tailwind CSS v4. Install dependencies, then start the dev server on port 5000.

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5000` with clean URLs:

- `/` — landing / info page
- `/start` — username setup
- `/booth` — photobooth

> Camera access requires either `localhost` or HTTPS. Opening the built files directly as a `file://` URL will block `getUserMedia`.

### 2. Build for production

```bash
npm run build
npm run preview
```

### 3. Add stickers

Drop any `.png` files into `public/assets/stickers/`, then run:

```bash
node build-assets.cjs
```

### 4. Add background music

Drop an `.mp3` into `public/assets/music/` and name it `background-music.mp3`, or update the `MUSIC_SRC` path in `public/app.js`.

---

## Firebase Setup (Feedback Wall)

The feedback wall requires a Firebase project with Firestore enabled.

1. Go to Firebase Console and create a project.
2. Enable Firestore Database.
3. Copy your Firebase config into `public/feedback.js`.
4. Deploy `firestore.rules` from the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

### Reset heart counts (admin utility)

```bash
npm install firebase-admin
# Download your service account key from Firebase Console > Project Settings > Service Accounts
# Save as serviceAccountKey.json next to reset-hearts.cjs (never commit this file)

node reset-hearts.cjs          # dry run — shows what would change
node reset-hearts.cjs --apply  # actually writes to Firestore
```

---

## Customization

### Announce new features

Edit the `FEATURES` array in `public/whatsnew.js` and bump `APP_VERSION` — the popup will show again for all users on next visit.

### Add a layout

Define a new layout object in the `LAYOUTS` map in `public/ui.js`. Each layout needs `id`, `name`, `desc`, `defaultShots`, `minShots`, `maxShots`, `exportW`, `exportH`, `size()`, and `draw()`.

### Add a frame theme

Add an entry to the `FRAME_THEMES` array in `public/ui.js` and implement its drawing logic in `applyFrameTheme()`.

### Change themes

Edit the `data-theme` values and corresponding CSS variable blocks in `src/main.css`. The four built-in themes are `cute`, `comic`, `anime`, and `retro`.

---

## Tech Stack

| | |
| --- | --- |
| **Language** | Vanilla JS (ES2020+), no framework |
| **Build** | Vite |
| **Styling** | Tailwind CSS v4 + CSS custom properties, `@property` typed colors |
| **Camera** | `getUserMedia` / WebRTC |
| **Canvas** | Native 2D Canvas API |
| **Fonts** | Baloo 2 + Plus Jakarta Sans (Google Fonts) |
| **Backend** | Firebase Firestore v8 (feedback wall only) |

---

## License

MIT — do whatever you want with it.
