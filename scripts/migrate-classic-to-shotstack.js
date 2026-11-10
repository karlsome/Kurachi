#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const { convertClassicProject } = require('./classicToShotstack');

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
const SHOTSTACK_ASSETS_COLLECTION = 'videoManualShotstackAssets';

function parseArgs(argv) {
  const args = {
    write: false,
    includeDeleted: false,
    overwrite: false,
    playlistIds: [],
    projectIds: [],
    reportPath: '',
    apiBase: '',
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
      case '--api-base':
        if (!argv[index + 1]) throw new Error('--api-base requires a URL');
        args.apiBase = argv[index + 1];
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
    '  --api-base <url>     Backend base URL used to build media proxy URLs the editor can load (required for a real run)',
    '  --report <file>      Write a JSON migration report to a file',
    '  --help               Show this message',
    '',
    'Notes:',
    '  - Default mode is dry-run.',
    '  - Only the latest working copy of each project is converted; no revisions are created.',
    '  - Each classic step becomes a video clip; overlays become clips on tracks above the video.',
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

function hasClassicProjectMedia(project) {
  if (!project || typeof project !== 'object') return false;
  if (safeText(project.videoUrl)) return true;
  if (Array.isArray(project.steps) && project.steps.some((step) => safeText(step?.videoUrl) || step?.assetId)) return true;
  return false;
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
    // Only metadata is refreshed here. Imported projects are replaced one by one (by source id);
    // projects people created natively in this playlist are never touched.
    await db.collection(SHOTSTACK_PLAYLISTS_COLLECTION).updateOne({ _id: existing._id }, { $set: doc });
    return { mode: 'updated', playlistId: existing._id, doc: { ...existing, ...doc } };
  }

  const result = await db.collection(SHOTSTACK_PLAYLISTS_COLLECTION).insertOne(doc);
  return { mode: 'inserted', playlistId: result.insertedId, doc: { _id: result.insertedId, ...doc } };
}

async function insertShotstackProject(db, classicProject, converted, targetPlaylistId, args) {
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
    currentRevisionNumber: 0,
    lastRevisionId: null,
    deployedRevisionId: null,
    deployedRevisionNumber: null,
    deployedRevisionName: null,
    deployedAt: null,
    deployedBy: null,
    deployedVideoUrl: null,
    deployedVideoStoragePath: null,
    deployedVideoMimeType: null,
    deployedVideoFileName: null,
    previewRevisionId: null,
    previewUrl: null,
    previewStoragePath: null,
    previewMimeType: null,
    previewThumbnailUrl: null,
    previewThumbnailStoragePath: null,
    previewThumbnailMimeType: null,
    previewStatus: 'idle',
    previewError: null,
    previewUpdatedAt: null,
    createdBy: classicProject.createdBy || 'migration',
    createdAt: classicProject.createdAt || now,
    updatedAt: now,
    lastEditedAt: now,
    lastEditedBy: 'migration',
    ...(classicProject.deleted ? { deleted: true, deletedAt: classicProject.deletedAt || now, deletedBy: classicProject.deletedBy || 'migration' } : {}),
  };

  if (!args.write) {
    return {
      mode: existing ? (args.overwrite ? 'would-replace' : 'would-skip-existing') : 'would-insert',
      projectId: existing?._id || null,
    };
  }
  if (existing && !args.overwrite) return { mode: 'skipped-existing', projectId: existing._id };
  if (existing && args.overwrite) await deleteImportedShotstackProject(db, existing);

  const result = await db.collection(SHOTSTACK_PROJECTS_COLLECTION).insertOne(projectDoc);
  return { mode: existing ? 'replaced' : 'inserted', projectId: result.insertedId };
}

/** Copy classic playlist assets into the Shotstack asset library (reference only; files stay in Firebase). */
async function copyPlaylistAssets(db, classicAssets, targetPlaylistId, args) {
  let copied = 0;
  let existingCount = 0;
  for (const asset of classicAssets) {
    const assetId = asset.assetId || String(asset._id);
    const exists = args.write && targetPlaylistId
      ? await db.collection(SHOTSTACK_ASSETS_COLLECTION).findOne({ playlistId: targetPlaylistId, assetId })
      : null;
    if (exists) { existingCount += 1; continue; }
    copied += 1;
    if (!args.write) continue;
    const uploadedAt = asset.uploadedAt || new Date();
    await db.collection(SHOTSTACK_ASSETS_COLLECTION).insertOne({
      playlistId: targetPlaylistId,
      assetId,
      name: asset.name || asset.title || assetId,
      type: asset.type || 'video',
      mimeType: asset.mimeType || asset.contentType || 'video/mp4',
      storagePath: asset.storagePath || null,
      downloadUrl: asset.downloadUrl || asset.url || null,
      size: asset.size || 0,
      uploadedBy: asset.uploadedBy || 'migration',
      uploadedAt,
      previewUrl: null,
      previewStoragePath: null,
      previewMimeType: null,
      previewDurationSeconds: null,
      thumbnailUrl: null,
      thumbnailStoragePath: null,
      thumbnailMimeType: null,
      processingStatus: 'ready',
      processingError: null,
      processingStartedAt: null,
      processingCompletedAt: uploadedAt,
      shotstackRenderId: null,
      importMeta: { source: 'classic-video-manual', sourceAssetId: String(asset._id) },
    });
  }
  return { copied, alreadyPresent: existingCount };
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

      playlistSummary.assets = await copyPlaylistAssets(db, playlistAssets, playlistResult.playlistId, args);

      for (const classicProject of playlistProjects) {
        summary.totals.classicProjects += 1;

        const { sourceProject, sourceRevision } = await loadClassicSourceProject(db, classicProject);
        const converted = convertClassicProject(sourceProject, playlistAssets, { apiBase: args.apiBase });
        const targetPlaylistId = playlistResult.playlistId || new ObjectId();
        const projectResult = await insertShotstackProject(db, classicProject, converted, targetPlaylistId, args);

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