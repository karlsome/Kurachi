#!/usr/bin/env node
/**
 * Import a batch of single-video Tebiki manuals (batch-<n>.json downloaded from the browser runner)
 * one by one via import-tebiki.js, then remove each tar once its project exists.
 *
 *   node import-batch.js ~/Downloads/batch-2.json [--playlist 塗工2号機] [--src-dir ~/Downloads] [--keep-tars]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
if (!file) { console.error('usage: node import-batch.js <batch.json>'); process.exit(1); }
const PLAYLIST = String(opt('playlist', '塗工2号機'));
const SRC = path.resolve(String(opt('src-dir', path.join(os.homedir(), 'Downloads'))));
const API = String(opt('api', 'http://localhost:3000'));
const KEEP = !!opt('keep-tars', false);
const items = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tebiki-batch-'));
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'tebiki-import', role: 'admin' })).toString('base64')}` };

(async () => {
  // existing titles in the playlist, so repeated titles get " (<tebiki id>)" instead of failing
  let existing = new Set();
  try {
    const pls = await (await fetch(`${API}/api/video-manuals-studio/playlists`, { headers: auth })).json();
    const pl = pls.find((p) => String(p.name).trim() === PLAYLIST);
    if (pl) existing = new Set((await (await fetch(`${API}/api/video-manuals-studio/playlists/${pl._id}/projects`, { headers: auth })).json()).map((p) => p.title));
  } catch { /* playlist is created by import-tebiki.js on first use */ }

  let ok = 0; const failed = [];
  for (const [idx, item] of items.entries()) {
    const step = item.steps[0];
    const tar = path.join(SRC, `tebiki_${step.videoId}.tar`);
    if (!fs.existsSync(tar)) { failed.push([item.sourceVideoId, 'tar missing']); continue; }
    if (existing.has(item.title)) { item.title = `${item.title} (${item.sourceVideoId})`; }
    existing.add(item.title);
    const dataFile = path.join(tmp, `${item.sourceVideoId}.json`);
    fs.writeFileSync(dataFile, JSON.stringify(item));
    const r = spawnSync('node', [path.join(__dirname, 'import-tebiki.js'), '--data', dataFile, '--src-dir', SRC, '--audio', 'none', '--playlist', PLAYLIST, '--api', API], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) {
      ok += 1;
      if (!KEEP) fs.rmSync(tar, { force: true });
      console.log(`  ok   [${idx + 1}/${items.length}] ${item.title.slice(0, 60)}`);
    } else {
      const msg = (r.stderr || r.stdout || '').trim().split('\n').pop();
      failed.push([item.sourceVideoId, msg.slice(0, 120)]);
      console.log(`  FAIL [${idx + 1}/${items.length}] ${item.title.slice(0, 50)}: ${msg.slice(0, 120)}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nbatch done: ${ok} ok, ${failed.length} failed`);
  if (failed.length) console.log(JSON.stringify(failed));
})();
