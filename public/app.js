/* ============================================================
   APP.JS — Enhanced: individual photo retake, polaroid caption,
   image stickers, rotation, mobile improvements.
   Gallery + export updated: each layout uses its own canonical
   canvas dimensions (no forced uniform sizing).

   BUILD MARKER: gallery-save-hardened-v3
   (Search for this string in your live deployed app.js to confirm
   the browser is actually running this file and not a cached/old
   copy — open DevTools Console and run:
     fetch('app.js').then(r=>r.text()).then(t=>console.log(t.includes('gallery-save-hardened-v3')))
   It should print `true`.)
   ============================================================ */

(() => {
  'use strict';

  /* ----------------------------------------------------------
     ZOOM LOCK
     Belt-and-suspenders alongside the viewport meta tag + CSS
     touch-action: blocks pinch-zoom (gesturestart, legacy WebKit),
     double-tap-zoom, and ctrl/cmd+wheel zoom — without touching
     normal single-finger scroll or any click/tap handling.
  ---------------------------------------------------------- */
  (function lockZoom() {
    // Legacy WebKit pinch gesture events (Safari iOS)
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
      document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });

    // Double-tap-to-zoom guard (most browsers respect touch-action: manipulation /
    // user-scalable=no, but this catches remaining edge cases on touch devices).
    // Skips elements that intentionally use double-tap, like editable text layers.
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      if (e.target.closest && e.target.closest('.text-layer, .sticker-layer')) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    // Multi-touch pinch guard for browsers without gesture events.
    // Skips the decorate stage, which manages touch-action itself during drag/resize/rotate.
    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 1 && !e.target.closest('#decorateStage')) {
        e.preventDefault();
      }
    }, { passive: false });

    // Ctrl/Cmd + wheel zoom (trackpad pinch on desktop browsers)
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
  })();

  const state = {
    layoutId: 'freeStrip',
    shotCount: 3,
    filterId: 'none',
    timerSeconds: 3,
    photos: [],          // raw captured canvases
    filteredPhotos: [],  // filtered versions
    frameColor: '#FFFFFF',
    frameThemeId: 'plain',
    textColor: '#2B2138',
    banner: '',
    soundOn: true,
    themeIdx: 0,
    retakeSlot: null,    // index of slot being retaken (null = normal capture)
    flashOn: false,      // screen-flash effect toggle (visual only, no device torch)
  };

  const MUSIC_SRC = 'assets/music/background-music.mp3';
  const MUSIC_VOLUME = 0.35;

  const THEMES = ['cute', 'comic', 'anime', 'retro'];
  const TEXT_COLORS = ['#2B2138', '#FF6B5B', '#58C9A3', '#7AB8F5', '#FFC857', '#FFFFFF'];
  const FRAME_COLORS = ['#FFFFFF', '#2B2138', '#FFD9CF', '#D7F3E8', '#FFEFC4'];

  let editor = null;
  let cfsActive = false;
  let decorateFs = false;

  const $ = (id) => document.getElementById(id);
  const el = {
    stepsBar: $('stepsBar'),
    toCaptureBtn: $('toCaptureBtn'),

    cameraVideo: $('cameraVideo'),
    captureCanvas: $('captureCanvas'),
    cameraStage: $('cameraStage'),
    cameraPermission: $('cameraPermission'),
    cameraPermissionText: $('cameraPermissionText'),
    cameraSkeleton: $('cameraSkeleton'),
    enableCameraBtn: $('enableCameraBtn'),
    flipCameraBtn: $('flipCameraBtn'),
    mirrorBtn: $('mirrorBtn'),
    flashToggleBtn: null,
    cameraFlash: $('cameraFlash'),
    filterToggleBtn: $('filterToggleBtn'),
    filterStrip: $('filterStrip'),
    timerPills: $('timerPills'),
    shutterBtn: $('shutterBtn'),
    retakeLastBtn: $('retakeLastBtn'),
    restartSessionBtn: $('restartSessionBtn'),
    countdownOverlay: $('countdownOverlay'),
    countdownNumber: $('countdownNumber'),
    poseOverlay: $('poseOverlay'),
    poseText: $('poseText'),
    shotsStrip: $('shotsStrip'),
    shotsProgress: $('shotsProgress'),
    toDecorateBtn: $('toDecorateBtn'),

    decorateStage: $('decorateStage'),
    panelTabs: $('panelTabs'),
    stickerGrid: $('stickerGrid'),
    randomStickerBtn: $('randomStickerBtn'),
    textInput: $('textInput'),
    addTextBtn: $('addTextBtn'),
    textColorRow: $('textColorRow'),
    frameColorRow: $('frameColorRow'),
    frameThemeGrid: $('frameThemeGrid'),
    bannerInput: $('bannerInput'),
    toExportBtn: $('toExportBtn'),

    exportCanvas: $('exportCanvas'),
    confettiLayer: $('confettiLayer'),
    downloadPngBtn: $('downloadPngBtn'),
    downloadJpgBtn: $('downloadJpgBtn'),
    downloadQrBtn: $('downloadQrBtn'),
    qrBox: $('qrBox'),
    newSessionBtn: $('newSessionBtn'),
    backToDecorateBtn: $('backToDecorateBtn'),

    galleryBtn: $('galleryBtn'),
    galleryBadge: $('galleryBadge'),
    galleryDrawer: $('galleryDrawer'),
    galleryBackdrop: $('galleryBackdrop'),
    closeGalleryBtn: $('closeGalleryBtn'),
    galleryGrid: $('galleryGrid'),
    galleryEmpty: $('galleryEmpty'),

    themeBtn: $('themeBtn'),
    soundBtn: $('soundBtn'),
    bgDecor: $('bgDecor'),
    bgMusic: $('bgMusic'),

    // Fullscreen camera overlay
    enterFullscreenBtn: $('enterFullscreenBtn'),
    cfsOverlay: $('cfsOverlay'),
    cfsVideoWrap: $('cfsVideoWrap'),
    cfsFlash: $('cfsFlash'),
    cfsCountdown: $('cfsCountdown'),
    cfsCountdownNum: $('cfsCountdownNum'),
    cfsExitBtn: $('cfsExitBtn'),
    cfsFlipBtn: $('cfsFlipBtn'),
    cfsFlashBtn: null,
    cfsProgressDots: $('cfsProgressDots'),
    cfsTimerPills: $('cfsTimerPills'),
    cfsFilterToggleBtn: null,
    cfsFilterTray: $('cfsFilterTray'),
    cfsShutterBtn: $('cfsShutterBtn'),
    cfsShotsThumBtn: $('cfsShotsThumBtn'),
    cfsShotsCard: $('cfsShotsCard'),
    cfsShotsCardClose: $('cfsShotsCardClose'),
    cfsShotsGrid: $('cfsShotsGrid'),
    cfsShotsCount: $('cfsShotsCount'),
    cfsProceedBtn: $('cfsProceedBtn'),

    // Decorate fullscreen btn
    decorateFullscreenBtn: $('decorateFullscreenBtn'),
  };

  /* ----------------------------------------------------------
     SCREEN NAVIGATION
  ---------------------------------------------------------- */
  function goToScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
    document.querySelectorAll('.step').forEach(s => {
      s.classList.toggle('active', s.dataset.step === name);
      const order = ['layout', 'capture', 'decorate', 'export'];
      s.classList.toggle('done', order.indexOf(s.dataset.step) < order.indexOf(name));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ----------------------------------------------------------
      SCREEN 1: LAYOUT PICKER (Cover Flow selector)
      The dropdown shot-count picker is gone — each layout defines
      its own defaultShots, and CoverFlow's onChange keeps state in
      sync as the user browses, so by the time they tap Continue
      state.layoutId/state.shotCount already match the centered card.
   ---------------------------------------------------------- */
  /** Update the proceed button labels. All layouts go through the
   *  decorate screen, so the label is always "Decorate strip". */
  function updateProceedButtonLabels() {
    const svgArrow = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    if (el.toDecorateBtn) {
      el.toDecorateBtn.innerHTML = `Decorate strip ${svgArrow}`;
    }
    if (el.cfsProceedBtn) {
      el.cfsProceedBtn.textContent = 'Decorate strip \u2192';
    }
  }

  function initLayoutPicker() {
    CoverFlow.init({
      layouts: UI.listLayouts(),
      initialId: state.layoutId,
      onChange: (layout) => {
        // Only update state when the user is actually on the layout picker screen.
        // If onChange fires while they're mid-capture or decorating (e.g. from
        // autoplay or a stale callback), ignore it — never overwrite shotCount
        // while photos are already being taken or edited.
        const activeScreen = document.querySelector('.screen.active');
        const onLayoutScreen = !activeScreen || activeScreen.dataset.screen === 'layout';
        if (!onLayoutScreen) return;
        state.layoutId  = layout.id;
        state.shotCount = layout.defaultShots;
        updateProceedButtonLabels();
      },
    });
  }

  el.toCaptureBtn.addEventListener('click', async () => {
    // Always re-read layout from CoverFlow so shotCount is 100% in sync
    // with whatever card is centered — guards against stale state if the
    // user browses the picker but the onChange fired before they settled.
    const currentLayout = CoverFlow.getCurrentLayout();
    if (currentLayout) {
      state.layoutId  = currentLayout.id;
      state.shotCount = currentLayout.defaultShots;
    }

    // Full reset — no leftover photos from a previous session bleeding
    // into the new layout's shot count.
    state.photos        = [];
    state.filteredPhotos = [];
    state.retakeSlot    = null;

    updateShotsPanel();
    applyCameraStageAspect();
    updateProceedButtonLabels();
    goToScreen('capture');
    if (state.soundOn) setMusicPlaying(true);
    await startCameraFlow();
  });

  /** Match the live camera preview's crop shape to the selected layout's
   *  actual per-photo slot shape (see UI.getShotAspect). Without this, the
   *  preview box uses a fixed aspect-ratio from CSS that has nothing to do
   *  with the chosen layout — so the live view crops the face one way, and
   *  drawCoveredImage() crops the captured frame a *different* way when it
   *  gets baked into the final strip, clipping faces unpredictably depending
   *  on layout. Setting it here keeps both crops identical. */
  function applyCameraStageAspect() {
    const ratio = UI.getShotAspect(state.layoutId, state.shotCount);
    if (ratio && el.cameraStage) {
      el.cameraStage.style.aspectRatio = ratio.toFixed(4);
    }
  }

  /* ----------------------------------------------------------
     SCREEN 2: CAPTURE
  ---------------------------------------------------------- */
  function renderFilterStrip() {
    el.filterStrip.innerHTML = '';
    Filters.LIST.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip' + (f.id === state.filterId ? ' active' : '');
      chip.dataset.filter = f.id;
      chip.innerHTML = `<div class="swatch" style="background:${filterSwatchColor(f.id)}"></div><span>${f.label}</span>`;
      chip.addEventListener('click', () => {
        state.filterId = f.id;
        applyLiveFilterClass();
        renderFilterStrip();
      });
      el.filterStrip.appendChild(chip);
    });
  }
  function filterSwatchColor(id) {
    return { none: '#cfd2d8', cartoon: '#FF6B5B', bw: '#5b5b5b', sepia: '#c08a4f', pop: '#7AB8F5', dream: '#FFD9CF' }[id] || '#ccc';
  }
  function applyLiveFilterClass() {
    Filters.LIST.forEach(f => { if (f.cssClass) el.cameraVideo.classList.remove(f.cssClass); });
    const cls = Filters.getById(state.filterId).cssClass;
    if (cls) el.cameraVideo.classList.add(cls);
  }

  // Filter strip is always visible — toggle is a hidden stub
  if (el.filterToggleBtn) el.filterToggleBtn.addEventListener('click', () => {
    el.filterStrip.hidden = !el.filterStrip.hidden;
  });

  el.timerPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    state.timerSeconds = parseInt(btn.dataset.timer, 10);
    el.timerPills.querySelectorAll('.pill-btn').forEach(p => p.classList.toggle('active', p === btn));
  });

  async function startCameraFlow() {
    Camera.init(el.cameraVideo);
    el.cameraPermission.hidden = true;
    el.cameraSkeleton.hidden = true;

    const result = await Camera.start();

    if (!result.ok) {
      el.cameraPermission.hidden = false;
      el.cameraPermissionText.textContent = permissionMessage(result.error);
      el.flipCameraBtn.disabled = true;
      return;
    }

    applyLiveFilterClass();
    el.flipCameraBtn.disabled = !Camera.canFlip();
    renderFilterStrip();
  }

  function permissionMessage(code) {
    return {
      denied: 'Camera permission was denied. Enable it in your browser settings, then try again.',
      'no-camera': 'No camera was found on this device. Connect one and try again.',
      'in-use': 'Your camera seems to be in use by another app. Close it and try again.',
      unknown: 'Something went wrong starting the camera. You can try again.',
    }[code] || 'Camera unavailable. You can try again.';
  }

  el.enableCameraBtn.addEventListener('click', startCameraFlow);

  el.flipCameraBtn.addEventListener('click', async () => {
    const result = await Camera.flip();
    if (!result.ok) UI.showToast("Couldn't switch camera");
    applyLiveFilterClass();
  });

  el.mirrorBtn.addEventListener('click', () => { Camera.toggleMirror(); });

  function updateFlashToggleUI() {
    // flash button removed; no-op kept for call-site compatibility
  }

  /* ----------------------------------------------------------
     SHOTS PANEL
  ---------------------------------------------------------- */
  function updateShotsPanel() {
    el.shotsStrip.innerHTML = '';
    for (let i = 0; i < state.shotCount; i++) {
      const thumb = document.createElement('div');
      const photo = state.filteredPhotos[i];

      if (photo) {
        thumb.className = 'shot-thumb' + (state.retakeSlot === i ? ' retake-active' : '');
        const img = document.createElement('img');
        img.src = photo.toDataURL('image/jpeg', 0.9);
        thumb.appendChild(img);

        const retakeBtn = document.createElement('button');
        retakeBtn.className = 'shot-retake-btn';
        retakeBtn.type = 'button';
        retakeBtn.title = `Retake photo ${i + 1}`;
        retakeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        retakeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startRetake(i);
        });
        thumb.appendChild(retakeBtn);
      } else {
        const isNextSlot = i === state.photos.length;
        thumb.className = 'shot-thumb empty' + (isNextSlot ? ' next-slot' : '');
        thumb.textContent = i + 1;
      }
      el.shotsStrip.appendChild(thumb);
    }

    const captured = state.photos.filter(Boolean).length;
    el.shotsProgress.textContent = `${captured} / ${state.shotCount}`;
    el.retakeLastBtn.disabled = captured === 0;
    el.toDecorateBtn.disabled = captured < state.shotCount;

    // Show eye preview button only once all shots are done.
    // Also close any open preview float if shots change (retake/restart).
    const previewEyeBtn = document.getElementById('previewEyeBtn');
    if (previewEyeBtn) previewEyeBtn.hidden = captured < state.shotCount;
    if (captured < state.shotCount) closePreviewFloat();

    if (state.retakeSlot !== null) {
      el.shutterBtn.setAttribute('aria-label', `Retake photo ${state.retakeSlot + 1}`);
      el.shutterBtn.classList.add('retake-mode');
    } else {
      el.shutterBtn.setAttribute('aria-label', 'Take photo');
      el.shutterBtn.classList.remove('retake-mode');
    }
  }

  function startRetake(slotIndex) {
    state.retakeSlot = slotIndex;
    updateShotsPanel();
    UI.showToast(`Ready to retake photo ${slotIndex + 1} — press shutter`);
  }

  let captureBusy = false;
  el.shutterBtn.addEventListener('click', async () => {
    if (captureBusy) return;
    if (state.retakeSlot === null && state.photos.filter(Boolean).length >= state.shotCount) return;

    captureBusy = true;
    el.shutterBtn.disabled = true;
    await runCountdown(state.timerSeconds);
    capturePhoto();
    el.shutterBtn.disabled = false;
    captureBusy = false;

    const captured = state.photos.filter(Boolean).length;
    if (captured >= state.shotCount && state.retakeSlot === null) {
      UI.showToast('All shots captured! Great job!');
    }
  });

  function runCountdown(seconds) {
    return new Promise((resolve) => {
      if (!seconds || seconds <= 0) return resolve();
      el.countdownOverlay.hidden = false;
      let n = seconds;
      el.countdownNumber.textContent = n;
      const tick = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(tick);
          el.countdownOverlay.hidden = true;
          resolve();
        } else {
          el.countdownNumber.textContent = n;
          el.countdownNumber.style.animation = 'none';
          void el.countdownNumber.offsetWidth;
          el.countdownNumber.style.animation = '';
        }
      }, 1000);
    });
  }

  function capturePhoto() {
    // Fire the flash FIRST, before any heavy canvas/pixel work below.
    // Filters.apply() (especially 'cartoon'/'dream') runs a synchronous
    // per-pixel loop that can take long enough on mobile CPUs to block
    // the main thread — if flashEffect() ran after that, the browser
    // often never got a chance to paint the brief flash at all, so it
    // looked like flash "didn't work" on phones even though it fired.
    flashEffect();

    const raw = Camera.grabFrame();
    const filtered = Filters.apply(state.filterId, raw);

    if (state.retakeSlot !== null) {
      state.photos[state.retakeSlot] = raw;
      state.filteredPhotos[state.retakeSlot] = filtered;
      UI.showToast(`Photo ${state.retakeSlot + 1} replaced!`);
      state.retakeSlot = null;
    } else {
      state.photos.push(raw);
      state.filteredPhotos.push(filtered);
    }

    updateShotsPanel();
  }

  function flashEffect() {
    if (!state.flashOn) return;
    el.cameraFlash.classList.remove('fire');
    void el.cameraFlash.offsetWidth; // restart animation if fired in quick succession
    el.cameraFlash.classList.add('fire');
    setTimeout(() => el.cameraFlash.classList.remove('fire'), 250);
    // Flash border ring
    el.cameraStage.classList.add('flash-ring');
    setTimeout(() => el.cameraStage.classList.remove('flash-ring'), 220);
    // Also fire CFS flash if in fullscreen
    if (cfsActive) {
      el.cfsFlash.classList.remove('fire');
      void el.cfsFlash.offsetWidth;
      el.cfsFlash.classList.add('fire');
      setTimeout(() => el.cfsFlash.classList.remove('fire'), 250);
    }
  }

  el.retakeLastBtn.addEventListener('click', () => {
    const lastIdx = state.photos.reduce((last, p, i) => p ? i : last, -1);
    if (lastIdx >= 0) startRetake(lastIdx);
  });

  el.restartSessionBtn.addEventListener('click', () => {
    state.photos         = [];
    state.filteredPhotos = [];
    state.retakeSlot     = null;
    updateShotsPanel();
    UI.showToast('Session restarted');
  });

  el.toDecorateBtn.addEventListener('click', async () => {
    Camera.stop();
    state.retakeSlot = null;

    // Clamp photos to exact shotCount
    state.filteredPhotos = state.filteredPhotos.slice(0, state.shotCount);
    state.photos         = state.photos.slice(0, state.shotCount);
    while (state.filteredPhotos.length < state.shotCount) state.filteredPhotos.push(null);
    while (state.photos.length         < state.shotCount) state.photos.push(null);

    goToScreen('decorate');
    renderDecorateStage();
  });

  // ── Floating preview modal ───────────────────────────────
  function openPreviewFloat() {
    const backdrop = document.getElementById('previewBackdrop');
    const inner    = document.getElementById('previewFloatInner');
    if (!backdrop || !inner) return;

    // Clean up any previous save row appended outside inner
    const card = document.getElementById('previewFloatCard');
    card?.querySelectorAll('.preview-save-row').forEach(el => el.remove());
    inner.innerHTML = '';

    try {
      const layout = UI.getLayout(state.layoutId);

      const { w, h } = layout.size(state.shotCount);
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width  = w;
      previewCanvas.height = h;
      const ctx = previewCanvas.getContext('2d');
      const photos = state.filteredPhotos.slice(0, state.shotCount);
      layout.draw(ctx, photos, {
        frameColor: state.frameColor,
        textColor:  state.textColor,
        banner:     state.banner,
      });
      // Contain scaling: max 80vw wide and max 60vh tall, keep natural aspect ratio.
      const modalW = Math.min(window.innerWidth  * 0.80, 380);
      const modalH = Math.min(window.innerHeight * 0.60, 500);
      const scaleW = modalW / w;
      const scaleH = modalH / h;
      const scale  = Math.min(scaleW, scaleH, 1);
      previewCanvas.style.width        = Math.round(w * scale) + 'px';
      previewCanvas.style.height       = Math.round(h * scale) + 'px';
      previewCanvas.style.display      = 'block';
      previewCanvas.style.borderRadius = '12px';
      previewCanvas.style.margin       = '0 auto';
      inner.appendChild(previewCanvas);
    } catch (_) {}
    requestAnimationFrame(() => backdrop.classList.add('show'));
  }

  function closePreviewFloat() {
    const backdrop = document.getElementById('previewBackdrop');
    if (!backdrop || !backdrop.classList.contains('show')) return;
    backdrop.classList.remove('show');
  }

  document.getElementById('previewEyeBtn')?.addEventListener('click', openPreviewFloat);
  document.getElementById('previewFloatClose')?.addEventListener('click', closePreviewFloat);
  document.getElementById('previewBackdrop')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('previewBackdrop')) closePreviewFloat();
  });

  /* ----------------------------------------------------------
     SCREEN 3: DECORATE
     The base canvas is drawn at full export resolution.
     CSS scaling shrinks it to fit the viewport for editing.
     decorateScaleFactor = exportPx / displayCSSPx
     (used later when baking layers onto the export canvas)
  ---------------------------------------------------------- */
  let decorateBaseCanvas = null;
  let decorateScaleFactor = 1;

  function renderDecorateStage() {
    el.decorateStage.innerHTML = '';
    const layout = UI.getLayout(state.layoutId);
    const { w, h } = layout.size(state.shotCount);

    decorateBaseCanvas = document.createElement('canvas');
    decorateBaseCanvas.width = w;
    decorateBaseCanvas.height = h;
    const ctx = decorateBaseCanvas.getContext('2d');

    // Slice to exact shot count — guards against stale photos array
    // having more/fewer entries than the chosen layout expects.
    const photos = state.filteredPhotos.slice(0, state.shotCount);
    layout.draw(ctx, photos, {
      frameColor: state.frameColor, textColor: state.textColor, banner: state.banner,
    });
    UI.applyFrameTheme(ctx, state.frameThemeId, w, h);

    el.decorateStage.appendChild(decorateBaseCanvas);

    // Always display at 50% of the canvas native resolution — keeps the
    // decorate stage compact on all screen sizes. The canvas itself is
    // still full-res, so exports/downloads are completely unaffected.
    const maxW = Math.min(w * 0.5, window.innerWidth - 32);
    const displayScale = Math.min(0.5, maxW / w);
    decorateBaseCanvas.style.width = (w * displayScale) + 'px';
    decorateBaseCanvas.style.height = (h * displayScale) + 'px';
    el.decorateStage.style.width = (w * displayScale) + 'px';
    el.decorateStage.style.height = (h * displayScale) + 'px';
    decorateScaleFactor = 1 / displayScale;

    editor = UI.createEditor(el.decorateStage);
    renderSwatchRow(el.textColorRow, TEXT_COLORS, state.textColor, (c) => { state.textColor = c; });
    renderSwatchRow(el.frameColorRow, FRAME_COLORS, state.frameColor, (c) => { state.frameColor = c; redrawBase(); });
    renderFrameThemeGrid();
    el.bannerInput.value = state.banner;
    updateCaptionCounter();

    UI.loadStickerManifest().then(() => {
      renderStickerGrid();
      UI.preloadStickerImages();
    });
  }

  function renderFrameThemeGrid() {
    if (!el.frameThemeGrid) return;
    el.frameThemeGrid.innerHTML = '';
    UI.listFrameThemes().forEach(theme => {
      const item = document.createElement('div');
      item.className = 'theme-swatch' + (theme.id === state.frameThemeId ? ' active' : '');
      item.style.setProperty('--swatch-color', theme.swatch);
      item.innerHTML = `<span class="theme-swatch-dot"></span><span class="theme-swatch-label">${theme.label}</span>`;
      item.addEventListener('click', () => {
        state.frameThemeId = theme.id;
        renderFrameThemeGrid();
        redrawBase();
      });
      el.frameThemeGrid.appendChild(item);
    });
  }

  function redrawBase() {
    if (!decorateBaseCanvas) return;
    const layout = UI.getLayout(state.layoutId);
    const ctx = decorateBaseCanvas.getContext('2d');
    // Always slice to the layout's exact shot count so changing frame
    // themes never accidentally renders photos from a different layout.
    const photos = state.filteredPhotos.slice(0, state.shotCount);
    layout.draw(ctx, photos, {
      frameColor: state.frameColor, textColor: state.textColor, banner: state.banner,
    });
    UI.applyFrameTheme(ctx, state.frameThemeId, decorateBaseCanvas.width, decorateBaseCanvas.height);
  }

  function renderStickerGrid() {
    el.stickerGrid.innerHTML = '';
    UI.getStickers().forEach(s => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.title = s.label;

      if (s.isImage) {
        item.innerHTML = `<img src="${s.src}" alt="${s.label}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" onerror="this.closest('.sticker-item').style.display='none'">`;
        item.addEventListener('click', () => {
          editor.addLayer('sticker', s.label, { isImage: true, src: s.src, w: 80, h: 80 });
        });
      } else {
        item.innerHTML = s.svg;
        item.addEventListener('click', () => {
          editor.addLayer('sticker', s.svg);
        });
      }
      el.stickerGrid.appendChild(item);
    });
  }

  el.randomStickerBtn.addEventListener('click', () => {
    const stickers = UI.getStickers();
    if (!stickers.length) return;
    const s = stickers[Math.floor(Math.random() * stickers.length)];
    if (s.isImage) {
      editor.addLayer('sticker', s.label, { isImage: true, src: s.src, w: 80, h: 80, random: true });
    } else {
      editor.addLayer('sticker', s.svg, { random: true });
    }
  });

  function renderSwatchRow(container, colors, active, onPick) {
    container.innerHTML = '';
    colors.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c === active ? ' active' : '');
      sw.style.background = c;
      sw.style.border = c === '#FFFFFF' ? '2px solid #EFE2D0' : '3px solid var(--surface)';
      sw.addEventListener('click', () => {
        container.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        onPick(c);
      });
      container.appendChild(sw);
    });
  }

  el.panelTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.panel-tab');
    if (!btn) return;
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t === btn));
    ['stickers', 'text', 'frame'].forEach(name => {
      document.getElementById('panel-' + name).hidden = name !== btn.dataset.panel;
    });
    if (el.randomStickerBtn) el.randomStickerBtn.hidden = btn.dataset.panel !== 'stickers';
  });

  el.addTextBtn.addEventListener('click', () => {
    const value = el.textInput.value.trim();
    if (!value) return;
    editor.addLayer('text', value, { color: state.textColor, fontSize: 26 });
    el.textInput.value = '';
  });

  const captionCounter = $('captionCounter');
  function updateCaptionCounter() {
    if (!captionCounter) return;
    const len = el.bannerInput.value.length;
    captionCounter.textContent = `${len} / 30`;
    captionCounter.classList.toggle('warn', len >= 25);
  }

  el.bannerInput.addEventListener('input', (e) => {
    state.banner = e.target.value.slice(0, 30);
    e.target.value = state.banner;
    updateCaptionCounter();
    redrawBase();
  });

  el.toExportBtn.addEventListener('click', async () => {
    const layerSnapshots = editor ? UI.snapshotLayers(editor.getLayers(), el.decorateStage) : [];
    goToScreen('export');
    await renderExportCanvas(layerSnapshots);
    UI.fireConfetti(el.confettiLayer);
  });

  el.backToDecorateBtn.addEventListener('click', () => goToScreen('decorate'));

  /* ----------------------------------------------------------
     SCREEN 4: EXPORT
     Export canvas always matches the layout's canonical size.
     No cropping, stretching, or resampling occurs.
  ---------------------------------------------------------- */
  /** Gallery copies are stored in localStorage (typically ~5MB total quota).
   *  A lossless PNG of a large decorated layout (Polaroid/Film Strip/
   *  6-Grid/Magazine — all 1.8-2.2 megapixels) commonly runs 3-6MB+ on its
   *  own, blowing the quota every single time regardless of what else is
   *  in the gallery. Classic Strip and 4-Grid stay under it only because
   *  they're smaller (≤1.44 megapixels). Saving a high-quality JPEG instead
   *  (same full resolution, just compressed — photographic content like a
   *  camera capture compresses 5-10x smaller than PNG) fixes this for every
   *  layout. This only affects the *gallery* copy: the Export screen's
   *  Download PNG/JPG buttons still read straight from el.exportCanvas at
   *  full lossless quality, untouched by this.
   *  JPEG has no alpha channel, so we composite onto white first — same
   *  approach already used by the Download JPG button below — otherwise
   *  the canvas's transparent rounded corners would turn black. */
  function canvasToGalleryDataUrl(canvas, quality = 0.86) {
    try {
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = '#FFFFFF';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, 0);
      return tmp.toDataURL('image/jpeg', quality);
    } catch (err) {
      // If JPEG encoding fails for any reason (extremely rare), fall back
      // to PNG straight off the source canvas rather than throwing and
      // silently aborting the whole save — large layouts will simply hit
      // the normal "storage is full" path instead of vanishing outright.
      console.error('[gallery] JPEG conversion failed, falling back to PNG:', err);
      try { return canvas.toDataURL('image/png'); } catch (err2) {
        console.error('[gallery] PNG fallback also failed:', err2);
        return null;
      }
    }
  }

  async function renderExportCanvas(layerSnapshots) {
    try {
      const layout = UI.getLayout(state.layoutId);
      const photos = state.filteredPhotos.slice(0, state.shotCount);

      const { w, h } = layout.size(state.shotCount);
      el.exportCanvas.width  = w;
      el.exportCanvas.height = h;
      el.exportCanvas.style.width  = Math.round(w * 0.5) + 'px';
      el.exportCanvas.style.height = Math.round(h * 0.5) + 'px';
      const ctx = el.exportCanvas.getContext('2d');
      layout.draw(ctx, photos, {
        frameColor: state.frameColor, textColor: state.textColor, banner: state.banner,
      });
      UI.applyFrameTheme(ctx, state.frameThemeId, w, h);

      if (layerSnapshots && layerSnapshots.length) {
        await UI.bakeSnapshots(ctx, layerSnapshots, decorateScaleFactor);
      }

      // Read final dimensions from canvas itself (w/h are block-scoped above).
      const finalW = el.exportCanvas.width;
      const finalH = el.exportCanvas.height;
      const galleryDataUrl = canvasToGalleryDataUrl(el.exportCanvas);
      if (!galleryDataUrl) {
        UI.showToast("Couldn't prepare this strip for the gallery. Try Download instead.");
        return;
      }

      saveToGallery(galleryDataUrl, {
        layoutId: state.layoutId,
        exportW: finalW,
        exportH: finalH,
      });
    } catch (err) {
      // Nothing in this function used to catch errors — a throw from
      // layout.draw(), bakeSnapshots(), or the canvas encode would abort
      // silently here with no toast and nothing in the gallery, while the
      // export screen still appeared to load fine. That's the "looks
      // finished but never shows up" symptom. Now it's always visible.
      console.error('[export] renderExportCanvas failed:', err);
      UI.showToast("Something went wrong saving this strip. Please try again.");
    }
  }

  function download(filename, dataUrl) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Smart save: uses Web Share API on mobile (iPhone/Android can save to photos directly),
  // falls back to a standard <a download> on desktop.
  el.downloadPngBtn.addEventListener('click', async () => {
    const filename = `snapcrate-${Date.now()}.png`;
    const dataUrl = el.exportCanvas.toDataURL('image/png');
    const blob = dataURLtoBlob(dataUrl);

    // Web Share API — available on iOS Safari 15+, Android Chrome, etc.
    // Lets the user pick "Save Image", AirDrop, etc. from the native share sheet.
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'image/png' })] })) {
      try {
        await navigator.share({
          files: [new File([blob], filename, { type: 'image/png' })],
          title: 'My Snapcrate photo strip',
        });
        return; // share sheet handled it — no need for anchor fallback
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled — do nothing
        // Any other error: fall through to the anchor download below
      }
    }
    // Desktop / browsers without Web Share: standard download
    download(filename, dataUrl);
    UI.showToast('Saved!');
  });

  // Stubs so any lingering references in old code don't throw
  if (el.downloadJpgBtn) el.downloadJpgBtn.addEventListener('click', () => {});
  if (el.downloadQrBtn)  el.downloadQrBtn.addEventListener('click', () => {});

  function dataURLtoBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function simpleCodeSvg() {
    let cells = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (Math.random() > 0.5 || (r < 2 && c < 2) || (r < 2 && c > 6) || (r > 6 && c < 2)) {
          cells += `<rect x="${c * 9}" y="${r * 9}" width="8" height="8" fill="#2B2138"/>`;
        }
      }
    }
    return `<svg width="100" height="100" viewBox="0 0 81 81">${cells}</svg>`;
  }

  el.newSessionBtn.addEventListener('click', () => {
    state.photos = [];
    state.filteredPhotos = [];
    state.banner = '';
    state.retakeSlot = null;
    el.qrBox.hidden = true;
    el.confettiLayer.innerHTML = '';
    goToScreen('layout');
  });

  /* ----------------------------------------------------------
     GALLERY
     Each item now stores: dataUrl, layoutId, exportW, exportH.
     Gallery thumbnails scale via CSS (object-fit: contain) so
     aspect ratio is always correct. The underlying dataUrl always
     holds full-resolution pixels.
  ---------------------------------------------------------- */
  const GALLERY_KEY = 'snapcrate_gallery_v2'; // bumped version to avoid stale schema

  function loadGallery() {
    try { return JSON.parse(localStorage.getItem(GALLERY_KEY)) || []; }
    catch (_) { return []; }
  }

  /**
   * Persist a gallery list to localStorage. Larger layouts (Film Strip,
   * 6-Grid, Magazine Cover) produce noticeably bigger PNG data URLs than
   * Classic Strip, so a gallery that's been fine for months can suddenly
   * blow past the localStorage quota (usually ~5MB) the moment one of
   * those is saved. Previously this failed silently (empty catch) — the
   * new photo would vanish with no error and no toast, exactly the "it
   * never shows up in the gallery" symptom.
   *
   * Now: if the write throws (QuotaExceededError or similar), we drop the
   * single oldest non-favorited item and retry, repeating until it either
   * fits or there's truly nothing left to drop. This way a successful
   * capture+save is never lost — at worst, an old unfavorited strip makes
   * room for the new one.
   *
   * Returns { ok, list } — ok is false only if even an empty/favorites-only
   * list still won't fit (e.g. localStorage disabled entirely).
   */
  function saveGalleryList(list, protectId) {
    let working = list.slice();
    for (let attempt = 0; attempt < working.length + 1; attempt++) {
      try {
        localStorage.setItem(GALLERY_KEY, JSON.stringify(working));
        return { ok: true, list: working };
      } catch (err) {
        console.warn(`[gallery] write failed (attempt ${attempt}, ${working.length} items, ${JSON.stringify(working).length} bytes):`, err && err.name, err && err.message);
        // Find the oldest evictable item to make room: skip favorites AND
        // skip protectId — the strip actually being saved right now. Without
        // this guard, a big layout (Polaroid/Film Strip/6-Grid/Magazine)
        // could end up evicting *itself* during this same loop, and the
        // caller would have no way to tell — every remaining write attempt
        // afterward succeeds (the list is now smaller), so it looks like a
        // normal "made room by trimming old strips" success even though the
        // strip the user just made is the one that got dropped. Gallery is
        // stored newest-first (via unshift), so the oldest evictable match
        // is the last one in array order.
        let evictIdx = -1;
        for (let i = working.length - 1; i >= 0; i--) {
          if (!working[i].favorite && working[i].id !== protectId) { evictIdx = i; break; }
        }
        if (evictIdx === -1) {
          // Nothing left to evict without touching favorites or the new
          // strip itself — genuinely out of room.
          return { ok: false, list: working };
        }
        working.splice(evictIdx, 1);
      }
    }
    return { ok: false, list: working };
  }

  /**
   * @param {string} dataUrl   - PNG data URL from the full-res export canvas
   * @param {object} meta      - { layoutId, exportW, exportH }
   */
  function saveToGallery(dataUrl, meta = {}) {
    const list = loadGallery();
    const newId = 'g_' + Date.now();
    list.unshift({
      id: newId,
      dataUrl,
      layoutId: meta.layoutId || 'freeStrip',
      exportW: meta.exportW || 1200,
      exportH: meta.exportH || 1800,
      favorite: false,
      createdAt: Date.now(),
    });
    const trimmed = list.slice(0, 40); // keep last 40
    const result = saveGalleryList(trimmed, newId);
    renderGalleryBadge();
    // Don't trust result.ok alone — confirm the strip we actually came here
    // to save is still in the persisted list, not just that *some* write
    // succeeded (an eviction loop can "succeed" after dropping the new item).
    const savedOk = result.ok && result.list.some(item => item.id === newId);
    if (!savedOk) {
      UI.showToast("Couldn't save to gallery — storage is full. Try downloading it instead.");
    } else if (result.list.length < trimmed.length) {
      UI.showToast('Saved to gallery (older strips were removed to make room)');
    }
    return savedOk;
  }

  function renderGalleryBadge() {
    const count = loadGallery().length;
    el.galleryBadge.hidden = count === 0;
    el.galleryBadge.textContent = count > 99 ? '99+' : count;
  }

  let galleryFilter = 'all';

  function renderGalleryGrid() {
    const list = loadGallery().filter(item => galleryFilter === 'all' || item.favorite);
    el.galleryGrid.innerHTML = '';
    if (!list.length) {
      el.galleryEmpty.hidden = false;
      el.galleryGrid.appendChild(el.galleryEmpty);
      return;
    }
    el.galleryEmpty.hidden = true;
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'gallery-card';

      // Compute aspect ratio — default to portrait strip if metadata missing
      const exportW = item.exportW || 1200;
      const exportH = item.exportH || 1800;
      const aspectRatio = exportW / exportH;

      // Apply aspect-ratio so card naturally fits its layout shape
      card.style.setProperty('--card-aspect', aspectRatio.toFixed(4));

      // Human-readable layout name used only for alt text (not shown in UI)
      const layout = UI.getLayout(item.layoutId || 'strip');
      const layoutLabel = layout ? layout.name : '';

      const favIcon = item.favorite
        ? `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zm-10 6.93l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.81 4.38.38-3.32 2.88 1 4.28L12 16.17z" fill="currentColor"/></svg>`;

      card.innerHTML = `
        <div class="gallery-card-img-wrap">
          <img src="${item.dataUrl}" alt="${layoutLabel} photobooth strip" loading="lazy">
        </div>
        <div class="gallery-card-actions">
          <button class="fav ${item.favorite ? 'active' : ''}" data-action="fav" title="Favorite">${favIcon}</button>
          <button data-action="download" title="Download"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/></svg></button>
          <button data-action="delete" title="Delete"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg></button>
        </div>
      `;
      card.querySelector('[data-action="fav"]').addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(item.id); });
      card.querySelector('[data-action="download"]').addEventListener('click', (e) => { e.stopPropagation(); download(`snapcrate-${item.layoutId || 'strip'}-${item.id}.jpg`, item.dataUrl); });
      card.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deletePhoto(item.id); });
      el.galleryGrid.appendChild(card);
    });
  }

  function toggleFavorite(id) {
    const list = loadGallery();
    const item = list.find(i => i.id === id);
    if (item) item.favorite = !item.favorite;
    saveGalleryList(list);
    renderGalleryGrid();
  }

  function deletePhoto(id) {
    const list = loadGallery().filter(i => i.id !== id);
    saveGalleryList(list);
    renderGalleryGrid();
    renderGalleryBadge();
  }

  function openGallery() {
    renderGalleryGrid();
    el.galleryBackdrop.hidden = false;
    el.galleryDrawer.classList.add('open');
    el.galleryDrawer.setAttribute('aria-hidden', 'false');
  }
  function closeGallery() {
    el.galleryDrawer.classList.remove('open');
    el.galleryDrawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { el.galleryBackdrop.hidden = true; }, 300);
  }

  el.galleryBtn.addEventListener('click', openGallery);
  el.closeGalleryBtn.addEventListener('click', closeGallery);
  el.galleryBackdrop.addEventListener('click', closeGallery);
  document.querySelectorAll('[data-galleryfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      galleryFilter = btn.dataset.galleryfilter;
      document.querySelectorAll('[data-galleryfilter]').forEach(b => b.classList.toggle('active', b === btn));
      renderGalleryGrid();
    });
  });

  /* ----------------------------------------------------------
     THEME + SOUND
  ---------------------------------------------------------- */
  const THEME_CYCLE_MS = 10000;
  let themeCycleTimer = null;

  function applyTheme(idx, { toast = false } = {}) {
    state.themeIdx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    document.body.dataset.theme = THEMES[state.themeIdx];
    if (toast) UI.showToast(`Theme: ${THEMES[state.themeIdx]}`);
    // Theme picks become the new base palette the ambient system gently
    // drifts around — keeps auto-variation "in family."
    if (window.AmbientTheme) AmbientTheme.setBaseTheme(THEMES[state.themeIdx]);
  }

  function startThemeCycle() {
    stopThemeCycle();
    themeCycleTimer = setInterval(() => {
      applyTheme(state.themeIdx + 1);
    }, THEME_CYCLE_MS);
  }

  function stopThemeCycle() {
    if (themeCycleTimer) { clearInterval(themeCycleTimer); themeCycleTimer = null; }
  }

  el.themeBtn.addEventListener('click', () => {
    applyTheme(state.themeIdx + 1, { toast: true });
    // Restart the countdown so an auto-switch doesn't fire right after a manual pick.
    startThemeCycle();
  });

  let musicReady = false;
  let musicFailed = false;

  function initMusic() {
    if (!el.bgMusic) return;
    el.bgMusic.src = MUSIC_SRC;
    el.bgMusic.volume = MUSIC_VOLUME;
    el.bgMusic.loop = true;
    el.bgMusic.addEventListener('canplaythrough', () => {
      musicReady = true;
      if (state.soundOn) {
        el.bgMusic.play().catch(() => {
          const onFirstGesture = () => {
            if (state.soundOn && !musicFailed) el.bgMusic.play().catch(() => {});
            document.removeEventListener('pointerdown', onFirstGesture, true);
            document.removeEventListener('keydown', onFirstGesture, true);
          };
          document.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true });
          document.addEventListener('keydown', onFirstGesture, { once: true, capture: true });
        });
      }
    }, { once: true });
    el.bgMusic.addEventListener('error', () => {
      musicFailed = true;
      state.soundOn = false;
      el.soundBtn.classList.add('disabled');
      el.soundBtn.title = 'Music file not found — add one at ' + MUSIC_SRC;
    });
    el.bgMusic.load();
  }

  function setMusicPlaying(playing) {
    if (!el.bgMusic || musicFailed) return;
    if (playing) el.bgMusic.play().catch(() => {});
    else el.bgMusic.pause();
  }

  el.soundBtn.addEventListener('click', () => {
    if (musicFailed) { UI.showToast('No music file found yet'); return; }
    state.soundOn = !state.soundOn;
    setMusicPlaying(state.soundOn);
    UI.showToast(state.soundOn ? 'Sound on' : 'Sound off');
    el.soundBtn.classList.toggle('muted', !state.soundOn);
  });

  /* ----------------------------------------------------------
     AUDIO LIFECYCLE — stop music when the user isn't actually
     looking at the page, so it never plays "ghost" in a
     background tab or after navigating away/closing/refreshing.
     - tab hidden (switch tab, minimize)  → pause only (resumable)
     - page actually being left (back/forward cache eviction,
       close, refresh, navigate away)     → pause AND reset to 0
     state.soundOn (the user's mute preference) is never changed
     by any of this — only playback position/state is affected,
     so the sound toggle's own label/icon stays accurate.
  ---------------------------------------------------------- */
  function stopMusicHard() {
    if (!el.bgMusic) return; // safe no-op if the audio element is missing
    try {
      el.bgMusic.pause();
      el.bgMusic.currentTime = 0;
    } catch (_) { /* some mobile browsers throw if media isn't loaded yet — harmless */ }
  }

  function pauseMusicSoft() {
    if (!el.bgMusic) return;
    try { el.bgMusic.pause(); } catch (_) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (!el.bgMusic) return;
    if (document.visibilityState === 'hidden') {
      pauseMusicSoft();
    } else if (document.visibilityState === 'visible') {
      // Only resume if the user actually had sound on and music isn't
      // broken — never override their mute choice.
      if (state.soundOn && !musicFailed) {
        el.bgMusic.play().catch(() => {}); // autoplay can still be blocked; fail silently
      }
    }
  });

  // pagehide fires reliably on tab close, refresh, back/forward navigation,
  // and is the recommended replacement for unload on mobile browsers
  // (iOS Safari in particular never fires 'unload' consistently).
  window.addEventListener('pagehide', stopMusicHard);

  // beforeunload as a belt-and-suspenders fallback for older desktop
  // browsers that handle pagehide inconsistently. Kept lightweight —
  // no confirmation dialogs, just the same hard stop.
  window.addEventListener('beforeunload', stopMusicHard);

  /* ----------------------------------------------------------
     FULLSCREEN CAMERA MODE
  ---------------------------------------------------------- */

  function enterFullscreenCamera() {
    if (cfsActive) return;
    cfsActive = true;
    document.body.classList.add('camera-fullscreen');

    // Move the video element into the fullscreen overlay's video wrap
    el.cfsVideoWrap.insertBefore(el.cameraVideo, el.cfsFlash);

    updateCfsProgressDots();
    updateCfsShotsThumbnail();
    syncCfsTimerPills();
    renderCfsFilterTray();
    el.cfsFilterTray.classList.add('open');

    el.cfsOverlay.style.display = 'flex';
  }

  function exitFullscreenCamera() {
    if (!cfsActive) return;
    cfsActive = false;
    document.body.classList.remove('camera-fullscreen');

    // Move video back to the original camera-stage
    el.cameraStage.insertBefore(el.cameraVideo, el.cameraPermission);

    el.cfsShotsCard.classList.remove('open');
    el.cfsOverlay.style.display = 'none';
  }

  function updateCfsProgressDots() {
    el.cfsProgressDots.innerHTML = '';
    for (let i = 0; i < state.shotCount; i++) {
      const dot = document.createElement('div');
      const hasPic = !!state.filteredPhotos[i];
      const isNext = i === state.photos.filter(Boolean).length && !hasPic;
      dot.className = 'cfs-dot' + (hasPic ? ' filled' : '') + (isNext ? ' next-dot' : '');
      el.cfsProgressDots.appendChild(dot);
    }
  }

  function updateCfsShotsThumbnail() {
    const lastPhoto = [...state.filteredPhotos].reverse().find(Boolean);
    el.cfsShotsThumBtn.innerHTML = '';
    if (lastPhoto) {
      const img = document.createElement('img');
      img.src = lastPhoto.toDataURL('image/jpeg', 0.7);
      el.cfsShotsThumBtn.appendChild(img);
    } else {
      el.cfsShotsThumBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" opacity=".4"/><circle cx="8.5" cy="10.5" r="1.6" fill="currentColor"/><path d="m4 17 5-5 4 4 3-3 4 4v1H4Z" fill="currentColor"/></svg>`;
    }
    const badge = document.createElement('div');
    const count = state.photos.filter(Boolean).length;
    badge.className = 'cfs-shots-count-badge';
    badge.textContent = `${count}/${state.shotCount}`;
    el.cfsShotsThumBtn.appendChild(badge);
  }

  function syncCfsTimerPills() {
    el.cfsTimerPills.querySelectorAll('.cfs-timer-pill').forEach(p => {
      p.classList.toggle('active', parseInt(p.dataset.timer, 10) === state.timerSeconds);
    });
  }

  function renderCfsFilterTray() {
    el.cfsFilterTray.innerHTML = '';
    Filters.LIST.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'cfs-filter-chip' + (f.id === state.filterId ? ' active' : '');
      chip.innerHTML = `<div class="swatch" style="background:${filterSwatchColor(f.id)};width:52px;height:52px;border-radius:12px;border:2px solid rgba(255,255,255,.3);"></div><span>${f.label}</span>`;
      chip.addEventListener('click', () => {
        state.filterId = f.id;
        applyLiveFilterClass();
        renderCfsFilterTray();
    el.cfsFilterTray.classList.add('open');
        renderFilterStrip();
      });
      el.cfsFilterTray.appendChild(chip);
    });
  }

  function renderCfsShotsCard() {
    el.cfsShotsGrid.innerHTML = '';
    for (let i = 0; i < state.shotCount; i++) {
      const thumb = document.createElement('div');
      const photo = state.filteredPhotos[i];
      thumb.className = 'cfs-mini-thumb' + (photo ? '' : ' empty');
      if (photo) {
        const img = document.createElement('img');
        img.src = photo.toDataURL('image/jpeg', 0.75);
        thumb.appendChild(img);
        const retakeBtn = document.createElement('button');
        retakeBtn.className = 'cfs-mini-retake';
        retakeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        retakeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startRetake(i);
          el.cfsShotsCard.classList.remove('open');
        });
        thumb.appendChild(retakeBtn);
      } else {
        thumb.textContent = i + 1;
      }
      el.cfsShotsGrid.appendChild(thumb);
    }
    const count = state.photos.filter(Boolean).length;
    el.cfsShotsCount.textContent = `${count}/${state.shotCount}`;
    el.cfsProceedBtn.disabled = count < state.shotCount;
  }

  // CFS flash effect
  function cfsFlashEffect() {
    if (!state.flashOn) return;
    el.cfsFlash.classList.remove('fire');
    void el.cfsFlash.offsetWidth;
    el.cfsFlash.classList.add('fire');
    setTimeout(() => el.cfsFlash.classList.remove('fire'), 250);
    // Also flash the border ring of the original stage (visible in normal mode)
    el.cameraStage.classList.add('flash-ring');
    setTimeout(() => el.cameraStage.classList.remove('flash-ring'), 220);
  }

  // CFS countdown (reuses the same promise shape as runCountdown)
  function runCfsCountdown(seconds) {
    return new Promise((resolve) => {
      if (!seconds || seconds <= 0) return resolve();
      el.cfsCountdown.hidden = false;
      let n = seconds;
      el.cfsCountdownNum.textContent = n;
      el.cfsCountdownNum.style.animation = 'none';
      void el.cfsCountdownNum.offsetWidth;
      el.cfsCountdownNum.style.animation = '';
      const tick = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(tick);
          el.cfsCountdown.hidden = true;
          resolve();
        } else {
          el.cfsCountdownNum.textContent = n;
          el.cfsCountdownNum.style.animation = 'none';
          void el.cfsCountdownNum.offsetWidth;
          el.cfsCountdownNum.style.animation = '';
        }
      }, 1000);
    });
  }

  // Shutter in fullscreen mode
  let cfsBusy = false;
  async function cfsCapture() {
    if (cfsBusy) return;
    if (state.retakeSlot === null && state.photos.filter(Boolean).length >= state.shotCount) return;
    cfsBusy = true;
    el.cfsShutterBtn.disabled = true;

    await runCfsCountdown(state.timerSeconds);
    // Fire flash (both cfsFlash and border ring)
    cfsFlashEffect();
    flashEffect(); // keeps the original flash in sync

    const raw = Camera.grabFrame();
    const filtered = Filters.apply(state.filterId, raw);

    if (state.retakeSlot !== null) {
      state.photos[state.retakeSlot] = raw;
      state.filteredPhotos[state.retakeSlot] = filtered;
      UI.showToast(`Photo ${state.retakeSlot + 1} replaced!`);
      state.retakeSlot = null;
    } else {
      state.photos.push(raw);
      state.filteredPhotos.push(filtered);
    }

    updateShotsPanel();
    updateCfsProgressDots();
    updateCfsShotsThumbnail();
    renderCfsShotsCard();

    el.cfsShutterBtn.disabled = false;
    cfsBusy = false;

    const count = state.photos.filter(Boolean).length;
    if (count >= state.shotCount) {
      // Auto-open the shots card when all are done
      el.cfsShotsCard.classList.add('open');
      renderCfsShotsCard();
    }
  }

  // Wire up fullscreen camera controls
  el.enterFullscreenBtn.addEventListener('click', enterFullscreenCamera);
  el.cfsExitBtn.addEventListener('click', exitFullscreenCamera);

  el.cfsFlipBtn.addEventListener('click', async () => {
    const result = await Camera.flip();
    if (!result.ok) UI.showToast("Couldn't switch camera");
    applyLiveFilterClass();
  });

  el.cfsTimerPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.cfs-timer-pill');
    if (!btn) return;
    state.timerSeconds = parseInt(btn.dataset.timer, 10);
    syncCfsTimerPills();
    // Also sync the normal timer pills
    el.timerPills.querySelectorAll('.pill-btn').forEach(p => p.classList.toggle('active', parseInt(p.dataset.timer, 10) === state.timerSeconds));
  });

  el.cfsShutterBtn.addEventListener('click', cfsCapture);

  el.cfsShotsThumBtn.addEventListener('click', () => {
    el.cfsShotsCard.classList.toggle('open');
    if (el.cfsShotsCard.classList.contains('open')) renderCfsShotsCard();
  });
  el.cfsShotsCardClose.addEventListener('click', () => {
    el.cfsShotsCard.classList.remove('open');
  });

  el.cfsProceedBtn.addEventListener('click', async () => {
    exitFullscreenCamera();
    Camera.stop();
    state.retakeSlot = null;

    // Same clamp as the normal toDecorateBtn path
    state.filteredPhotos = state.filteredPhotos.slice(0, state.shotCount);
    state.photos         = state.photos.slice(0, state.shotCount);
    while (state.filteredPhotos.length < state.shotCount) state.filteredPhotos.push(null);
    while (state.photos.length         < state.shotCount) state.photos.push(null);

    goToScreen('decorate');
    renderDecorateStage();
  });

  // Flash border ring on normal capture too (even outside fullscreen)
  // patch the original flashEffect to also ring the border
  const _origFlashEffect = flashEffect;

  /* ----------------------------------------------------------
     DECORATE FULLSCREEN TOGGLE
  ---------------------------------------------------------- */

  el.decorateFullscreenBtn.addEventListener('click', () => {
    decorateFs = !decorateFs;
    document.body.classList.toggle('decorate-fullscreen', decorateFs);
    // Update icon
    const icon = decorateFs
      ? `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    el.decorateFullscreenBtn.innerHTML = icon;
  });

  /* ----------------------------------------------------------
     INIT
  ---------------------------------------------------------- */
  function init() {
    UI.renderBgDecor(el.bgDecor);
    initLayoutPicker();
    renderGalleryBadge();
    initMusic();
    UI.loadStickerManifest();
    goToScreen('layout');
    if (window.AmbientTheme) AmbientTheme.init(THEMES[state.themeIdx]);
    startThemeCycle();
    window.addEventListener('beforeunload', () => { Camera.stop(); exitFullscreenCamera(); stopThemeCycle(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();