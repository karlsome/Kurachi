#!/usr/bin/env node
/**
 * Restore audio for imported Tebiki videos. The browser runner downloads each video's segments to
 * ~/Downloads/tebiki-<id>-av.ts; this script waits for each file, remuxes it with ffmpeg (stream copy), replaces the
 * stored asset in place via replace-asset-media.js, and deletes the temp files.
 *
 *   node replace-audio-batch.js ~/Downloads/tebiki-audio-jobs.json [--apply] [--limit 5]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const jobsFile = args.find((a, i) => !a.startsWith('--') && (limitIndex === -1 || i !== limitIndex + 1));
const APPLY = args.includes('--apply');
const limit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1]);
const DL = path.join(os.homedir(), 'Downloads');
const API = 'http://localhost:3000/api/video-manuals-studio';
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'tebiki-import', role: 'admin' })).toString('base64')}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tebiki-av-'));

const stable = async (file) => {
  if (!fs.existsSync(file) || fs.existsSync(`${file}.crdownload`)) return false;
  const a = fs.statSync(file).size; await sleep(1500); return a > 0 && a === fs.statSync(file).size;
};

(async () => {
  const jobs = JSON.parse(fs.readFileSync(path.resolve(jobsFile), 'utf8')).slice(0, limit);
  // tebiki id -> storage path of its library asset
  const paths = new Map();
  for (const pl of await (await fetch(`${API}/playlists`, { headers: auth })).json()) {
    for (const asset of await (await fetch(`${API}/playlists/${pl._id}/assets`, { headers: auth })).json()) {
      const id = (/tebiki-(\d+)-step01\.mp4$/.exec(asset.name || '') || [])[1];
      if (id && asset.storagePath) paths.set(id, asset.storagePath);
    }
  }
  const stats = { ok: 0, skipped: 0, failed: [] };
  for (const [index, job] of jobs.entries()) {
    const id = String(job.id);
    const label = `[${index + 1}/${jobs.length}] ${id}`;
    const storagePath = paths.get(id);
    if (!storagePath) { stats.failed.push([id, 'no asset']); console.log(`  FAIL ${label}: no step01 asset found`); continue; }
    const ts = path.join(DL, `tebiki-${id}-av.ts`);
    for (let waited = 0; !(await stable(ts)); waited += 3) {
      if (waited > 900) break;
      await sleep(3000);
    }
    if (!fs.existsSync(ts)) { stats.failed.push([id, 'download missing']); console.log(`  FAIL ${label}: download missing`); continue; }
    const work = path.join(scratch, id); fs.mkdirSync(work, { recursive: true });
    fs.renameSync(ts, path.join(work, 'in.ts'));
    const mux = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(work, 'in.ts'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', path.join(work, 'out.mp4')], { encoding: 'utf8' });
    if (mux.status !== 0) { stats.failed.push([id, `ffmpeg: ${(mux.stderr || '').trim().split('\n').pop()}`]); console.log(`  FAIL ${label}: ffmpeg`); fs.rmSync(work, { recursive: true, force: true }); continue; }
    const rep = spawnSync('node', [path.join(__dirname, 'replace-asset-media.js'), '--storage-path', storagePath, '--file', path.join(work, 'out.mp4'), ...(APPLY ? ['--apply'] : [])], { encoding: 'utf8' });
    fs.rmSync(work, { recursive: true, force: true });
    if (rep.status === 0) {
      if (/already has audio/.test(rep.stdout)) { stats.skipped += 1; console.log(`  skip ${label}: already has audio`); }
      else { stats.ok += 1; console.log(`  ok   ${label}`); }
    } else {
      const msg = (rep.stderr || rep.stdout || '').trim().split('\n').pop();
      stats.failed.push([id, msg.slice(0, 120)]);
      console.log(`  FAIL ${label}: ${msg.slice(0, 120)}`);
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`\nDone: ${stats.ok} replaced, ${stats.skipped} skipped, ${stats.failed.length} failed`);
  if (stats.failed.length) console.log(JSON.stringify(stats.failed));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
