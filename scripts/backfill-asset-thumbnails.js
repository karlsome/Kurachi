#!/usr/bin/env node
/**
 * Give every Video Manual library video that has no thumbnail one (a JPEG frame ~1 s in).
 * Frames are cut locally with ffmpeg and uploaded through the server route
 * POST /api/video-manuals-studio/assets/:assetId/thumbnail (the server stores them in Firebase).
 * No Shotstack render is used, so this costs nothing.
 *
 *   node scripts/backfill-asset-thumbnails.js --dry-run
 *   node scripts/backfill-asset-thumbnails.js --api http://localhost:3000 [--playlist <playlistId>]
 *
 * Needs: ffmpeg on PATH and the Kurachi server running with the thumbnail route.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); if (i === -1) return def; const n = args[i + 1]; return n && !n.startsWith('--') ? n : true; };
const API = String(opt('api', 'http://localhost:3000')).replace(/\/+$/, '');
const DRY = !!opt('dry-run', false);
const ONLY_PLAYLIST = opt('playlist', null);
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'thumbnail-backfill', role: 'admin' })).toString('base64')}` };

async function api(endpoint, init = {}) {
  const res = await fetch(`${API}/${endpoint}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${typeof data === 'string' ? data : data.error || ''}`);
  return data;
}

(async () => {
  const playlists = (await api('api/video-manuals-studio/playlists')).filter((p) => !ONLY_PLAYLIST || String(p._id) === String(ONLY_PLAYLIST));
  let done = 0, failed = 0, total = 0;
  for (const playlist of playlists) {
    const assets = await api(`api/video-manuals-studio/playlists/${playlist._id}/assets?type=videos`);
    const missing = (Array.isArray(assets) ? assets : assets.assets || []).filter((a) => a.type === 'video' && !a.thumbnailUrl && (a.downloadUrl || a.url));
    if (!missing.length) continue;
    console.log(`\nPlaylist "${playlist.name}": ${missing.length} video(s) without thumbnail`);
    for (const asset of missing) {
      total += 1;
      const label = `${asset.name || asset.fileName} (${asset._id})`;
      if (DRY) { console.log(`  would process ${label}`); continue; }
      const out = path.join(os.tmpdir(), `thumb-${asset._id}.jpg`);
      try {
        const src = asset.downloadUrl || asset.url;
        let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', out], { encoding: 'utf8' });
        if (r.status !== 0 || !fs.existsSync(out) || !fs.statSync(out).size) {
          r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', out], { encoding: 'utf8' });
          if (r.status !== 0) throw new Error((r.stderr || 'ffmpeg failed').split('\n').slice(-3).join(' '));
        }
        await api(`api/video-manuals-studio/assets/${asset._id}/thumbnail`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: fs.readFileSync(out) });
        done += 1;
        console.log(`  ok   ${label}`);
      } catch (err) {
        failed += 1;
        console.log(`  FAIL ${label}: ${err.message}`);
      } finally {
        fs.rmSync(out, { force: true });
      }
    }
  }
  console.log(`\n${DRY ? 'Dry run: ' + total + ' to do.' : `Done: ${done} ok, ${failed} failed of ${total}.`}`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
