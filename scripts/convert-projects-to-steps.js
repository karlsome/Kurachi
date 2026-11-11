#!/usr/bin/env node
/**
 * Convert every single-timeline Video Manual project to the step structure (every video clip -> one step).
 * 1) writes a JSON backup of each project document first, 2) calls POST /projects/:id/convert-to-steps.
 * Deployed revisions stay deployed (revision snapshots are never touched).
 *
 *   node scripts/convert-projects-to-steps.js --dry-run
 *   node scripts/convert-projects-to-steps.js [--api http://localhost:3000] [--backup-dir ./backups]
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); if (i === -1) return def; const n = args[i + 1]; return n && !n.startsWith('--') ? n : true; };
const API = String(opt('api', 'http://localhost:3000')).replace(/\/+$/, '');
const DRY = !!opt('dry-run', false);
const BACKUP_DIR = path.resolve(String(opt('backup-dir', path.join(__dirname, '..', 'backups'))));
const auth = { Authorization: `Bearer ${Buffer.from(JSON.stringify({ username: 'steps-migration', role: 'admin' })).toString('base64')}` };

async function api(endpoint, method = 'GET') {
  const res = await fetch(`${API}/${endpoint}`, { method, headers: auth });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${typeof body === 'string' ? body : body.error || ''}`);
  return body;
}

(async () => {
  const playlists = await api('api/video-manuals-studio/playlists');
  const flat = [];
  for (const playlist of playlists) {
    const projects = await api(`api/video-manuals-studio/playlists/${playlist._id}/projects`);
    for (const p of projects) if (p.structure !== 'steps') flat.push({ playlist, project: p });
  }
  console.log(`${flat.length} single-timeline project(s) to convert.`);
  flat.forEach(({ playlist, project }) => console.log(`  - [${playlist.name}] ${project.title}${project.deployedRevisionId ? '  (deployed)' : ''}`));
  if (DRY || !flat.length) return;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `video-manual-projects-before-steps-${stamp}.json`);
  const full = [];
  for (const { project } of flat) full.push(await api(`api/video-manuals-studio/projects/${project._id}`));
  fs.writeFileSync(backupFile, JSON.stringify(full, null, 2));
  console.log(`Backup written: ${backupFile}\n`);

  let ok = 0;
  for (const { playlist, project } of flat) {
    try {
      const r = await api(`api/video-manuals-studio/projects/${project._id}/convert-to-steps`, 'POST');
      ok += 1;
      console.log(`  ok   [${playlist.name}] ${project.title}: ${r.steps.length} step(s), mode ${r.mode}${r.overlaysShortened ? `, ${r.overlaysShortened} overlay(s) shortened at a cut` : ''}`);
    } catch (err) {
      console.log(`  FAIL [${playlist.name}] ${project.title}: ${err.message}`);
    }
  }
  console.log(`\nDone: ${ok}/${flat.length} converted.`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
