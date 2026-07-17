/* ============================================================
   UI.JS  — Enhanced with image stickers, rotation, retake system,
   polaroid caption, multi-asset frame themes, mobile support.
   Export canvas sizes match per-layout spec exactly:
     Classic Strip   → 1200 × 1800
     4-Grid Collage  → 1200 × 1200
     Polaroid Style  → 1200 × 1500
     Film Strip      → dynamic width (scales with shot count) × ~1010, square photo slots, sprocket-hole frame
     6-Grid Collage  → 1200 × 1800
     Magazine Cover  → 1200 × 1500
   ============================================================ */

const UI = (() => {

  /* ----------------------------------------------------------
     IMAGE-BASED STICKER SYSTEM
  ---------------------------------------------------------- */
  const STICKER_PATH = 'assets/stickers/';
  const STICKER_MANIFEST = 'assets/stickers/stickers.json';

  let _stickerList = [];

  const _imgCache = {};
  function loadStickerImage(src) {
    if (!_imgCache[src]) {
      _imgCache[src] = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }
    return _imgCache[src];
  }

  async function loadStickerManifest() {
    try {
      const res = await fetch(STICKER_MANIFEST, { cache: 'no-cache' });
      if (!res.ok) throw new Error('manifest not found');
      const filenames = await res.json();
      _stickerList = filenames.map(filename => {
        const name = filename.replace(/\.[^.]+$/, '');
        const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
        return { id: 'img-' + name, label, src: STICKER_PATH + filename, isImage: true };
      });
    } catch (_) {
      _stickerList = [];
    }
  }

  function preloadStickerImages() {
    _stickerList.forEach(s => loadStickerImage(s.src));
  }

  /* ----------------------------------------------------------
     LAYOUT TEMPLATES
     Each layout has:
       exportW / exportH  — the canonical full-resolution export canvas size
       size(shotCount)    — returns { w, h, ...layout-specific metrics }
                            where w === exportW, h === exportH
     The decorate stage and export canvas always use these full-res dimensions;
     visual scaling for display is handled via CSS only (never resampling pixels).
  ---------------------------------------------------------- */
  // ── LAYOUT FACTORY HELPERS ──────────────────────────────────────
  // Each base type (strip / grid / polaroid) has a shared draw function.
  // Variants are lightweight objects that reference the same draw logic
  // but differ in id, name, desc, and built-in frameStyle decoration.

  function _makeStrip(id, name, desc, frameStyle) {
    return {
      id, name, desc, frameStyle,
      defaultShots: 3, minShots: 3, maxShots: 3,
      exportW: 480, exportH: 1800,
      size(shotCount) {
        const count = shotCount || this.defaultShots;
        const w = 480, padding = 28;
        const photoH = (w - padding * 2) * 0.74;
        const h = padding * 2 + count * photoH + (count - 1) * 16 + 70;
        return { w, h: Math.round(h), photoH, padding };
      },
      draw(ctx, photos, opts) {
        const slotCount = this.defaultShots;
        const slots = photos.slice(0, slotCount);
        while (slots.length < slotCount) slots.push(null);
        const { w, h, photoH, padding } = this.size(slotCount);
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 26); ctx.fill();
        let y = padding;
        slots.forEach((p, i) => {
          if (p) {
            drawCoveredImage(ctx, p, padding, y, w - padding * 2, photoH, 10);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, padding, y, w - padding * 2, photoH, 10); ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 18px "Baloo 2", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, w / 2, y + photoH / 2);
            ctx.restore();
          }
          y += photoH + 16;
        });
        drawSprockets(ctx, w, h, padding);
        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 22px "Baloo 2", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(opts.banner, w / 2, h - 24);
        }
        applyLayoutFrameStyle(ctx, this.frameStyle, w, h);
      },
    };
  }

  function _makeGrid(id, name, desc, frameStyle) {
    return {
      id, name, desc, frameStyle,
      defaultShots: 4, minShots: 4, maxShots: 4,
      exportW: 1200, exportH: 1200,
      size() {
        const w = 1200, h = 1200, padding = 60, gap = 32;
        const cell = Math.floor((w - padding * 2 - gap) / 2);
        return { w, h, cell, padding, gap };
      },
      draw(ctx, photos, opts) {
        const { w, h, cell, padding, gap } = this.size();
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 60); ctx.fill();
        const positions = [
          [padding, padding], [padding + cell + gap, padding],
          [padding, padding + cell + gap], [padding + cell + gap, padding + cell + gap],
        ];
        photos.slice(0, 4).forEach((p, i) => {
          const [x, y] = positions[i];
          if (p) {
            drawCoveredImage(ctx, p, x, y, cell, cell, 28);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, x, y, cell, cell, 28); ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 40px "Baloo 2", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, x + cell / 2, y + cell / 2);
            ctx.restore();
          }
        });
        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 60px "Baloo 2", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(opts.banner, w / 2, h - padding / 2);
        }
        applyLayoutFrameStyle(ctx, this.frameStyle, w, h);
      },
    };
  }

  function _makePolaroid(id, name, desc, frameStyle, shots) {
    const shotCount = shots || 1;
    return {
      id, name, desc, frameStyle,
      defaultShots: shotCount, minShots: shotCount, maxShots: shotCount,
      exportW: 1200, exportH: shotCount === 2 ? 2400 : 1500,
      size() {
        if (shotCount === 2) {
          // Two stacked polaroid frames
          const w = 1200, padding = 56, gap = 40;
          const photoH = 860;
          const frameH = padding + photoH + 80; // photo + caption area per frame
          const h = frameH * 2 + gap;
          return { w, h, photoH, padding, gap, frameH };
        }
        return { w: 1200, h: 1500, photoH: 1080, padding: 56 };
      },
      draw(ctx, photos, opts) {
        if (shotCount === 2) {
          const { w, h, photoH, padding, gap, frameH } = this.size();
          ctx.fillStyle = opts.frameColor || '#FFFFFF';
          roundRect(ctx, 0, 0, w, h, 24); ctx.fill();

          [0, 1].forEach(i => {
            const yOff = i * (frameH + gap);
            const photo = photos[i] || null;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,.15)'; ctx.shadowBlur = 16;
            if (photo) {
              drawCoveredImage(ctx, photo, padding, yOff + padding, w - padding * 2, photoH, 10);
            } else {
              ctx.fillStyle = '#F0E8DC';
              roundRect(ctx, padding, yOff + padding, w - padding * 2, photoH, 10); ctx.fill();
              ctx.fillStyle = '#B0A0C0';
              ctx.font = '600 52px "Baloo 2", sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`Photo ${i + 1}`, w / 2, yOff + padding + photoH / 2);
            }
            ctx.restore();
            // per-frame caption area
            if (opts.banner) {
              ctx.fillStyle = opts.textColor || '#2B2138';
              ctx.font = '600 52px "Baloo 2", cursive';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(opts.banner.slice(0, 30), w / 2, yOff + padding + photoH + (frameH - padding - photoH) / 2);
            }
          });
          applyLayoutFrameStyle(ctx, this.frameStyle, w, h);
          return;
        }

        // ── Single polaroid ──
        const { w, h, photoH, padding } = this.size();
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 24); ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.15)'; ctx.shadowBlur = 24;
        if (photos[0]) {
          drawCoveredImage(ctx, photos[0], padding, padding, w - padding * 2, photoH, 10);
        } else {
          ctx.fillStyle = '#F0E8DC';
          roundRect(ctx, padding, padding, w - padding * 2, photoH, 10); ctx.fill();
        }
        ctx.restore();
        const caption = (opts.banner || '').trim();
        if (caption) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 72px "Baloo 2", cursive';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(caption.slice(0, 30), w / 2, padding + photoH + (h - padding - photoH) / 2);
        }
        applyLayoutFrameStyle(ctx, this.frameStyle, w, h);
      },
    };
  }

  // ── Built-in frame style decorator (baked into each variant's draw) ──
  // These are DIFFERENT from the user-selectable applyFrameTheme overlays
  // in the Decorate screen — these define the carousel card's identity/look.
  // Keeping them separate means both systems work independently.
  function applyLayoutFrameStyle(ctx, style, w, h) {
    if (!style || style === 'plain' || style === 'custom') return;
    ctx.save();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    const sc = Math.min(w, h) / 480;

    if (style === 'pastel-pink') {
      ctx.strokeStyle = '#FF9FC4'; ctx.lineWidth = 8 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 20 * sc); ctx.stroke();
      [w * 0.25, w * 0.5, w * 0.75].forEach(x => {
        pathHeart(ctx, x, 10 * sc, 5 * sc); ctx.fillStyle = '#FF9FC4'; ctx.fill();
        pathHeart(ctx, x, h - 10 * sc, 5 * sc); ctx.fill();
      });
    }
    else if (style === 'retro-film') {
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 3 * sc;
      ctx.setLineDash([6 * sc, 4 * sc]);
      roundRect(ctx, 6 * sc, 6 * sc, w - 12 * sc, h - 12 * sc, 16 * sc); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(43,33,56,0.07)';
      ctx.fillRect(0, 0, w, 18 * sc);
      ctx.fillRect(0, h - 18 * sc, w, 18 * sc);
    }
    else if (style === 'mint-fresh') {
      ctx.strokeStyle = '#58C9A3'; ctx.lineWidth = 6 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 20 * sc); ctx.stroke();
      ctx.fillStyle = '#58C9A3';
      [[10 * sc, 10 * sc], [w - 10 * sc, 10 * sc], [10 * sc, h - 10 * sc], [w - 10 * sc, h - 10 * sc]].forEach(([cx, cy]) => {
        pathSparkle(ctx, cx, cy, 6 * sc); ctx.fill();
      });
    }
    else if (style === 'golden') {
      ctx.strokeStyle = '#FFC857'; ctx.lineWidth = 7 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 18 * sc); ctx.stroke();
      ctx.strokeStyle = '#E0A030'; ctx.lineWidth = 2 * sc;
      roundRect(ctx, 10 * sc, 10 * sc, w - 20 * sc, h - 20 * sc, 14 * sc); ctx.stroke();
      ctx.fillStyle = '#FFC857';
      [w * 0.2, w * 0.5, w * 0.8].forEach(x => {
        pathStar(ctx, x, 12 * sc, 6 * sc, 0); ctx.fill();
        pathStar(ctx, x, h - 12 * sc, 6 * sc, 0); ctx.fill();
      });
    }
    else if (style === 'sky-blue') {
      ctx.strokeStyle = '#7AB8F5'; ctx.lineWidth = 6 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 22 * sc); ctx.stroke();
      ctx.fillStyle = '#7AB8F5';
      const rng = seeded(w * 2 + h * 3);
      for (let i = 0; i < 6; i++) {
        const x = (i < 3 ? 10 * sc + rng() * 8 * sc : w - 10 * sc - rng() * 8 * sc);
        const y = 20 * sc + rng() * (h - 40 * sc);
        pathSparkle(ctx, x, y, (4 + rng() * 3) * sc); ctx.fill();
      }
    }
    // grid variants
    else if (style === 'grid-minimal') {
      ctx.strokeStyle = '#EFE2D0'; ctx.lineWidth = 5 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 55 * sc); ctx.stroke();
    }
    else if (style === 'grid-party') {
      const colors2 = ['#FF6B5B','#FFC857','#58C9A3','#7AB8F5'];
      const rng2 = seeded(w * 5 + h * 11);
      for (let i = 0; i < 16; i++) {
        const edge = Math.floor(rng2() * 4);
        let x2, y2;
        if (edge === 0)      { x2 = rng2() * w; y2 = 8 * sc + rng2() * 10 * sc; }
        else if (edge === 1) { x2 = rng2() * w; y2 = h - 8 * sc - rng2() * 10 * sc; }
        else if (edge === 2) { x2 = 8 * sc + rng2() * 10 * sc; y2 = rng2() * h; }
        else                 { x2 = w - 8 * sc - rng2() * 10 * sc; y2 = rng2() * h; }
        ctx.fillStyle = colors2[Math.floor(rng2() * colors2.length)];
        pathStar(ctx, x2, y2, (5 + rng2() * 4) * sc, rng2() * Math.PI); ctx.fill();
      }
    }
    else if (style === 'grid-dark') {
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 10 * sc;
      roundRect(ctx, 5 * sc, 5 * sc, w - 10 * sc, h - 10 * sc, 55 * sc); ctx.stroke();
      ctx.strokeStyle = '#FF6B5B'; ctx.lineWidth = 3 * sc;
      roundRect(ctx, 14 * sc, 14 * sc, w - 28 * sc, h - 28 * sc, 46 * sc); ctx.stroke();
    }
    else if (style === 'grid-floral') {
      ctx.fillStyle = '#FF9FC4';
      const spots = [[0,0],[w,0],[0,h],[w,h],[w/2,0],[w/2,h],[0,h/2],[w,h/2]];
      spots.forEach(([x2,y2]) => { pathHeart(ctx, x2, y2, 14 * sc); ctx.fill(); });
      ctx.strokeStyle = '#FF9FC4'; ctx.lineWidth = 3 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 55 * sc); ctx.stroke();
    }
    // polaroid variants
    else if (style === 'pola-vintage') {
      ctx.strokeStyle = '#C4A882'; ctx.lineWidth = 10 * sc;
      roundRect(ctx, 5 * sc, 5 * sc, w - 10 * sc, h - 10 * sc, 20 * sc); ctx.stroke();
      ctx.fillStyle = 'rgba(196,168,130,0.08)';
      ctx.fillRect(0, 0, w, h);
    }
    else if (style === 'pola-neon') {
      ['#FF6B5B','#FFC857','#58C9A3'].forEach((c, i) => {
        ctx.strokeStyle = c; ctx.lineWidth = 4 * sc;
        roundRect(ctx, (5 + i * 6) * sc, (5 + i * 6) * sc, w - (10 + i * 12) * sc, h - (10 + i * 12) * sc, (20 - i * 2) * sc);
        ctx.stroke();
      });
    }
    else if (style === 'pola-minimal') {
      ctx.strokeStyle = '#EFE2D0'; ctx.lineWidth = 16 * sc;
      roundRect(ctx, 8 * sc, 8 * sc, w - 16 * sc, h - 16 * sc, 16 * sc); ctx.stroke();
    }
    else if (style === 'pola-dark') {
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 12 * sc;
      roundRect(ctx, 6 * sc, 6 * sc, w - 12 * sc, h - 12 * sc, 20 * sc); ctx.stroke();
      ctx.fillStyle = '#FF6B5B';
      pathHeart(ctx, w / 2, h - 30 * sc, 10 * sc); ctx.fill();
    }

    ctx.restore();
  }

  const LAYOUTS = {
    // ── STRIP GROUP ───────
    freeStrip: _makeStrip('freeStrip', 'Classic Strip',    'Decorate it yourself', 'plain'),

    // ── GRID GROUP ────────
    freeGrid:  _makeGrid('freeGrid',  '4-Grid Collage',   'Decorate it yourself', 'plain'),

    // ── POLAROID GROUP ────
    freePolaroid: _makePolaroid('freePolaroid', 'Polaroid Duo',     'Decorate it yourself', 'plain', 2),
  };

  function listLayouts() { return Object.values(LAYOUTS); }
  function getLayout(id) { return LAYOUTS[id] || LAYOUTS.freeStrip; }


  /** Return the canonical export dimensions for a layout+shotCount combo.
   *  These are the authoritative pixel sizes — never deviate from them. */
  function getExportSize(layoutId, shotCount) {
    const layout = getLayout(layoutId);
    return { w: layout.exportW, h: layout.exportH };
  }

  /** Return the aspect ratio (w/h) of a single photo SLOT within a layout —
   *  not the full export canvas. For multi-photo layouts (strip, grid)
   *  each individual cell has its own shape, distinct from the
   *  overall canvas shape. The live camera preview (.camera-stage) needs to
   *  match this per-slot ratio exactly — otherwise the preview crops the
   *  face one way, and drawCoveredImage() later crops it again a different
   *  way when baking into the final layout, and faces/heads get clipped
   *  unpredictably between what the user saw and what got saved. */
  function getShotAspect(layoutId, shotCount) {
    const layout = getLayout(layoutId);
    const count = shotCount || layout.defaultShots;
    // strip variants (including freeStrip)
    if (layoutId.startsWith('strip') || layoutId === 'freeStrip') {
      const { w, photoH, padding } = layout.size(count);
      return (w - padding * 2) / photoH;
    }
    // grid variants (including freeGrid)
    if (layoutId.startsWith('grid') || layoutId === 'freeGrid') return 1;
    // polaroid variants (including freePolaroid)
    if (layoutId.startsWith('polaroid') || layoutId === 'freePolaroid') {
      const s = layout.size();
      return (s.w - s.padding * 2) / s.photoH;
    }
    return 1;
  }

  /* ----------------------------------------------------------
     CANVAS DRAW HELPERS
  ---------------------------------------------------------- */
  /** True if a #RRGGBB color is perceptually light (so dark elements
   *  drawn on top of it — sprocket holes, banner text — stay readable).
   *  Standard relative-luminance weighting (matches WCAG's formula shape). */
  function isLightColor(hex) {
    if (!hex || hex[0] !== '#' || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCoveredImage(ctx, srcCanvas, x, y, w, h, radius) {
    ctx.save();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const srcRatio = sw / sh, dstRatio = w / h;
    let drawW, drawH, sx, sy;
    if (srcRatio > dstRatio) {
      drawH = sh; drawW = sh * dstRatio; sx = (sw - drawW) / 2; sy = 0;
    } else {
      drawW = sw; drawH = sw / dstRatio; sx = 0; sy = (sh - drawH) / 2;
    }
    ctx.drawImage(srcCanvas, sx, sy, drawW, drawH, x, y, w, h);
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

  function drawSprocketsHorizontal(ctx, w, h, padding) {
    const holeR = 10;
    const marginY = 38;
    const count = Math.max(2, Math.floor((w - padding * 2) / 72));
    const span = (w - padding * 2) / count;
    ctx.fillStyle = 'rgba(43,33,56,0.12)';
    for (let i = 0; i < count; i++) {
      const cx = padding + span * i + span / 2;
      ctx.beginPath(); ctx.arc(cx, marginY, holeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, h - marginY, holeR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function pathStar(ctx, cx, cy, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function pathHeart(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.3);
    ctx.bezierCurveTo(cx - s, cy - s * 0.6, cx - s * 0.5, cy - s * 1.3, cx, cy - s * 0.5);
    ctx.bezierCurveTo(cx + s * 0.5, cy - s * 1.3, cx + s, cy - s * 0.6, cx, cy + s * 0.3);
    ctx.closePath();
  }
  function pathSparkle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
    ctx.closePath();
  }
  /* ----------------------------------------------------------
     FRAME THEMES
  ---------------------------------------------------------- */
  const FRAME_THEMES = [
    { id: 'plain',       label: 'Plain',        swatch: '#F3ECE0' },
    { id: 'kawaii',      label: 'Kawaii',       swatch: '#FF9FC4' },
    { id: 'pastel',      label: 'Pastel',       swatch: '#D7F3E8' },
    { id: 'ribbon',      label: 'Ribbon',       swatch: '#FF7AB3' },
    { id: 'scrapbook',   label: 'Scrapbook',    swatch: '#FFEFC4' },
    { id: 'doodle',      label: 'Doodle',       swatch: '#2B2138' },
    { id: 'heart',       label: 'Heart',        swatch: '#FF6B5B' },
    { id: 'sparkle',     label: 'Sparkle',      swatch: '#FFC857' },
    { id: 'polaroid',    label: 'Polaroid',     swatch: '#F4F1EA' },
    { id: 'stickerbomb', label: 'Sticker Bomb', swatch: '#FFC857' },
  ];

  function listFrameThemes() { return FRAME_THEMES; }
  function getFrameTheme(id) { return FRAME_THEMES.find(t => t.id === id) || FRAME_THEMES[0]; }

  function seeded(seed) {
    let s = seed % 2147483647;
    return () => (s = (s * 48271) % 2147483647) / 2147483647;
  }

  function applyFrameTheme(ctx, themeId, w, h) {
    if (themeId === 'plain' || !themeId) {
      // Clean matted frame: soft double border so "Plain" still looks finished.
      const sc = Math.min(w, h) / 480;
      ctx.save();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(43,33,56,0.10)'; ctx.lineWidth = 4 * sc;
      roundRect(ctx, 4 * sc, 4 * sc, w - 8 * sc, h - 8 * sc, 18 * sc); ctx.stroke();
      ctx.strokeStyle = 'rgba(43,33,56,0.06)'; ctx.lineWidth = 2 * sc;
      roundRect(ctx, 11 * sc, 11 * sc, w - 22 * sc, h - 22 * sc, 14 * sc); ctx.stroke();
      ctx.restore();
      return;
    }
    // Scale all frame decorations relative to canvas size so they look
    // identical at any resolution (preview or final export).
    const sc = Math.min(w, h) / 480;
    // Reset global state that a previous draw pass might have left dirty
    // (lineDash, globalAlpha, etc.) so frame overlays never stack on repeat
    // calls — redrawBase() calls this every time a theme chip is tapped.
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.save();

    if (themeId === 'kawaii') {
      // Soft rounded border + a single neat row of tiny hearts, calm & cute.
      ctx.strokeStyle = '#FFC2DD'; ctx.lineWidth = 5 * sc;
      roundRect(ctx, 6 * sc, 6 * sc, w - 12 * sc, h - 12 * sc, 28 * sc); ctx.stroke();
      ctx.fillStyle = '#FF9FC4';
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = (i + 1) * (w / (n + 1));
        pathHeart(ctx, x, 15 * sc, 4.5 * sc); ctx.fill();
        pathHeart(ctx, x, h - 15 * sc, 4.5 * sc); ctx.fill();
      }
      // soft blush corners
      ctx.fillStyle = 'rgba(255,158,196,0.55)';
      [[22 * sc, 22 * sc], [w - 22 * sc, 22 * sc], [22 * sc, h - 22 * sc], [w - 22 * sc, h - 22 * sc]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.ellipse(x, y, 8 * sc, 5 * sc, 0, 0, Math.PI * 2); ctx.fill();
      });
    }

    else if (themeId === 'pastel') {
      // Gentle rounded frame in a soft tint, thin inner keyline.
      ctx.strokeStyle = '#FFE3D6'; ctx.lineWidth = 12 * sc;
      roundRect(ctx, 7 * sc, 7 * sc, w - 14 * sc, h - 14 * sc, 24 * sc); ctx.stroke();
      ctx.strokeStyle = '#D7F3E8'; ctx.lineWidth = 2 * sc;
      roundRect(ctx, 16 * sc, 16 * sc, w - 32 * sc, h - 32 * sc, 18 * sc); ctx.stroke();
      const dot = (cx, cy, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, 4.5 * sc, 0, Math.PI * 2); ctx.fill(); };
      [['#FFB3C8', w * 0.5, 14 * sc], ['#FFB3C8', w * 0.5, h - 14 * sc], ['#9AD9F0', 14 * sc, h * 0.5], ['#9AD9F0', w - 14 * sc, h * 0.5]].forEach(([c, x, y]) => dot(x, y, c));
    }

    else if (themeId === 'ribbon') {
      // Minimal corner ribbons + a small centered bow, clean pink.
      const tri = 56 * sc;
      const corner = (x0, y0, flip) => {
        ctx.fillStyle = '#FF9FC4';
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + (flip ? -tri : tri), y0); ctx.lineTo(x0, y0 + (flip ? -tri : tri));
        ctx.closePath(); ctx.fill();
      };
      corner(0, 0, false); corner(w, h, true);
      _drawBow(ctx, w / 2, 14 * sc, 18 * sc, '#FF9FC4');
    }

    else if (themeId === 'scrapbook') {
      // Two washi tapes (top corners) + photo corners, soft stitched frame.
      const tape = (cx, cy, rot, color) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.fillStyle = color; ctx.globalAlpha = 0.75;
        ctx.fillRect(-30 * sc, -8 * sc, 60 * sc, 16 * sc);
        ctx.globalAlpha = 1; ctx.restore();
      };
      tape(36 * sc, 13 * sc, -0.16, '#FFD9CF');
      tape(w - 36 * sc, 13 * sc, 0.16, '#DCEBFC');
      tape(36 * sc, h - 13 * sc, 0.16, '#FFEFC4');
      tape(w - 36 * sc, h - 13 * sc, -0.16, '#D7F3E8');
      const corner = (x, y, dx, dy) => {
        ctx.fillStyle = '#2B2138';
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + dx * 20 * sc, y); ctx.lineTo(x, y + dy * 20 * sc);
        ctx.closePath(); ctx.fill();
      };
      corner(7 * sc, 7 * sc, 1, 1); corner(w - 7 * sc, 7 * sc, -1, 1);
      corner(7 * sc, h - 7 * sc, 1, -1); corner(w - 7 * sc, h - 7 * sc, -1, -1);
      ctx.strokeStyle = 'rgba(43,33,56,0.35)'; ctx.lineWidth = 1.4 * sc; ctx.setLineDash([4 * sc, 5 * sc]);
      roundRect(ctx, 11 * sc, 11 * sc, w - 22 * sc, h - 22 * sc, 10 * sc); ctx.stroke();
      ctx.setLineDash([]);
    }

    else if (themeId === 'doodle') {
      // One clean hand-drawn dashed border + small corner stars only.
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 2.2 * sc; ctx.lineCap = 'round';
      ctx.setLineDash([2 * sc, 8 * sc]);
      roundRect(ctx, 8 * sc, 8 * sc, w - 16 * sc, h - 16 * sc, 22 * sc); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2B2138';
      [[18 * sc, 18 * sc], [w - 18 * sc, 18 * sc], [18 * sc, h - 18 * sc], [w - 18 * sc, h - 18 * sc]].forEach(([sx, sy]) => { pathStar(ctx, sx, sy, 6 * sc, Math.PI / 8); ctx.fill(); });
    }

    else if (themeId === 'heart') {
      // Single elegant heart keyline border + a couple of accent hearts.
      ctx.strokeStyle = '#FF9FC4'; ctx.lineWidth = 4 * sc;
      roundRect(ctx, 7 * sc, 7 * sc, w - 14 * sc, h - 14 * sc, 22 * sc); ctx.stroke();
      ctx.fillStyle = '#FF6B5B';
      pathHeart(ctx, w / 2, 15 * sc, 6 * sc); ctx.fill();
      pathHeart(ctx, w / 2, h - 15 * sc, 6 * sc); ctx.fill();
      ctx.fillStyle = '#FFB3C8';
      pathHeart(ctx, 15 * sc, h * 0.5, 5 * sc); ctx.fill();
      pathHeart(ctx, w - 15 * sc, h * 0.5, 5 * sc); ctx.fill();
    }

    else if (themeId === 'sparkle') {
      // Refined: thin gold keyline + four corner sparkles only.
      ctx.strokeStyle = '#FFD98A'; ctx.lineWidth = 3 * sc;
      roundRect(ctx, 7 * sc, 7 * sc, w - 14 * sc, h - 14 * sc, 20 * sc); ctx.stroke();
      const corners = [[20 * sc, 20 * sc], [w - 20 * sc, 20 * sc], [20 * sc, h - 20 * sc], [w - 20 * sc, h - 20 * sc]];
      const cc = ['#FFC857', '#7AB8F5', '#FF9FC4', '#FFC857'];
      corners.forEach(([x, y], i) => {
        ctx.fillStyle = cc[i];
        if (i % 2 === 0) pathSparkle(ctx, x, y, 9 * sc);
        else pathStar(ctx, x, y, 7 * sc, Math.PI / 6);
        ctx.fill();
      });
    }

    else if (themeId === 'polaroid') {
      // Clean white instant-film border with a subtle inner shadow line.
      ctx.strokeStyle = '#F4F1EA'; ctx.lineWidth = 18 * sc;
      roundRect(ctx, 9 * sc, 9 * sc, w - 18 * sc, h - 18 * sc, 8 * sc); ctx.stroke();
      ctx.strokeStyle = 'rgba(43,33,56,0.10)'; ctx.lineWidth = 1.2 * sc;
      roundRect(ctx, 19 * sc, 19 * sc, w - 38 * sc, h - 38 * sc, 4 * sc); ctx.stroke();
    }

    else if (themeId === 'stickerbomb') {
      // Playful but tidy: evenly spaced stickers along all four edges.
      const rng = seeded(w * 13 + h * 7);
      const shapes = ['star', 'heart', 'sparkle'];
      const colors = ['#FF6B5B', '#FFC857', '#58C9A3', '#7AB8F5', '#FF7AB3', '#B98CFF'];
      const perEdge = 5;
      const place = (x, y) => {
        const shape = shapes[Math.floor(rng() * shapes.length)];
        ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
        ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1 * sc;
        const r = (7 + rng() * 4) * sc;
        if (shape === 'star') pathStar(ctx, x, y, r, rng() * Math.PI);
        else if (shape === 'heart') pathHeart(ctx, x, y, r * 0.7);
        else pathSparkle(ctx, x, y, r);
        ctx.fill(); ctx.stroke();
      };
      for (let i = 0; i < perEdge; i++) {
        const tx = (i + 1) * (w / (perEdge + 1));
        place(tx, 16 * sc + rng() * 8 * sc);
        place(tx, h - 16 * sc - rng() * 8 * sc);
      }
      for (let i = 0; i < perEdge; i++) {
        const ty = (i + 1) * (h / (perEdge + 1));
        place(16 * sc + rng() * 8 * sc, ty);
        place(w - 16 * sc - rng() * 8 * sc, ty);
      }
    }

    ctx.restore();
  }

  function _drawBow(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#2B2138';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx - size, cy - size, cx - size * 1.6, cy, cx, cy);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx + size, cy - size, cx + size * 1.6, cy, cx, cy);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ----------------------------------------------------------
     STICKER LIBRARY
  ---------------------------------------------------------- */
  function getStickers() { return _stickerList; }

  /* ----------------------------------------------------------
     DECORATE-STAGE EDITOR — with rotation support
  ---------------------------------------------------------- */
  function createEditor(stageEl) {
    const layers = [];
    let selectedId = null;
    let idCounter = 0;

    function clearSelection() {
      layers.forEach(l => l.el.classList.remove('selected'));
      selectedId = null;
    }

    function selectLayer(id) {
      clearSelection();
      const layer = layers.find(l => l.id === id);
      if (layer) { layer.el.classList.add('selected'); selectedId = id; }
    }

    const DELETE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>';
    const ROTATE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function makeHandle(parentEl, className, innerHTML) {
      const h = document.createElement('div');
      h.className = className;
      if (innerHTML) h.innerHTML = innerHTML;
      parentEl.appendChild(h);
      return h;
    }

    function addLayer(type, content, opts = {}) {
      const id = 'layer_' + (++idCounter);
      const el = document.createElement('div');
      el.className = type === 'sticker' ? 'sticker-layer' : 'text-layer';
      el.dataset.id = id;

      const stageRect = stageEl.getBoundingClientRect();
      const w = opts.w || (type === 'sticker' ? 70 : 140);
      const h = opts.h || (type === 'sticker' ? 70 : 40);

      let x, y, rotation;
      if (opts.random) {
        // Pick a random zone around the frame (top-middle, bottom, left edge,
        // right edge) and a random tilt so the sticker lands angled to the frame.
        const margin = 6;
        const zones = ['top', 'bottom', 'left', 'right'];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        const maxX = Math.max(margin, stageRect.width - w - margin);
        const maxY = Math.max(margin, stageRect.height - h - margin);
        if (zone === 'top') {
          x = Math.random() * maxX; y = margin; rotation = (Math.random() * 30 - 15);
        } else if (zone === 'bottom') {
          x = Math.random() * maxX; y = maxY; rotation = (Math.random() * 30 - 15);
        } else if (zone === 'left') {
          x = margin; y = Math.random() * maxY; rotation = (Math.random() * 30 - 15);
        } else {
          x = maxX; y = Math.random() * maxY; rotation = (Math.random() * 30 - 15);
        }
      } else {
        x = opts.x ?? (stageRect.width / 2 - w / 2);
        y = opts.y ?? (stageRect.height / 2 - h / 2);
        rotation = opts.rotation || 0;
      }

      if (type === 'sticker') {
        if (opts.isImage && opts.src) {
          el.innerHTML = `<img src="${opts.src}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;" draggable="false" alt="${content}">`;
        } else {
          el.innerHTML = content;
        }
      } else {
        el.textContent = content;
        el.style.color = opts.color || '#2B2138';
        el.style.fontSize = (opts.fontSize || 24) + 'px';
      }

      makeHandle(el, 'layer-delete', DELETE_ICON);
      makeHandle(el, 'layer-handle');
      makeHandle(el, 'layer-rotate', ROTATE_ICON);

      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.transform = `rotate(${rotation}deg)`;

      stageEl.appendChild(el);
      const layer = {
        id, type, el, x, y, w, h,
        rotation,
        random: opts.random || false,
        content,
        color: opts.color,
        fontSize: opts.fontSize || 24,
        isImage: opts.isImage || false,
        src: opts.src || null,
      };
      layers.push(layer);
      attachInteractions(layer);
      selectLayer(id);
      return layer;
    }

    function removeLayer(id) {
      const idx = layers.findIndex(l => l.id === id);
      if (idx >= 0) {
        layers[idx].el.remove();
        layers.splice(idx, 1);
      }
      if (selectedId === id) selectedId = null;
    }

    function attachInteractions(layer) {
      const el = layer.el;
      const deleteBtn = el.querySelector('.layer-delete');
      const resizeHandle = el.querySelector('.layer-handle');
      const rotateHandle = el.querySelector('.layer-rotate');

      deleteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeLayer(layer.id);
      });

      let dragging = false, dragStartX = 0, dragStartY = 0, originX = 0, originY = 0;
      el.addEventListener('pointerdown', (e) => {
        if (e.target === resizeHandle || e.target === deleteBtn || e.target === rotateHandle) return;
        selectLayer(layer.id);
        dragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        originX = layer.x; originY = layer.y;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        stageEl.style.touchAction = 'none';
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        layer.x = originX + (e.clientX - dragStartX);
        layer.y = originY + (e.clientY - dragStartY);
        el.style.left = layer.x + 'px';
        el.style.top = layer.y + 'px';
      });
      function endDrag(e) {
        if (dragging) {
          dragging = false;
          el.style.cursor = 'grab';
          stageEl.style.touchAction = 'pan-y';
          try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      }
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);

      let resizing = false, rStartX = 0, rStartY = 0, startW = 0, startH = 0;
      resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        resizing = true;
        rStartX = e.clientX; rStartY = e.clientY;
        startW = layer.w; startH = layer.h;
        resizeHandle.setPointerCapture(e.pointerId);
        stageEl.style.touchAction = 'none';
      });
      resizeHandle.addEventListener('pointermove', (e) => {
        if (!resizing) return;
        const dx = e.clientX - rStartX;
        const dy = layer.type === 'sticker' ? dx : (e.clientY - rStartY);
        let newW = Math.max(28, startW + dx);
        let newH = layer.type === 'sticker' ? newW : Math.max(20, startH + dy);
        layer.w = newW; layer.h = newH;
        el.style.width = newW + 'px';
        el.style.height = newH + 'px';
        if (layer.type === 'text') {
          layer.fontSize = Math.max(12, Math.round(newH * 0.6));
          el.style.fontSize = layer.fontSize + 'px';
        }
      });
      resizeHandle.addEventListener('pointerup', (e) => {
        resizing = false;
        stageEl.style.touchAction = 'pan-y';
        try { resizeHandle.releasePointerCapture(e.pointerId); } catch (_) {}
      });

      let rotating = false, rotStartAngle = 0, rotOrigin = 0;
      function getAngleFromCenter(clientX, clientY) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
      }
      rotateHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        rotating = true;
        rotStartAngle = getAngleFromCenter(e.clientX, e.clientY);
        rotOrigin = layer.rotation;
        rotateHandle.setPointerCapture(e.pointerId);
        stageEl.style.touchAction = 'none';
        el.style.cursor = 'grabbing';
      });
      rotateHandle.addEventListener('pointermove', (e) => {
        if (!rotating) return;
        const currentAngle = getAngleFromCenter(e.clientX, e.clientY);
        layer.rotation = rotOrigin + (currentAngle - rotStartAngle);
        el.style.transform = `rotate(${layer.rotation}deg)`;
      });
      rotateHandle.addEventListener('pointerup', (e) => {
        rotating = false;
        stageEl.style.touchAction = 'pan-y';
        el.style.cursor = 'grab';
        try { rotateHandle.releasePointerCapture(e.pointerId); } catch (_) {}
      });

      if (layer.type === 'text') {
        el.addEventListener('dblclick', () => {
          const next = prompt('Edit text', layer.content);
          if (next !== null && next.trim()) {
            layer.content = next.trim();
            el.textContent = layer.content;
            makeHandle(el, 'layer-delete', DELETE_ICON);
            const h2 = makeHandle(el, 'layer-handle');
            makeHandle(el, 'layer-rotate', ROTATE_ICON);
            attachResizeOnly(layer, h2);
          }
        });
      }
    }

    function attachResizeOnly(layer, handle) {
      let resizing = false, rStartX = 0, rStartY = 0, startW = 0, startH = 0;
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        resizing = true; rStartX = e.clientX; rStartY = e.clientY;
        startW = layer.w; startH = layer.h;
        handle.setPointerCapture(e.pointerId);
        stageEl.style.touchAction = 'none';
      });
      handle.addEventListener('pointermove', (e) => {
        if (!resizing) return;
        const dx = e.clientX - rStartX;
        layer.w = Math.max(28, startW + dx);
        layer.el.style.width = layer.w + 'px';
      });
      handle.addEventListener('pointerup', (e) => {
        resizing = false;
        stageEl.style.touchAction = 'pan-y';
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      });
    }

    stageEl.addEventListener('pointerdown', (e) => {
      if (e.target === stageEl || e.target.tagName === 'CANVAS') clearSelection();
    });

    function clearAll() {
      layers.forEach(l => l.el.remove());
      layers.length = 0;
      selectedId = null;
    }

    function getLayers() { return layers; }
    return { addLayer, removeLayer, clearAll, getLayers, selectLayer, clearSelection };
  }

  /** Snapshot layer positions relative to the *display-scaled* stage element.
   *  The caller must pass decorateScaleFactor so bakeSnapshots can map back
   *  to full-resolution canvas coordinates. */
  function snapshotLayers(layers, stageEl) {
    const stageRect = stageEl.getBoundingClientRect();
    return layers.map(layer => {
      const r = layer.el.getBoundingClientRect();
      return {
        type: layer.type,
        content: layer.content,
        color: layer.color,
        fontSize: layer.fontSize,
        rotation: layer.rotation || 0,
        isImage: layer.isImage || false,
        src: layer.src || null,
        // positions/sizes in display (CSS-pixel) space
        x: r.left - stageRect.left,
        y: r.top - stageRect.top,
        w: r.width,
        h: r.height,
      };
    });
  }

  /** Bake snapshotted layers onto a full-resolution canvas.
   *  scale = exportCanvasPx / displayCSSPx  (the inverse of the CSS display scale) */
  async function bakeSnapshots(ctx, snapshots, scale) {
    for (const snap of snapshots) {
      const x = snap.x * scale;
      const y = snap.y * scale;
      const w = snap.w * scale;
      const h = snap.h * scale;
      const rot = (snap.rotation || 0) * Math.PI / 180;

      if (snap.type === 'sticker') {
        await new Promise((resolve) => {
          if (snap.isImage && snap.src) {
            loadStickerImage(snap.src).then(img => {
              if (!img) return resolve();
              ctx.save();
              ctx.translate(x + w / 2, y + h / 2);
              ctx.rotate(rot);
              ctx.drawImage(img, -w / 2, -h / 2, w, h);
              ctx.restore();
              resolve();
            });
          } else {
            let svgStr = snap.content;
            if (!svgStr.includes('xmlns=')) {
              svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
            const img = new Image();
            img.onload = () => {
              ctx.save();
              ctx.translate(x + w / 2, y + h / 2);
              ctx.rotate(rot);
              ctx.drawImage(img, -w / 2, -h / 2, w, h);
              ctx.restore();
              resolve();
            };
            img.onerror = () => resolve();
            img.src = encoded;
          }
        });
      } else {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(rot);
        ctx.fillStyle = snap.color || '#2B2138';
        ctx.font = `700 ${Math.round((snap.fontSize || 24) * scale)}px "Baloo 2", sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(snap.content, -w / 2, 0);
        ctx.restore();
      }
    }
  }

  async function bakeLayersToCanvasAsync(ctx, layers, scale, stageEl) {
    const snaps = snapshotLayers(layers, stageEl);
    await bakeSnapshots(ctx, snaps, scale);
  }

  /* ----------------------------------------------------------
     TOAST
  ---------------------------------------------------------- */
  let toastTimer = null;
  function showToast(message, duration = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 300);
    }, duration);
  }

  /* ----------------------------------------------------------
     CONFETTI
  ---------------------------------------------------------- */
  function fireConfetti(container, count = 60) {
    if (!container) return;
    const colors = ['#FF6B5B', '#FFC857', '#58C9A3', '#7AB8F5', '#FF7AB3'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      const size = 6 + Math.random() * 6;
      piece.style.width = size + 'px';
      piece.style.height = (size * 0.4) + 'px';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      const duration = 2.2 + Math.random() * 1.6;
      piece.style.animationDuration = duration + 's';
      piece.style.animationDelay = (Math.random() * 0.4) + 's';
      container.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 0.4) * 1000);
    }
  }

  /* ----------------------------------------------------------
     BACKGROUND FLOATING SHAPES
  ---------------------------------------------------------- */
  function renderBgDecor(container) {
    if (!container || container.childElementCount) return;
    const shapes = [
      { top: '8%', left: '4%', size: 70, color: 'var(--accent-soft)', delay: '0s' },
      { top: '70%', left: '8%', size: 50, color: 'var(--mint-soft)', delay: '2s' },
      { top: '20%', left: '90%', size: 90, color: 'var(--butter-soft)', delay: '1s' },
      { top: '78%', left: '85%', size: 60, color: 'var(--sky-soft)', delay: '3s' },
      { top: '45%', left: '50%', size: 40, color: 'var(--accent-soft)', delay: '1.5s' },
    ];
    shapes.forEach(s => {
      const span = document.createElement('span');
      span.style.top = s.top; span.style.left = s.left;
      span.style.width = s.size + 'px'; span.style.height = s.size + 'px';
      span.style.background = s.color;
      span.style.animationDelay = s.delay;
      container.appendChild(span);
    });
  }

  return {
    listLayouts, getLayout, getExportSize, getShotAspect,
    drawCoveredImage, roundRect,
    getStickers, preloadStickerImages, loadStickerImage, loadStickerManifest,
    createEditor, bakeLayersToCanvasAsync, snapshotLayers, bakeSnapshots,
    showToast, fireConfetti, renderBgDecor, listFrameThemes, getFrameTheme, applyFrameTheme,
  };
})();