import { startThemeCycle } from './theme-cycle.js';

/* ─── Drawing helpers (ported from ui.js) ─── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCoveredImage(ctx, img, x, y, w, h, radius) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const srcRatio = sw / sh, dstRatio = w / h;
  let drawW, drawH, sx, sy;
  if (srcRatio > dstRatio) {
    drawH = sh; drawW = sh * dstRatio; sx = (sw - drawW) / 2; sy = 0;
  } else {
    drawW = sw; drawH = sw / dstRatio; sx = 0; sy = (sh - drawH) / 2;
  }
  ctx.drawImage(img, sx, sy, drawW, drawH, x, y, w, h);
  ctx.restore();
}

function drawSprockets(ctx, w, h, padding) {
  const holeR = 10;
  const margin = padding * 0.42;
  const count = Math.floor(h / 65);
  ctx.fillStyle = 'rgba(43,33,56,0.12)';
  for (let i = 0; i < count; i++) {
    const cy = 44 + i * 65;
    ctx.beginPath(); ctx.arc(margin, cy, holeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w - margin, cy, holeR, 0, Math.PI * 2); ctx.fill();
  }
}

/* ─── Emoji stickers ─── */
const STICKERS = ['💖','⭐','🌟','🎀','✨','🦋','🌸','🍰','🍓','🎀','💫','🌈','🎵','🎪','💕'];
function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function drawStickers(ctx, w, h, count, seed) {
  const rng = seededRng(seed);
  const fontSize = Math.round(Math.min(w, h) * 0.09);
  ctx.font = `${fontSize}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < count; i++) {
    const x = fontSize + rng() * (w - fontSize * 2);
    const y = fontSize + rng() * (h - fontSize * 2);
    const rot = (rng() - 0.5) * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.85;
    ctx.fillText(STICKERS[Math.floor(rng() * STICKERS.length)], 0, 0);
    ctx.restore();
  }
}

/* ─── Layout renderers ─── */
function renderStrip(images) {
  const w = 480, padding = 28;
  const photoH = (w - padding * 2) * 0.74;
  const count = 3;
  const h = padding * 2 + count * photoH + (count - 1) * 16 + 70;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // frame bg
  ctx.fillStyle = '#2563EB';
  roundRect(ctx, 0, 0, w, h, 26); ctx.fill();

  // photos
  let y = padding;
  for (let i = 0; i < count; i++) {
    if (images[i]) {
      drawCoveredImage(ctx, images[i], padding, y, w - padding * 2, photoH, 10);
    } else {
      ctx.fillStyle = '#F0E8DC';
      roundRect(ctx, padding, y, w - padding * 2, photoH, 10); ctx.fill();
    }
    y += photoH + 16;
  }

  drawSprockets(ctx, w, h, padding);
  drawStickers(ctx, w, h, 5, 42);

  // banner
  ctx.fillStyle = '#2B2138';
  ctx.font = '600 22px "Baloo 2", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Snapcrate', w / 2, h - 24);

  return c;
}

function renderGrid(images) {
  const w = 1200, h = 1200, padding = 60, gap = 32;
  const cell = Math.floor((w - padding * 2 - gap) / 2);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 0, 0, w, h, 60); ctx.fill();

  const positions = [
    [padding, padding], [padding + cell + gap, padding],
    [padding, padding + cell + gap], [padding + cell + gap, padding + cell + gap],
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y] = positions[i];
    if (images[i]) {
      drawCoveredImage(ctx, images[i], x, y, cell, cell, 28);
    } else {
      ctx.fillStyle = '#F0E8DC';
      roundRect(ctx, x, y, cell, cell, 28); ctx.fill();
    }
  }

  drawStickers(ctx, w, h, 6, 99);

  return c;
}

/* ─── Image loader ─── */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ─── Background decor ─── */
function renderBgDecor(container) {
  if (!container || container.childElementCount) return;
  const shapes = [
    { top: '8%', left: '4%', size: 70, color: 'var(--accent-soft)', delay: '0s' },
    { top: '70%', left: '8%', size: 50, color: 'var(--mint-soft)', delay: '2s' },
    { top: '20%', left: '90%', size: 90, color: 'var(--butter-soft)', delay: '1s' },
    { top: '78%', left: '85%', size: 60, color: 'var(--sky-soft)', delay: '3s' },
    { top: '45%', left: '50%', size: 40, color: 'var(--accent-soft)', delay: '1.5s' },
  ];
  shapes.forEach((s) => {
    const span = document.createElement('span');
    span.style.top = s.top;
    span.style.left = s.left;
    span.style.width = s.size + 'px';
    span.style.height = s.size + 'px';
    span.style.background = s.color;
    span.style.animationDelay = s.delay;
    container.appendChild(span);
  });
}

/* ─── Main init ─── */
document.addEventListener('DOMContentLoaded', async () => {
  renderBgDecor(document.getElementById('bgDecor'));
  startThemeCycle();

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Load images
  const allImages = await Promise.all(
    Array.from({ length: 7 }, (_, i) => loadImage(`img/${i + 1}.jpeg`))
  );

  // Render strip (images 1-3)
  const stripCanvas = renderStrip(allImages.slice(0, 3));
  const stripTarget = document.getElementById('preview-strip');
  if (stripTarget) {
    stripTarget.innerHTML = '';
    const img = document.createElement('img');
    img.src = stripCanvas.toDataURL('image/jpeg', 0.92);
    img.alt = 'Classic Strip preview';
    img.style.width = '100%';
    img.style.maxWidth = '330px';
    img.style.borderRadius = '14px';
    img.style.boxShadow = '0 20px 50px -12px rgba(37,99,235,.45)';
    stripTarget.appendChild(img);
  }
});
