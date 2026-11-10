// Import マスタ管理N-2.mdb → materialMasterDB3 / bomMasterDB / processMasterDB
// Follows MDB_to_MongoDB_guide.md. MDB is the source of truth for every
// MDB-derived field; custom fields (e.g. 品目マスタ.imageURL) are never touched
// because material writes use dot-notation $set.

const fs = require("fs");

const DB_NAME = "Sasaki_Coating_MasterDB";
const REQUIRED_TABLES = [
  "tbl100_品目マスタ",
  "tbl100_製造マスタ",
  "tbl400_工程マスタ",
  "tbl800_基本マスタ",
  "SCTFLIB_SSKET",
];
const SEGMENTS = [
  { segment: "分類コード", len: 1, table: "tbl101_分類コード", nameCol: "分類名" },
  { segment: "顧客コード", len: 2, table: "tbl102_顧客コード", customer: true },
  { segment: "基材コード", len: 6, table: "tbl103_基材コード", nameCol: "基材名" },
  { segment: "色コード", len: 2, table: "tbl104_色コード", nameCol: "色名" },
  { segment: "処理コード", len: 1, table: "tbl105_処理コード", nameCol: "処理名" },
  { segment: "粘着コード", len: 2, table: "tbl106_粘着コード", nameCol: "粘着名" },
  { segment: "厚コード", len: 3, table: "tbl107_厚コード", nameCol: "厚名" },
  { segment: "幅長コード", len: 3, table: "tbl108_幅長コード", nameCol: "幅長名" },
];
const CHUNK = 1000;

function cleanVal(v) {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" || t === "(Empty Date)" ? null : t;
  }
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === "number" && !Number.isInteger(v)) return Math.round(v * 1e6) / 1e6;
  if (typeof v === "bigint") return v.toString();
  if (Buffer.isBuffer(v)) return null;
  return v ?? null;
}
const norm = (s) => String(s ?? "").trim().replace(/\.$/, "");
const safeKey = (k) => String(k).replace(/\./g, "．").replace(/^\$/, "＄");

function stable(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (v && v._bsontype === "ObjectId") return JSON.stringify(String(v));
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}
const same = (a, b) => stable(a) === stable(b);

// Read big tables in slices so the raw MDB rows never all sit in memory at once.
function* chunkedRows(table, size = 2000) {
  const n = table.rowCount;
  for (let o = 0; o < n; o += size) yield* table.getData({ rowOffset: o, rowLimit: size });
}

