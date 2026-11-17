#!/usr/bin/env node
// Copy every <背番号>_<type>.pce that is in Drive "freyaAdmin pce" but not yet in "freyaAdmin pce 2"
// into "freyaAdmin pce 2", converting it to points (JSON) like the admin upload does.
//
// The save itself is server.js's own _ncSaveProgram (loaded from the NC PROGRAMS block), so the result is
// the same as uploading the file by hand: Drive slot file + description, ncProgramsDB record with points.
// The old folder is only read, never changed.
//
//   node scripts/migrate-pce-to-pce2.js            dry run: report only, writes nothing
//   node scripts/migrate-pce-to-pce2.js --apply    upload the missing files
//   options: --limit N   --only 1GD,2AB   --parser <path to freyaAdmin2 src/utils/pceParser.js>
//
// Skipped: names that are not <背番号>_<Nh_NN>.pce, items not in masterDB, SCNA items, files that are
// already in pce 2 or already have an active ncProgramsDB record, PCE files that cannot be read.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const { Readable } = require("stream");

const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { google } = require("googleapis");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const LIMIT = Number(opt("--limit")) || Infinity;
const ONLY = opt("--only") ? new Set(opt("--only").split(",").map((s) => s.trim())) : null;
const PARSER = path.resolve(opt("--parser") || path.join(ROOT, "../freyaAdmin2/src/utils/pceParser.js"));
const NAME_RE = /^(.+)_(\d+h_\d{2})\.pce$/i;
const UPLOADED_BY = "migration (freyaAdmin pce)";

function buildDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function listFiles(drive, folderId) {
  const out = [];
  let pageToken;
  do {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken,files(id,name,size)", pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    out.push(...r.data.files);
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out;
}

async function download(drive, fileId) {
  const r = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return Buffer.from(r.data);
}

// Load server.js's point validation + NC PROGRAMS block with the real Drive client and Mongo client.
function loadServerHelpers(client, drive) {
  const src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const vStart = src.indexOf("function _validateScnaNcPoints");
  const vEnd = src.indexOf('app.post("/api/scna-nc-programs"');
  const bStart = src.indexOf("// ==================== NC PROGRAMS (non-SCNA");
  const bEnd = src.indexOf("// ==================== END NC PROGRAMS");
  if ([vStart, vEnd, bStart, bEnd].some((i) => i < 0)) throw new Error("server.js: NC PROGRAMS block not found");
  const app = { get() {}, post() {}, delete() {}, patch() {}, put() {} };
  const ctx = {
    app, client, ObjectId, Readable, DB_NAME: "Sasaki_Coating_MasterDB", _buildDriveClient: () => drive,
    console, process, Buffer, Date, Map, Set, Number, String, Array, Object, JSON, Math, Promise, Error, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(`${src.slice(vStart, vEnd)}\n${src.slice(bStart, bEnd)}
    ;globalThis.__nc = { _validateScnaNcPoints, _ncSaveProgram, _ncFindItem, _ncRootFolder };`, ctx);
  return ctx.__nc;
}

(async () => {
  const { parsePce } = await import(pathToFileURL(PARSER).href);
  const drive = buildDrive();
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    tlsAllowInvalidCertificates: true, tlsAllowInvalidHostnames: true,
  });
  await client.connect();
  const database = client.db("Sasaki_Coating_MasterDB");
  const nc = loadServerHelpers(client, drive);

  const oldId = process.env.GOOGLE_DRIVE_PCE_FOLDER_ID;
  if (!oldId) throw new Error("GOOGLE_DRIVE_PCE_FOLDER_ID is not set");
  // In dry-run mode do not create "freyaAdmin pce 2" if it is missing (the save would create it).
  let newId = process.env.GOOGLE_DRIVE_PCE2_FOLDER_ID || null;
  if (!newId) {
    const old = await drive.files.get({ fileId: oldId, supportsAllDrives: true, fields: "parents,driveId" });
    const parent = (old.data.parents || [])[0] || old.data.driveId;
    const r = await drive.files.list({
      q: `'${parent}' in parents and name = 'freyaAdmin pce 2' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    newId = r.data.files[0]?.id || null;
    if (!newId && APPLY) newId = await nc._ncRootFolder(drive);
  }

  const oldFiles = await listFiles(drive, oldId);
  const inNew = new Set(newId ? (await listFiles(drive, newId)).map((f) => f.name.toLowerCase()) : []);
  const programs = database.collection("ncProgramsDB");

  const report = { mode: APPLY ? "apply" : "dry-run", at: new Date().toISOString(), saved: [], wouldSave: [], skipped: [], failed: [] };
  const skip = (name, reason) => report.skipped.push({ name, reason });
  let done = 0;

  for (const f of oldFiles.sort((a, b) => a.name.localeCompare(b.name))) {
    const m = NAME_RE.exec(f.name);
    if (!m) { skip(f.name, "name is not <背番号>_<type>.pce"); continue; }
    const [, sebanggo, machineType] = m;
    if (ONLY && !ONLY.has(sebanggo)) continue;
    if (inNew.has(`${sebanggo}_${machineType}.pce`.toLowerCase())) continue; // already in pce 2 (not reported)
    if (await programs.findOne({ 背番号: sebanggo, machineType, machine: null, isActive: true }, { projection: { _id: 1 } })) {
      skip(f.name, "already has an active NC program"); continue;
    }
    if (done >= LIMIT) break;
    const item = await nc._ncFindItem(database, sebanggo);
    if (!item) { skip(f.name, "背番号 not in masterDB"); continue; }
    if (item.工場 === "SCNA") { skip(f.name, "SCNA item"); continue; }

    try {
      const buffer = await download(drive, f.id);
      const parsed = parsePce(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const error = nc._validateScnaNcPoints(parsed.points);
      if (error) throw new Error(error);
      const entry = { name: f.name, sebanggo, machineType, 工場: item.工場, points: parsed.pointCount };
      if (APPLY) {
        const saved = await nc._ncSaveProgram(database, drive, {
          item, sebanggo, machineType, machine: null, fileName: f.name, buffer,
          points: parsed.points, layers: parsed.layers, uploadedBy: UPLOADED_BY,
        });
        report.saved.push({ ...entry, id: String(saved._id) });
        console.log(`saved   ${f.name}  (${item.工場}, ${parsed.pointCount} points)`);
      } else {
        report.wouldSave.push(entry);
      }
      done++;
    } catch (e) {
      report.failed.push({ name: f.name, error: e.message });
      console.log(`FAILED  ${f.name}: ${e.message}`);
    }
  }

  const reasons = {};
  report.skipped.forEach((s) => { reasons[s.reason] = (reasons[s.reason] || 0) + 1; });
  console.log(`\nold folder: ${oldFiles.length} files · already in pce 2: ${inNew.size}`);
  console.log(`${APPLY ? "saved" : "would save"}: ${APPLY ? report.saved.length : report.wouldSave.length} · failed: ${report.failed.length} · skipped: ${report.skipped.length}`, reasons);
  const out = path.join(ROOT, "scripts", `migrate-pce-report-${report.mode}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`report: ${out}`);
  await client.close();
})().catch((e) => { console.error(e); process.exit(1); });
