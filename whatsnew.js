/* ============================================================
   WHATSNEW.JS
   Self-contained "What's New" announcement popup. Injects its
   own markup (same pattern as feedback.js), shows once per
   APP_VERSION via localStorage, and never touches camera,
   filters, or the feedback system.
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     VERSION CONTROL
     Bump APP_VERSION whenever you ship updates worth announcing.
     The storage key below is derived from it automatically, so a
     version bump alone is enough to force the popup to show again
     for everyone — no need to touch localStorage logic itself.
  ---------------------------------------------------------- */
  const APP_VERSION = 'v1';
  const STORAGE_KEY = 'snapcrate_whatsnew_seen_' + APP_VERSION;

  // ── Edit this list for each release — this is the only thing ──
  // you need to change when announcing new features.
  const FEATURES = [
    'Updated navbar UI for a cleaner look',
    'Disabled zoom for stable photobooth experience',
    'Added camera flash effect inside rounded frame',
    'Added flash toggle button (ON/OFF)',
    'Removed layout resolution text',
    'Added new photobooth layouts',
    'Audio now stops when leaving the page',
    'Improved performance and UI smoothness',
    'Improved heart reaction system',
  ];

  const SHOW_DELAY_MS = 1500;

  function hasSeenCurrentVersion() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch (_) { return false; } // localStorage unavailable — fail open, show once per load
  }

  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, '1'); }
    catch (_) { /* nothing we can do — popup just may reappear next visit */ }
  }

  function buildModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'whatsnew-backdrop';
    backdrop.id = 'whatsnewBackdrop';

    const featureItems = FEATURES.map(f =>
      '<li>' + f + '</li>'
    ).join('');

    backdrop.innerHTML = `
      <div class="whatsnew-modal" role="dialog" aria-modal="true" aria-labelledby="whatsnewTitle">
        <button class="whatsnew-close" id="whatsnewCloseBtn" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
        </button>
        <h2 id="whatsnewTitle">🎉 What's New in Snapcrate</h2>
        <ul class="whatsnew-list">${featureItems}</ul>
        <button class="whatsnew-cta" id="whatsnewGotItBtn" type="button">Got it</button>
      </div>
    `;

    document.body.appendChild(backdrop);
    return backdrop;
  }

  function closeModal(backdrop) {
    backdrop.classList.remove('show');
    markSeen();
    setTimeout(() => backdrop.remove(), 250); // let the fade-out finish before removing
  }

  function showModal() {
    const backdrop = buildModal();
    // Force layout before adding .show so the CSS transition actually fires
    // instead of jumping straight to the end state.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => backdrop.classList.add('show'));
    });

    document.getElementById('whatsnewCloseBtn').addEventListener('click', () => closeModal(backdrop));
    document.getElementById('whatsnewGotItBtn').addEventListener('click', () => closeModal(backdrop));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop); // click outside the card also dismisses
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        closeModal(backdrop);
        document.removeEventListener('keydown', onEsc);
      }
    });
  }

  function boot() {
    if (hasSeenCurrentVersion()) return;
    setTimeout(showModal, SHOW_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
