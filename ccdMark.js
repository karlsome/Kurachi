"use strict";

/**
 * CCD mark app (ioT/ccd_mark on the cutter's miniPC) -> cloud backup, same path as SCNA NC:
 * miniPC -> this server -> Mongo (+ the PCE file in Firebase Storage).
 *
 *   PUT  /api/ccd-mark/recipes/:sebanggo   {machine, recipe, pceName?, pceBase64?}  save / replace a recipe
 *   GET  /api/ccd-mark/recipes?machine=     list (no recipe body)
 *   GET  /api/ccd-mark/recipes/:sebanggo?machine=   full recipe + pceURL (restore on a miniPC)
 *   GET  /api/ccd-mark/recipes/:sebanggo/history?machine=   replaced versions, newest first (no recipe body)
 *   POST /api/ccd-mark/cuts                 one finished sheet: mark differences + cut check result
 *   GET  /api/ccd-mark/cuts?machine=&sebanggo=&limit=
 *
 * Collections: ccdMarkRecipesDB (one active doc per machine + 背番号; a replaced one is moved to
 * ccdMarkRecipesHistoryDB), ccdMarkCutsDB. PCE originals: Storage ccdMark/<machine>/<背番号>/<time>.pce,
 * written only when the file changed (sha1).
 *
 * Version = recipe.updated || recipe.created (time of the last save on a PC). An upload older than the
 * active cloud copy is refused (409) so a PC that was offline cannot overwrite a newer recipe; that PC
 * downloads the newer one at its next sync instead.
 */

const crypto = require("crypto");

const RECIPES = "ccdMarkRecipesDB";
const HISTORY = "ccdMarkRecipesHistoryDB";
const CUTS = "ccdMarkCutsDB";
const NAME_RE = /^[\w\-.]+$/;

