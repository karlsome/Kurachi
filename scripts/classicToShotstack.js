'use strict';

/**
 * Pure converter: classic Video Manual project (steps[] + elements[]) -> Shotstack Studio `edit`.
 * No database access. Conventions follow freyaAdmin2's VideoManualProjectEditorPage:
 *   - clips use position "center" + offset as a fraction of the canvas, y positive = UP
 *   - track index 0 is the TOP layer
 *   - editor media src is the API proxy URL, assetSourceMap maps proxy URL -> public URL
 */

const WORK_SANS = 'Work Sans';
const PROXY_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value, digits = 4) { const f = 10 ** digits; return Math.round(value * f) / f; }
function safeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}
function isTransientLocalUrl(url) {
  return typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'));
}
function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safeColor(value, fallback) {
  const color = safeText(value);
  return /^[#a-zA-Z0-9(),.%\s]+$/.test(color) && color ? color : fallback;
}

// ── media URLs ──────────────────────────────────────────────────────────────

function createMediaResolver(apiBase, assetSourceMap, warnings) {
  const base = safeText(apiBase).replace(/\/+$/, '');
  let warnedNoBase = false;
  return function resolve(publicUrl) {
    if (!publicUrl) return null;
    let parsed;
    try { parsed = new URL(publicUrl); } catch { return publicUrl; }
    const needsProxy = PROXY_HOSTS.includes(parsed.hostname) || parsed.hostname.endsWith('.amazonaws.com');
    if (!needsProxy) return publicUrl;
    if (!base) {
      if (!warnedNoBase) {
        warnings.push('No --api-base given: media URLs were left as raw storage URLs, which the browser editor cannot load (CORS). Re-run with --api-base.');
        warnedNoBase = true;
      }
      return publicUrl;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const rawName = segments[segments.length - 1] || 'asset';
    const safeName = encodeURIComponent(rawName.includes('.') ? rawName : `${rawName}.bin`);
    const proxied = `${base}/api/video-manual-media/${safeName}?url=${encodeURIComponent(parsed.toString())}`;
    assetSourceMap[proxied] = publicUrl;
    return proxied;
  };
}

// ── geometry ────────────────────────────────────────────────────────────────

/** Pixel box (top-left x,y + size) -> Shotstack center-anchored fractional offset. */
function computeOffset(cx, cy, canvasW, canvasH) {
  return {
    x: round(clamp(cx / canvasW - 0.5, -1.5, 1.5)),
    y: round(clamp(-(cy / canvasH - 0.5), -1.5, 1.5)),
  };
}

function baseOverlayClip(el, box, canvas) {
  const start = Math.max(0, toNumber(el.startTime, 0));
  const length = Math.max(0.1, toNumber(el.endTime, start) - start);
  const clip = {
    start: round(start, 3),
    length: round(length, 3),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
    position: 'center',
    offset: computeOffset(box.cx, box.cy, canvas.width, canvas.height),
  };
  const rawOpacity = toNumber(el.opacity, 100);
  const opacity = rawOpacity <= 1 ? rawOpacity : rawOpacity / 100;
  if (opacity < 0.999) clip.opacity = round(clamp(opacity, 0, 1), 3);
  const rotation = toNumber(el.rotation, 0);
  if (Math.abs(rotation) > 0.01) clip.transform = { rotate: { angle: round(rotation, 2) } };
  return clip;
}

function elementBox(el) {
  const width = Math.max(1, toNumber(el.width, 100));
  const height = Math.max(1, toNumber(el.height, 100));
  return { width, height, cx: toNumber(el.x, 0) + width / 2, cy: toNumber(el.y, 0) + height / 2 };
}

// ── shapes (SVG, same look family as freyaAdmin2 createShapeSvg but classic colours) ──

function buildShapeSvg(el) {
  const stroke = safeColor(el.strokeColor, '#ef4444');
  const sw = Math.max(1, toNumber(el.strokeWidth, 3));
  const w = Math.max(1, toNumber(el.width, 100));
  const h = Math.max(1, toNumber(el.height, 100));
  const fill = el.fill ? stroke : 'none';

  if (el.subtype === 'rect') {
    const W = Math.round(w), H = Math.round(h);
    return {
      width: W, height: H, padding: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(1, W - sw)}" height="${Math.max(1, H - sw)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${sw}"/></svg>`,
    };
  }
  if (el.subtype === 'circle') {
    const W = Math.round(w), H = Math.round(h);
    return {
      width: W, height: H, padding: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><ellipse cx="${W / 2}" cy="${H / 2}" rx="${Math.max(1, W / 2 - sw / 2)}" ry="${Math.max(1, H / 2 - sw / 2)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${sw}"/></svg>`,
    };
  }
  // line / arrow: draw the real segment; pad the box so strokes and arrow heads are not clipped.
  const pad = Math.ceil(sw * 2 + 16);
  const W = Math.round(w + pad * 2), H = Math.round(h + pad * 2);
  const sx = pad + toNumber(el.startNormX, 0) * w;
  const sy = pad + toNumber(el.startNormY, 1) * h;
  const ex = pad + toNumber(el.endNormX, 1) * w;
  const ey = pad + toNumber(el.endNormY, 0) * h;
  let body = `<line x1="${round(sx, 2)}" y1="${round(sy, 2)}" x2="${round(ex, 2)}" y2="${round(ey, 2)}"/>`;
  if (el.subtype === 'arrow') {
    const angle = Math.atan2(ey - sy, ex - sx);
    const head = 15 + sw;
    const a1x = ex - head * Math.cos(angle - Math.PI / 6), a1y = ey - head * Math.sin(angle - Math.PI / 6);
    const a2x = ex - head * Math.cos(angle + Math.PI / 6), a2y = ey - head * Math.sin(angle + Math.PI / 6);
    body += `<polyline points="${round(a1x, 2)},${round(a1y, 2)} ${round(ex, 2)},${round(ey, 2)} ${round(a2x, 2)},${round(a2y, 2)}" fill="none"/>`;
  }
  return {
    width: W, height: H, padding: pad,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g stroke="${escapeXml(stroke)}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`,
  };
}

// ── element converters (return an array of clips; blink expands into several) ──

function expandBlink(el, clip) {
  if (!el.blink) return [clip];
  // classic: visible while (elapsed % 1) < 0.5
  const clips = [];
  const total = clip.length;
  for (let t = 0; t < total - 0.001; t += 1) {
    clips.push({ ...clip, start: round(clip.start + t, 3), length: round(Math.min(0.5, total - t), 3) });
  }
  return clips.length ? clips : [clip];
}

function fontWeightOf(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').toLowerCase();
  if (text === 'bold') return 700;
  if (text === 'normal' || !text) return 400;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 400;
}

function convertText(el, ctx) {
  const box = elementBox(el);
  const clip = baseOverlayClip(el, box, ctx.canvas);
  const family = safeText(el.fontFamily);
  if (family && !['system-ui', 'sans-serif', WORK_SANS].includes(family)) {
    ctx.report.warnings.push(`Text ${el.id || ''}: font "${family}" replaced with ${WORK_SANS}.`);
  }
  const asset = {
    type: 'rich-text',
    text: String(el.text ?? ''),
    font: {
      family: WORK_SANS,
      size: Math.max(8, Math.round(toNumber(el.fontSize, 36))),
      weight: fontWeightOf(el.fontWeight),
      color: safeColor(el.color, '#ffffff'),
      opacity: 1,
    },
    align: {
      horizontal: ['left', 'center', 'right'].includes(el.textAlign) ? el.textAlign : 'center',
      vertical: 'middle',
    },
  };
  const bg = safeText(el.backgroundColor);
  if (bg && bg !== 'transparent') asset.background = { color: safeColor(bg, '#000000'), opacity: 1 };
  ctx.report.converted.text += 1;
  return expandBlink(el, { ...clip, asset });
}

function convertShape(el, ctx) {
  const shape = buildShapeSvg(el);
  const box = elementBox(el);
  const clip = baseOverlayClip(el, { ...box, width: shape.width, height: shape.height }, ctx.canvas);
  ctx.report.converted.shape += 1;
  return expandBlink(el, { ...clip, asset: { type: 'svg', src: shape.svg, opacity: 1 } });
}

function convertImage(el, ctx) {
  const src = safeText(el.imageUrl || el.url || el.src);
  if (!src) {
    ctx.report.warnings.push(`Skipped image ${el.id || ''}: no URL.`);
    return [];
  }
  const box = elementBox(el);
  const clip = baseOverlayClip(el, box, ctx.canvas);
  if (isTransientLocalUrl(src)) {
    ctx.report.warnings.push(`Image ${el.id || ''} only had a local blob URL (never uploaded); replaced with a placeholder.`);
    ctx.report.skipped.push({ elementId: el.id || null, type: 'image', reason: 'blob url' });
    return [{ ...clip, asset: {
      type: 'rich-text', text: 'Image unavailable',
      font: { family: WORK_SANS, size: 24, weight: 600, color: '#475569', opacity: 1 },
      align: { horizontal: 'center', vertical: 'middle' },
      background: { color: '#E2E8F0', opacity: 0.9 },
    } }];
  }
  ctx.report.converted.image += 1;
  return expandBlink(el, { ...clip, asset: { type: 'image', src: ctx.resolveMedia(src) }, fit: 'contain' });
}

function convertAudio(el, ctx) {
  const src = safeText(el.audioUrl || el.url || el.src);
  if (!src || isTransientLocalUrl(src)) {
    ctx.report.warnings.push(`Skipped audio ${el.id || ''}: ${src ? 'local blob URL' : 'no URL'}.`);
    ctx.report.skipped.push({ elementId: el.id || null, type: 'audio', reason: src ? 'blob url' : 'no url' });
    return [];
  }
  const start = Math.max(0, toNumber(el.startTime, 0));
  ctx.report.converted.audio += 1;
  return [{
    asset: { type: 'audio', src: ctx.resolveMedia(src), trim: 0, volume: round(clamp(toNumber(el.volume, 100) / 100, 0, 1), 2) },
    start: round(start, 3),
    length: round(Math.max(0.1, toNumber(el.endTime, start) - start), 3),
  }];
}

function convertElement(el, ctx) {
  switch (el?.type) {
    case 'text': return convertText(el, ctx);
    case 'shape': return convertShape(el, ctx);
    case 'image': return convertImage(el, ctx);
    case 'audio': return convertAudio(el, ctx);
    default:
      ctx.report.skipped.push({ elementId: el?.id || null, type: el?.type || 'unknown', reason: 'unsupported element type' });
      ctx.report.warnings.push(`Skipped unsupported element type "${el?.type || 'unknown'}".`);
      return [];
  }
}

// ── track packing ───────────────────────────────────────────────────────────

/** Greedy: put each clip in the first track where it does not overlap in time. */
function packIntoTracks(clips) {
  const tracks = [];
  [...clips].sort((a, b) => a.start - b.start).forEach((clip) => {
    const end = clip.start + clip.length;
    const track = tracks.find((t) => t.end <= clip.start + 0.001);
    if (track) { track.clips.push(clip); track.end = end; } else { tracks.push({ clips: [clip], end }); }
  });
  return tracks.map((t) => ({ clips: t.clips }));
}

// ── main ────────────────────────────────────────────────────────────────────

function buildAssetLookup(project, playlistAssets) {
  const lookup = new Map();
  [...(project.assets || []), ...(playlistAssets || [])].forEach((asset) => {
    const key = String(asset.assetId || asset._id || '').trim();
    if (key && !lookup.has(key)) lookup.set(key, asset);
  });
  return lookup;
}

function convertClassicProject(project, playlistAssets = [], { apiBase = '' } = {}) {
  const report = {
    sourceProjectId: String(project._id),
    sourceTitle: project.title || 'Untitled Project',
    warnings: [],
    skipped: [],
    converted: { video: 0, text: 0, shape: 0, image: 0, audio: 0 },
  };
  const canvas = {
    width: Math.max(320, Math.round(toNumber(project.width, 1920))),
    height: Math.max(180, Math.round(toNumber(project.height, 1080))),
  };
  const assetSourceMap = {};
  const resolveMedia = createMediaResolver(apiBase, assetSourceMap, report.warnings);
  const ctx = { canvas, report, resolveMedia };
  const lookup = buildAssetLookup(project, playlistAssets);

  const videoClips = [];
  const overlayByLane = new Map(); // lane -> { clips, maxLayer }
  const audioClips = [];
  const stepMeta = [];

  (project.steps || []).forEach((step, index) => {
    const stepStart = Math.max(0, toNumber(step?.startTime, 0));
    const stepEnd = Math.max(stepStart + 0.1, toNumber(step?.endTime, stepStart + 5));
    const assetId = step?.assetId || project.currentAssetId || null;
    const asset = assetId ? lookup.get(String(assetId)) : null;
    const publicUrl = (asset && (asset.downloadUrl || asset.url)) || step?.videoUrl || project.videoUrl || null;

    if (publicUrl) {
      videoClips.push({
        asset: { type: 'video', src: resolveMedia(publicUrl), trim: round(Math.max(0, toNumber(step?.sourceStart, 0)), 3), volume: step?.muted ? 0 : 1 },
        start: round(stepStart, 3),
        length: round(stepEnd - stepStart, 3),
      });
      report.converted.video += 1;
    } else {
      report.warnings.push(`Step "${safeText(step?.label, `Step ${index + 1}`)}" has no source video.`);
    }
    stepMeta.push({
      classicStepId: step?.id || null,
      label: safeText(step?.label, `Step ${index + 1}`),
      description: safeText(step?.description),
      startTime: stepStart,
      endTime: stepEnd,
    });

    (step?.elements || []).forEach((el) => {
      const clips = convertElement(el, ctx);
      if (!clips.length) return;
      if (el.type === 'audio') { audioClips.push(...clips); return; }
      const lane = toNumber(el.timelineLane, 0);
      const group = overlayByLane.get(lane) || { clips: [], maxLayer: -Infinity };
      group.clips.push(...clips);
      group.maxLayer = Math.max(group.maxLayer, toNumber(el.layer, 0));
      overlayByLane.set(lane, group);
    });
  });

  // Top of the stack first: highest layer, then highest lane.
  const overlayTracks = [...overlayByLane.entries()]
    .sort((a, b) => (b[1].maxLayer - a[1].maxLayer) || (b[0] - a[0]))
    .flatMap(([, group]) => packIntoTracks(group.clips));

  const tracks = [...overlayTracks, ...packIntoTracks(videoClips), ...packIntoTracks(audioClips)];
  if (!tracks.length) report.warnings.push('Project has no convertible content; imported as an empty edit.');

  const edit = {
    timeline: { background: '#000000', tracks },
    output: { format: 'mp4', fps: 30, size: { width: canvas.width, height: canvas.height } },
  };

  return {
    title: safeText(project.title, 'Untitled Project'),
    description: safeText(project.description),
    status: safeText(project.status, 'draft') || 'draft',
    edit,
    assetSourceMap,
    settings: {
      output: edit.output,
      importMeta: {
        source: 'classic-video-manual',
        sourceProjectId: String(project._id),
        sourcePlaylistId: String(project.playlistId),
        importedAt: new Date().toISOString(),
        classicStepMeta: stepMeta,
        warnings: report.warnings,
        skipped: report.skipped,
      },
    },
    report,
  };
}

module.exports = { convertClassicProject, computeOffset, buildShapeSvg, packIntoTracks };
