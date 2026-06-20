/**
 * ============================================================
 * reset-hearts.js
 * One-time migration script — Snapcrate Photobooth
 *
 * Purpose:
 *   Normalize the `hearts` field across every document in the
 *   `feedbacks` collection. After running this:
 *     - every doc has hearts === 0 (number)
 *     - name / message / rating / timestamp are untouched
 *     - no documents are created or deleted
 *
 * This uses the Firebase ADMIN SDK, not the client SDK — it
 * authenticates with a service account and bypasses Firestore
 * Security Rules entirely, so it works no matter what state your
 * rules are currently in. This must be run from your own machine
 * (or a trusted server), NEVER shipped to the browser/client.
 *
 * ------------------------------------------------------------
 * SETUP (one time):
 *   1. npm install firebase-admin
 *   2. Get a service account key:
 *        Firebase Console → Project Settings (gear icon)
 *        → Service Accounts tab → "Generate new private key"
 *      This downloads a JSON file. Save it next to this script as
 *      serviceAccountKey.json — do NOT commit it to git, do NOT
 *      put it anywhere public (it grants full admin access).
 *
 * RUN:
 *   node reset-hearts.js          → dry run (reports only, no writes)
 *   node reset-hearts.js --apply  → actually performs the writes
 * ============================================================
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const COLLECTION = 'feedbacks';
const BATCH_LIMIT = 400; // Firestore batch hard cap is 500 writes; stay under it

const DRY_RUN = !process.argv.includes('--apply');

async function resetHearts() {
  console.log(`[reset-hearts] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writing to Firestore)'}`);
  console.log(`[reset-hearts] Reading collection "${COLLECTION}"...`);

  const snapshot = await db.collection(COLLECTION).get();
  console.log(`[reset-hearts] Found ${snapshot.size} document(s).`);

  if (snapshot.empty) {
    console.log('[reset-hearts] Nothing to do — collection is empty.');
    return;
  }

  let needsReset = 0;
  let alreadyZero = 0;
  let missingField = 0;
  let nonNumeric = 0;

  const docsToFix = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const current = data.hearts;

    if (current === undefined) {
      missingField++;
      needsReset++;
      docsToFix.push(doc.ref);
    } else if (typeof current !== 'number') {
      nonNumeric++;
      needsReset++;
      docsToFix.push(doc.ref);
      console.log(`[reset-hearts]   ⚠ doc ${doc.id} has non-numeric hearts:`, current);
    } else if (current !== 0) {
      needsReset++;
      docsToFix.push(doc.ref);
    } else {
      alreadyZero++;
    }
  });

  console.log('[reset-hearts] Summary:');
  console.log(`  - already hearts: 0       → ${alreadyZero}`);
  console.log(`  - missing hearts field    → ${missingField}`);
  console.log(`  - non-numeric hearts      → ${nonNumeric}`);
  console.log(`  - total needing reset     → ${needsReset}`);

  if (needsReset === 0) {
    console.log('[reset-hearts] ✅ Every document already has hearts: 0. Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('');
    console.log(`[reset-hearts] DRY RUN complete. ${needsReset} document(s) WOULD be updated.`);
    console.log('[reset-hearts] Re-run with --apply to actually write changes:');
    console.log('[reset-hearts]   node reset-hearts.js --apply');
    return;
  }

  // ---- Apply in batches (merge: true equivalent via update on existing docs) ----
  console.log('');
  console.log(`[reset-hearts] Applying hearts: 0 to ${docsToFix.length} document(s)...`);

  let batch = db.batch();
  let opsInBatch = 0;
  let totalWritten = 0;

  for (const ref of docsToFix) {
    // set(..., { merge: true }) so this works identically whether the field
    // already exists or not — it adds it if missing, overwrites if present,
    // and never touches name/message/rating/timestamp.
    batch.set(ref, { hearts: 0 }, { merge: true });
    opsInBatch++;
    totalWritten++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`[reset-hearts]   committed batch of ${opsInBatch} (${totalWritten}/${docsToFix.length} total)`);
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
    console.log(`[reset-hearts]   committed final batch of ${opsInBatch} (${totalWritten}/${docsToFix.length} total)`);
  }

  console.log('');
  console.log(`[reset-hearts] ✅ Done. ${totalWritten} document(s) now have hearts: 0.`);
  console.log('[reset-hearts] Other fields (name, message, rating, timestamp) were not touched.');
}

resetHearts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reset-hearts] ❌ FAILED:', err);
    process.exit(1);
  });
