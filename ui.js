/* ============================================================
   UI.JS  — Enhanced with image stickers, rotation, retake system,
   polaroid caption, multi-asset frame themes, mobile support.
   Export canvas sizes match per-layout spec exactly:
     Classic Strip   → 1200 × 1800
     4-Grid Collage  → 1200 × 1200
     Polaroid Style  → 1200 × 1500
     Film Strip      → 1800 × 1200
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
  const LAYOUTS = {

    // ── Classic Strip — 480px wide, dynamic height ───────────
    strip: {
      id: 'strip',
      name: 'Classic Strip',
      desc: 'Vertical 3–4 shot strip',
      defaultShots: 3,
      minShots: 3, maxShots: 4,
      exportW: 480, exportH: 1800, // exportH is approximate; real h is computed by size()
      size(shotCount) {
        const w = 480;
        const padding = 28;
        const photoH = (w - padding * 2) * 0.74;
        const h = padding * 2 + shotCount * photoH + (shotCount - 1) * 16 + 70;
        return { w, h: Math.round(h), photoH, padding };
      },
      draw(ctx, photos, opts) {
        const { w, h, photoH, padding } = this.size(photos.length);
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 26);
        ctx.fill();

        let y = padding;
        photos.forEach((p, i) => {
          if (p) {
            drawCoveredImage(ctx, p, padding, y, w - padding * 2, photoH, 10);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, padding, y, w - padding * 2, photoH, 10);
            ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 18px "Baloo 2", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, w / 2, y + photoH / 2);
            ctx.restore();
          }
          y += photoH + 16;
        });

        drawSprockets(ctx, w, h, padding);

        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 22px "Baloo 2", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(opts.banner, w / 2, h - 24);
        }
      },
    },

    // ── 4-Grid Collage — 1200 × 1200 ─────────────────────────
    grid: {
      id: 'grid',
      name: '4-Grid Collage',
      desc: 'Square 2x2 collage',
      defaultShots: 4,
      minShots: 4, maxShots: 4,
      exportW: 1200, exportH: 1200,
      size() {
        const w = 1200, h = 1200;
        const padding = 60, gap = 32;
        const cell = Math.floor((w - padding * 2 - gap) / 2);
        const bannerH = Math.round(h - padding * 2 - cell * 2 - gap);
        return { w, h, cell, padding, gap, bannerH };
      },
      draw(ctx, photos, opts) {
        const { w, h, cell, padding, gap } = this.size();
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 60);
        ctx.fill();

        const positions = [
          [padding, padding],
          [padding + cell + gap, padding],
          [padding, padding + cell + gap],
          [padding + cell + gap, padding + cell + gap],
        ];
        photos.slice(0, 4).forEach((p, i) => {
          const [x, y] = positions[i];
          if (p) {
            drawCoveredImage(ctx, p, x, y, cell, cell, 28);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, x, y, cell, cell, 28);
            ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 40px "Baloo 2", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, x + cell / 2, y + cell / 2);
            ctx.restore();
          }
        });

        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 60px "Baloo 2", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opts.banner, w / 2, h - padding / 2);
        }
      },
    },

    // ── Polaroid Style — 1200 × 1500 ─────────────────────────
    polaroid: {
      id: 'polaroid',
      name: 'Polaroid Style',
      desc: 'Single frame, thick bottom border',
      defaultShots: 1,
      minShots: 1, maxShots: 1,
      exportW: 1200, exportH: 1500,
      size() {
        const w = 1200, h = 1500;
        const padding = 56;
        const photoH = 1080;
        return { w, h, photoH, padding };
      },
      draw(ctx, photos, opts) {
        const { w, h, photoH, padding } = this.size();
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 24);
        ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.15)';
        ctx.shadowBlur = 24;
        if (photos[0]) {
          drawCoveredImage(ctx, photos[0], padding, padding, w - padding * 2, photoH, 10);
        } else {
          ctx.fillStyle = '#F0E8DC';
          roundRect(ctx, padding, padding, w - padding * 2, photoH, 10);
          ctx.fill();
        }
        ctx.restore();

        const caption = (opts.banner || '').trim();
        if (caption) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 72px "Baloo 2", cursive';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(caption.slice(0, 30), w / 2, padding + photoH + (h - padding - photoH) / 2);
        }
      },
    },

    // ── Film Strip — 1800 × 1200 ─────────────────────────────
    filmstrip: {
      id: 'filmstrip',
      name: 'Film Strip',
      desc: 'Horizontal strip with sprocket holes',
      defaultShots: 4,
      minShots: 3, maxShots: 4,
      exportW: 1800, exportH: 1200,
      size(shotCount) {
        const w = 1800, h = 1200;
        const padding = 60, gap = 28;
        const topMargin = 80, captionH = 100, bottomMargin = 80;
        const photoH = h - topMargin - captionH - bottomMargin;
        const photoW = Math.floor((w - padding * 2 - (shotCount - 1) * gap) / shotCount);
        return { w, h, photoW, photoH, padding, gap, topMargin, captionH, bottomMargin };
      },
      draw(ctx, photos, opts) {
        const { w, h, photoW, photoH, padding, gap, topMargin, captionH } = this.size(photos.length);
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 60);
        ctx.fill();

        let x = padding;
        const y = topMargin;
        photos.forEach((p, i) => {
          if (p) {
            drawCoveredImage(ctx, p, x, y, photoW, photoH, 18);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, x, y, photoW, photoH, 18);
            ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 40px "Baloo 2", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, x + photoW / 2, y + photoH / 2);
            ctx.restore();
          }
          x += photoW + gap;
        });

        drawSprocketsHorizontal(ctx, w, h, padding);

        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 52px "Baloo 2", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opts.banner, w / 2, topMargin + photoH + captionH / 2);
        }
      },
    },

    // ── 6-Grid Collage — 1200 × 1800 ─────────────────────────
    grid6: {
      id: 'grid6',
      name: '6-Grid Collage',
      desc: '2 columns x 3 rows collage',
      defaultShots: 6,
      minShots: 6, maxShots: 6,
      exportW: 1200, exportH: 1800,
      size() {
        const w = 1200, h = 1800;
        const padding = 56, gap = 28;
        const cell = Math.floor((w - padding * 2 - gap) / 2);
        const bannerH = Math.round(h - padding * 2 - cell * 3 - gap * 2);
        return { w, h, cell, padding, gap, bannerH };
      },
      draw(ctx, photos, opts) {
        const { w, h, cell, padding, gap } = this.size();
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 60);
        ctx.fill();

        const positions = [];
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 2; col++) {
            positions.push([padding + col * (cell + gap), padding + row * (cell + gap)]);
          }
        }
        photos.slice(0, 6).forEach((p, i) => {
          const [x, y] = positions[i];
          if (p) {
            drawCoveredImage(ctx, p, x, y, cell, cell, 22);
          } else {
            ctx.save();
            ctx.fillStyle = '#F0E8DC';
            roundRect(ctx, x, y, cell, cell, 22);
            ctx.fill();
            ctx.fillStyle = '#B0A0C0';
            ctx.font = '600 36px "Baloo 2", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Photo ${i + 1}`, x + cell / 2, y + cell / 2);
            ctx.restore();
          }
        });

        if (opts.banner) {
          ctx.fillStyle = opts.textColor || '#2B2138';
          ctx.font = '600 56px "Baloo 2", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opts.banner, w / 2, h - padding / 2);
        }
      },
    },

    // ── Magazine Cover — 1200 × 1500 ─────────────────────────
    magazine: {
      id: 'magazine',
      name: 'Magazine Cover',
      desc: 'Cover photo with title & headline',
      defaultShots: 1,
      minShots: 1, maxShots: 1,
      exportW: 1200, exportH: 1500,
      size() {
        return { w: 1200, h: 1500 };
      },
      draw(ctx, photos, opts) {
        const { w, h } = this.size();
        const border = 24;
        ctx.fillStyle = opts.frameColor || '#FFFFFF';
        roundRect(ctx, 0, 0, w, h, 32);
        ctx.fill();

        ctx.save();
        roundRect(ctx, border, border, w - border * 2, h - border * 2, 20);
        ctx.clip();
        if (photos[0]) {
          drawCoveredImage(ctx, photos[0], border, border, w - border * 2, h - border * 2, 0);
        } else {
          ctx.fillStyle = '#F0E8DC';
          ctx.fillRect(border, border, w - border * 2, h - border * 2);
        }
        ctx.restore();

        // Masthead
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(border, border, w - border * 2, 180);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 96px "Baloo 2", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SNAPCRATE', w / 2, border + 100);
        ctx.restore();

        const headline = (opts.banner || '').trim();
        if (headline) {
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(border, h - border - 180, w - border * 2, 180);
          ctx.fillStyle = opts.textColor || '#FFFFFF';
          ctx.font = '700 64px "Baloo 2", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(headline.slice(0, 30), w / 2, h - border - 90);
          ctx.restore();
        }
      },
    },
  };

  function listLayouts() { return Object.values(LAYOUTS); }
  function getLayout(id) { return LAYOUTS[id] || LAYOUTS.strip; }

  /** Return the canonical export dimensions for a layout+shotCount combo.
   *  These are the authoritative pixel sizes — never deviate from them. */
  function getExportSize(layoutId, shotCount) {
    const layout = getLayout(layoutId);
    return { w: layout.exportW, h: layout.exportH };
  }

  /** Return the aspect ratio (w/h) of a single photo SLOT within a layout —
   *  not the full export canvas. For multi-photo layouts (strip, filmstrip,
   *  grid, grid6) each individual cell has its own shape, distinct from the
   *  overall canvas shape. The live camera preview (.camera-stage) needs to
   *  match this per-slot ratio exactly — otherwise the preview crops the
   *  face one way, and drawCoveredImage() later crops it again a different
   *  way when baking into the final layout, and faces/heads get clipped
   *  unpredictably between what the user saw and what got saved. */
  function getShotAspect(layoutId, shotCount) {
    const layout = getLayout(layoutId);
    const count = shotCount || layout.defaultShots;
    switch (layout.id) {
      case 'strip': {
        const { w, photoH, padding } = layout.size(count);
        return (w - padding * 2) / photoH;
      }
      case 'filmstrip': {
        const { photoW, photoH } = layout.size(count);
        return photoW / photoH;
      }
      case 'grid':
      case 'grid6':
        return 1; // square cells
      case 'polaroid': {
        const { w, photoH, padding } = layout.size();
        return (w - padding * 2) / photoH;
      }
      case 'magazine': {
        const { w, h } = layout.size();
        const border = 24;
        return (w - border * 2) / (h - border * 2);
      }
      default:
        return 1;
    }
  }

  /* ----------------------------------------------------------
     CANVAS DRAW HELPERS
  ---------------------------------------------------------- */
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
    { id: 'plain',       label: 'Plain',        swatch: '#FFFFFF' },
    { id: 'kawaii',      label: 'Kawaii',        swatch: '#FFD9CF' },
    { id: 'pastel',      label: 'Pastel',        swatch: '#D7F3E8' },
    { id: 'ribbon',      label: 'Ribbon',        swatch: '#FF7AB3' },
    { id: 'scrapbook',   label: 'Scrapbook',     swatch: '#FFEFC4' },
    { id: 'doodle',      label: 'Doodle',        swatch: '#2B2138' },
    { id: 'heart',       label: 'Heart',         swatch: '#FF6B5B' },
    { id: 'sparkle',     label: 'Sparkle',       swatch: '#7AB8F5' },
    { id: 'polaroid',    label: 'Polaroid',      swatch: '#FFFFFF' },
    { id: 'stickerbomb', label: 'Sticker Bomb',  swatch: '#FFC857' },
  ];

  function listFrameThemes() { return FRAME_THEMES; }
  function getFrameTheme(id) { return FRAME_THEMES.find(t => t.id === id) || FRAME_THEMES[0]; }

  function seeded(seed) {
    let s = seed % 2147483647;
    return () => (s = (s * 48271) % 2147483647) / 2147483647;
  }

  function applyFrameTheme(ctx, themeId, w, h) {
    if (themeId === 'plain' || !themeId) return;
    // Scale all frame decorations relative to canvas size so they look
    // identical at any resolution (preview or final export).
    const sc = Math.min(w, h) / 480;
    ctx.save();

    if (themeId === 'kawaii') {
      ctx.strokeStyle = '#FF9FC4'; ctx.lineWidth = 6 * sc;
      roundRect(ctx, 5 * sc, 5 * sc, w - 10 * sc, h - 10 * sc, 22 * sc); ctx.stroke();
      ctx.fillStyle = '#FF9FC4';
      [[20 * sc, 20 * sc], [w - 20 * sc, 20 * sc], [20 * sc, h - 20 * sc], [w - 20 * sc, h - 20 * sc]].forEach(([cx, cy]) => {
        ctx.beginPath(); ctx.arc(cx, cy, 5 * sc, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#FF6B5B';
      [w * 0.3, w * 0.5, w * 0.7].forEach(hx => {
        pathHeart(ctx, hx, 14 * sc, 5 * sc); ctx.fill();
        pathHeart(ctx, hx, h - 14 * sc, 5 * sc); ctx.fill();
      });
      ctx.fillStyle = '#FFC857';
      pathStar(ctx, w * 0.15, 18 * sc, 6 * sc, 0); ctx.fill();
      pathStar(ctx, w * 0.85, 18 * sc, 6 * sc, 0); ctx.fill();
    }

    else if (themeId === 'pastel') {
      const stripe = 10 * sc;
      const colors = ['#FFD9CF', '#D7F3E8', '#DCEBFC', '#FFEFC4'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(0, i * stripe, w, stripe);
        ctx.fillRect(0, h - (i + 1) * stripe, w, stripe);
      }
      ctx.fillStyle = '#FF9FC4';
      [[12 * sc, h * 0.25], [12 * sc, h * 0.75], [w - 12 * sc, h * 0.25], [w - 12 * sc, h * 0.75]].forEach(([x, y]) => {
        pathSparkle(ctx, x, y, 6 * sc); ctx.fill();
      });
    }

    else if (themeId === 'ribbon') {
      const tri = 70 * sc;
      ctx.fillStyle = '#FF7AB3';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tri, 0); ctx.lineTo(0, tri); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1.4 * sc;
      ctx.beginPath(); ctx.moveTo(0, tri); ctx.lineTo(tri, 0); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${14 * sc}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
      ctx.save(); ctx.translate(22 * sc, 22 * sc); ctx.rotate(-Math.PI / 4);
      ctx.fillText('♥', 0, 5 * sc); ctx.restore();
      ctx.fillStyle = '#FF7AB3';
      ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - tri, h); ctx.lineTo(w, h - tri); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1.4 * sc;
      ctx.beginPath(); ctx.moveTo(w - tri, h); ctx.lineTo(w, h - tri); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 122, 179, 0.18)';
      ctx.fillRect(0, 0, w, 7 * sc);
      ctx.fillRect(0, h - 7 * sc, w, 7 * sc);
      _drawBow(ctx, w / 2, 8 * sc, 18 * sc, '#FF7AB3');
    }

    else if (themeId === 'scrapbook') {
      const tape = (cx, cy, rot, color) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.fillStyle = color; ctx.globalAlpha = 0.85;
        ctx.fillRect(-30 * sc, -9 * sc, 60 * sc, 18 * sc);
        ctx.globalAlpha = 1; ctx.strokeStyle = '#2B2138'; ctx.lineWidth = sc;
        ctx.strokeRect(-30 * sc, -9 * sc, 60 * sc, 18 * sc);
        ctx.restore();
      };
      tape(34 * sc, 14 * sc, -0.12, '#FFD9CF');
      tape(w - 34 * sc, 14 * sc, 0.12, '#DCEBFC');
      tape(w / 2, h - 14 * sc, 0.06, '#D7F3E8');
      tape(14 * sc, h * 0.4, Math.PI / 2 + 0.1, '#FFEFC4');
      tape(w - 14 * sc, h * 0.6, Math.PI / 2 - 0.1, '#FFD9CF');
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1.6 * sc; ctx.setLineDash([3 * sc, 4 * sc]);
      [[6 * sc, 6 * sc], [w - 26 * sc, 6 * sc], [6 * sc, h - 26 * sc], [w - 26 * sc, h - 26 * sc]].forEach(([x, y]) => {
        ctx.strokeRect(x, y, 20 * sc, 20 * sc);
      });
      ctx.setLineDash([]);
    }

    else if (themeId === 'doodle') {
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 2.4 * sc;
      ctx.setLineDash([sc, 7 * sc]); ctx.lineCap = 'round';
      roundRect(ctx, 6 * sc, 6 * sc, w - 12 * sc, h - 12 * sc, 20 * sc); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2B2138';
      [[14 * sc, 14 * sc], [w - 14 * sc, 14 * sc], [14 * sc, h - 14 * sc], [w - 14 * sc, h - 14 * sc]].forEach(([sx, sy]) => {
        pathStar(ctx, sx, sy, 7 * sc, Math.PI / 8); ctx.fill();
      });
      ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1.6 * sc; ctx.lineCap = 'round';
      const zigzag = (startX, y, steps, amp) => {
        ctx.beginPath(); ctx.moveTo(startX, y);
        for (let i = 1; i <= steps; i++) ctx.lineTo(startX + i * (w / steps), y + (i % 2 === 0 ? 0 : amp));
        ctx.stroke();
      };
      zigzag(0, 22 * sc, 12, 4 * sc);
      zigzag(0, h - 22 * sc, 12, -4 * sc);
    }

    else if (themeId === 'heart') {
      ctx.fillStyle = '#FF6B5B';
      const rng = seeded(w * 7 + h);
      const count = Math.max(8, Math.floor(h / (60 * sc)));
      for (let i = 0; i < count; i++) {
        const side = i % 4;
        let x, y;
        if (side === 0) { x = 14 * sc + rng() * (w - 28 * sc); y = 12 * sc + rng() * 10 * sc; }
        else if (side === 1) { x = 14 * sc + rng() * (w - 28 * sc); y = h - 12 * sc - rng() * 10 * sc; }
        else if (side === 2) { x = 12 * sc + rng() * 10 * sc; y = 40 * sc + rng() * (h - 80 * sc); }
        else { x = w - 12 * sc - rng() * 10 * sc; y = 40 * sc + rng() * (h - 80 * sc); }
        ctx.fillStyle = i % 2 === 0 ? '#FF6B5B' : '#FF7AB3';
        pathHeart(ctx, x, y, (6 + rng() * 4) * sc); ctx.fill();
      }
      ctx.strokeStyle = '#FF9FC4'; ctx.lineWidth = 4 * sc;
      roundRect(ctx, 5 * sc, 5 * sc, w - 10 * sc, h - 10 * sc, 22 * sc); ctx.stroke();
    }

    else if (themeId === 'sparkle') {
      const rng = seeded(w * 3 + h * 5);
      const positions = [
        [18 * sc, 18 * sc], [w - 18 * sc, 18 * sc], [18 * sc, h - 18 * sc], [w - 18 * sc, h - 18 * sc],
        [w / 2, 14 * sc], [w / 2, h - 14 * sc],
        [w * 0.25, 14 * sc], [w * 0.75, 14 * sc], [w * 0.25, h - 14 * sc], [w * 0.75, h - 14 * sc],
        [12 * sc, h / 2], [w - 12 * sc, h / 2],
      ];
      positions.forEach(([x, y], i) => {
        ctx.fillStyle = i % 3 === 0 ? '#FFC857' : i % 3 === 1 ? '#7AB8F5' : '#FF9FC4';
        if (i % 2 === 0) { pathSparkle(ctx, x, y, (8 + rng() * 4) * sc); }
        else { pathStar(ctx, x, y, (6 + rng() * 3) * sc, rng() * Math.PI); }
        ctx.fill();
      });
      ctx.strokeStyle = '#FFC857'; ctx.lineWidth = 3 * sc;
      ctx.setLineDash([5 * sc, 8 * sc]);
      roundRect(ctx, 6 * sc, 6 * sc, w - 12 * sc, h - 12 * sc, 20 * sc); ctx.stroke();
      ctx.setLineDash([]);
    }

    else if (themeId === 'polaroid') {
      ctx.strokeStyle = '#EFE2D0'; ctx.lineWidth = 14 * sc;
      roundRect(ctx, 7 * sc, 7 * sc, w - 14 * sc, h - 14 * sc, 12 * sc); ctx.stroke();
      ctx.fillStyle = '#2B2138';
      ctx.beginPath(); ctx.arc(w / 2, 12 * sc, 4 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#EFE2D0';
      [[0, 0], [w, 0], [0, h], [w, h]].forEach(([cx, cy]) => {
        ctx.beginPath();
        const s = 18 * sc;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (cx === 0 ? s : -s), cy);
        ctx.lineTo(cx, cy + (cy === 0 ? s : -s));
        ctx.closePath(); ctx.fill();
      });
    }

    else if (themeId === 'stickerbomb') {
      const rng = seeded(w * 13 + h * 7);
      const shapes = ['star', 'heart', 'sparkle'];
      const colors = ['#FF6B5B', '#FFC857', '#58C9A3', '#7AB8F5', '#FF7AB3'];
      for (let i = 0; i < 18; i++) {
        const edge = Math.floor(rng() * 4);
        let x, y;
        if (edge === 0) { x = rng() * w; y = 10 * sc + rng() * 14 * sc; }
        else if (edge === 1) { x = rng() * w; y = h - 10 * sc - rng() * 14 * sc; }
        else if (edge === 2) { x = 10 * sc + rng() * 14 * sc; y = rng() * h; }
        else { x = w - 10 * sc - rng() * 14 * sc; y = rng() * h; }
        const shape = shapes[Math.floor(rng() * shapes.length)];
        ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
        ctx.strokeStyle = '#2B2138'; ctx.lineWidth = 1.2 * sc;
        const r = (6 + rng() * 5) * sc;
        if (shape === 'star') pathStar(ctx, x, y, r, rng() * Math.PI);
        else if (shape === 'heart') pathHeart(ctx, x, y, r * 0.7);
        else pathSparkle(ctx, x, y, r);
        ctx.fill(); ctx.stroke();
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
      const x = opts.x ?? (stageRect.width / 2 - w / 2);
      const y = opts.y ?? (stageRect.height / 2 - h / 2);
      const rotation = opts.rotation || 0;

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

      makeHandle(el, 'layer-delete', '✕');
      makeHandle(el, 'layer-handle');
      makeHandle(el, 'layer-rotate', '↻');

      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.transform = `rotate(${rotation}deg)`;

      stageEl.appendChild(el);
      const layer = {
        id, type, el, x, y, w, h,
        rotation,
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
            makeHandle(el, 'layer-delete', '✕');
            const h2 = makeHandle(el, 'layer-handle');
            makeHandle(el, 'layer-rotate', '↻');
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

  /* ----------------------------------------------------------
     POSE PROMPTS
  ---------------------------------------------------------- */
  const POSES = [
    'Peace sign!', 'Big cheesy smile', 'Surprised face', 'Strike a pose',
    'Duck face (just kidding, smile!)', 'Look over your shoulder', 'Jazz hands',
    'Wink at the camera', 'Pretend to laugh', 'Crossed arms, cool look',
  ];
  function randomPose() { return POSES[Math.floor(Math.random() * POSES.length)]; }

  return {
    listLayouts, getLayout, getExportSize, getShotAspect,
    drawCoveredImage, roundRect,
    getStickers, preloadStickerImages, loadStickerImage, loadStickerManifest,
    createEditor, bakeLayersToCanvasAsync, snapshotLayers, bakeSnapshots,
    showToast, fireConfetti, renderBgDecor, randomPose,
    listFrameThemes, getFrameTheme, applyFrameTheme,
  };
})();
