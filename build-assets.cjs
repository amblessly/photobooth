#!/usr/bin/env node
// ============================================================
// build-assets.js  (was: generate-stickers.js + trim-stickers.js)
// Run this locally before pushing to GitHub.
//
// USAGE
// -----
//   node build-assets.js             # runs ALL steps
//   node build-assets.js stickers    # only scan /assets/stickers/ → stickers.json
//   node build-assets.js trim        # only trim transparent padding from sticker PNGs
//
// Typical full workflow after adding/removing assets:
//   npm install sharp       (first time only — needed for trim)
//   node build-assets.js
//   git add assets/stickers/stickers.json
//   git push
//
// The `trim` step requires the `sharp` npm package.
// Everything else is stdlib-only.
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────
const ROOT         = __dirname;
const STICKER_DIR  = path.join(ROOT, 'assets', 'stickers');
const STICKER_JSON = path.join(STICKER_DIR, 'stickers.json');
const IMG_EXTS     = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TRIM_EXTS    = new Set(['.png', '.webp']);   // alpha-bearing formats
const TRIM_MARGIN  = 0.06;                         // breathing room re-added after trim

// ── Helpers ──────────────────────────────────────────────────────────
function scanImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return IMG_EXTS.has(ext) && f !== 'stickers.json';
    })
    .sort();
}

function writeJson(dest, data) {
  fs.writeFileSync(dest, JSON.stringify(data, null, 2));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created ${path.relative(ROOT, dir)}/`);
  }
}

// ── Step 1: generate stickers.json ───────────────────────────────────
async function stepStickers() {
  console.log('\n── Stickers ─────────────────────────────────────────');
  ensureDir(STICKER_DIR);

  const files = scanImages(STICKER_DIR);
  if (!files.length) {
    console.log('No images found in /assets/stickers/ — add PNG/WebP files and re-run.');
    return;
  }

  writeJson(STICKER_JSON, files);
  console.log(`✓ stickers.json updated with ${files.length} sticker(s):`);
  files.forEach(f => console.log(`  - ${f}`));
}

// ── Step 2: trim transparent padding from sticker PNGs ───────────────
async function stepTrim() {
  console.log('\n── Trim sticker padding ─────────────────────────────');

  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('✗ Missing dependency "sharp". Run: npm install sharp');
    process.exit(1);
  }

  if (!fs.existsSync(STICKER_DIR)) {
    console.log('No /assets/stickers/ folder found — nothing to trim.');
    return;
  }

  const files = fs.readdirSync(STICKER_DIR)
    .filter(f => TRIM_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.log('No PNG/WebP stickers found in /assets/stickers/.');
    return;
  }

  console.log(`Trimming ${files.length} sticker(s)...\n`);

  let trimmedCount = 0;
  for (const file of files) {
    const fullPath = path.join(STICKER_DIR, file);
    try {
      const original = sharp(fullPath);
      const meta     = await original.metadata();

      const { data, info } = await sharp(fullPath).trim().toBuffer({ resolveWithObject: true });

      if (info.width === meta.width && info.height === meta.height) {
        console.log(`  - ${file}  (already tight, no change)`);
        continue;
      }

      const mx = Math.round(info.width  * TRIM_MARGIN);
      const my = Math.round(info.height * TRIM_MARGIN);

      await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .extend({ top: my, bottom: my, left: mx, right: mx, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(fullPath + '.tmp');

      fs.renameSync(fullPath + '.tmp', fullPath);
      trimmedCount++;
      console.log(`  ✓ ${file}  ${meta.width}x${meta.height} → ${info.width + mx * 2}x${info.height + my * 2}`);
    } catch (err) {
      console.log(`  ✗ ${file}  FAILED: ${err.message}`);
    }
  }

  console.log(`\nTrim done. ${trimmedCount}/${files.length} file(s) trimmed.`);
  console.log('Re-run "node build-assets.js stickers" if file names changed.');
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];

  if (!arg || arg === 'trim')     await stepTrim();
  if (!arg || arg === 'stickers') await stepStickers();

  if (arg && !['trim', 'stickers'].includes(arg)) {
    console.error(`Unknown command: ${arg}`);
    console.error('Usage: node build-assets.js [stickers|trim]');
    process.exit(1);
  }

  console.log('\n✅ build-assets done. Push assets/*.json to GitHub when ready.\n');
}

main().catch(err => {
  console.error('❌ build-assets FAILED:', err);
  process.exit(1);
});
