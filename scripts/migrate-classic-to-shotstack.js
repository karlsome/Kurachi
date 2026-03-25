#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'Sasaki_Coating_MasterDB';

const CLASSIC_PLAYLISTS_COLLECTION = 'videoManualPlaylists';
const CLASSIC_PROJECTS_COLLECTION = 'videoManualProjects';
const CLASSIC_REVISIONS_COLLECTION = 'videoRevisions';
const CLASSIC_ASSETS_COLLECTION = 'videoManualAssets';

const SHOTSTACK_PLAYLISTS_COLLECTION = 'videoManualShotstackPlaylists';
const SHOTSTACK_PROJECTS_COLLECTION = 'videoManualShotstackProjects';
const SHOTSTACK_REVISIONS_COLLECTION = 'videoManualShotstackRevisions';

function parseArgs(argv) {
  const args = {
    write: false,
    includeDeleted: false,
    overwrite: false,
    playlistIds: [],
    projectIds: [],
    reportPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--write':
        args.write = true;
        break;
      case '--include-deleted':
        args.includeDeleted = true;
        break;
      case '--overwrite':
        args.overwrite = true;
        break;
      case '--playlist':
        if (!argv[index + 1]) throw new Error('--playlist requires an id');
        args.playlistIds.push(argv[index + 1]);
        index += 1;
        break;
      case '--project':
        if (!argv[index + 1]) throw new Error('--project requires an id');
        args.projectIds.push(argv[index + 1]);
        index += 1;
        break;
      case '--report':
        if (!argv[index + 1]) throw new Error('--report requires a file path');
        args.reportPath = argv[index + 1];
        index += 1;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  console.log([
    'Approximate classic Video Manual -> Shotstack VM2 migration',
    '',
    'Usage:',
    '  node scripts/migrate-classic-to-shotstack.js [options]',
    '',
    'Options:',
    '  --write              Persist converted playlists/projects into MongoDB',
    '  --playlist <id>      Migrate only a specific classic playlist id (repeatable)',
    '  --project <id>       Migrate only a specific classic project id (repeatable)',
    '  --include-deleted    Include soft-deleted classic projects',
    '  --overwrite          Replace previously imported Shotstack records for the same source ids',
    '  --report <file>      Write a JSON migration report to a file',
    '  --help               Show this message',
    '',
    'Notes:',
    '  - Default mode is dry-run.',
    '  - One Shotstack track is created per classic step so the current VM2 editor keeps its step model.',
    '  - Shapes/arrows/lines are approximated as inline SVG clips.',
  ].join('\n'));
}

function ensureObjectId(value, label) {
  if (!value) throw new Error(`${label} is required`);
  if (value instanceof ObjectId) return value;
  if (!ObjectId.isValid(String(value))) throw new Error(`${label} is not a valid ObjectId: ${value}`);
  return new ObjectId(String(value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createIdFactory(prefix) {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  };
}

function buildAssetLookup(project, playlistAssets) {
  const lookup = new Map();

  (project.assets || []).forEach((asset) => {
    const key = String(asset.assetId || asset._id || '').trim();
    if (key) lookup.set(key, asset);
  });

  playlistAssets.forEach((asset) => {
    const key = String(asset.assetId || asset._id || '').trim();
    if (key && !lookup.has(key)) lookup.set(key, asset);
  });

  return lookup;
}

function resolveClassicAssetUrl(asset) {
  if (!asset || typeof asset !== 'object') return null;
  return asset.downloadUrl || asset.url || asset.src || null;
}

function resolveClassicStepVideoUrl(step, project, assetLookup) {
  const assetId = step?.assetId || project?.currentAssetId || null;
  if (assetId && assetLookup.has(String(assetId))) {
    const assetUrl = resolveClassicAssetUrl(assetLookup.get(String(assetId)));
    if (assetUrl) return { url: assetUrl, assetId: String(assetId) };
  }

  const directUrl = step?.videoUrl || project?.videoUrl || null;
  if (directUrl) return { url: directUrl, assetId: null };
  return { url: null, assetId: assetId ? String(assetId) : null };
}

function hasClassicProjectMedia(project) {
  if (!project || typeof project !== 'object') return false;
  if (safeText(project.videoUrl)) return true;
  if (Array.isArray(project.steps) && project.steps.some((step) => safeText(step?.videoUrl) || step?.assetId)) return true;
  return false;
}

function normalizeHexColor(value, fallback) {
  const color = safeText(value);
  if (!color) return fallback;
  return color;
}

function percentOpacityToUnit(value, fallback = 1) {
  const raw = toNumber(value, fallback * 100);
  if (raw <= 1) return clamp(raw, 0, 1);
  return clamp(raw / 100, 0, 1);
}

function isTransientLocalUrl(url) {
  return typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:application/octet-stream'));
}

function computeClipOffset(x, y, width, height, projectWidth, projectHeight) {
  const centerX = toNumber(x, 0) + (toNumber(width, 0) / 2);
  const centerY = toNumber(y, 0) + (toNumber(height, 0) / 2);

  return {
    x: clamp(((centerX / Math.max(1, projectWidth)) - 0.5) * 2, -1, 1),
    y: clamp(((centerY / Math.max(1, projectHeight)) - 0.5) * 2, -1, 1),
  };
}

function buildShapeSvg(shapeType, width, height, options = {}) {
  const fill = normalizeHexColor(options.fill, '#fecaca');
  const stroke = normalizeHexColor(options.stroke, '#ef4444');
  const strokeWidth = Math.max(2, toNumber(options.strokeWidth, 3));
  const safeWidth = Math.max(24, Math.round(toNumber(width, 120)));
  const safeHeight = Math.max(24, Math.round(toNumber(height, 80)));
  const strokePadding = strokeWidth + 14;

  switch (shapeType) {
    case 'rect': {
      const inset = strokePadding;
      return `<svg xmlns="http://www.w3.org/2000/svg" data-vmss-shape="rect" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><rect x="${inset}" y="${inset}" width="${Math.max(1, safeWidth - (inset * 2))}" height="${Math.max(1, safeHeight - (inset * 2))}" rx="12" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
    }
    case 'circle': {
      const radiusX = Math.max(8, (safeWidth / 2) - strokePadding);
      const radiusY = Math.max(8, (safeHeight / 2) - strokePadding);
      const centerX = safeWidth / 2;
      const centerY = safeHeight / 2;
      const ovalPath = [
        `M ${centerX - radiusX} ${centerY}`,
        `A ${radiusX} ${radiusY} 0 1 0 ${centerX + radiusX} ${centerY}`,
        `A ${radiusX} ${radiusY} 0 1 0 ${centerX - radiusX} ${centerY}`,
      ].join(' ');
      return `<svg xmlns="http://www.w3.org/2000/svg" data-vmss-shape="circle" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><path d="${ovalPath}" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
    }
    case 'arrow': {
      const margin = strokePadding + 6;
      const leftX = margin;
      const rightX = safeWidth - margin;
      const centerY = safeHeight / 2;
      const usableHeight = Math.max(18, safeHeight - (margin * 2));
      const headLength = Math.max(18, Math.min(safeWidth * 0.28, usableHeight * 1.1));
      const shaftHalf = Math.max(4, usableHeight * 0.16);
      const bodyRight = Math.max(leftX + 12, rightX - headLength);
      const topY = centerY - (usableHeight / 2);
      const bottomY = centerY + (usableHeight / 2);
      const arrowPath = [
        `M ${leftX} ${centerY - shaftHalf}`,
        `L ${bodyRight} ${centerY - shaftHalf}`,
        `L ${bodyRight} ${topY}`,
        `L ${rightX} ${centerY}`,
        `L ${bodyRight} ${bottomY}`,
        `L ${bodyRight} ${centerY + shaftHalf}`,
        `L ${leftX} ${centerY + shaftHalf}`,
        'Z',
      ].join(' ');
      return `<svg xmlns="http://www.w3.org/2000/svg" data-vmss-shape="arrow" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><path d="${arrowPath}" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    case 'line': {
      const margin = strokePadding + 8;
      const centerY = safeHeight / 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" data-vmss-shape="line" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><line x1="${margin}" y1="${centerY}" x2="${safeWidth - margin}" y2="${centerY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="butt"/></svg>`;
    }
    default:
      return '';
  }
}

function buildRichTextClip(element, projectWidth, projectHeight) {
  const clipWidth = Math.max(80, Math.round(toNumber(element.width, 360)));
  const clipHeight = Math.max(40, Math.round(toNumber(element.height, 80)));
  const clip = {
    asset: {
      type: 'rich-text',
      text: safeText(element.text, safeText(element.label, 'Text')),
      font: {
        family: 'Work Sans',
        size: 36,
        weight: 600,
        color: '#111111',
        opacity: 1,
      },
      align: {
        horizontal: 'center',
        vertical: 'middle',
      },
    },
    start: toNumber(element.startTime, 0),
    length: Math.max(0.1, toNumber(element.endTime, 0) - toNumber(element.startTime, 0)),
    width: clipWidth,
    height: clipHeight,
    offset: computeClipOffset(element.x, element.y, clipWidth, clipHeight, projectWidth, projectHeight),
  };

  return clip;
}

function buildUnavailableImageFallbackClip(element, projectWidth, projectHeight, reason) {
  const clipWidth = Math.max(120, Math.round(toNumber(element.width, 260)));
  const clipHeight = Math.max(80, Math.round(toNumber(element.height, 180)));

  return {
    asset: {
      type: 'rich-text',
      text: reason || 'Imported image unavailable',
      font: {
        family: 'Work Sans',
        size: Math.max(14, Math.round(Math.min(28, clipHeight * 0.16))),
        weight: 600,
        color: '#475569',
        opacity: 1,
      },
      align: {
        horizontal: 'center',
        vertical: 'middle',
      },
      background: {
        color: '#E2E8F0',
        opacity: 0.9,
        borderRadius: 18,
      },
      padding: 20,
    },
    start: toNumber(element.startTime, 0),
    length: Math.max(0.1, toNumber(element.endTime, 0) - toNumber(element.startTime, 0)),
    width: clipWidth,
    height: clipHeight,
    offset: computeClipOffset(element.x, element.y, clipWidth, clipHeight, projectWidth, projectHeight),
  };
}

function buildImageClip(element, projectWidth, projectHeight, report) {
  const src = safeText(element.imageUrl || element.url || element.src);
  if (!src) {
    report.warnings.push(`Skipped image element ${element.id || '(unknown)'} because it has no image URL.`);
    return null;
  }

  if (isTransientLocalUrl(src)) {
    report.warnings.push(`Image element ${element.id || '(unknown)'} used a local blob URL and was converted to a text placeholder.`);
    return buildUnavailableImageFallbackClip(element, projectWidth, projectHeight, 'Imported image unavailable');
  }

  const clipWidth = Math.max(24, Math.round(toNumber(element.width, 300)));
  const clipHeight = Math.max(24, Math.round(toNumber(element.height, 200)));

  const clip = {
    asset: {
      type: 'image',
      src,
    },
    start: toNumber(element.startTime, 0),
    length: Math.max(0.1, toNumber(element.endTime, 0) - toNumber(element.startTime, 0)),
    width: clipWidth,
    height: clipHeight,
    offset: computeClipOffset(element.x, element.y, clipWidth, clipHeight, projectWidth, projectHeight),
  };

  return clip;
}

function buildAudioClip(element, report) {
  const src = safeText(element.audioUrl || element.url || element.src);
  if (!src) {
    report.warnings.push(`Skipped audio element ${element.id || '(unknown)'} because it has no audio URL.`);
    return null;
  }

  return {
    asset: {
      type: 'audio',
      src,
      volume: clamp(toNumber(element.volume, 100) / 100, 0, 1),
    },
    start: toNumber(element.startTime, 0),
    length: Math.max(0.1, toNumber(element.endTime, 0) - toNumber(element.startTime, 0)),
  };
}

function buildNativeShapeAsset(shapeType, width, height, options = {}) {
  const clipWidth = Math.max(24, Math.round(toNumber(width, 180)));
  const clipHeight = Math.max(24, Math.round(toNumber(height, 100)));
  const strokeWidth = Math.max(1, Math.round(toNumber(options.strokeWidth, 3)));
  const fillColor = '#FECACA';
  const fillOpacity = 0.35;
  const strokeColor = '#EF4444';

  if (shapeType === 'rect') {
    return {
      type: 'shape',
      shape: 'rectangle',
      width: clipWidth,
      height: clipHeight,
      rectangle: {
        width: Math.max(8, clipWidth - (strokeWidth * 2)),
        height: Math.max(8, clipHeight - (strokeWidth * 2)),
      },
      fill: { color: fillColor, opacity: fillOpacity },
      stroke: { color: strokeColor, width: strokeWidth },
    };
  }

  if (shapeType === 'circle') {
    return {
      type: 'shape',
      shape: 'circle',
      width: clipWidth,
      height: clipHeight,
      circle: {
        radius: Math.max(8, Math.floor((Math.min(clipWidth, clipHeight) - (strokeWidth * 2)) / 2)),
      },
      fill: { color: fillColor, opacity: fillOpacity },
      stroke: { color: strokeColor, width: strokeWidth },
    };
  }

  return {
    type: 'shape',
    shape: 'line',
    width: clipWidth,
    height: clipHeight,
    line: {
      length: Math.max(12, clipWidth - (strokeWidth * 2)),
      thickness: strokeWidth,
    },
    fill: { color: '#000000', opacity: 0 },
    stroke: { color: strokeColor, width: strokeWidth },
  };
}

function buildShapeClip(element, projectWidth, projectHeight, report) {
  const shapeType = safeText(element.subtype, 'rect');
  const supportedType = ['rect', 'circle', 'arrow', 'line'].includes(shapeType) ? shapeType : 'rect';
  const clipWidth = Math.max(24, Math.round(toNumber(element.width, 180)));
  const clipHeight = Math.max(24, Math.round(toNumber(element.height, 100)));
  const approximatedType = supportedType === 'arrow' ? 'line' : supportedType;
  const shapeAsset = buildNativeShapeAsset(approximatedType, clipWidth, clipHeight, {
    strokeWidth: toNumber(element.strokeWidth, 3),
  });

  if (shapeType !== approximatedType) {
    report.warnings.push(`Converted classic shape "${shapeType}" to native Shotstack "${approximatedType}" for element ${element.id || '(unknown)'}.`);
  }

  const clip = {
    asset: shapeAsset,
    start: toNumber(element.startTime, 0),
    length: Math.max(0.1, toNumber(element.endTime, 0) - toNumber(element.startTime, 0)),
    width: clipWidth,
    height: clipHeight,
    offset: computeClipOffset(element.x, element.y, clipWidth, clipHeight, projectWidth, projectHeight),
  };

  return clip;
}

function getClipLayerWeight(clip) {
  const assetType = clip?.asset?.type;
  if (assetType === 'video') return 0;
  if (assetType === 'audio') return 1;
  if (assetType === 'image') return 2;
  if (assetType === 'shape' || assetType === 'svg') return 3;
  if (assetType === 'rich-text' || assetType === 'text' || assetType === 'title') return 4;
  return 5;
}

function convertClassicElement(element, context) {
  const { projectWidth, projectHeight, report } = context;
  switch (element?.type) {
    case 'text':
    case 'title':
      report.converted.nativeText += 1;
      return buildRichTextClip(element, projectWidth, projectHeight);
    case 'image':
      report.converted.nativeImage += 1;
      return buildImageClip(element, projectWidth, projectHeight, report);
    case 'audio':
      report.converted.nativeAudio += 1;
      return buildAudioClip(element, report);
    case 'shape':
      report.converted.svgShape += 1;
      return buildShapeClip(element, projectWidth, projectHeight, report);
    default:
      report.skipped.push({
        elementId: element?.id || null,
        type: element?.type || 'unknown',
        reason: 'Unsupported classic element type',
      });
      report.warnings.push(`Skipped unsupported classic element type "${element?.type || 'unknown'}".`);
      return null;
  }
}

function createImportReport(project) {
  return {
    sourceProjectId: String(project._id),
    sourceTitle: project.title || 'Untitled Project',
    warnings: [],
    skipped: [],
    converted: {
      stepTracks: 0,
      baseVideoClips: 0,
      nativeText: 0,
      nativeImage: 0,
      nativeAudio: 0,
      svgShape: 0,
    },
  };
}

function convertClassicProjectToShotstack(project, playlistAssets, options = {}) {
  const sourceProject = deepClone(project);
  const report = createImportReport(sourceProject);
  const stepId = createIdFactory('step_');
  const projectWidth = Math.max(320, Math.round(toNumber(sourceProject.width, 1920)));
  const projectHeight = Math.max(180, Math.round(toNumber(sourceProject.height, 1080)));
  const assetLookup = buildAssetLookup(sourceProject, playlistAssets);
  const tracks = [];
  const stepMeta = [];
  const assetSourceMap = {};

  (sourceProject.steps || []).forEach((step) => {
    const stepStart = toNumber(step?.startTime, 0);
    const stepEnd = Math.max(stepStart + 0.1, toNumber(step?.endTime, stepStart + 5));
    const clips = [];
    const media = resolveClassicStepVideoUrl(step, sourceProject, assetLookup);

    if (media.url) {
      clips.push({
        asset: {
          type: 'video',
          src: media.url,
          trim: Math.max(0, toNumber(step?.sourceStart, 0)),
          volume: step?.muted ? 0 : 1,
        },
        start: stepStart,
        length: Math.max(0.1, stepEnd - stepStart),
      });
      assetSourceMap[media.url] = media.url;
      report.converted.baseVideoClips += 1;
    } else {
      report.warnings.push(`Step "${safeText(step?.label, stepId())}" has no source video. Imported overlays only.`);
    }

    (step?.elements || []).forEach((element) => {
      const clip = convertClassicElement(element, { projectWidth, projectHeight, report });
      if (clip) {
        if (clip.asset?.src && typeof clip.asset.src === 'string' && !clip.asset.src.startsWith('<svg')) {
          assetSourceMap[clip.asset.src] = clip.asset.src;
        }
        clips.push(clip);
      }
    });

    clips.sort((left, right) => {
      const byStart = toNumber(left.start, 0) - toNumber(right.start, 0);
      if (byStart !== 0) return byStart;
      const byLayer = getClipLayerWeight(left) - getClipLayerWeight(right);
      if (byLayer !== 0) return byLayer;
      return toNumber(left.length, 0) - toNumber(right.length, 0);
    });

    tracks.push({ clips });
    stepMeta.push({
      classicStepId: step?.id || null,
      classicLabel: safeText(step?.label, `Step ${tracks.length + 1}`),
      classicDescription: safeText(step?.description),
    });

    report.converted.stepTracks += 1;
  });

  if (!tracks.length) {
    report.warnings.push('Project has no classic steps. Imported as an empty Shotstack edit.');
  }

  const edit = {
    timeline: {
      background: '#ffffff',
      tracks,
    },
    output: {
      format: 'mp4',
      fps: 24,
      size: {
        width: projectWidth,
        height: projectHeight,
      },
    },
  };

  const settings = {
    output: edit.output,
    importMeta: {
      source: 'classic-video-manual',
      sourceProjectId: String(sourceProject._id),
      sourcePlaylistId: String(sourceProject.playlistId),
      importedAt: new Date().toISOString(),
      classicWidth: sourceProject.width || null,
      classicHeight: sourceProject.height || null,
      classicDuration: sourceProject.duration || null,
      classicCurrentAssetId: sourceProject.currentAssetId || null,
      classicStepMeta: stepMeta,
      classicAssets: (sourceProject.assets || []).map((asset) => ({
        assetId: asset.assetId || asset._id || null,
        title: asset.title || asset.name || null,
        downloadUrl: asset.downloadUrl || asset.url || null,
        storagePath: asset.storagePath || null,
        mimeType: asset.mimeType || asset.contentType || null,
      })),
      warnings: report.warnings,
      skipped: report.skipped,
    },
  };

  return {
    title: safeText(sourceProject.title, 'Untitled Project'),
    description: safeText(sourceProject.description),
    status: safeText(sourceProject.status, 'draft') || 'draft',
    edit,
    assetSourceMap,
    settings,
    report,
  };
}

function shouldUseClassicRevisionFallback(project) {
  if (!project || typeof project !== 'object') return false;
  if (!Array.isArray(project.steps) || !project.steps.length) return !!project.lastRevisionId;
  return !hasClassicProjectMedia(project) && !!project.lastRevisionId;
}

async function loadClassicSourceProject(db, project) {
  if (!shouldUseClassicRevisionFallback(project)) {
    return { sourceProject: project, sourceRevision: null };
  }

  const revision = await db.collection(CLASSIC_REVISIONS_COLLECTION).findOne({ _id: project.lastRevisionId });
  const snapshot = revision?.snapshot && typeof revision.snapshot === 'object' ? deepClone(revision.snapshot) : null;
  if (!snapshot) {
    return { sourceProject: project, sourceRevision: null };
  }

  return {
    sourceProject: {
      ...snapshot,
      _id: project._id,
      playlistId: project.playlistId,
      title: snapshot.title || project.title,
      description: snapshot.description || project.description || '',
      status: project.status || snapshot.status || 'draft',
      createdBy: project.createdBy || snapshot.createdBy,
      createdAt: project.createdAt || snapshot.createdAt,
      updatedAt: project.updatedAt || snapshot.updatedAt,
      lastEditedAt: project.lastEditedAt || snapshot.lastEditedAt,
      lastEditedBy: project.lastEditedBy || snapshot.lastEditedBy,
      order: project.order,
      deleted: project.deleted,
      deletedAt: project.deletedAt,
      deletedBy: project.deletedBy,
      currentRevisionNumber: project.currentRevisionNumber || snapshot.currentRevisionNumber || 0,
      lastRevisionId: project.lastRevisionId || snapshot.lastRevisionId || null,
    },
    sourceRevision: revision,
  };
}

async function fetchClassicPlaylists(db, args) {
  const query = {};
  if (args.playlistIds.length) {
    query._id = { $in: args.playlistIds.map((value) => ensureObjectId(value, 'playlist id')) };
  }
  return db.collection(CLASSIC_PLAYLISTS_COLLECTION).find(query).sort({ updatedAt: -1 }).toArray();
}

async function fetchClassicProjects(db, playlistId, args) {
  const query = { playlistId };
  if (!args.includeDeleted) {
    query.deleted = { $ne: true };
  }
  if (args.projectIds.length) {
    query._id = { $in: args.projectIds.map((value) => ensureObjectId(value, 'project id')) };
  }
  return db.collection(CLASSIC_PROJECTS_COLLECTION).find(query).sort({ order: 1, createdAt: 1 }).toArray();
}

async function fetchPlaylistAssets(db, playlistId) {
  return db.collection(CLASSIC_ASSETS_COLLECTION).find({ playlistId }).toArray();
}

async function findImportedShotstackPlaylist(db, classicPlaylistId) {
  return db.collection(SHOTSTACK_PLAYLISTS_COLLECTION).findOne({ 'importMeta.sourceClassicPlaylistId': String(classicPlaylistId) });
}

async function findImportedShotstackProject(db, classicProjectId) {
  return db.collection(SHOTSTACK_PROJECTS_COLLECTION).findOne({ 'settings.importMeta.sourceProjectId': String(classicProjectId) });
}

async function deleteImportedShotstackProject(db, projectDoc) {
  if (!projectDoc?._id) return;
  await db.collection(SHOTSTACK_REVISIONS_COLLECTION).deleteMany({ projectId: projectDoc._id });
  await db.collection(SHOTSTACK_PROJECTS_COLLECTION).deleteOne({ _id: projectDoc._id });
}

async function upsertShotstackPlaylist(db, classicPlaylist, args) {
  const existing = await findImportedShotstackPlaylist(db, classicPlaylist._id);
  const now = new Date();
  const doc = {
    name: safeText(classicPlaylist.name, 'Untitled Playlist'),
    description: safeText(classicPlaylist.description),
    model: classicPlaylist.model ? String(classicPlaylist.model) : null,
    privacy: safeText(classicPlaylist.privacy, 'internal') || 'internal',
    access: deepClone(classicPlaylist.access || {
      editRoles: ['admin', '課長', '部長', '係長'],
      editUsers: [],
      viewRoles: [],
      viewUsers: [],
    }),
    createdBy: classicPlaylist.createdBy || 'migration',
    createdAt: classicPlaylist.createdAt || now,
    updatedAt: now,
    importMeta: {
      sourceClassicPlaylistId: String(classicPlaylist._id),
      importedAt: now,
      sourceCollection: CLASSIC_PLAYLISTS_COLLECTION,
    },
  };

  if (!args.write) {
    return { mode: existing ? 'would-update' : 'would-insert', playlistId: existing?._id || null, doc };
  }

  if (existing && !args.overwrite) {
    return { mode: 'skipped-existing', playlistId: existing._id, doc: existing };
  }

  if (existing && args.overwrite) {
    await db.collection(SHOTSTACK_PROJECTS_COLLECTION).deleteMany({ playlistId: existing._id });
    await db.collection(SHOTSTACK_REVISIONS_COLLECTION).deleteMany({ playlistId: existing._id });
    await db.collection(SHOTSTACK_PLAYLISTS_COLLECTION).updateOne({ _id: existing._id }, { $set: doc });
    return { mode: 'updated', playlistId: existing._id, doc: { ...existing, ...doc } };
  }

  const result = await db.collection(SHOTSTACK_PLAYLISTS_COLLECTION).insertOne(doc);
  return { mode: 'inserted', playlistId: result.insertedId, doc: { _id: result.insertedId, ...doc } };
}

async function insertShotstackProjectWithRevision(db, classicProject, converted, targetPlaylistId, sourceRevision, args) {
  const existing = await findImportedShotstackProject(db, classicProject._id);
  const now = new Date();
  const projectDoc = {
    playlistId: targetPlaylistId,
    title: converted.title,
    description: converted.description,
    order: toNumber(classicProject.order, 0),
    status: converted.status,
    schemaVersion: 1,
    edit: converted.edit,
    assetSourceMap: converted.assetSourceMap,
    settings: converted.settings,
    currentRevisionNumber: 1,
    lastRevisionId: null,
    createdBy: classicProject.createdBy || 'migration',
    createdAt: classicProject.createdAt || now,
    updatedAt: now,
    lastEditedAt: now,
    lastEditedBy: 'migration',
    ...(classicProject.deleted ? {
      deleted: true,
      deletedAt: classicProject.deletedAt || now,
      deletedBy: classicProject.deletedBy || 'migration',
    } : {}),
  };

  const snapshot = {
    title: converted.title,
    description: converted.description,
    status: converted.status,
    edit: converted.edit,
    assetSourceMap: converted.assetSourceMap,
    settings: {
      ...converted.settings,
      importMeta: {
        ...converted.settings.importMeta,
        sourceClassicRevisionId: sourceRevision?._id ? String(sourceRevision._id) : null,
        sourceClassicRevisionNumber: sourceRevision?.revisionNumber || classicProject.currentRevisionNumber || 0,
      },
    },
  };

  if (!args.write) {
    return {
      mode: existing
        ? (args.overwrite ? 'would-replace' : 'would-skip-existing')
        : 'would-insert',
      projectId: existing?._id || null,
      projectDoc,
      snapshot,
    };
  }

  if (existing && !args.overwrite) {
    return { mode: 'skipped-existing', projectId: existing._id, projectDoc: existing, snapshot: null };
  }

  if (existing && args.overwrite) {
    await deleteImportedShotstackProject(db, existing);
  }

  const projectInsert = await db.collection(SHOTSTACK_PROJECTS_COLLECTION).insertOne(projectDoc);
  const projectId = projectInsert.insertedId;
  const revisionDoc = {
    projectId,
    playlistId: targetPlaylistId,
    revisionName: `Imported from classic${classicProject.currentRevisionNumber ? ` Rev ${classicProject.currentRevisionNumber}` : ''}`,
    revisionNumber: 1,
    snapshot,
    createdAt: now,
    createdBy: 'migration',
  };
  const revisionInsert = await db.collection(SHOTSTACK_REVISIONS_COLLECTION).insertOne(revisionDoc);

  await db.collection(SHOTSTACK_PROJECTS_COLLECTION).updateOne(
    { _id: projectId },
    {
      $set: {
        currentRevisionNumber: 1,
        lastRevisionId: revisionInsert.insertedId,
      },
    },
  );

  return {
    mode: existing ? 'replaced' : 'inserted',
    projectId,
    projectDoc: { _id: projectId, ...projectDoc, lastRevisionId: revisionInsert.insertedId },
    snapshot,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!MONGO_URI) {
    throw new Error('MONGODB_URI is missing. Expected it in Kurachi/.env');
  }

  const client = new MongoClient(MONGO_URI, {
    serverApi: { version: '1' },
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
  });

  const summary = {
    dryRun: !args.write,
    includeDeleted: args.includeDeleted,
    overwrite: args.overwrite,
    playlists: [],
    totals: {
      classicPlaylists: 0,
      classicProjects: 0,
      migratedProjects: 0,
      skippedProjects: 0,
      warnings: 0,
    },
  };

  await client.connect();

  try {
    const db = client.db(DB_NAME);
    const classicPlaylists = await fetchClassicPlaylists(db, args);
    summary.totals.classicPlaylists = classicPlaylists.length;

    for (const classicPlaylist of classicPlaylists) {
      const playlistAssets = await fetchPlaylistAssets(db, classicPlaylist._id);
      const playlistProjects = await fetchClassicProjects(db, classicPlaylist._id, args);
      if (args.projectIds.length && !playlistProjects.length) {
        continue;
      }
      const playlistResult = await upsertShotstackPlaylist(db, classicPlaylist, args);

      const playlistSummary = {
        sourcePlaylistId: String(classicPlaylist._id),
        sourceName: classicPlaylist.name || 'Untitled Playlist',
        targetPlaylistId: playlistResult.playlistId ? String(playlistResult.playlistId) : null,
        playlistMode: playlistResult.mode,
        projectCount: playlistProjects.length,
        projects: [],
      };

      for (const classicProject of playlistProjects) {
        summary.totals.classicProjects += 1;

        const { sourceProject, sourceRevision } = await loadClassicSourceProject(db, classicProject);
        const converted = convertClassicProjectToShotstack(sourceProject, playlistAssets, args);
        const targetPlaylistId = playlistResult.playlistId || new ObjectId();
        const projectResult = await insertShotstackProjectWithRevision(
          db,
          classicProject,
          converted,
          targetPlaylistId,
          sourceRevision,
          args,
        );

        if (String(projectResult.mode).includes('skip')) {
          summary.totals.skippedProjects += 1;
        } else {
          summary.totals.migratedProjects += 1;
        }

        summary.totals.warnings += converted.report.warnings.length;

        playlistSummary.projects.push({
          sourceProjectId: String(classicProject._id),
          sourceTitle: classicProject.title || 'Untitled Project',
          targetProjectId: projectResult.projectId ? String(projectResult.projectId) : null,
          mode: projectResult.mode,
          usedClassicRevisionFallback: !!sourceRevision,
          warningCount: converted.report.warnings.length,
          converted: converted.report.converted,
          warnings: converted.report.warnings,
          skipped: converted.report.skipped,
        });
      }

      summary.playlists.push(playlistSummary);
    }
  } finally {
    await client.close();
  }

  if (args.reportPath) {
    const resolvedPath = path.resolve(process.cwd(), args.reportPath);
    fs.writeFileSync(resolvedPath, JSON.stringify(summary, null, 2));
    console.log(`Report written to ${resolvedPath}`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});