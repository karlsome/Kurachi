#!/usr/bin/env node
/**
 * Add Tebiki caption text (stored in Tebiki as bottom-centre text overlays) as timed subtitles to already imported
 * single-step projects that have none. Source: tebiki-captions.json exported from the logged-in Tebiki session.
 *
 *   node apply-captions.js ~/Downloads/tebiki-captions.json            # dry run
 *   node apply-captions.js ~/Downloads/tebiki-captions.json --apply [--only 1017092]
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const ONLY = onlyIndex === -1 ? null : args[onlyIndex + 1];
const file = args.find((a, i) => !a.startsWith('--') && (onlyIndex === -1 || i !== onlyIndex + 1));
const APPLY = args.includes('--apply');
const API = 'http://localhost:3000/api/video-manuals-studio';
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'tebiki-import', role: 'admin' })).toString('base64')}`, 'Content-Type': 'application/json' };
const captions = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const call = async (method, url, body) => {
  const res = await fetch(`${API}/${url}`, { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status}`);
  return res.json();
};

(async () => {
  const stats = { candidates: 0, applied: 0, noCaptions: 0, hasSubs: 0, notSingleStep: 0, emptyAfterFit: 0, ja: 0, en: 0 };
  for (const playlist of await call('GET', 'playlists')) {
    for (const summary of await call('GET', `playlists/${playlist._id}/projects`)) {
      const id = (/Tebiki video (\d+)/.exec(summary.description || '') || [])[1];
      if (!id || (ONLY && ONLY !== id)) continue;
      if (!captions[id]) { stats.noCaptions += 1; continue; }
      const project = await call('GET', `projects/${summary._id}`);
      if (project.structure !== 'steps' || project.steps.length !== 1) { stats.notSingleStep += 1; continue; }
      const step = project.steps[0];
      if ((step.subtitles || []).length) { stats.hasSubs += 1; continue; }
      stats.candidates += 1;
      const lang = captions[id].ja ? 'ja' : 'en';
      const len = Number(step.edit?.timeline?.tracks?.[0]?.clips?.[0]?.length) || Number(step.durationSeconds) || 0;
      const subtitles = captions[id][lang]
        .map(([begin, duration, text]) => ({ start: Math.max(0, Math.min(len, begin)), end: Math.min(len, begin + duration), text }))
        .filter((cue) => cue.text && cue.end > cue.start + 0.05);
      if (!subtitles.length) { stats.emptyAfterFit += 1; continue; }
      stats[lang] += 1;
      if (APPLY) {
        await call('PATCH', `projects/${project._id}/steps/${step.id}`, { subtitles });
        stats.applied += 1;
        console.log(`  ok  ${id} [${lang}] ${subtitles.length} cues  ${project.title.slice(0, 50)}`);
      } else if (ONLY || stats.candidates <= 3) {
        console.log(`  would add ${id} [${lang}] ${subtitles.length} cues (len ${len.toFixed(1)}s): ${subtitles[0].text.slice(0, 40)}`);
      }
    }
  }
  console.log(JSON.stringify(stats));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
