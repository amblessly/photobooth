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
    layoutId: 'strip',
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

  const $ = (id) => document.getElementById(id);
  const el = {
    stepsBar: $('stepsBar'),
    layoutGrid: $('layoutGrid'),
    shotCountSelect: $('shotCountSelect'),
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
    flashToggleBtn: $('flashToggleBtn'),
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
     SCREEN 1: LAYOUT PICKER
  ---------------------------------------------------------- */
  function renderLayoutGrid() {
    el.layoutGrid.innerHTML = '';
    UI.listLayouts().forEach(layout => {
      const card = document.createElement('div');
      card.className = 'layout-card' + (layout.id === state.layoutId ? ' selected' : '');
      card.dataset.layout = layout.id;
      card.innerHTML = `
        <div class="thumb">${layoutThumbSvg(layout.id)}</div>
        <div class="name">${layout.name}</div>
        <div class="desc">${layout.desc}</div>
      `;
      card.addEventListener('click', () => {
        state.layoutId = layout.id;
        const def = UI.getLayout(layout.id);
        state.shotCount = def.defaultShots;
        renderLayoutGrid();
        populateShotCountSelect();
      });
      el.layoutGrid.appendChild(card);
    });
  }

  function layoutThumbSvg(id) {
    const stroke = '#2B2138';
    if (id === 'strip') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="14" y="4" width="36" height="56" rx="6" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
        <rect x="19" y="9" width="26" height="14" rx="2" fill="#FFD9CF"/><rect x="19" y="25" width="26" height="14" rx="2" fill="#D7F3E8"/><rect x="19" y="41" width="26" height="12" rx="2" fill="#DCEBFC"/></svg>`;
    }
    if (id === 'grid') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
        <rect x="11" y="11" width="20" height="20" rx="3" fill="#FFD9CF"/><rect x="33" y="11" width="20" height="20" rx="3" fill="#D7F3E8"/><rect x="11" y="33" width="20" height="20" rx="3" fill="#DCEBFC"/><rect x="33" y="33" width="20" height="20" rx="3" fill="#FFEFC4"/></svg>`;
    }
    if (id === 'polaroid') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="10" y="6" width="44" height="50" rx="3" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
        <rect x="14" y="10" width="36" height="32" rx="2" fill="#FFD9CF"/></svg>`;
    }
    if (id === 'filmstrip') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
        <rect x="12" y="16" width="18" height="18" rx="2" fill="#FFD9CF"/><rect x="34" y="16" width="18" height="18" rx="2" fill="#D7F3E8"/><rect x="12" y="38" width="18" height="18" rx="2" fill="#DCEBFC"/><rect x="34" y="38" width="18" height="18" rx="2" fill="#FFEFC4"/>
        <circle cx="14" cy="9" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="24" cy="9" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="34" cy="9" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="44" cy="9" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="54" cy="9" r="1.6" fill="${stroke}" opacity=".35"/>
        <circle cx="14" cy="59" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="24" cy="59" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="34" cy="59" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="44" cy="59" r="1.6" fill="${stroke}" opacity=".35"/><circle cx="54" cy="59" r="1.6" fill="${stroke}" opacity=".35"/></svg>`;
    }
    if (id === 'grid6') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="6" y="4" width="52" height="56" rx="6" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
        <rect x="11" y="9" width="20" height="14" rx="2" fill="#FFD9CF"/><rect x="33" y="9" width="20" height="14" rx="2" fill="#D7F3E8"/>
        <rect x="11" y="25" width="20" height="14" rx="2" fill="#DCEBFC"/><rect x="33" y="25" width="20" height="14" rx="2" fill="#FFEFC4"/>
        <rect x="11" y="41" width="20" height="14" rx="2" fill="#FFD9CF"/><rect x="33" y="41" width="20" height="14" rx="2" fill="#D7F3E8"/></svg>`;
    }
    if (id === 'magazine') {
      return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="8" y="2" width="48" height="60" rx="4" fill="#FFD9CF" stroke="${stroke}" stroke-width="2"/>
        <rect x="8" y="2" width="48" height="14" rx="2" fill="${stroke}" opacity=".75"/><rect x="8" y="48" width="48" height="14" rx="2" fill="${stroke}" opacity=".5"/>
        <rect x="14" y="6" width="36" height="6" rx="1" fill="#FFF6EC"/><rect x="14" y="52" width="28" height="5" rx="1" fill="#FFF6EC"/></svg>`;
    }
    return `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="10" y="6" width="44" height="50" rx="3" fill="#FFF6EC" stroke="${stroke}" stroke-width="2"/>
      <rect x="14" y="10" width="36" height="32" rx="2" fill="#FFD9CF"/></svg>`;
  }

  function populateShotCountSelect() {
    const def = UI.getLayout(state.layoutId);
    el.shotCountSelect.innerHTML = '';
    for (let n = def.minShots; n <= def.maxShots; n++) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = `${n} shot${n > 1 ? 's' : ''}`;
      if (n === state.shotCount) opt.selected = true;
      el.shotCountSelect.appendChild(opt);
    }
    el.shotCountSelect.disabled = def.minShots === def.maxShots;
  }

  el.shotCountSelect.addEventListener('change', (e) => {
    state.shotCount = parseInt(e.target.value, 10);
  });

  el.toCaptureBtn.addEventListener('click', async () => {
    state.photos = [];
    state.filteredPhotos = [];
    state.retakeSlot = null;
    updateShotsPanel();
    applyCameraStageAspect();
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

  el.filterToggleBtn.addEventListener('click', () => {
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
    showPosePrompt();
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

  el.flashToggleBtn.addEventListener('click', () => {
    state.flashOn = !state.flashOn;
    updateFlashToggleUI();
  });

  function updateFlashToggleUI() {
    el.flashToggleBtn.classList.toggle('active', state.flashOn);
    el.flashToggleBtn.setAttribute('aria-pressed', String(state.flashOn));
    el.flashToggleBtn.title = state.flashOn ? 'Flash on' : 'Flash off';
  }
  updateFlashToggleUI();

  function showPosePrompt() {
    if (Math.random() > 0.55) {
      el.poseText.textContent = UI.randomPose();
      el.poseOverlay.hidden = false;
      setTimeout(() => { el.poseOverlay.hidden = true; }, 2200);
    }
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
    if (captured < state.shotCount && state.retakeSlot === null) {
      showPosePrompt();
    } else if (state.retakeSlot === null && captured >= state.shotCount) {
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
  }

  el.retakeLastBtn.addEventListener('click', () => {
    const lastIdx = state.photos.reduce((last, p, i) => p ? i : last, -1);
    if (lastIdx >= 0) startRetake(lastIdx);
  });

  el.restartSessionBtn.addEventListener('click', () => {
    state.photos = [];
    state.filteredPhotos = [];
    state.retakeSlot = null;
    updateShotsPanel();
    UI.showToast('Session restarted');
  });

  el.toDecorateBtn.addEventListener('click', () => {
    Camera.stop();
    state.retakeSlot = null;
    goToScreen('decorate');
    renderDecorateStage();
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
    layout.draw(ctx, state.filteredPhotos, {
      frameColor: state.frameColor, textColor: state.textColor, banner: state.banner,
    });
    UI.applyFrameTheme(ctx, state.frameThemeId, w, h);

    el.decorateStage.appendChild(decorateBaseCanvas);

    const isMobile = window.innerWidth <= 880;
    const maxW = isMobile
      ? Math.min(w, window.innerWidth - 32)
      : Math.min(480, window.innerWidth - 64);
    const displayScale = Math.min(1, maxW / w);
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
    layout.draw(ctx, state.filteredPhotos, {
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
      const { w, h } = layout.size(state.shotCount);
      el.exportCanvas.width = w;
      el.exportCanvas.height = h;
      const ctx = el.exportCanvas.getContext('2d');
      layout.draw(ctx, state.filteredPhotos, {
        frameColor: state.frameColor, textColor: state.textColor, banner: state.banner,
      });
      UI.applyFrameTheme(ctx, state.frameThemeId, w, h);

      if (layerSnapshots && layerSnapshots.length) {
        await UI.bakeSnapshots(ctx, layerSnapshots, decorateScaleFactor);
      }

      const galleryDataUrl = canvasToGalleryDataUrl(el.exportCanvas);
      if (!galleryDataUrl) {
        UI.showToast("Couldn't prepare this strip for the gallery. Try Download instead.");
        return;
      }

      saveToGallery(galleryDataUrl, {
        layoutId: state.layoutId,
        exportW: w,
        exportH: h,
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

  el.downloadPngBtn.addEventListener('click', () => {
    // dataUrl already comes from the full-res exportCanvas — no re-encoding needed
    download(`snapcrate-${Date.now()}.png`, el.exportCanvas.toDataURL('image/png'));
    UI.showToast('PNG saved');
  });

  el.downloadJpgBtn.addEventListener('click', () => {
    // Composite onto a white-background canvas at full resolution
    const tmp = document.createElement('canvas');
    tmp.width = el.exportCanvas.width;
    tmp.height = el.exportCanvas.height;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#FFFFFF';
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(el.exportCanvas, 0, 0);
    download(`snapcrate-${Date.now()}.jpg`, tmp.toDataURL('image/jpeg', 0.92));
    UI.showToast('JPG saved');
  });

  el.downloadQrBtn.addEventListener('click', () => {
    const dataUrl = el.exportCanvas.toDataURL('image/png');
    const blob = dataURLtoBlob(dataUrl);
    const blobUrl = URL.createObjectURL(blob);
    el.qrBox.hidden = false;
    el.qrBox.innerHTML = `
      ${simpleCodeSvg(blobUrl)}
      <p>Scannable QR codes need a server to host the image online.<br>For now, tap below to open your strip in a new tab on this device.</p>
      <button class="btn btn-secondary" type="button" id="openBlobBtn">Open strip link</button>
    `;
    document.getElementById('openBlobBtn').addEventListener('click', () => window.open(blobUrl, '_blank'));
  });

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
      layoutId: meta.layoutId || 'strip',
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
  el.themeBtn.addEventListener('click', () => {
    state.themeIdx = (state.themeIdx + 1) % THEMES.length;
    document.body.dataset.theme = THEMES[state.themeIdx];
    UI.showToast(`Theme: ${THEMES[state.themeIdx]}`);
    // Manual theme picks become the new base palette the ambient
    // system gently drifts around — keeps auto-variation "in family."
    if (window.AmbientTheme) AmbientTheme.setBaseTheme(THEMES[state.themeIdx]);
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
     INIT
  ---------------------------------------------------------- */
  function init() {
    UI.renderBgDecor(el.bgDecor);
    renderLayoutGrid();
    populateShotCountSelect();
    renderGalleryBadge();
    initMusic();
    UI.loadStickerManifest();
    goToScreen('layout');
    if (window.AmbientTheme) AmbientTheme.init(THEMES[state.themeIdx]);
    window.addEventListener('beforeunload', () => Camera.stop());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