// ─── Read MDB → in-memory dataset ───────────────────────────────────────────
async function readDataset(filePath, onStage = () => {}) {
  const { default: MDBReader } = await import("mdb-reader");
  onStage("MDBファイルを読み込み中 / Reading MDB file");
  const reader = new MDBReader(fs.readFileSync(filePath));
  const names = new Set(reader.getTableNames());
  const missing = REQUIRED_TABLES.filter((t) => !names.has(t));
  if (missing.length) {
    throw new Error(`This does not look like マスタ管理N-2.mdb. Missing tables: ${missing.join(", ")}`);
  }
  const rows = (t) => reader.getTable(t).getData();

  onStage("コードテーブルを読み込み中 / Reading lookup tables");
  const ssket = new Map();
  for (const r of rows("SCTFLIB_SSKET")) ssket.set(`${norm(r["MKB"])}|${norm(r["CODE9"])}`, r["NMOJI"]);
  const ssketLookup = (mkb, code) => (code == null ? null : cleanVal(ssket.get(`${norm(mkb)}|${norm(code)}`)));

  const kihon = new Map();
  for (const r of rows("tbl800_基本マスタ")) kihon.set(`${cleanVal(r["基本名称"])}|${norm(r["細目コード"])}`, cleanVal(r["細目名称"]));
  const kihonLookup = (cat, code) => (code == null ? null : kihon.get(`${cat}|${norm(code)}`) ?? null);

  const processRows = rows("tbl400_工程マスタ");
  const processByCode = new Map();
  for (const r of processRows) {
    const code = parseInt(String(r["工程コード"]).match(/\d+/)?.[0] ?? "", 10);
    if (!Number.isNaN(code)) processByCode.set(code, r);
  }

  // 品番 segment lookup tables (key column = table suffix, fallback first column)
  const segLookups = SEGMENTS.map((s) => {
    const map = new Map();
    if (names.has(s.table)) {
      const t = reader.getTable(s.table);
      const cols = t.getColumnNames();
      const keyCol = cols.includes(s.segment) ? s.segment : cols[0];
      for (const r of t.getData()) {
        const raw = String(r[keyCol] ?? "");
        // Names are kept exactly as stored (untrimmed), matching existing documents.
        const rawName = (v) => (v == null ? null : String(v));
        const rec = s.customer
          ? { 得意先: rawName(r["得意先"]), 入出荷先: rawName(r["入出荷先"]) }
          : { name: rawName(r[s.nameCol]) };
        if (!map.has(raw)) map.set(raw, rec);
      }
    }
    return map;
  });

  function decodeHinban(h) {
    if (h.length !== 20) return null;
    let pos = 0;
    const segments = SEGMENTS.map((s, i) => {
      const raw = h.slice(pos, pos + s.len);
      pos += s.len;
      const hit = segLookups[i].get(raw);
      if (s.customer) {
        return { segment: s.segment, raw, matched: !!hit, 得意先: hit?.得意先 ?? null, 入出荷先: hit?.入出荷先 ?? null };
      }
      return { segment: s.segment, raw, matched: !!hit, name: hit?.name ?? null };
    });
    return { fully_decoded: segments.every((s) => s.matched), segments };
  }

  onStage("品目マスタを変換中 / Converting 品目マスタ");
  const items = new Map(); // 品番 -> { fields, resolved, 品番構造 }
  let skippedNoHinban = 0;
  for (const r of chunkedRows(reader.getTable("tbl100_品目マスタ"))) {
    const hb = cleanVal(r["品番"]);
    if (hb == null || typeof hb !== "string") {
      skippedNoHinban++;
      continue;
    }
    const fields = {};
    for (const [k, v] of Object.entries(r)) fields[safeKey(k)] = cleanVal(v);
    const pair = (mkb, key) => ({ code: fields[key] ?? null, name: ssketLookup(mkb, fields[key]) });
    const procRaw = fields["工程コード"];
    const procCode = procRaw == null ? null : parseInt(String(procRaw).match(/\d+/)?.[0] ?? "", 10);
    const procOk = procCode != null && !Number.isNaN(procCode);
    const resolved = {
      品目区分: pair(701, "品目区分"),
      工程コード: {
        raw: typeof r["工程コード"] === "string" ? r["工程コード"] : procRaw ?? null, // untrimmed, as in existing docs
        code: procOk ? procCode : null,
        name: procOk ? cleanVal(processByCode.get(procCode)?.["工程名"]) ?? null : null,
      },
      色コード: pair(906, "色コード"),
      ユーザーコード: pair(900, "ユーザーコード"),
      工場コード: pair(901, "工場コード"),
      部門コード: { code: fields["部門コード"] ?? null, name: kihonLookup("部門コード", fields["部門コード"]) },
    };
    const doc = { fields, resolved };
    const struct = decodeHinban(hb);
    if (struct) doc.品番構造 = struct;
    items.set(hb, doc);
  }

  onStage("製造マスタ(BOM)を変換中 / Converting 製造マスタ (BOM)");
  // Convert each 製造マスタ row immediately (no raw-row grouping), sort per 品番 afterwards.
  const boms = new Map();
  for (const r of chunkedRows(reader.getTable("tbl100_製造マスタ"))) {
    const hb = cleanVal(r["品番"]);
    if (hb == null) continue;
    const pc = parseInt(String(r["工程コード"]).match(/\d+/)?.[0] ?? "", 10);
    const proc = processByCode.get(pc);
    const unit = cleanVal(r["生産単位"]);
    const step = {
      工程番号: cleanVal(r["工程番号"]),
      工程コード: Number.isNaN(pc) ? null : pc,
      工程名: cleanVal(proc?.["工程名"]) ?? null,
      工程略名: cleanVal(proc?.["工程略名"]) ?? null,
      構成品番: cleanVal(r["構成品番"]),
      生産単位: { code: unit, name: ssketLookup(902, unit) },
      原単位: cleanVal(r["原単位"]),
      製品原単位: cleanVal(r["製品原単位"]),
      作業リード日: cleanVal(r["作業リード日"]),
      総作業リード日: cleanVal(r["総作業リード日"]),
      段取時間: cleanVal(r["段取時間"]),
      作業時間: cleanVal(r["作業時間"]),
      型番: cleanVal(r["型番"]),
      曜日オプション: cleanVal(r["曜日オプション"]),
      時間オプション: cleanVal(r["時間オプション"]),
    };
    if (!boms.has(hb)) boms.set(hb, []);
    boms.get(hb).push(step);
  }
  for (const steps of boms.values()) steps.sort((a, b) => Number(a.工程番号) - Number(b.工程番号));

  onStage("工程マスタを変換中 / Converting 工程マスタ");
  const processes = new Map();
  for (const [code, r] of processByCode) {
    const o = {};
    for (const k of ["工程名", "工程略名", "工程仕様", "工程分類コード", "事業所コード", "部門コード"]) o[k] = cleanVal(r[k]);
    processes.set(code, {
      工程コード: code,
      ...o,
      resolved: {
        工程分類コード: { code: o.工程分類コード, name: kihonLookup("工程分類コード", o.工程分類コード) },
        事業所コード: { code: o.事業所コード, name: kihonLookup("事業所", o.事業所コード) },
        部門コード: { code: o.部門コード, name: kihonLookup("部門コード", o.部門コード) },
      },
    });
  }

  return { items, boms, processes, skippedNoHinban };
}

