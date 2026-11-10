// Child process for the MDB import preview. Reading the 230MB MDB peaks near 1GB,
// so it runs here (with its own heap limit) and exits afterwards, returning all
// memory to the OS instead of bloating the API server.
// argv: <mdbPath> <payloadPath>     IPC out: {type:'stage'|'done'|'error', ...}
const { MongoClient, ServerApiVersion } = require("mongodb");
const mdbImport = require("./mdbImport");

const [mdbPath, payloadPath] = process.argv.slice(2);
const send = (m) => process.send && process.send(m);

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
  });
  try {
    const onStage = (stage) => send({ type: "stage", stage });
    const ds = await mdbImport.readDataset(mdbPath, onStage);
    await client.connect();
    const { plan, summary } = await mdbImport.buildPlan(client.db(mdbImport.DB_NAME), ds, onStage);
    onStage("適用データを準備中 / Preparing changes");
    mdbImport.writePayload(ds, plan, payloadPath);
    send({ type: "done", summary });
  } catch (e) {
    send({ type: "error", message: e.message });
  } finally {
    await client.close().catch(() => {});
    process.exit(0);
  }
})();
