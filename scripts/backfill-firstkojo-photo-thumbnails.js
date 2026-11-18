#!/usr/bin/env node
/**
 * Give every 第一工場 roll photo that has no thumbnail one, exactly like a new upload does:
 * <photo>_thumb.jpg (max 160px JPEG) next to the full photo in Firebase Storage, and
 * imageThumbUrl set on the roll in submittedDB.firstFactoryProduction + firstFactoryQueue.
 *
 *   node scripts/backfill-firstkojo-photo-thumbnails.js --dry-run
 *   node scripts/backfill-firstkojo-photo-thumbnails.js [--date 2026-11-18] [--limit 50]
 *
 * Needs: .env with MONGODB_URI + FIREBASE_* (same as server.js) and macOS `sips` for resizing.
 * Safe to re-run: photos that already have imageThumbUrl are skipped, and an existing
 * _thumb.jpg in storage is reused instead of re-made.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');
const { MongoClient } = require('mongodb');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); if (i === -1) return def; const n = args[i + 1]; return n && !n.startsWith('--') ? n : true; };
const DRY = !!opt('dry-run', false);
const ONLY_DATE = opt('date', null);
const LIMIT = Number(opt('limit', 0)) || 0;
const THUMB_SIZE = 160;
const DOWNLOAD_TOKEN = 'masterDBToken69'; // same token the upload route uses

function initFirebase() {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return admin.storage().bucket();
}

// https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media&token=...
function storagePathFromUrl(url) {
  const m = String(url || '').match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function makeThumb(srcFile, outFile) {
  const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', String(THUMB_SIZE), srcFile, '--out', outFile], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(outFile) || !fs.statSync(outFile).size) {
    throw new Error((r.stderr || 'sips failed').trim().split('\n').slice(-2).join(' '));
  }
}

(async () => {
  const bucket = initFirebase();
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('submittedDB');
  const cols = [db.collection('firstFactoryProduction'), db.collection('firstFactoryQueue')];

  const query = {
    imageUrl: { $regex: '^https://firebasestorage\\.googleapis\\.com/' },
    $or: [{ imageThumbUrl: { $exists: false } }, { imageThumbUrl: '' }, { imageThumbUrl: null }],
    ...(ONLY_DATE ? { date: ONLY_DATE } : {}),
  };

  const urls = new Set();
  for (const col of cols) {
    (await col.find(query, { projection: { imageUrl: 1 } }).toArray()).forEach((d) => urls.add(d.imageUrl));
  }
  let list = [...urls];
  if (LIMIT) list = list.slice(0, LIMIT);
  console.log(`${list.length} photo(s) without a thumbnail${ONLY_DATE ? ` on ${ONLY_DATE}` : ''}${DRY ? ' (dry run)' : ''}`);

  let done = 0, reused = 0, failed = 0;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-thumbs-'));
  for (const imageUrl of list) {
    const srcPath = storagePathFromUrl(imageUrl);
    if (!srcPath) { failed += 1; console.log(`  skip (unrecognised URL) ${imageUrl}`); continue; }
    const thumbPath = srcPath.replace(/\.(jpe?g|png)$/i, '') + '_thumb.jpg';
    if (DRY) { console.log(`  would make ${thumbPath}`); continue; }

    try {
      const thumbFile = bucket.file(thumbPath);
      const [exists] = await thumbFile.exists();
      if (exists) {
        reused += 1;
      } else {
        const src = path.join(tmp, 'src');
        const out = path.join(tmp, 'thumb.jpg');
        await bucket.file(srcPath).download({ destination: src });
        makeThumb(src, out);
        await thumbFile.save(fs.readFileSync(out), {
          metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: DOWNLOAD_TOKEN } },
          validation: false,
        });
      }
      const thumbUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(thumbPath)}?alt=media&token=${DOWNLOAD_TOKEN}`;
      for (const col of cols) await col.updateMany({ imageUrl }, { $set: { imageThumbUrl: thumbUrl } });
      done += 1;
      console.log(`  ok   ${thumbPath}${exists ? ' (already in storage)' : ''}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL ${srcPath}: ${err.message}`);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nDone: ${done} linked (${reused} reused existing thumbnail), ${failed} failed`);
  await client.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
