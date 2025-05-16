// masterUserServer.js
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");

const app = express();
const port = 3100; // Different port from main server

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const DB_NAME = "Sasaki_Coating_MasterDB";

// Routes
app.get("/", (req, res) => {
  res.send("✅ Master User Server is running");
});

// Fetch all master users
app.get("/masterUsers", async (req, res) => {
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = await db.collection("masterUsers").find().toArray();
    res.json(users);
  } catch (error) {
    console.error("Error fetching master users:", error);
    res.status(500).send("Server error");
  }
});


// Create master user
app.post("/createMasterUser", async (req, res) => {
  const { username, password, company, email, validUntil, dbName } = req.body;

  if (!username || !password || !company || !email || !validUntil || !dbName) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    await client.connect();
    const masterDB = client.db("Sasaki_Coating_MasterDB");
    const masterUsers = masterDB.collection("masterUsers");

    // Check if username or dbName already exists
    const existingUser = await masterUsers.findOne({ username });
    const existingDb = (await client.db().admin().listDatabases()).databases.find(db => db.name === dbName);

    if (existingUser) return res.status(400).json({ error: "Username already exists" });
    if (existingDb) return res.status(400).json({ error: "Database name already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert to master user database
    const insertResult = await masterUsers.insertOne({
      username,
      password: hashedPassword,
      company,
      email,
      validUntil: new Date(validUntil),
      dbName,
      createdAt: new Date(),
    });

    // Automatically create the user-specific database and its collections
    const customerDB = client.db(dbName);
    await customerDB.createCollection("masterDB");
    await customerDB.createCollection("submittedDB");
    await customerDB.createCollection("logs");
    await customerDB.createCollection("indexes");
    await customerDB.collection("logs").insertOne({
      action: "database initialized",
      by: username,
      timestamp: new Date(),
    });

    res.status(201).json({ message: "Master user and customer DB created successfully" });
  } catch (err) {
    console.error("Error creating master user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/updateMasterUser", async (req, res) => {
  const { id, company, email, validUntil, dbName, devices } = req.body;

  if (!id) return res.status(400).json({ error: "Missing ID" });

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB"); // Or your actual DB
    const masterUsers = db.collection("masterUsers");

    const updateData = {
      company,
      email,
      validUntil: validUntil ? new Date(validUntil) : null,
      dbName
    };

    // Include devices array only if it exists
    if (Array.isArray(devices)) {
      updateData.devices = devices;
    }

    const result = await masterUsers.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "User not updated" });
    }

    res.status(200).json({ message: "Master user updated" });
  } catch (error) {
    console.error("Error updating master user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete master user
app.post("/deleteMasterUser", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send("Missing ID");

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const coll = db.collection("masterUsers");
    const result = await coll.deleteOne({ _id: new ObjectId(id) });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Error deleting user");
  }
});

app.listen(port, () => {
  console.log(`✅ MasterUser server running at http://localhost:${port}`);
});