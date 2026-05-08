/**
 * One-time seed script: inserts 小瀬 equipment into setsubiDB.
 * Run with:  node scripts/seed-setsubi-kose.js
 * Requires the Kurachi server to be running on localhost:3000.
 */

const BASE_URL = "http://localhost:3000";
const IMAGE_BASE = "https://karlsome.github.io/Kurachi/src/machines/";

function img(filename) {
  return IMAGE_BASE + filename;
}

const machines = [
  // Individual machines — specific images where available
  { name: "OZNC01", imageURL: img("OZNC01.jpg") },
  { name: "OZNC02", imageURL: img("OZNC02.jpg") },
  { name: "OZNC03", imageURL: img("OZNC03.jpg") },
  { name: "OZNC04", imageURL: img("NCC01.jpg") },
  { name: "OZNC05", imageURL: img("NCC01.jpg") },
  { name: "OZNC06", imageURL: img("NCC01.jpg") },
  { name: "OZNC07", imageURL: img("NCC01.jpg") },
  { name: "OZNC08", imageURL: img("NCC01.jpg") },
  { name: "OZNC09", imageURL: img("NCC01.jpg") },
  { name: "OZNC10", imageURL: img("NCC01.jpg") },
  { name: "OZNC11", imageURL: img("NCC01.jpg") },
  { name: "OZNC12", imageURL: img("NCC01.jpg") },
  { name: "OZNC13", imageURL: img("NCC01.jpg") },
  { name: "OZNC14", imageURL: img("NCC01.jpg") },
  { name: "OZNC15", imageURL: img("NCC01.jpg") },
  { name: "OZNC16", imageURL: img("NCC01.jpg") },
  { name: "OZNC17", imageURL: img("NCC01.jpg") },
  { name: "OZNC18", imageURL: img("NCC01.jpg") },
  // Paired machines — formatted with comma instead of plus
  { name: "OZNC03,OZNC05", imageURL: img("OZNC03.jpg") },
  { name: "OZNC04,OZNC06", imageURL: img("NCC01.jpg") },
  { name: "OZNC07,OZNC09", imageURL: img("NCC01.jpg") },
  { name: "OZNC08,OZNC10", imageURL: img("NCC01.jpg") },
];

const records = machines.map((m) => ({
  name: m.name,
  工場: "小瀬",
  imageURL: m.imageURL,
}));

async function seed() {
  console.log(`Inserting ${records.length} records into setsubiDB (工場: 小瀬)…`);

  const response = await fetch(BASE_URL + "/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dbName: "Sasaki_Coating_MasterDB",
      collectionName: "setsubiDB",
      query: {},
      insertData: records,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("❌ Insert failed:", result);
    process.exit(1);
  }

  console.log(`✅ Inserted ${result.insertedCount ?? "?"} records.`);
}

seed().catch((err) => {
  console.error("❌ Unexpected error:", err.message);
  process.exit(1);
});
