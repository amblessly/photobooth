/* ============================================================
   FILTERS.JS
   Pure canvas/pixel-based filter engine. No external libraries.
   Each filter takes a source canvas (or image) and returns a
   new canvas with the effect baked in, so it works identically
   for live preview thumbnails and for final high-res export.
   ============================================================ */

const Filters = (() => {

  /** Available filter definitions. `cssClass` drives the live <video> preview
   *  (cheap, GPU-accelerated). `apply` is the pixel-accurate version used
   *  when baking a captured photo or the final export canvas. */
  const LIST = [
    { id: 'none',    label: 'Original', cssClass: '' },
    { id: 'cartoon', label: 'Cartoon',  cssClass: 'filter-cartoon' },
    { id: 'bw',      label: 'Comic B&W', cssClass: 'filter-bw' },
    { id: 'sepia',   label: 'Sepia',    cssClass: 'filter-sepia' },
    { id: 'pop',     label: 'Color Pop', cssClass: 'filter-pop' },
    { id: 'dream',   label: 'Dreamy',   cssClass: 'filter-dream' },
  ];

  function getById(id) {
    return LIST.find(f => f.id === id) || LIST[0];
  }

  /** Clone a canvas into a new same-size canvas for safe pixel manipulation. */
  function cloneCanvas(srcCanvas) {
    const out = document.createElement('canvas');
    out.width = srcCanvas.width;
    out.height = srcCanvas.height;
    out.getContext('2d').drawImage(srcCanvas, 0, 0);
    return out;
  }

  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /** Simple 3x3 Sobel-style edge map, used to fake a "cartoon ink outline". */
  function edgeMask(ctx, w, h) {
    const src = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < src.data.length; i += 4, p++) {
      gray[p] = (src.data[i] * 0.299 + src.data[i + 1] * 0.587 + src.data[i + 2] * 0.114);
    }
    const edges = new Uint8ClampedArray(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = gray[i - 1] - gray[i + 1];
        const gy = gray[i - w] - gray[i + w];
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[i] = mag > 38 ? 255 : 0;
      }
    }
    return edges;
  }

  /** Posterize channel values to flatten color into "cartoon" bands. */
  function posterize(value, levels = 5) {
    const step = 255 / (levels - 1);
    return Math.round(Math.round(value / step) * step);
  }

  const ops = {
    none(canvas) { return cloneCanvas(canvas); },

    cartoon(canvas) {
      const out = cloneCanvas(canvas);
      const ctx = out.getContext('2d');
      const { width: w, height: h } = out;
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        d[i]     = clamp(posterize(d[i], 6) * 1.12);
        d[i + 1] = clamp(posterize(d[i + 1], 6) * 1.08);
        d[i + 2] = clamp(posterize(d[i + 2], 6) * 1.05);
      }
      ctx.putImageData(imgData, 0, 0);

      // overlay ink edges
      const edges = edgeMask(ctx, w, h);
      const final = ctx.getImageData(0, 0, w, h);
      for (let p = 0, i = 0; i < final.data.length; i += 4, p++) {
        if (edges[p]) {
          final.data[i] = final.data[i + 1] = final.data[i + 2] = 30;
        }
      }
      ctx.putImageData(final, 0, 0);
      return out;
    },

    bw(canvas) {
      const out = cloneCanvas(canvas);
      const ctx = out.getContext('2d');
      const { width: w, height: h } = out;
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const contrast = clamp((g - 128) * 1.35 + 128);
        d[i] = d[i + 1] = d[i + 2] = contrast;
      }
      ctx.putImageData(imgData, 0, 0);
      return out;
    },

    sepia(canvas) {
      const out = cloneCanvas(canvas);
      const ctx = out.getContext('2d');
      const { width: w, height: h } = out;
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i]     = clamp(r * 0.393 + g * 0.769 + b * 0.189);
        d[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168);
        d[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131);
      }
      ctx.putImageData(imgData, 0, 0);
      return out;
    },

    pop(canvas) {
      const out = cloneCanvas(canvas);
      const ctx = out.getContext('2d');
      const { width: w, height: h } = out;
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
        d[i]     = clamp(avg + (d[i] - avg) * 1.9);
        d[i + 1] = clamp(avg + (d[i + 1] - avg) * 1.9);
        d[i + 2] = clamp(avg + (d[i + 2] - avg) * 1.9);
      }
      ctx.putImageData(imgData, 0, 0);
      return out;
    },

    dream(canvas) {
      const out = cloneCanvas(canvas);
      const ctx = out.getContext('2d');
      const { width: w, height: h } = out;
      // soft blur pass via downscale/upscale (cheap box blur)
      const tmp = document.createElement('canvas');
      const scale = 0.18;
      tmp.width = Math.max(1, Math.round(w * scale));
      tmp.height = Math.max(1, Math.round(h * scale));
      tmp.getContext('2d').drawImage(out, 0, 0, tmp.width, tmp.height);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tmp, 0, 0, w, h);
      ctx.globalAlpha = 1;

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = clamp(d[i] * 1.08 + 6);
        d[i + 1] = clamp(d[i + 1] * 1.05 + 6);
        d[i + 2] = clamp(d[i + 2] * 1.1 + 10);
      }
      ctx.putImageData(imgData, 0, 0);
      return out;
    },
  };

  /** Apply a filter by id to a source canvas, returning a brand-new canvas. */
  function apply(filterId, srcCanvas) {
    const fn = ops[filterId] || ops.none;
    return fn(srcCanvas);
  }

  return { LIST, getById, apply };
})();
