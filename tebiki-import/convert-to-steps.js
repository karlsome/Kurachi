#!/usr/bin/env node
/**
 * Build a STEP-BASED Video Manual project from the Tebiki manual that import-tebiki.js already imported.
 *
 *   Tebiki step  ->  1 project step (own timeline: the step's video as one clip + timed subtitles)
 *
 * It re-uses the videos already uploaded by import-tebiki.js (reads the clips + assetSourceMap of that flat
 * project) and only CREATES a new project; the flat project is not touched.
 *
 * Subtitles: Tebiki keeps each narration line as its own cue, but the cue timings are not available here.
 * The lines from tebiki-9022530.json become contiguous cues over each step video, with each cue's length
 * proportional to its text length (min 1.5 s). Retime them in the step editor if needed.
 *
 *   node convert-to-steps.js --dry-run
 *   node convert-to-steps.js --api http://localhost:3000
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); if (i === -1) return def; const n = args[i + 1]; return n && !n.startsWith('--') ? n : true; };
const API = String(opt('api', 'http://localhost:3000')).replace(/\/+$/, '');
const DRY = !!opt('dry-run', false);
const PLAYLIST_NAME = String(opt('playlist', 'TEBIKI videos'));
const DATA = path.resolve(String(opt('data', path.join(__dirname, 'tebiki-9022530.json'))));
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const NEW_TITLE = String(opt('title', `${data.title} (steps)`));
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'tebiki-import', role: 'admin' })).toString('base64')}` };

async function api(endpoint, { method = 'GET', json } = {}) {
  const res = await fetch(`${API}/${endpoint}`, { method, headers: { ...auth, ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${typeof body === 'string' ? body : body.error || ''}`);
  return body;
}

// One cue per narration line, contiguous over [0, duration], length ~ text length.
function buildCues(description, duration) {
  const lines = String(description || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !(duration > 0)) return [];
  const weights = lines.map((l) => Math.max(l.length, 10));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return lines.map((text, i) => {
    const end = i === lines.length - 1 ? duration : Math.min(duration, t + (weights[i] / total) * duration);
    const cue = { start: Math.round(t * 1000) / 1000, end: Math.round(end * 1000) / 1000, text };
    t = end;
    return cue;
  }).filter((c) => c.end > c.start);
}

(async () => {
  const playlists = await api('api/video-manuals-studio/playlists');
  const playlist = playlists.find((p) => String(p.name).trim().toLowerCase() === PLAYLIST_NAME.toLowerCase());
  if (!playlist) throw new Error(`Playlist "${PLAYLIST_NAME}" not found`);
  const projects = await api(`api/video-manuals-studio/playlists/${playlist._id}/projects`);
  if (projects.some((p) => p.title === NEW_TITLE)) throw new Error(`A project "${NEW_TITLE}" already exists. Delete it first or pass --title.`);
  const sourceSummary = projects.find((p) => p.title === data.title && p.structure !== 'steps');
  if (!sourceSummary) throw new Error(`Imported flat project "${data.title}" not found in "${PLAYLIST_NAME}". Run import-tebiki.js first.`);
  const source = await api(`api/video-manuals-studio/projects/${sourceSummary._id}`);

  const clips = (source.edit?.timeline?.tracks?.[0]?.clips || []).filter((c) => c?.asset?.type === 'video').sort((a, b) => a.start - b.start);
  if (clips.length !== data.steps.length) throw new Error(`Expected ${data.steps.length} clips in the imported project, found ${clips.length}`);

  const plan = data.steps.map((step, i) => {
    const clip = { ...clips[i], start: 0 };
    return {
      title: step.title,
      edit: { timeline: { background: source.edit.timeline.background, tracks: [{ clips: [clip] }] }, output: source.edit.output },
      assetSourceMap: source.assetSourceMap?.[clip.asset.src] ? { [clip.asset.src]: source.assetSourceMap[clip.asset.src] } : {},
      subtitles: buildCues(step.description, clip.length),
      length: clip.length,
    };
  });

  console.log(`Source: "${source.title}" (${source._id}), playlist "${playlist.name}"`);
  plan.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.title}  ${s.length}s  ${s.subtitles.length} subtitles${Object.keys(s.assetSourceMap).length ? '' : '  (!) no assetSourceMap entry'}`));
  if (DRY) { console.log(`\nDry run. Would create step-based project "${NEW_TITLE}".`); return; }

  const created = await api(`api/video-manuals-studio/playlists/${playlist._id}/projects`, { method: 'POST', json: { title: NEW_TITLE, description: source.description || '', structure: 'steps' } });
  const projectId = String(created.insertedId || created._id);
  console.log(`\nCreated project ${projectId}`);
  for (const s of plan) {
    const { step } = await api(`api/video-manuals-studio/projects/${projectId}/steps`, { method: 'POST', json: { title: s.title } });
    await api(`api/video-manuals-studio/projects/${projectId}/steps/${step.id}`, { method: 'PATCH', json: { edit: s.edit, assetSourceMap: s.assetSourceMap, subtitles: s.subtitles } });
    console.log(`  ok  ${s.title}`);
  }
  console.log(`\nDone. Open it in Freya Admin 2 (Video Manual > ${playlist.name} > "${NEW_TITLE}").`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
