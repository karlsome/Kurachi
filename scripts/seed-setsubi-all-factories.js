/**
 * Seed setsubiDB with equipment for every factory in factoryDB.
 *
 * Machine names are fetched DYNAMICALLY from /getSetsubiList (queries submittedDB.pressDB).
 * Already-seeded records are skipped so the script is safe to re-run.
 *
 * Usage: node scripts/seed-setsubi-all-factories.js
 * Requires the Kurachi server to be running on localhost:3000.
 */

const BASE      = "http://localhost:3000";
const DB_NAME   = "Sasaki_Coating_MasterDB";
const IMG_BASE  = "https://karlsome.github.io/Kurachi/src/machines/";

// ── Image URL helper ─────────────────────────────────────────────────────────
// Picks the best available image based on the first machine name in a record.
function imageForMachine(machineName) {
  if (!machineName) return IMG_BASE + "NCC01.jpg";

  // For paired entries (e.g. "OZNC03,OZNC05") use the first name
  const primary = machineName.split(",")[0].trim();

  if (primary === "OZNC01") return IMG_BASE + "OZNC01.jpg";
  if (primary === "OZNC02") return IMG_BASE + "OZNC02.jpg";
  if (primary.startsWith("OZNC03")) return IMG_BASE + "OZNC03.jpg";
  if (primary.startsWith("ALC01")) return IMG_BASE + "ALC01.jpg";
  if (primary.startsWith("ALC02")) return IMG_BASE + "ALC02.jpg";
  if (primary.startsWith("RPNC")) return IMG_BASE + "RPNC01.jpg";
  if (primary.startsWith("NCC"))  return IMG_BASE + "NCC01.jpg";

  return IMG_BASE + "NCC01.jpg"; // default fallback
}

// ── Generic helpers ──────────────────────────────────────────────────────────
async function postJson(endpoint, body) {
  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function getJson(endpoint) {
  const res = await fetch(BASE + endpoint);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Fetch all factories from factoryDB ───────────────────────────────────────
async function fetchFactories() {
  const result = await postJson("/queries", {
    dbName: DB_NAME,
    collectionName: "factoryDB",
    query: {},
    sort: { 工場: 1 },
  });
  return Array.isArray(result) ? result : [];
}

// ── Fetch existing setsubiDB records ─────────────────────────────────────────
async function fetchExistingEquipment() {
  const result = await postJson("/queries", {
    dbName: DB_NAME,
    collectionName: "setsubiDB",
    query: {},
  });
  return Array.isArray(result) ? result : [];
}

// ── Fetch distinct equipment for one factory from production data ─────────────
async function fetchMachinesForFactory(factoryName) {
  try {
    const result = await getJson(`/getSetsubiList?factory=${encodeURIComponent(factoryName)}`);
    return Array.isArray(result)
      ? result.map((r) => r["設備"]).filter(Boolean)
      : [];
  } catch (err) {
    console.warn(`  ⚠ Could not fetch machines for ${factoryName}: ${err.message}`);
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("Fetching factories from factoryDB…");
  const factories = await fetchFactories();

  if (factories.length === 0) {
    console.log("No factories found in factoryDB. Nothing to do.");
    return;
  }

  console.log(`Found ${factories.length} factories: ${factories.map((f) => f["工場"]).join(", ")}\n`);

  console.log("Fetching existing setsubiDB records to avoid duplicates…");
  const existing = await fetchExistingEquipment();

  // Build a Set of "工場::name" keys already in the DB
  const alreadySeeded = new Set(
    existing.map((r) => `${r["工場"] ?? ""}::${r.name ?? ""}`)
  );
  console.log(`  ${alreadySeeded.size} records already in setsubiDB.\n`);

  let totalInserted = 0;

  for (const factory of factories) {
    const factoryName = factory["工場"];
    if (!factoryName) continue;

    console.log(`→ ${factoryName}`);
    const machines = await fetchMachinesForFactory(factoryName);

    if (machines.length === 0) {
      console.log("  No machines found in production data — skipping.\n");
      continue;
    }

    console.log(`  Found ${machines.length} machines: ${machines.join(", ")}`);

    // Filter out already-seeded records
    const toInsert = machines
      .filter((name) => !alreadySeeded.has(`${factoryName}::${name}`))
      .map((name) => ({
        name,
        工場: factoryName,
        imageURL: imageForMachine(name),
      }));

    if (toInsert.length === 0) {
      console.log("  All machines already seeded — skipping.\n");
      continue;
    }

    const result = await postJson("/queries", {
      dbName: DB_NAME,
      collectionName: "setsubiDB",
      query: {},
      insertData: toInsert,
    });

    const count = result.insertedCount ?? toInsert.length;
    console.log(`  ✅ Inserted ${count} records.\n`);
    totalInserted += count;

    // Update the local duplicate-check set so subsequent loops stay accurate
    toInsert.forEach((r) => alreadySeeded.add(`${factoryName}::${r.name}`));
  }

  console.log(`Done. Total inserted: ${totalInserted}`);
}

seed().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