// ─── Plan: compare dataset against Mongo ────────────────────────────────────
function itemSetDoc(hb, d) {
  const set = { 品番: hb, resolved: d.resolved };
  for (const [k, v] of Object.entries(d.fields)) set[`品目マスタ.${k}`] = v;
  if (d.品番構造) set.品番構造 = d.品番構造;
  return set;
}

function buildBomDoc(hb, steps, idMap) {
  return {
    品番: hb,
    BOM: steps.map((s) => {
      const id = s.構成品番 != null ? idMap.get(s.構成品番) : null;
      return { ...s, 構成品_id: id ?? null };
    }),
  };
}

async function loadIdMap(db) {
  const map = new Map();
  const cur = db.collection("materialMasterDB3").find({}, { projection: { 品番: 1 } });
  for await (const d of cur) if (d.品番 != null && !map.has(d.品番)) map.set(d.品番, d._id);
  return map;
}

async function buildPlan(db, ds, onStage = () => {}) {
  onStage("既存の材料データを比較中 / Comparing materialMasterDB3");
  const plan = { material: { add: [], change: [], unchanged: 0 }, bom: { add: [], change: [], unchanged: 0 }, process: { add: [], change: [], unchanged: 0 } };
  const samples = { material: [], bom: [], process: [] };
  const existingIds = new Map();
  const seenInDb = new Set();

  const cur = db.collection("materialMasterDB3").find({}, { projection: { 品番: 1, 品目マスタ: 1, resolved: 1, 品番構造: 1 } });
  for await (const doc of cur) {
    const hb = doc.品番;
    if (hb == null) continue;
    existingIds.set(hb, doc._id);
    seenInDb.add(hb);
    const d = ds.items.get(hb);
    if (!d) continue;
    const changedFields = [];
    const ex = doc.品目マスタ || {};
    for (const [k, v] of Object.entries(d.fields)) if (!same(ex[k] ?? null, v)) changedFields.push(k);
    for (const k of Object.keys(d.resolved)) {
      if (!same(doc.resolved?.[k], d.resolved[k])) changedFields.push(`resolved.${k}`);
    }
    if (d.品番構造 && !same(doc.品番構造, d.品番構造)) changedFields.push("品番構造");
    if (changedFields.length) {
      plan.material.change.push(hb);
      if (samples.material.length < 30) samples.material.push({ 品番: hb, kind: "changed", fields: changedFields.slice(0, 8) });
    } else plan.material.unchanged++;
  }
  for (const hb of ds.items.keys()) {
    if (!seenInDb.has(hb)) {
      plan.material.add.push(hb);
      if (samples.material.filter((s) => s.kind === "added").length < 15) samples.material.push({ 品番: hb, kind: "added" });
    }
  }
  const materialNotInMdb = [...seenInDb].filter((hb) => !ds.items.has(hb)).length;

  onStage("既存のBOMデータを比較中 / Comparing bomMasterDB");
  // Preview ids: existing ids, or a placeholder for items about to be added.
  const previewIds = new Map(existingIds);
  for (const hb of plan.material.add) previewIds.set(hb, `NEW:${hb}`);
  const bomSeen = new Set();
  const bcur = db.collection("bomMasterDB").find({}, { projection: { 品番: 1, BOM: 1 } });
  for await (const doc of bcur) {
    const hb = doc.品番;
    if (hb == null) continue;
    bomSeen.add(hb);
    const steps = ds.boms.get(hb);
    if (!steps) continue;
    const want = buildBomDoc(hb, steps, previewIds).BOM;
    if (same(doc.BOM, want)) plan.bom.unchanged++;
    else {
      plan.bom.change.push(hb);
      if (samples.bom.length < 30) samples.bom.push({ 品番: hb, kind: "changed" });
    }
  }
  for (const hb of ds.boms.keys()) {
    if (!bomSeen.has(hb)) {
      plan.bom.add.push(hb);
      if (samples.bom.filter((s) => s.kind === "added").length < 15) samples.bom.push({ 品番: hb, kind: "added" });
    }
  }
  const bomNotInMdb = [...bomSeen].filter((hb) => !ds.boms.has(hb)).length;
  let missingLinks = 0;
  for (const steps of ds.boms.values()) for (const s of steps) if (s.構成品番 != null && !previewIds.has(s.構成品番)) missingLinks++;

  onStage("既存の工程データを比較中 / Comparing processMasterDB");
  const procSeen = new Set();
  const pcur = db.collection("processMasterDB").find({});
  for await (const doc of pcur) {
    const want = ds.processes.get(doc.工程コード);
    if (!want) continue;
    procSeen.add(doc.工程コード);
    if (Object.keys(want).every((k) => same(doc[k] ?? null, want[k]))) plan.process.unchanged++;
    else {
      plan.process.change.push(doc.工程コード);
      if (samples.process.length < 30) samples.process.push({ 工程コード: doc.工程コード, kind: "changed" });
    }
  }
  for (const code of ds.processes.keys()) {
    if (!procSeen.has(code)) {
      plan.process.add.push(code);
      if (samples.process.length < 30) samples.process.push({ 工程コード: code, kind: "added" });
    }
  }

  const summary = {
    mdb: { items: ds.items.size, boms: ds.boms.size, processes: ds.processes.size, skippedNoHinban: ds.skippedNoHinban },
    material: { add: plan.material.add.length, change: plan.material.change.length, unchanged: plan.material.unchanged, notInMdb: materialNotInMdb },
    bom: { add: plan.bom.add.length, change: plan.bom.change.length, unchanged: plan.bom.unchanged, notInMdb: bomNotInMdb, missingComponentLinks: missingLinks },
    process: { add: plan.process.add.length, change: plan.process.change.length, unchanged: plan.process.unchanged },
    samples,
  };
  return { plan, summary };
}

