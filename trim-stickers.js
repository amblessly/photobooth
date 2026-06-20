#!/usr/bin/env node
// ============================================================
// trim-stickers.js
// Run this locally before generate-stickers.js:
//   npm install sharp
//   node trim-stickers.js
//
// Auto-trims excess transparent padding from every sticker PNG
// in /assets/stickers/ and adds back a small, equal margin —
// so every sticker's artwork fills roughly the same proportion
// of its tile in the sticker grid, even though the original
// files were never drawn at consistent sizes/margins.
//
// Overwrites files in place. Run generate-stickers.js again
// afterward if you've added/removed any files (this script does
// not touch stickers.json).
// ============================================================

const fs = require('fs');
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  console.error('✗ Missing dependency "sharp". Run: npm install sharp');
  process.exit(1);
}

const STICKER_DIR = path.join(__dirname, 'assets', 'stickers');
const SUPPORTED = ['.png', '.webp']; // formats with real alpha channels worth trimming
const MARGIN_PCT = 0.06; // equal breathing room added back on every side, relative to trimmed size

async function trimOne(filePath) {
  const original = sharp(filePath);
  const meta = await original.metadata();

  // sharp's trim() crops fully-transparent (or near-uniform) borders down
  // to the bounding box of actual content — exactly what normalizes how
  // "full" each sticker looks once placed in an equal-size grid cell.
  const trimmedBuffer = await sharp(filePath).trim().toBuffer({ resolveWithObject: true });
  const { data, info } = trimmedBuffer;

  if (info.width === meta.width && info.height === meta.height) {
    return { skipped: true };
  }

  // Add back a small uniform margin so trimmed stickers don't end up
  // touching cell edges differently depending on their shape.
  const marginX = Math.round(info.width * MARGIN_PCT);
  const marginY = Math.round(info.height * MARGIN_PCT);

  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extend({
      top: marginY, bottom: marginY, left: marginX, right: marginX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(filePath + '.tmp');

  fs.renameSync(filePath + '.tmp', filePath);

  return {
    skipped: false,
    before: `${meta.width}x${meta.height}`,
    after: `${info.width + marginX * 2}x${info.height + marginY * 2}`,
  };
}

async function run() {
  if (!fs.existsSync(STICKER_DIR)) {
    console.log('No /assets/stickers/ folder found — nothing to trim.');
    return;
  }

  const files = fs.readdirSync(STICKER_DIR)
    .filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.log('No PNG/WebP stickers found in /assets/stickers/.');
    return;
  }

  console.log(`Trimming ${files.length} sticker(s)...\n`);

  let trimmedCount = 0;
  for (const file of files) {
    const fullPath = path.join(STICKER_DIR, file);
    try {
      const result = await trimOne(fullPath);
      if (result.skipped) {
        console.log(`  - ${file}  (already tight, no change)`);
      } else {
        trimmedCount++;
        console.log(`  ✓ ${file}  ${result.before} → ${result.after}`);
      }
    } catch (err) {
      console.log(`  ✗ ${file}  FAILED: ${err.message}`);
    }
  }

  console.log(`\nDone. ${trimmedCount}/${files.length} file(s) trimmed.`);
  console.log('Tip: run "node generate-stickers.js" again if the file list changed.');
}

run();
