#!/usr/bin/env node
/**
 * Import a legacy Tebiki manual into a Freya Video Manual Studio (Shotstack) project.
 *
 *   1 Tebiki step  ->  1 video clip (= 1 step) on a single timeline track
 *   Tebiki narration subtitles -> step description (shown as CC by the players)
 *
 * Talks to the existing /api/video-manuals-studio endpoints, so uploads, asset
 * records, previews and Firebase paths are created exactly as the editor does.
 *
 * Usage (run on your Mac, in this folder):
 *   node import-tebiki.js --dry-run
 *   node import-tebiki.js --api http://localhost:3000
 *   node import-tebiki.js --api https://your-server --user karl --role admin
 *
 * Requires: Node 18+, ffmpeg + ffprobe on PATH (brew install ffmpeg).
 * Tebiki streams are login-protected (403 without browser cookies); use --src-dir <folder> with tebiki_<videoId>.tar files saved from a logged-in browser.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const DRY = !!opt('dry-run', false);
const FORCE = !!opt('force', false);
const API = String(opt('api', process.env.VITE_API_URL || 'http://localhost:3000')).replace(/\/+$/, '');
const USER = String(opt('user', 'tebiki-import'));
const ROLE = String(opt('role', 'admin'));
const PLAYLIST_NAME = String(opt('playlist', 'TEBIKI videos'));
const DATA = path.resolve(String(opt('data', path.join(__dirname, 'tebiki-9022530.json'))));
const WORKDIR = path.resolve(String(opt('workdir', path.join(os.tmpdir(), 'tebiki-import'))));
const AUDIO = String(opt('audio', 'mix')); // mix | en | default | none (none only with --src-dir)
const SRC_DIR = opt('src-dir', null) ? path.resolve(String(opt('src-dir'))) : null; // folder of tebiki_<videoId>.tar files saved from a logged-in browser (stream is login-protected)
const ONLY = opt('only', null) ? String(opt('only')).split(',').map(Number) : null; // 0-based step positions

const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
fs.mkdirSync(WORKDIR, { recursive: true });

// ---------- helpers ----------
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const authHeaders = () => ({ Authorization: `Bearer ${b64(JSON.stringify({ username: USER, role: ROLE }))}` });

async function api(endpoint, { method = 'GET', json, headers = {}, body } = {}) {
  const res = await fetch(`${API}/${endpoint}`, {
    method,
    headers: { ...authHeaders(), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
  if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : parsed.error || JSON.stringify(parsed).slice(0, 200)}`);
  return parsed;
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd} not found. Install it first (brew install ffmpeg).`);
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || '').split('\n').slice(-12).join('\n')}`);
  return r.stdout;
}

function probeDuration(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(parseFloat(out).toFixed(3));
}

// Local mode: tar holds video.ts, audio_und.bin (stream 0 = und) and audio_en.bin (stream 1 = en).
function encodeFromLocal(step, out) {
  const tar = path.join(SRC_DIR, `tebiki_${step.videoId}.tar`);
  if (!fs.existsSync(tar)) throw new Error(`Missing ${tar}`);
  const dir = path.join(WORKDIR, `src-${step.videoId}`);
  fs.mkdirSync(dir, { recursive: true });
  run('tar', ['-xf', tar, '-C', dir]);
  const v = path.join(dir, 'video.ts'), und = path.join(dir, 'audio_und.bin'), en = path.join(dir, 'audio_en.bin');
  const a = (f) => JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', f])).streams.filter((s) => s.codec_type === 'audio').length;
  console.log(`    audio streams: 0:und(${a(und)}), 1:en(${a(en)})  [local tar]`);
  const inputs = ['-y', '-v', 'error', '-i', v, '-i', und, '-i', en, '-map', '0:v:0', '-c:v', 'copy'];
  let audioArgs;
  if (AUDIO === 'none') audioArgs = ['-an'];
  else if (AUDIO === 'mix') audioArgs = ['-filter_complex', '[1:a:0][2:a:0]amix=inputs=2:duration=longest:normalize=0[a]', '-map', '[a]', '-c:a', 'aac', '-b:a', '128k'];
  else if (AUDIO === 'en') audioArgs = ['-map', '2:a:0', '-c:a', 'aac', '-b:a', '128k'];
  else audioArgs = ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '128k'];
  run('ffmpeg', [...inputs, ...audioArgs, '-movflags', '+faststart', out]);
  return out;
}

function downloadStep(step) {
  const out = path.join(WORKDIR, `tebiki-${data.sourceVideoId}-step${String(step.position + 1).padStart(2, '0')}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  if (SRC_DIR) return encodeFromLocal(step, out);

  const master = `${data.vodBase}/${step.videoId}/${step.videoId}_high.m3u8`;
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-allowed_extensions', 'ALL', master]));
  const audioIdx = probe.streams.filter((s) => s.codec_type === 'audio').map((s) => s.index);
  const audioInfo = probe.streams.filter((s) => s.codec_type === 'audio').map((s) => `${s.index}:${(s.tags && s.tags.language) || '?'}`);
  console.log(`    audio streams: ${audioInfo.join(', ') || 'none'}`);

  const base = ['-y', '-v', 'error', '-allowed_extensions', 'ALL', '-i', master, '-map', '0:v:0', '-c:v', 'copy'];
  let audioArgs;
  if (audioIdx.length === 0) {
    audioArgs = ['-an'];
  } else if (AUDIO === 'mix' && audioIdx.length >= 2) {
    audioArgs = ['-filter_complex', '[0:a:0][0:a:1]amix=inputs=2:duration=longest:normalize=0[a]', '-map', '[a]', '-c:a', 'aac', '-b:a', '128k'];
  } else if (AUDIO === 'en' && audioIdx.length >= 2) {
    audioArgs = ['-map', '0:a:1', '-c:a', 'aac', '-b:a', '128k'];
  } else {
    audioArgs = ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k'];
  }
  run('ffmpeg', [...base, ...audioArgs, '-movflags', '+faststart', out]);
  return out;
}

// Same transform the editor uses (normalizePlayableMediaSource) so edit.src and assetSourceMap match what the UI expects.
function toEditorSource(publicUrl) {
  const parsed = new URL(publicUrl);
  const segs = parsed.pathname.split('/').filter(Boolean);
  const raw = segs[segs.length - 1] || 'asset';
  const safe = encodeURIComponent(raw.includes('.') ? raw : `${raw}.bin`);
  return `${API}/api/video-manual-media/${safe}?url=${encodeURIComponent(parsed.toString())}`;
}

// ---------- main ----------
(async () => {
  const steps = data.steps.filter((s) => !ONLY || ONLY.includes(s.position));
  console.log(`Tebiki "${data.title}" (video ${data.sourceVideoId}) -> playlist "${PLAYLIST_NAME}" via ${API}`);
  console.log(`${steps.length} step(s), audio mode: ${AUDIO}, workdir: ${WORKDIR}${DRY ? '  [DRY RUN]' : ''}\n`);

  // 1. download + encode every step video
  const local = [];
  for (const step of steps) {
    console.log(`[${step.position + 1}/${data.steps.length}] ${step.title}  (tebiki ${step.duration}s)`);
    const file = downloadStep(step);
    const duration = probeDuration(file);
    console.log(`    -> ${path.basename(file)}  ${duration}s  ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
    local.push({ step, file, duration });
  }
  if (DRY) { console.log('\nDry run done. Nothing was uploaded.'); return; }

  // 2. playlist
  const playlists = await api('api/video-manuals-studio/playlists');
  let playlist = playlists.find((p) => String(p.name).trim().toLowerCase() === PLAYLIST_NAME.toLowerCase());
  if (!playlist) {
    console.log(`\nPlaylist "${PLAYLIST_NAME}" not found, creating it...`);
    const created = await api('api/video-manuals-studio/playlists', { method: 'POST', json: { name: PLAYLIST_NAME, description: 'Legacy manuals imported from Tebiki', privacy: 'internal' } });
    playlist = { ...created, _id: created.insertedId };
  }
  const playlistId = String(playlist._id);
  console.log(`\nPlaylist: ${PLAYLIST_NAME} (${playlistId})`);

  // 3. skip if already imported
  const existing = await api(`api/video-manuals-studio/playlists/${playlistId}/projects`);
  if (!FORCE && existing.some((p) => p.title === data.title)) {
    throw new Error(`A project titled "${data.title}" already exists in this playlist. Use --force to import another copy.`);
  }

  // 4. upload videos
  const clips = [];
  const assetSourceMap = {};
  let cursor = 0;
  for (const item of local) {
    const fileName = path.basename(item.file);
    process.stdout.write(`Uploading ${fileName} ... `);
    const upload = await api('api/video-manuals-studio/upload-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'X-File-Name': fileName, 'X-Upload-Folder': 'videoManuals/shotstackAssets', 'X-Playlist-Id': playlistId },
      body: fs.readFileSync(item.file),
    });
    console.log(`ok (asset ${upload.assetId})`);
    const src = toEditorSource(upload.url);
    assetSourceMap[src] = upload.url;
    clips.push({ asset: { type: 'video', src, trim: 0, volume: 1 }, start: Number(cursor.toFixed(3)), length: item.duration, _desc: item.step.description });
    cursor += item.duration;
  }

  // 5. project
  const project = await api(`api/video-manuals-studio/playlists/${playlistId}/projects`, { method: 'POST', json: { title: data.title, description: `Imported from Tebiki video ${data.sourceVideoId}` } });
  const projectId = String(project.insertedId || project._id);

  const stepDescriptions = clips.filter((c) => c._desc).map((c) => ({ start: c.start, description: c._desc }));
  const edit = {
    timeline: { background: '#ffffff', tracks: [{ clips: clips.map(({ _desc, ...c }) => c) }] },
    output: { format: 'mp4', fps: 30, size: { width: 1920, height: 1080 } },
  };
  await api(`api/video-manuals-studio/projects/${projectId}`, { method: 'PATCH', json: { edit, assetSourceMap, settings: { output: null, stepDescriptions } } });

  console.log(`\nDone. Project "${data.title}" (${projectId}) created with ${clips.length} steps, ${(cursor / 60).toFixed(1)} min.`);
  console.log('Open it in Freya Admin 2 (Video Manual > TEBIKI videos), check the steps and CC text, then Save / Deploy.');
})().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