// ─── Apply payload (only the changed documents, written to an NDJSON file) ───
// The preview step writes exactly what must be written; apply streams that file
// and never has to re-read the 230MB MDB.
function writePayload(ds, plan, payloadPath) {
  const fd = fs.openSync(payloadPath, "w");
  const w = (o) => fs.writeSync(fd, JSON.stringify(o) + "\n");
  try {
    for (const hb of [...plan.material.add, ...plan.material.change]) w({ t: "m", 品番: hb, set: itemSetDoc(hb, ds.items.get(hb)) });
    const bomTargets = new Set([...plan.bom.add, ...plan.bom.change]);
    // BOMs that reference newly added items must be rewritten so 構成品_id resolves.
    const newItems = new Set(plan.material.add);
    if (newItems.size) for (const [hb, steps] of ds.boms) if (steps.some((s) => newItems.has(s.構成品番))) bomTargets.add(hb);
    for (const hb of bomTargets) w({ t: "b", 品番: hb, steps: ds.boms.get(hb) });
    for (const code of [...plan.process.add, ...plan.process.change]) w({ t: "p", doc: ds.processes.get(code) });
  } finally {
    fs.closeSync(fd);
  }
}

async function bulk(coll, ops, acc) {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const r = await coll.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
    acc.matched += r.matchedCount || 0;
    acc.modified += r.modifiedCount || 0;
    acc.upserted += r.upsertedCount || 0;
  }
}

