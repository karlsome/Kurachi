#!/usr/bin/env node
/**
 * Queue the Shotstack hover-preview render (4 s low-res clip) for Video Manual library videos that have none.
 * Uses POST /api/video-manuals-studio/assets/:assetId/generate-preview, then waits until each is ready/failed.
 * NOTE: every render uses Shotstack credits (SHOTSTACK_ENV on the server decides sandbox vs production).
 *
 *   node scripts/queue-asset-previews.js --dry-run
 *   node scripts/queue-asset-previews.js [--api http://localhost:3000] [--playlist <id>] [--concurrency 3]
 */
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); if (i === -1) return def; const n = args[i + 1]; return n && !n.startsWith('--') ? n : true; };
const API = String(opt('api', 'http://localhost:3000')).replace(/\/+$/, '');
const DRY = !!opt('dry-run', false);
const ONLY_PLAYLIST = opt('playlist', null);
const CONCURRENCY = Math.max(1, Number(opt('concurrency', 3)) || 3);
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'preview-backfill', role: 'admin' })).toString('base64')}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(endpoint, init = {}) {
  let res;
  for (let attempt = 1; ; attempt += 1) {
    try { res = await fetch(`${API}/${endpoint}`, { ...init, headers: { ...auth, ...(init.headers || {}) } }); break; }
    catch (e) { if (attempt >= 4) throw new Error(`${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`); await sleep(1500 * attempt); }
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${typeof data === 'string' ? data : data.error || ''}`);
  return data;
}

(async () => {
  const playlists = (await api('api/video-manuals-studio/playlists')).filter((p) => !ONLY_PLAYLIST || String(p._id) === String(ONLY_PLAYLIST));
  const jobs = [];
  for (const playlist of playlists) {
    const assets = await api(`api/video-manuals-studio/playlists/${playlist._id}/assets`);
    (Array.isArray(assets) ? assets : []).filter((a) => a.type === 'video' && !a.previewUrl && a.processingStatus !== 'processing')
      .forEach((a) => jobs.push({ playlist, asset: a }));
  }
  console.log(`${jobs.length} video(s) without a hover preview.`);
  if (DRY || !jobs.length) return;

  const stats = { ready: 0, failed: 0 };
  async function worker() {
    while (jobs.length) {
      const { playlist, asset } = jobs.shift();
      const label = `${asset.name} [${playlist.name}]`;
      try {
        await api(`api/video-manuals-studio/assets/${asset._id}/generate-preview`, { method: 'POST' });
        for (;;) { // wait for Shotstack + upload to finish
          await sleep(6000);
          const list = await api(`api/video-manuals-studio/playlists/${playlist._id}/assets`);
          const now = list.find((a) => String(a._id) === String(asset._id));
          if (now?.processingStatus === 'ready' && now.previewUrl) { stats.ready += 1; console.log(`  ok   ${label}`); break; }
          if (now?.processingStatus === 'failed') { stats.failed += 1; console.log(`  FAIL ${label}: ${now.processingError}`); break; }
        }
      } catch (err) {
        stats.failed += 1;
        console.log(`  FAIL ${label}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone: ${stats.ready} ready, ${stats.failed} failed.`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
