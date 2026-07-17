/* ============================================================
   AMBIENT.JS
   Slow, automatic "breathing" of the active theme's color palette.
   Every AMBIENT_INTERVAL the page nudges its CSS color variables —
   a touch lighter/darker, a touch warmer/cooler — and lets the
   existing typed-<color> transition on <body> (see style.css)
   animate the change over several seconds. Nothing here changes
   layout, markup, or which theme is selected; it only breathes
   gentle variation around whichever palette is currently active.

   Pure read of CSS variables in -> nudge -> write back out.
   No DOM structure changes, no canvas/camera/export involvement.
   ============================================================ */

const AmbientTheme = (() => {

  // Variables we're allowed to drift. Every one of these is already
  // a typed `<color>` custom property in style.css, so writing a new
  // value to it is natively animatable by the browser — no manual
  // interpolation/rAF loop required.
  const DRIFT_VARS = [
    '--cream', '--cream-deep',
    '--accent', '--accent-soft', '--accent-deep',
    '--ink',
    '--mint', '--butter', '--sky',
    '--surface-tint',
  ];

  const TICK_MS = 60_000;       // how often we pick a new ambient nudge
  const FADE_S = 9;             // how long that nudge takes to settle in (slow, unnoticed)
  const MAX_LIGHTNESS_DRIFT = 4;   // % L nudge, lighter/darker
  const MAX_HUE_DRIFT = 6;         // degrees, warmer/cooler
  const MAX_SAT_DRIFT = 3;         // % S nudge

  let baseTheme = null;        // the manually-selected theme name we're drifting around
  let basePalette = {};        // { varName: {h,s,l} } snapshot of that theme's true colors
  let timer = null;
  let bodyEl = null;
  let enabled = false;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---- color helpers (hex <-> hsl), small + dependency-free ---- */
  function hexToHsl(hex) {
    const m = hex.replace('#', '');
    const r = parseInt(m.substring(0, 2), 16) / 255;
    const g = parseInt(m.substring(2, 4), 16) / 255;
    const b = parseInt(m.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, s)) / 100;
    l = Math.min(100, Math.max(0, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    const toHex = (v) => {
      const n = Math.round((v + m) * 255);
      return Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /** Read the *true* (un-drifted) value of each tracked variable for a given
   *  theme by toggling data-theme on a detached probe element — never the
   *  live body — so we get the CSS-defined value, not a leftover ambient
   *  inline override. */
  function snapshotThemePalette(themeName) {
    const probe = document.createElement('div');
    probe.style.display = 'none';
    if (themeName && themeName !== 'cute') probe.dataset.theme = themeName;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    const palette = {};
    DRIFT_VARS.forEach(name => {
      const hex = computed.getPropertyValue(name).trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(hex)) {
        palette[name] = hexToHsl(hex.startsWith('#') ? hex : '#' + hex);
      }
    });
    probe.remove();
    return palette;
  }

  function clearInlineOverrides() {
    if (!bodyEl) return;
    DRIFT_VARS.forEach(name => bodyEl.style.removeProperty(name));
  }

  /** Pick one gentle, coherent drift (not per-variable independent noise —
   *  that would look like flicker. Instead choose a single "mood" — lighter,
   *  darker, warmer, or cooler — and apply it consistently across the whole
   *  palette so it reads as one atmosphere shift, not random jitter. */
  function applyAmbientNudge() {
    if (!bodyEl || !Object.keys(basePalette).length) return;

    const moodRoll = Math.random();
    const lightnessShift = (moodRoll < 0.5 ? 1 : -1) * (Math.random() * MAX_LIGHTNESS_DRIFT);
    const hueShift = (Math.random() < 0.5 ? 1 : -1) * (Math.random() * MAX_HUE_DRIFT);
    const satShift = (Math.random() < 0.5 ? 1 : -1) * (Math.random() * MAX_SAT_DRIFT);

    DRIFT_VARS.forEach(name => {
      const base = basePalette[name];
      if (!base) return;
      // --ink carries body text — keep it the most conservative: a tiny
      // lightness-only nudge, no hue/saturation drift, so contrast against
      // --cream/--surface never meaningfully moves.
      if (name === '--ink') {
        const tightLightness = Math.max(-2, Math.min(2, lightnessShift * 0.4));
        bodyEl.style.setProperty(name, hslToHex(base.h, base.s, base.l + tightLightness));
        return;
      }
      const hex = hslToHex(base.h + hueShift, base.s + satShift, base.l + lightnessShift);
      bodyEl.style.setProperty(name, hex);
    });
  }

  function scheduleTick() {
    clearTimeout(timer);
    if (!enabled || prefersReducedMotion()) return;
    timer = setTimeout(() => {
      // Re-check in case the tab is hidden right as the timer fires.
      if (document.visibilityState === 'visible') applyAmbientNudge();
      scheduleTick();
    }, TICK_MS);
  }

  /** Call whenever the user (or app) sets a new base theme. Re-anchors the
   *  palette we drift around and resets any in-flight ambient offset so the
   *  manual switch reads as the deliberate, snappier transition it already
   *  was — ambient drift resumes fresh from the new theme's true colors. */
  function setBaseTheme(themeName) {
    baseTheme = themeName;
    clearInlineOverrides();
    basePalette = snapshotThemePalette(themeName);
    scheduleTick();
  }

  function pause() {
    enabled = false;
    clearTimeout(timer);
  }

  function resume() {
    if (enabled) return;
    enabled = true;
    scheduleTick();
  }

  function init(initialTheme) {
    bodyEl = document.body;

    // Ambient nudges should fade in slower than the manual theme-switch
    // transition (which stays snappy on purpose). We add a second,
    // slower transition-duration rule scoped via a class, layered on
    // top of the existing `transition` shorthand on body (style.css)
    // rather than replacing it — manual theme clicks are unaffected,
    // and entry order/count here must mirror that shorthand exactly:
    // background-color, then the 10 typed-color custom properties.
    bodyEl.classList.add('ambient-enabled');
    const style = document.createElement('style');
    style.textContent = `
      body.ambient-enabled {
        transition-duration: .4s, ${DRIFT_VARS.map(() => FADE_S + 's').join(', ')};
      }
    `;
    document.head.appendChild(style);

    if (prefersReducedMotion()) return; // stay fully static; base theme still works normally

    enabled = true;
    setBaseTheme(initialTheme || 'cute');

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (enabled) scheduleTick();
      } else {
        clearTimeout(timer);
      }
    });
  }

  return { init, setBaseTheme, pause, resume };
})();