function registerCcdMarkRoutes(app, client, { dbName, bucket }) {
  const db = async () => {
    await client.connect();
    return client.db(dbName);
  };
  const machineOf = (v) => String(v || "").trim();

  app.put("/api/ccd-mark/recipes/:sebanggo", async (req, res) => {
    try {
      const sebanggo = req.params.sebanggo;
      const { recipe, pceName, pceBase64 } = req.body || {};
      const from = String((req.body && req.body.from) || "").slice(0, 100);
      const machine = machineOf(req.body && req.body.machine);
      if (!NAME_RE.test(sebanggo) || !NAME_RE.test(machine)) {
        return res.status(400).json({ error: "valid 背番号 and machine are required" });
      }
      if (!recipe || typeof recipe !== "object" || !recipe.marks || typeof recipe.marks !== "object") {
        return res.status(400).json({ error: "recipe with marks is required" });
      }
      const d = await db();
      const col = d.collection(RECIPES);
      const old = await col.findOne({ machine, 背番号: sebanggo, isActive: true });
      const now = new Date().toISOString();
      const savedAt = String(recipe.updated || recipe.created || "");
      if (old && old.savedAt && savedAt < old.savedAt) {
        return res.status(409).json({ error: `cloud has a newer version (${old.savedAt})`, savedAt: old.savedAt });
      }

      let pce = old ? { pceName: old.pceName, pceURL: old.pceURL, pceSha1: old.pceSha1 } : {};
      if (pceBase64) {
        const buf = Buffer.from(String(pceBase64), "base64");
        const sha1 = crypto.createHash("sha1").update(buf).digest("hex");
        if (!old || old.pceSha1 !== sha1) {
          const file = bucket().file(`ccdMark/${machine}/${sebanggo}/${Date.now()}.pce`);
          await file.save(buf, {
            metadata: { contentType: "application/octet-stream",
                        metadata: { firebaseStorageDownloadTokens: "masterDBToken69" } },
            public: true,
          });
          pce.pceURL = `https://storage.googleapis.com/${file.bucket.name}/${encodeURIComponent(file.name)}?alt=media&token=masterDBToken69`;
          pce.pceSha1 = sha1;
        }
        pce.pceName = pceName || pce.pceName || `${sebanggo}.pce`;
      }

      const doc = {
        machine,
        背番号: sebanggo,
        recipe,
        markCount: Object.keys(recipe.marks).length,
        savedAt,                                 // when the recipe was last saved on a PC (= version)
        uploadedFrom: from,                      // host name of that PC
        ...pce,
        uploadedAt: now,
        isActive: true,
      };
      if (old) {
        if (old.savedAt === doc.savedAt && old.pceSha1 === doc.pceSha1) {
          await col.updateOne({ _id: old._id }, { $set: { recipe, markCount: doc.markCount, uploadedAt: now } });
          return res.json({ success: true, unchanged: true });
        }
        const { _id, ...rest } = old;
        await d.collection(HISTORY).insertOne({ ...rest, recipeId: _id, replacedAt: now });
        await col.updateOne({ _id: old._id }, { $set: doc });
      } else {
        await col.insertOne(doc);
      }
      res.json({ success: true, pceURL: doc.pceURL || null });
    } catch (error) {
      console.error("❌ ccd-mark recipe save:", error);
      res.status(500).json({ error: "Failed to save recipe", details: error.message });
    }
  });

  app.get("/api/ccd-mark/recipes", async (req, res) => {
    try {
      const q = { isActive: true };
      if (req.query.machine) q.machine = machineOf(req.query.machine);
      const list = await (await db()).collection(RECIPES).find(q)
        .project({ recipe: 0 }).sort({ machine: 1, 背番号: 1 }).toArray();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to list recipes", details: error.message });
    }
  });

  app.get("/api/ccd-mark/recipes/:sebanggo/history", async (req, res) => {
    try {
      const machine = machineOf(req.query.machine);
      if (!machine) return res.status(400).json({ error: "machine is required" });
      const list = await (await db()).collection(HISTORY)
        .find({ machine, 背番号: req.params.sebanggo })
        .project({ recipe: 0 }).sort({ replacedAt: -1 }).limit(100).toArray();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to list recipe history", details: error.message });
    }
  });

  app.get("/api/ccd-mark/recipes/:sebanggo", async (req, res) => {
    try {
      const machine = machineOf(req.query.machine);
      if (!machine) return res.status(400).json({ error: "machine is required" });
      const doc = await (await db()).collection(RECIPES)
        .findOne({ machine, 背番号: req.params.sebanggo, isActive: true });
      if (!doc) return res.status(404).json({ error: "Recipe not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recipe", details: error.message });
    }
  });

  app.post("/api/ccd-mark/cuts", async (req, res) => {
    try {
      const b = req.body || {};
      const machine = machineOf(b.machine);
      if (!NAME_RE.test(machine) || !b.date || !b.time) {
        return res.status(400).json({ error: "machine, date and time are required" });
      }
      const col = (await db()).collection(CUTS);
      // the miniPC retries until it gets an answer: one doc per machine + date + time
      const key = { machine, date: String(b.date), time: String(b.time) };
      const doc = { ...b, ...key, 背番号: String(b.sebanggo || ""), uploadedAt: new Date().toISOString() };
      delete doc.sebanggo;
      delete doc._id;
      await col.updateOne(key, { $set: doc }, { upsert: true });
      res.json({ success: true });
    } catch (error) {
      console.error("❌ ccd-mark cut save:", error);
      res.status(500).json({ error: "Failed to save cut", details: error.message });
    }
  });

  app.get("/api/ccd-mark/cuts", async (req, res) => {
    try {
      const q = {};
      if (req.query.machine) q.machine = machineOf(req.query.machine);
      if (req.query.sebanggo) q.背番号 = String(req.query.sebanggo);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 2000);
      const list = await (await db()).collection(CUTS).find(q)
        .sort({ date: -1, time: -1 }).limit(limit).toArray();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to list cuts", details: error.message });
    }
  });
}

module.exports = { registerCcdMarkRoutes };