async function applyPayload(db, payloadPath, onStage = () => {}) {
  const readline = require("readline");
  const colls = { m: db.collection("materialMasterDB3"), b: db.collection("bomMasterDB"), p: db.collection("processMasterDB") };
  const keyField = { m: "品番", b: "品番", p: "工程コード" };
  for (const t of ["m", "b", "p"]) {
    try { await colls[t].createIndex({ [keyField[t]]: 1 }, { unique: true }); } catch (e) { console.warn(`⚠️ index ${colls[t].collectionName}: ${e.message}`); }
  }
  const result = { material: { matched: 0, modified: 0, upserted: 0 }, bom: { matched: 0, modified: 0, upserted: 0, missingComponentLinks: 0 }, process: { matched: 0, modified: 0, upserted: 0 } };
  const accOf = { m: result.material, b: result.bom, p: result.process };
  const label = { m: "材料 / materials", b: "BOM", p: "工程 / processes" };
  let curType = null, ops = [], idMap = null, done = 0;

  const flush = async () => {
    if (ops.length && curType) {
      await bulk(colls[curType], ops, accOf[curType]);
      done += ops.length;
      onStage(`${label[curType]}を更新中 / Writing ${label[curType]} (${done})`);
    }
    ops = [];
  };

  const rl = readline.createInterface({ input: fs.createReadStream(payloadPath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const o = JSON.parse(line);
    if (o.t !== curType) {
      await flush();
      curType = o.t;
      done = 0;
      if (curType === "b") {
        onStage("コンポーネントIDを解決中 / Resolving component ids");
        idMap = await loadIdMap(db); // live ids, after new materials were written
      }
    }
    if (o.t === "m") {
      ops.push({ updateOne: { filter: { 品番: o.品番 }, update: { $set: o.set }, upsert: true } });
    } else if (o.t === "b") {
      const doc = buildBomDoc(o.品番, o.steps, idMap);
      for (const s of doc.BOM) if (s.構成品番 != null && s.構成品_id == null) result.bom.missingComponentLinks++;
      ops.push({ updateOne: { filter: { 品番: o.品番 }, update: { $set: doc }, upsert: true } });
    } else if (o.t === "p") {
      ops.push({ updateOne: { filter: { 工程コード: o.doc.工程コード }, update: { $set: o.doc }, upsert: true } });
    }
    if (ops.length >= CHUNK) await flush();
  }
  await flush();
  return result;
}

module.exports = { readDataset, buildPlan, writePayload, applyPayload, DB_NAME };
