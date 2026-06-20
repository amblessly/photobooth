#!/usr/bin/env node
// ============================================================
// generate-stickers.js
// Run this locally before pushing to GitHub:
//   node generate-stickers.js
//
// Auto-scans /assets/stickers/ for any image files and
// writes stickers.json — no manual editing needed.
// ============================================================

const fs = require('fs');
const path = require('path');

const STICKER_DIR = path.join(__dirname, 'assets', 'stickers');
const OUTPUT_FILE = path.join(STICKER_DIR, 'stickers.json');
const SUPPORTED = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// Create folder if it doesn't exist yet
if (!fs.existsSync(STICKER_DIR)) {
  fs.mkdirSync(STICKER_DIR, { recursive: true });
  console.log('Created /assets/stickers/ folder');
}

// Scan folder for image files
const files = fs.readdirSync(STICKER_DIR)
  .filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
  .sort();

if (files.length === 0) {
  console.log('No images found in /assets/stickers/');
  console.log('Add some PNG/JPG/WebP files and run this again.');
  process.exit(0);
}

// Write stickers.json
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(files, null, 2));

console.log(`✓ stickers.json updated with ${files.length} sticker(s):`);
files.forEach(f => console.log(`  - ${f}`));
console.log('\nNow push to GitHub and you\'re done!');
