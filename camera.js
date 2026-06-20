/* ============================================================
   CAMERA.JS
   Wraps all getUserMedia / WebRTC concerns: starting/stopping
   the stream, switching front/rear camera, mirroring, and
   grabbing a still frame onto a canvas (with an optional
   filter baked in for the final captured photo).
   ============================================================ */

const Camera = (() => {

  let stream = null;
  let videoEl = null;
  let facingMode = 'user'; // 'user' = front, 'environment' = rear
  let mirrored = true;
  let availableFacingModes = { user: true, environment: false };
  let activeDeviceId = null;
  let videoInputs = []; // cached list of available cameras (mainly useful on desktop)

  // Resolution ladder: try 4K ideal first, then step down. We use `ideal`
  // (never `min`/exact) so getUserMedia never hard-fails just because a
  // device can't hit a given tier — the browser picks the closest match,
  // and if that still throws we retry the next tier down ourselves.
  const RESOLUTION_LADDER = [
    { width: 3840, height: 2160 }, // 4K
    { width: 2560, height: 1440 }, // QHD
    { width: 1920, height: 1080 }, // FHD
    { width: 1280, height: 720 },  // HD
    { width: 640, height: 480 },   // last-resort baseline
  ];

  function init(videoElement) {
    videoEl = videoElement;
  }

  async function refreshDeviceList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoInputs = devices.filter(d => d.kind === 'videoinput');
      availableFacingModes.environment = videoInputs.length > 1;
    } catch (_) { /* enumerateDevices can fail silently on some browsers */ }
  }

  /** Build a constraints object for a given resolution tier. Prefers an
   *  explicit deviceId (desktop multi-webcam case) over facingMode when
   *  one has been selected via selectDevice(). */
  function buildConstraints(tier) {
    const video = {
      width: { ideal: tier.width },
      height: { ideal: tier.height },
    };
    if (activeDeviceId) {
      video.deviceId = { exact: activeDeviceId };
    } else {
      video.facingMode = { ideal: facingMode };
    }
    return { audio: false, video };
  }

  async function start() {
    stop(); // ensure no duplicate tracks

    let lastErr = null;
    for (const tier of RESOLUTION_LADDER) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(buildConstraints(tier));
        break; // success — stop walking the ladder
      } catch (err) {
        lastErr = err;
        // Permission/hardware errors won't be fixed by trying a lower
        // resolution, so bail immediately instead of retrying 5x.
        const code = classifyError(err);
        if (code === 'denied' || code === 'no-camera' || code === 'in-use') {
          return { ok: false, error: code };
        }
        // OverconstrainedError etc. — fall through and try the next tier.
      }
    }

    if (!stream) {
      return { ok: false, error: classifyError(lastErr) };
    }

    try {
      videoEl.srcObject = stream;
      await videoEl.play().catch(() => {}); // play() may reject if interrupted; harmless
      applyMirror();
      await refreshDeviceList();
      return { ok: true, settings: stream.getVideoTracks()[0]?.getSettings?.() || null };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  }

  function classifyError(err) {
    if (!err) return 'unknown';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') return 'denied';
    if (err.name === 'NotFoundError') return 'no-camera';
    if (err.name === 'NotReadableError') return 'in-use';
    return 'unknown';
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  async function flip() {
    // Multi-webcam desktops rarely expose facingMode at all, so cycling
    // facingMode there is a no-op. If we have more than one enumerated
    // camera and no clean front/rear distinction, cycle deviceId instead.
    if (videoInputs.length > 1 && !hasDistinctFacingModes()) {
      const ids = videoInputs.map(d => d.deviceId);
      const idx = activeDeviceId ? ids.indexOf(activeDeviceId) : -1;
      activeDeviceId = ids[(idx + 1) % ids.length];
    } else {
      facingMode = facingMode === 'user' ? 'environment' : 'user';
      activeDeviceId = null;
    }
    const result = await start();
    // front camera mirrors by convention, rear/external typically doesn't
    mirrored = activeDeviceId ? false : facingMode === 'user';
    applyMirror();
    return result;
  }

  /** Heuristic: mobile browsers report distinguishable facingMode-capable
   *  devices; most desktop webcams don't expose meaningful labels until
   *  permission is granted, and we have no reliable front/back signal on
   *  desktop, so default to deviceId cycling unless clearly on mobile. */
  function hasDistinctFacingModes() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
  }

  /** List of enumerated cameras, useful for a desktop "choose webcam" menu. */
  function listCameras() {
    return videoInputs.map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
  }

  async function selectDevice(deviceId) {
    activeDeviceId = deviceId || null;
    return start();
  }

  function setMirror(value) {
    mirrored = value;
    applyMirror();
  }

  function toggleMirror() {
    setMirror(!mirrored);
    return mirrored;
  }

  function applyMirror() {
    if (!videoEl) return;
    videoEl.classList.toggle('mirrored', mirrored);
  }

  function isMirrored() { return mirrored; }
  function getFacingMode() { return facingMode; }
  function canFlip() { return availableFacingModes.environment || videoInputs.length > 1; }

  /** Grab the current video frame onto an offscreen canvas. If mirrored,
   *  the flip is baked into the pixels so the exported photo matches what
   *  the user saw in the preview.
   *
   *  Note on resolution: we request up to 4K from getUserMedia so the
   *  *source* video is as sharp as the device allows, but we cap the
   *  captured canvas to MAX_CAPTURE_DIM on its longest edge. A 4-shot
   *  strip otherwise holds 8 full-res canvases in memory at once (raw +
   *  filtered) — at native 4K that's 250MB+ on phones, which is how you
   *  get tab crashes mid-session. 2400px is still well above what any
   *  printed photo strip or screen export needs. */
  const MAX_CAPTURE_DIM = 2400;

  function grabFrame() {
    const vw = videoEl.videoWidth || 1920;
    const vh = videoEl.videoHeight || 1080;
    const longEdge = Math.max(vw, vh);
    const scale = longEdge > MAX_CAPTURE_DIM ? MAX_CAPTURE_DIM / longEdge : 1;
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, 0, 0, w, h);
    return canvas;
  }

  return {
    init, start, stop, flip, setMirror, toggleMirror,
    isMirrored, getFacingMode, canFlip, grabFrame,
    listCameras, selectDevice,
  };
})();