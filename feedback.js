/* ============================================================
   FEEDBACK.JS  —  Snapcrate Photobooth
   Plain script (no ES modules) — works with file:// and any server.
   Uses Firebase v8 compat CDN loaded via index.html.
   ============================================================ */

(function () {
  'use strict';

  /* ── Firebase config ───────────────────────────────────── */
  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyC2UwMrWeSxqukdlZg0ngf7l0Q5gkXsNbo',
    authDomain:        'snapcrate-photobooth.firebaseapp.com',
    projectId:         'snapcrate-photobooth',
    storageBucket:     'snapcrate-photobooth.firebasestorage.app',
    messagingSenderId: '367959795898',
    appId:             '1:367959795898:web:c7c129b8a1ac7062593a83',
    measurementId:     'G-LB3DXM8X32',
  };

  const COLLECTION  = 'feedbacks';
  const PAGE_SIZE   = 8;
  const COOLDOWN_MS = 30_000;

  let db            = null;
  let selectedRating = 0;
  let lastSubmitTime = 0;
  let submitting     = false;
  let lastDoc        = null;
  let allLoaded      = false;
  let displayedCount = 0;
  let displayedSum   = 0;

  /* ── Init Firebase ─────────────────────────────────────── */
  function initFirebase() {
    try {
      // Use a separate named app so it never collides with any other
      // Firebase instance the photobooth itself might initialise.
      if (!firebase.apps.find(a => a.name === 'snapcrate-fb')) {
        firebase.initializeApp(FIREBASE_CONFIG, 'snapcrate-fb');
      }
      db = firebase.app('snapcrate-fb').firestore();
      return true;
    } catch (e) {
      console.error('[Feedback] Firebase init failed:', e);
      return false;
    }
  }

  /* ── Sanitise ──────────────────────────────────────────── */
  function sanitize(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .trim();
  }

  /* ── Inject HTML ───────────────────────────────────────── */
  function buildHTML() {
    const section = document.createElement('section');
    section.className = 'feedback-section';
    section.id = 'feedbackSection';

    section.innerHTML = `
<div class="feedback-section-inner">
  <div class="feedback-section-head">
    <h2>💬 What did you think?</h2>
    <p>Your feedback helps make Snapcrate even better for everyone.</p>
  </div>

  <div class="feedback-grid">

    <!-- FORM CARD -->
    <div class="feedback-card feedback-form-card">
      <h3>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Leave a review
      </h3>

      <div id="feedbackFormWrap">
        <div class="feedback-field">
          <label class="feedback-label" for="fbName">Your name</label>
          <input id="fbName" type="text" class="feedback-input" placeholder="Enter your name (optional)" maxlength="30" autocomplete="nickname"/>
        </div>

        <div class="feedback-field">
          <label class="feedback-label">Rating <span class="req">*</span></label>
          <div class="star-row" id="fbStarRow">
            <button class="star-btn" type="button" data-star="1" aria-label="1 star"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>
            <button class="star-btn" type="button" data-star="2" aria-label="2 stars"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>
            <button class="star-btn" type="button" data-star="3" aria-label="3 stars"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>
            <button class="star-btn" type="button" data-star="4" aria-label="4 stars"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>
            <button class="star-btn" type="button" data-star="5" aria-label="5 stars"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>
            <span class="star-label" id="fbStarLabel"></span>
          </div>
          <span class="feedback-error-msg" id="fbStarErr">Please select a rating.</span>
        </div>

        <div class="feedback-field">
          <label class="feedback-label" for="fbMsg">Message <span class="req">*</span></label>
          <textarea id="fbMsg" class="feedback-textarea" placeholder="Share your experience with Snapcrate Photobooth..." maxlength="500" rows="4"></textarea>
          <span class="feedback-char-count" id="fbCharCount">0 / 500</span>
          <span class="feedback-error-msg" id="fbMsgErr">Please write a message.</span>
        </div>

        <button class="feedback-submit" id="fbSubmitBtn" type="button">Submit feedback</button>
        <span class="feedback-error-msg" id="fbGenErr" style="margin-top:8px;display:none;text-align:center;"></span>
      </div>

      <!-- Success -->
      <div class="feedback-success" id="fbSuccess">
        <div class="feedback-success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h4>Thank you for your feedback!</h4>
        <p>Your review has been added to the wall below.</p>
        <button class="feedback-submit" id="fbAnotherBtn" type="button" style="max-width:220px;margin-top:4px;">Leave another</button>
      </div>
    </div>

    <!-- WALL CARD -->
    <div class="feedback-card feedback-wall-card">
      <h3>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Community reviews
      </h3>
      <p class="feedback-wall-summary" id="fbWallSummary">Loading reviews…</p>
      <div class="feedback-list" id="fbReviewList">
        <div class="fb-wall-loading"><div class="fb-spinner"></div>Fetching reviews…</div>
      </div>
      <button class="fb-load-more" id="fbLoadMoreBtn" type="button" style="display:none;">Load more reviews</button>
    </div>

  </div>
</div>`;

    document.body.appendChild(section);

    // Footer
    if (!document.querySelector('.snapcrate-footer')) {
      var foot = document.createElement('footer');
      foot.className = 'snapcrate-footer';
      foot.innerHTML = 'Captured with <span></span> · Snapcrate Photobooth';
      document.body.appendChild(foot);
    }
  }

  /* ── Star rating ───────────────────────────────────────── */
  const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Amazing!'];

  function paintStars(hovered) {
    var btns  = document.querySelectorAll('.star-btn');
    var label = document.getElementById('fbStarLabel');
    btns.forEach(function(b) {
      var n = +b.dataset.star;
      var active = hovered > 0 ? n <= hovered : n <= selectedRating;
      b.classList.toggle('lit', active);
    });
    label.textContent = STAR_LABELS[hovered || selectedRating] || '';
  }

  function initStars() {
    var row = document.getElementById('fbStarRow');
    row.querySelectorAll('.star-btn').forEach(function(b) {
      b.addEventListener('mouseenter', function() { paintStars(+b.dataset.star); });
      b.addEventListener('mouseleave', function() { paintStars(0); });
      b.addEventListener('click', function() {
        selectedRating = +b.dataset.star;
        paintStars(0);
        document.getElementById('fbStarErr').style.display = 'none';
      });
    });
  }

  /* ── Char counter ──────────────────────────────────────── */
  function initCharCounter() {
    var msg     = document.getElementById('fbMsg');
    var counter = document.getElementById('fbCharCount');
    msg.addEventListener('input', function() {
      var len = msg.value.length;
      counter.textContent = len + ' / 500';
      counter.classList.toggle('warn', len > 450);
    });
    msg.addEventListener('focus', function() {
      msg.classList.remove('invalid');
      document.getElementById('fbMsgErr').style.display = 'none';
    });
  }

  /* ── Submit ────────────────────────────────────────────── */
  function handleSubmit() {
    if (submitting) return;

    var now = Date.now();
    if (now - lastSubmitTime < COOLDOWN_MS) {
      var wait = Math.ceil((COOLDOWN_MS - (now - lastSubmitTime)) / 1000);
      showGenErr('Please wait ' + wait + ' more second' + (wait !== 1 ? 's' : '') + ' before submitting again.');
      return;
    }

    var nameRaw = (document.getElementById('fbName').value || '').trim();
    var msgRaw  = (document.getElementById('fbMsg').value  || '').trim();
    var rating  = selectedRating;
    var valid   = true;

    if (!rating) {
      document.getElementById('fbStarErr').style.display = 'block';
      valid = false;
    }
    if (!msgRaw) {
      document.getElementById('fbMsg').classList.add('invalid');
      document.getElementById('fbMsgErr').style.display = 'block';
      valid = false;
    }
    if (!valid) return;

    hideGenErr();

    var name    = sanitize(nameRaw).slice(0, 30) || 'Anonymous';
    var message = sanitize(msgRaw).slice(0, 500);

    submitting = true;
    setSubmitLoading(true);

    db.collection(COLLECTION).add({
      name:      name,
      rating:    rating,
      message:   message,
      hearts:    0,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(function(docRef) {
      lastSubmitTime = Date.now();
      showSuccess();
      prependReview({ name: name, rating: rating, message: message, hearts: 0, timestamp: null }, docRef.id);
    })
    .catch(function(err) {
      console.error('[Feedback] Submit error:', err);
      showGenErr('Something went wrong. Please try again.');
    })
    .finally(function() {
      submitting = false;
      setSubmitLoading(false);
    });
  }

  function setSubmitLoading(on) {
    var btn = document.getElementById('fbSubmitBtn');
    btn.disabled = on;
    btn.innerHTML = on
      ? '<span class="fb-spinner"></span> Submitting…'
      : 'Submit feedback';
  }

  function showSuccess() {
    document.getElementById('feedbackFormWrap').style.display = 'none';
    document.getElementById('fbSuccess').classList.add('show');
  }

  function resetForm() {
    selectedRating = 0;
    document.getElementById('fbName').value = '';
    document.getElementById('fbMsg').value  = '';
    document.getElementById('fbCharCount').textContent = '0 / 500';
    document.querySelectorAll('.star-btn').forEach(function(b) { b.classList.remove('lit'); });
    document.getElementById('fbStarLabel').textContent = '';
    document.getElementById('fbStarErr').style.display = 'none';
    document.getElementById('fbMsgErr').style.display  = 'none';
    document.getElementById('fbMsg').classList.remove('invalid');
    hideGenErr();
  }

  function showGenErr(msg) {
    var el = document.getElementById('fbGenErr');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function hideGenErr() {
    var el = document.getElementById('fbGenErr');
    el.textContent = '';
    el.style.display = 'none';
  }

  /* ── Hearts (one tap per device, stored locally) ──────────── */
  var HEARTED_KEY = 'snapcrate_hearted_reviews';

  // One-time cleanup: earlier builds recorded a review as "hearted" in
  // localStorage even when the matching Firestore write silently failed
  // (rules were rejecting update()). Those local locks are now stale —
  // they'd show a review as already-hearted when its real Firestore
  // count is back at 0. Bump RESET_VERSION any time hearts data needs
  // to be invalidated again in the future; each version only runs once
  // per browser, tracked via HEARTED_RESET_KEY.
  var HEARTED_RESET_KEY = 'snapcrate_hearted_reviews_reset_version';
  var RESET_VERSION = '1';

  function clearStaleHeartLocksOnce() {
    try {
      if (localStorage.getItem(HEARTED_RESET_KEY) !== RESET_VERSION) {
        localStorage.removeItem(HEARTED_KEY);
        localStorage.setItem(HEARTED_RESET_KEY, RESET_VERSION);
        console.log('[Heart] Cleared stale local heart locks (reset v' + RESET_VERSION + ').');
      }
    } catch (e) { /* localStorage unavailable — nothing to clean up */ }
  }

  function getHeartedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(HEARTED_KEY)) || []); }
    catch (e) { return new Set(); }
  }
  function saveHeartedSet(set) {
    try { localStorage.setItem(HEARTED_KEY, JSON.stringify(Array.from(set))); }
    catch (e) { /* localStorage unavailable — hearts just won't persist across reloads */ }
  }
  function hasHearted(id) { return id ? getHeartedSet().has(id) : false; }
  function markHearted(id) {
    var set = getHeartedSet();
    set.add(id);
    saveHeartedSet(set);
  }

  var HEART_SVG_OUTLINE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var HEART_SVG_FILLED  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

  function heartButtonHTML(id, hearts, hearted) {
    var safeId = sanitize(id);
    return '<button type="button" class="fb-heart-btn' + (hearted ? ' hearted' : '') + '" data-review-id="' + safeId + '" ' +
      (hearted ? 'disabled aria-pressed="true"' : 'aria-pressed="false"') + ' title="' + (hearted ? 'You hearted this' : 'Heart this review') + '">' +
      (hearted ? HEART_SVG_FILLED : HEART_SVG_OUTLINE) +
      '<span class="fb-heart-count">' + (hearts || 0) + '</span>' +
      '</button>';
  }

  function handleHeartClick(e) {
    var btn = e.target.closest('.fb-heart-btn');
    if (!btn || btn.disabled) return;
    var id = btn.dataset.reviewId;

    // --- DIAGNOSTIC LOGGING (temporary — remove once confirmed fixed) ---
    console.log('[Heart] click fired. id=', id, 'alreadyHearted=', hasHearted(id));

    if (!id) { console.error('[Heart] ABORT: no data-review-id found on button.', btn); return; }
    if (hasHearted(id)) { console.log('[Heart] ABORT: already hearted locally, skipping write.'); return; }

    // Optimistic UI: lock the button and bump the visible count immediately.
    var countEl = btn.querySelector('.fb-heart-count');
    var optimisticCount = (+countEl.textContent || 0) + 1;
    btn.disabled = true;
    btn.classList.add('hearted');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'You hearted this';
    btn.innerHTML = HEART_SVG_FILLED + '<span class="fb-heart-count">' + optimisticCount + '</span>';
    markHearted(id);

    console.log('[Heart] optimistic UI applied. Writing to Firestore: feedbacks/' + id);

    db.collection(COLLECTION).doc(id).update({
      hearts: firebase.firestore.FieldValue.increment(1),
    }).then(function() {
      console.log('[Heart] ✅ Firestore update SUCCEEDED for feedbacks/' + id);
    }).catch(function(err) {
      // --- THIS is the block that tells us the real cause ---
      console.error('[Heart] ❌ Firestore update FAILED for feedbacks/' + id);
      console.error('[Heart] error.code =', err && err.code);
      console.error('[Heart] error.message =', err && err.message);
      console.error('[Heart] full error object:', err);

      if (err && err.code === 'permission-denied') {
        console.error('[Heart] DIAGNOSIS: Firestore Security Rules are rejecting this update(). ' +
          'The optimistic UI shows the new count, but nothing was saved — this is why it reverts on refresh.');
      } else if (err && err.code === 'not-found') {
        console.error('[Heart] DIAGNOSIS: doc "' + id + '" does not exist in collection "' + COLLECTION + '". ' +
          'Check that the id passed into makeReviewEl() actually matches a real document.');
      }

      // Don't roll back the UI or the localStorage lock — the tap already
      // "counted" for this device; a transient write failure shouldn't let
      // someone retry-spam the same review. (The count display will simply
      // re-sync to the true Firestore value on next page load.)
    });
  }

  /* ── Review wall ───────────────────────────────────────── */
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  function renderStars(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<span style="color:' + (i <= n ? 'var(--butter)' : 'var(--border)') + '">' + STAR_SVG + '</span>';
    }
    return out;
  }

  function formatDate(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : new Date();
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch(e) { return 'Just now'; }
  }

  function makeReviewEl(data, id) {
    var div = document.createElement('div');
    div.className = 'fb-review';
    if (id) {
      div.dataset.id = id;            // kept for backward compatibility
      div.dataset.reviewId = id;      // explicit attribute per spec: data-review-id on the card
    }
    div.innerHTML =
      '<div class="fb-review-header">' +
        '<span class="fb-review-name">' + sanitize(data.name) + '</span>' +
        '<span class="fb-review-stars">' + renderStars(data.rating) + '</span>' +
        heartButtonHTML(id, data.hearts, hasHearted(id)) +
        '<span class="fb-review-date">' + formatDate(data.timestamp) + '</span>' +
      '</div>' +
      '<p class="fb-review-msg">' + sanitize(data.message) + '</p>';
    return div;
  }

  function prependReview(data, id) {
    var list = document.getElementById('fbReviewList');
    var empty = list.querySelector('.fb-wall-empty, .fb-wall-loading');
    if (empty) empty.remove();

    var el = makeReviewEl(data, id);
    el.style.borderColor = 'var(--mint)';
    list.insertBefore(el, list.firstChild);
    displayedCount++;
    displayedSum += data.rating;

    setTimeout(function() { el.style.borderColor = ''; }, 2000);
    updateWallSummary();
  }

  function loadReviews(isLoadMore) {
    var list    = document.getElementById('fbReviewList');
    var loadBtn = document.getElementById('fbLoadMoreBtn');

    if (!isLoadMore) {
      list.innerHTML = '<div class="fb-wall-loading"><div class="fb-spinner"></div>Fetching reviews…</div>';
      loadBtn.style.display = 'none';
      lastDoc = null;
      allLoaded = false;
      displayedCount = 0;
      displayedSum   = 0;
    } else {
      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading…';
    }

    var ref = db.collection(COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(PAGE_SIZE);
    if (isLoadMore && lastDoc) {
      ref = ref.startAfter(lastDoc);
    }

    ref.get().then(function(snap) {
      if (!isLoadMore) list.innerHTML = '';

      if (snap.empty && !isLoadMore) {
        list.innerHTML =
          '<div class="fb-wall-empty">' +
            '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            '<p>No reviews yet — be the first! 🌟</p>' +
          '</div>';
        updateWallSummary();
        return;
      }

      snap.forEach(function(doc) {
        var data = doc.data();
        // --- DIAGNOSTIC LOGGING (temporary) ---
        console.log('[Heart] loaded doc', doc.id, '→ hearts in Firestore =', data.hearts, '(raw type:', typeof data.hearts, ')');
        list.appendChild(makeReviewEl(data, doc.id));
        displayedCount++;
        displayedSum += (data.rating || 0);
        lastDoc = doc;
      });

      allLoaded = snap.size < PAGE_SIZE;
      loadBtn.style.display = allLoaded ? 'none' : 'block';
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load more reviews';
      updateWallSummary();

    }).catch(function(err) {
      console.error('[Feedback] Load error:', err);
      list.innerHTML = '<div class="fb-wall-empty"><p>Couldn\'t load reviews. Check your connection.</p></div>';
      loadBtn.style.display = 'none';
    });
  }

  function updateWallSummary() {
    var el  = document.getElementById('fbWallSummary');
    var avg = displayedCount ? (displayedSum / displayedCount).toFixed(1) : 0;
    if (!displayedCount) {
      el.textContent = 'No reviews yet.';
    } else {
      el.innerHTML = displayedCount + (allLoaded ? '' : '+') + ' review' + (displayedCount !== 1 ? 's' : '') +
        (avg ? ' <span class="fb-avg-stars">★ ' + avg + '</span>' : '');
    }
  }

  /* ── Boot ──────────────────────────────────────────────── */
  function boot() {
    if (!initFirebase()) {
      console.warn('[Feedback] Firebase unavailable — feedback section hidden.');
      return;
    }
    clearStaleHeartLocksOnce();
    buildHTML();
    initStars();
    initCharCounter();

    document.getElementById('fbSubmitBtn').addEventListener('click', handleSubmit);
    document.getElementById('fbAnotherBtn').addEventListener('click', function() {
      resetForm();
      document.getElementById('fbSuccess').classList.remove('show');
      document.getElementById('feedbackFormWrap').style.display = '';
    });
    document.getElementById('fbLoadMoreBtn').addEventListener('click', function() {
      loadReviews(true);
    });
    // Delegated on the list container so it covers reviews added later
    // (load-more, or a freshly-submitted review prepended to the top).
    document.getElementById('fbReviewList').addEventListener('click', handleHeartClick);

    loadReviews(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
