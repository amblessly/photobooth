/* ============================================================
   COVERFLOW.JS
   Apple "Cover Flow" style carousel for the layout-picker screen.

   Each card renders its layout's own draw() routine onto a small
   offscreen canvas (placeholder photo slots) — same rounded
   corners, sprockets, banner area as the real export.

   Talks to the rest of the app only through init()'s onChange
   callback, which fires with the centered layout object whenever
   the selection changes (drag, click, keyboard, wheel, or
   autoplay). Does not know about app state, camera, or export.
   ============================================================ */

const CoverFlow = (() => {

  const AUTOPLAY_MS = 4000;
  const IDLE_RESUME_MS = 5200;
  const DRAG_COMMIT_PCT = 16; // % of stage width to drag before committing a step
  const PREVIEW_MAX_PX = 260; // longest edge of the canvas-rendered fallback preview

  let layouts = [];
  let index = 0;
  let onChangeCb = null;

  let stageEl, trackEl, dotsEl, infoNameEl, infoDescEl, infoShotsEl, prevBtn, nextBtn;
  let cards = [];

  let autoplayTimer = null;
  let idleTimer = null;

  let dragging = false;
  let dragStartX = 0;
  let dragOffsetPct = 0;
  let pointerId = null;

  let wheelCooldown = false;
  let resizeRaf = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isCompactViewport() {
    return window.innerWidth <= 560;
  }

  /* ---- render a layout into a small canvas ---- */
  function renderPreviewCanvas(layout) {
    const shotCount = layout.defaultShots;
    let dims;
    try {
      dims = layout.size(shotCount);
    } catch (_) {
      dims = { w: layout.exportW || 400, h: layout.exportH || 500 };
    }
    const longEdge = Math.max(dims.w, dims.h);
    const scale = PREVIEW_MAX_PX / longEdge;

    const canvas = document.createElement('canvas');
    canvas.className = 'cf-card-canvas';
    canvas.width = Math.max(1, Math.round(dims.w * scale));
    canvas.height = Math.max(1, Math.round(dims.h * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    try {
      layout.draw(ctx, new Array(shotCount).fill(null), {
        frameColor: '#FFFFFF',
        textColor: '#2B2138',
        banner: '',
      });
    } catch (_) {
      // If a layout's draw() ever throws on empty photos, fail quiet —
      // an empty card is better than a broken carousel.
    }
    return canvas;
  }


  /* ---- build the DOM for every card once ---- */
  function buildCards() {
    trackEl.innerHTML = '';
    cards = layouts.map((layout, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cf-card';
      card.setAttribute('role', 'option');
      card.setAttribute('aria-label', layout.name);
      card.dataset.index = String(i);

      const preview = document.createElement('div');
      preview.className = 'cf-card-preview';

      preview.appendChild(renderPreviewCanvas(layout));

      card.appendChild(preview);

      card.addEventListener('click', () => {
        if (dragging) return;
        userInteracted();
        if (i !== index) goTo(i);
      });

      trackEl.appendChild(card);
      return card;
    });
    buildDots();
    positionCards();
  }

  function buildDots() {
    dotsEl.innerHTML = '';
    layouts.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'cf-dot' + (i === index ? ' active' : '');
      dotsEl.appendChild(dot);
    });
  }

  function updateDotsActive() {
    dotsEl.querySelectorAll('.cf-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function updateInfo() {
    const layout = layouts[index];
    if (!layout) return;
    infoNameEl.textContent = layout.name;
    infoDescEl.textContent = layout.desc;
    const n = layout.defaultShots;
    infoShotsEl.innerHTML = `<svg class="cf-shots-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7" stroke-linejoin="round"/></svg> ${n} Photo${n > 1 ? 's' : ''}`;
    const infoEl = infoNameEl.closest('.cf-info');
    if (infoEl) {
      infoEl.classList.remove('cf-info-anim');
      // restart the animation even if it's already mid-flight
      void infoEl.offsetWidth;
      infoEl.classList.add('cf-info-anim');
    }
  }

  /* ---- position every card relative to the centered index ---- */
  function positionCards() {
    const n = cards.length;
    if (!n) return;
    const rotateDeg = isCompactViewport() ? 22 : 35;
    const reduced = prefersReducedMotion();

    cards.forEach((card, i) => {
      let d = i - index;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const abs = Math.abs(d);
      const sign = Math.sign(d);

      let translateX, rotateY, scale, opacity, z;
      if (d === 0) {
        translateX = dragOffsetPct;
        rotateY = reduced ? 0 : -dragOffsetPct * 0.4;
        scale = 1;
        opacity = 1;
        z = 30;
      } else if (abs === 1) {
        translateX = sign * 78 + dragOffsetPct;
        rotateY = sign * -rotateDeg;
        scale = 0.85;
        opacity = 0.5;
        z = 20;
      } else if (abs === 2) {
        translateX = sign * 132 + dragOffsetPct * 0.6;
        rotateY = sign * -rotateDeg;
        scale = 0.72;
        opacity = 0.22;
        z = 10;
      } else {
        translateX = sign * 170;
        rotateY = sign * -rotateDeg;
        scale = 0.6;
        opacity = 0;
        z = 0;
      }

      card.style.transform =
        `translate3d(${translateX}%, 0, 0) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(z);
      card.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      card.classList.toggle('cf-card-active', d === 0);
      card.setAttribute('aria-selected', d === 0 ? 'true' : 'false');
    });
  }

  function goTo(newIndex) {
    const n = layouts.length;
    if (!n) return;
    index = ((newIndex % n) + n) % n;
    dragOffsetPct = 0;
    positionCards();
    updateDotsActive();
    updateInfo();
    if (onChangeCb) onChangeCb(layouts[index]);
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  /* ---- autoplay ---- */
  function startAutoplay() {
    clearTimeout(autoplayTimer);
    if (prefersReducedMotion() || layouts.length < 2) return;
    autoplayTimer = setTimeout(() => {
      next();
      startAutoplay();
    }, AUTOPLAY_MS);
  }

  function userInteracted() {
    clearTimeout(autoplayTimer);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startAutoplay, IDLE_RESUME_MS);
  }

  /* ---- pointer drag (mouse + touch, unified) ---- */
  function onPointerDown(e) {
    if (layouts.length < 2) return;
    dragging = true;
    pointerId = e.pointerId;
    dragStartX = e.clientX;
    dragOffsetPct = 0;
    stageEl.classList.add('cf-dragging');
    userInteracted();
    try { stageEl.setPointerCapture(pointerId); } catch (_) { /* noop */ }
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const deltaPx = e.clientX - dragStartX;
    const stageW = stageEl.clientWidth || 1;
    dragOffsetPct = (deltaPx / stageW) * 140;
    positionCards();
  }

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    stageEl.classList.remove('cf-dragging');
    const pct = dragOffsetPct;
    dragOffsetPct = 0;
    if (pct <= -DRAG_COMMIT_PCT) {
      goTo(index + 1);
    } else if (pct >= DRAG_COMMIT_PCT) {
      goTo(index - 1);
    } else {
      positionCards(); // snap back
    }
  }

  /* ---- wheel (trackpad horizontal scroll / mouse wheel) ---- */
  function onWheel(e) {
    if (layouts.length < 2) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 12) return;
    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    userInteracted();
    if (delta > 0) next(); else prev();
    setTimeout(() => { wheelCooldown = false; }, 420);
  }

  /* ---- keyboard ---- */
  function onKeydown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      userInteracted();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      userInteracted();
      prev();
    } else if (e.key === 'Enter') {
      const continueBtn = document.getElementById('toCaptureBtn');
      if (continueBtn) continueBtn.click();
    }
  }

  function bindEvents() {
    stageEl.addEventListener('pointerdown', onPointerDown);
    stageEl.addEventListener('pointermove', onPointerMove);
    stageEl.addEventListener('pointerup', endDrag);
    stageEl.addEventListener('pointercancel', endDrag);
    stageEl.addEventListener('wheel', onWheel, { passive: false });
    stageEl.addEventListener('keydown', onKeydown);

    if (prevBtn) prevBtn.addEventListener('click', () => { userInteracted(); prev(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { userInteracted(); next(); });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        clearTimeout(autoplayTimer);
        clearTimeout(idleTimer);
      } else {
        userInteracted();
      }
    });

    window.addEventListener('resize', () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        positionCards();
      });
    });
  }

  /** layouts: array of layout objects (from UI.listLayouts()).
   *  initialId: layout id to center on at startup.
   *  onChange: fn(layout) called whenever the centered layout changes. */
  async function init({ layouts: ls, initialId, onChange }) {
    layouts = ls || [];
    onChangeCb = onChange || null;

    stageEl = document.getElementById('cfStage');
    trackEl = document.getElementById('cfTrack');
    dotsEl = document.getElementById('cfDots');
    infoNameEl = document.getElementById('cfInfoName');
    infoDescEl = document.getElementById('cfInfoDesc');
    infoShotsEl = document.getElementById('cfInfoShots');
    prevBtn = document.getElementById('cfPrevBtn');
    nextBtn = document.getElementById('cfNextBtn');

    if (!stageEl || !trackEl || !layouts.length) return;

    const startAt = Math.max(0, layouts.findIndex(l => l.id === initialId));
    index = startAt === -1 ? 0 : startAt;

    buildCards();
    updateInfo();
    bindEvents();
    startAutoplay();

    // Fire once at startup so the caller's app-state mirrors the initial card.
    if (onChangeCb) onChangeCb(layouts[index]);
  }

  function getCurrentLayout() { return layouts[index]; }

  return { init, getCurrentLayout, next, prev };
})();
