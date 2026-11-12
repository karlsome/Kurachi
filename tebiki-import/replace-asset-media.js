#!/usr/bin/env node
/**
 * Replace the media file of a Video Manual library asset IN PLACE (same Firebase Storage path, same download token),
 * e.g. to swap a silent video for the same video with audio. Project/step/timeline URLs keep working, and the old
 * (silent) object is overwritten, i.e. gone from storage.
 *
 *   node replace-asset-media.js --storage-path videoManuals/shotstackAssets/<file>.mp4 --file /path/new.mp4 [--apply]
 *
 * Without --apply it only reports what it would do. Safety checks: the new file must be an mp4 with an audio stream and its
 * duration must match the stored one within 0.3 s (subtitles / trims depend on timing).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { spawnSync } = require('child_process');
const admin = require('firebase-admin');
const { MongoClient } = require('mongodb');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const storagePath = opt('storage-path');
const file = opt('file');
const APPLY = args.includes('--apply');
if (!storagePath || !file) { console.error('usage: --storage-path <path> --file <mp4> [--apply]'); process.exit(1); }

const probe = (target) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,width,height', '-of', 'json', target], { encoding: 'utf8' });
  const streams = JSON.parse(r.stdout || '{"streams":[]}').streams;
  const video = streams.find((s) => s.codec_type === 'video');
  return { audio: streams.some((s) => s.codec_type === 'audio'), duration: Number(video?.duration) || 0, size: video ? `${video.width}x${video.height}` : '' };
};

(async () => {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: 'service_account', project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), client_email: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  const bucket = admin.storage().bucket();
  const object = bucket.file(storagePath);
  const [exists] = await object.exists();
  if (!exists) throw new Error(`not found in storage: ${storagePath}`);
  const [meta] = await object.getMetadata();
  const token = String(meta.metadata?.firebaseStorageDownloadTokens || '');
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  const before = probe(url);
  const after = probe(file);
  console.log(`stored : ${meta.size} bytes, audio=${before.audio}, ${before.duration.toFixed(2)}s ${before.size}, token ${token ? 'present' : 'MISSING'}`);
  console.log(`new    : ${fs.statSync(file).size} bytes, audio=${after.audio}, ${after.duration.toFixed(2)}s ${after.size}`);
  if (before.audio) { console.log('stored file already has audio: nothing to do.'); return; }
  if (!token) throw new Error('stored object has no download token; refusing');
  if (!after.audio) throw new Error('new file has no audio stream; refusing');
  if (Math.abs(after.duration - before.duration) > 0.3) throw new Error('duration differs by more than 0.3 s; refusing');
  if (!APPLY) { console.log('dry run: nothing changed (pass --apply).'); return; }

  await bucket.upload(file, {
    destination: storagePath,
    resumable: false,
    metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=60', metadata: { firebaseStorageDownloadTokens: token } },
  });
  const [after2] = await object.getMetadata();
  console.log(`uploaded: ${after2.size} bytes, token kept: ${after2.metadata?.firebaseStorageDownloadTokens === token}`);

  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  try {
    const r = await mongo.db('Sasaki_Coating_MasterDB').collection('videoManualShotstackAssets')
      .updateMany({ storagePath }, { $set: { size: Number(after2.size), hasAudio: true, updatedAt: new Date() } });
    console.log(`asset records updated: ${r.modifiedCount}`);
  } finally { await mongo.close(); }
  console.log('verify:', JSON.stringify(probe(url)));
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
