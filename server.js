// This is the COMBINED version of `server.js` with all `masterUserServer.js` routes ported into it.
// Nothing from `masterUserServer.js` is lost — everything is now under the same server, same Express instance.
// The port used will still be 3000 (same as original `server.js`) unless you change it below.
const jwt = require('jsonwebtoken');
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
  // Disable SSL certificate validation for development (fixes Google API SSL errors)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️  Development mode: SSL certificate validation disabled');
}

const express = require("express");
const bodyParser = require('body-parser');
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");

// GEN-related imports
const path = require('path');
const fs = require('fs');
const { extractGENTokens } = require('./gen-token-extractor');
const fetch = require('node-fetch');
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// SSE (Server-Sent Events) Setup
// ============================================
// Store connected clients for each machine
const machineConnections = new Map();

// Store connected clients for each factory (for production TV)
const factoryConnections = new Map();

// Helper function to send SSE message to specific machine clients
function broadcastToMachine(machineId, data) {
  const clients = machineConnections.get(machineId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.error(`Error sending to client for ${machineId}:`, error);
    }
  });
  
  console.log(`📡 Broadcasted to ${clients.length} client(s) on ${machineId}:`, data);
}

// Helper function to send SSE message to all factory TV clients
function broadcastToFactory(factoryId, data) {
  const clients = factoryConnections.get(factoryId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.error(`Error sending to client for factory ${factoryId}:`, error);
    }
  });
  
  console.log(`📡 Broadcasted to ${clients.length} factory TV client(s) on ${factoryId}:`, data);
}

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  readPreference:'nearest', // Use 'nearest' read preference for better performance
  tlsAllowInvalidCertificates: true, // Fix for local development SSL certificate issues
  tlsAllowInvalidHostnames: true, // Fix for local development SSL certificate issues
});

const DB_NAME = "Sasaki_Coating_MasterDB";

// Routes
app.get("/", (req, res) => {
  res.send("✅ Master User Server is running");
});

// ============================================
// SSE ROUTES - Machine Display Pages
// ============================================

// SSE endpoint - clients connect here to receive real-time updates
app.get("/sse/machine/:machineId", (req, res) => {
  const machineId = req.params.machineId.toUpperCase();
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add this client to the machine's connection list
  if (!machineConnections.has(machineId)) {
    machineConnections.set(machineId, []);
  }
  machineConnections.get(machineId).push(res);
  
  console.log(`✅ New SSE connection established for ${machineId}. Total clients: ${machineConnections.get(machineId).length}`);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', machineId, timestamp: new Date().toISOString() })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    const clients = machineConnections.get(machineId) || [];
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
    console.log(`❌ SSE client disconnected from ${machineId}. Remaining: ${clients.length}`);
  });
});

// SSE endpoint for factory TV - monitors all equipment in a factory
app.get("/sse/factory/:factoryId", (req, res) => {
  const factoryId = req.params.factoryId;
  
  console.log(`🏭 New factory TV connection request for: ${factoryId}`);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add this client to factory connections
  if (!factoryConnections.has(factoryId)) {
    factoryConnections.set(factoryId, []);
  }
  factoryConnections.get(factoryId).push(res);
  
  console.log(`✅ New factory TV connected to ${factoryId}. Total TVs: ${factoryConnections.get(factoryId).length}`);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', factoryId, timestamp: new Date().toISOString() })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    const clients = factoryConnections.get(factoryId) || [];
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
    console.log(`❌ Factory TV disconnected from ${factoryId}. Remaining: ${clients.length}`);
  });
});

// API endpoint to broadcast scan data to specific machine
app.post("/api/broadcast-scan", async (req, res) => {
  const { machineId, sebanggo, hinban, timestamp, additionalData } = req.body;
  
  // Allow empty sebanggo only if action is 'clear'
  const isClearAction = additionalData?.action === 'clear';
  
  if (!machineId || (!sebanggo && !isClearAction)) {
    return res.status(400).json({ error: "machineId and sebanggo are required (unless action is 'clear')" });
  }
  
  const normalizedMachineId = machineId.toUpperCase();
  
  // Broadcast to all clients listening to this machine
  broadcastToMachine(normalizedMachineId, {
    type: 'scan',
    machineId: normalizedMachineId,
    sebanggo,
    hinban: hinban || '',
    timestamp: timestamp || new Date().toISOString(),
    additionalData: additionalData || {}
  });
  
  // ✅ Insert log to tabletLogDB in parallel with SSE broadcast
  if (sebanggo && hinban) {
    try {
      await client.connect();
      const database = client.db("submittedDB");
      const tabletLogDB = database.collection("tabletLogDB");
      
      const currentDate = new Date();
      const dateYYYYMMDD = currentDate.toISOString().split('T')[0]; // yyyy-mm-dd
      const timeHHMMSS = currentDate.toTimeString().split(' ')[0]; // HH:mm:ss
      
      // Extract 工場 and sessionID from additionalData
      const 工場 = additionalData?.工場 || additionalData?.factory || '';
      const sessionID = additionalData?.sessionID || '';
      const cleanedAdditionalData = { ...additionalData };
      delete cleanedAdditionalData.工場;
      delete cleanedAdditionalData.factory;
      delete cleanedAdditionalData.sessionID;
      
      const logEntry = {
        sessionID: sessionID,
        背番号: sebanggo,
        品番: hinban,
        工場: 工場,
        設備: normalizedMachineId,
        Action: 'Scanned kanban (Step 1)',
        Status: 'in-progress',
        Timestamp: currentDate.toISOString(), // ISO string format
        Date: dateYYYYMMDD, // yyyy-mm-dd
        Time: timeHHMMSS, // HH:mm:ss
        AdditionalData: cleanedAdditionalData
      };
      
      await tabletLogDB.insertOne(logEntry);
      console.log(`📝 Tablet log inserted: ${sebanggo} - Scanned kanban (Session: ${sessionID})`);
    } catch (error) {
      console.error('❌ Error inserting tablet log:', error);
      // Don't block the response if logging fails
    }
  }
  
  res.json({ 
    success: true, 
    message: `Broadcasted to ${normalizedMachineId}`,
    clientCount: (machineConnections.get(normalizedMachineId) || []).length
  });
});

// API endpoint to generate sessionID by getting next order number
app.get("/api/generate-session-id", async (req, res) => {
  try {
    const { 背番号, 設備, 工場, Date: dateParam } = req.query;
    
    if (!背番号 || !設備 || !工場 || !dateParam) {
      return res.status(400).json({ error: "背番号, 設備, 工場, and Date are required" });
    }
    
    await client.connect();
    const database = client.db("submittedDB");
    const tabletLogDB = database.collection("tabletLogDB");
    
    // Find the highest order number for this pattern today (count distinct sessionIDs, not all log entries)
    const basePattern = `${背番号}_${設備}_${工場}_${dateParam}`;
    const escapedPattern = basePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use aggregation pipeline to get distinct sessionIDs (API v1 compatible)
    const existingSessions = await tabletLogDB.aggregate([
      { $match: { sessionID: { $regex: `^${escapedPattern}_` } } },
      { $group: { _id: "$sessionID" } },
      { $project: { sessionID: "$_id", _id: 0 } }
    ]).toArray();
    
    // Find the highest order number from existing sessions
    let highestOrder = 0;
    existingSessions.forEach(doc => {
      const sessionID = doc.sessionID;
      const match = sessionID.match(/_([0-9]+)$/);
      if (match) {
        const orderNum = parseInt(match[1], 10);
        if (orderNum > highestOrder) {
          highestOrder = orderNum;
        }
      }
    });
    
    const orderNumber = highestOrder + 1;
    const sessionID = `${basePattern}_${orderNumber.toString().padStart(3, '0')}`;
    
    res.json({ 
      success: true, 
      sessionID: sessionID,
      orderNumber: orderNumber
    });
  } catch (error) {
    console.error("❌ Error generating sessionID:", error);
    res.status(500).json({ 
      error: "Error generating sessionID", 
      details: error.message 
    });
  }
});

// API endpoint to insert tablet action logs
app.post("/api/tablet-log", async (req, res) => {
  try {
    const { 背番号, 品番, 工場, 設備, Action, Status, sessionID, AdditionalData } = req.body;
    
    // Validate required fields - 設備 and Action are always required
    if (!設備 || !Action) {
      return res.status(400).json({ error: "設備 and Action are required" });
    }
    
    // 背番号 is required for most actions, but not for setup actions
    const setupActions = ['Kensa mode checkbox toggled', 'Break time', 'Reset'];
    const isSetupAction = setupActions.some(setupAction => Action.includes(setupAction));
    
    if (!背番号 && !isSetupAction) {
      return res.status(400).json({ error: "背番号 is required for this action" });
    }
    
    // ✅ STRICT REQUIREMENT: sessionID must be provided by frontend
    if (!sessionID) {
      console.error(`❌ REJECTED: No sessionID provided for action: ${Action}`);
      return res.status(400).json({ 
        error: "sessionID is required. Frontend must generate and provide sessionID.",
        action: Action,
        設備: 設備
      });
    }
    
    await client.connect();
    const database = client.db("submittedDB");
    const tabletLogDB = database.collection("tabletLogDB");
    
    const currentDate = new Date();
    
    // Convert to JST (UTC+9) for Date and Time fields
    const jstDate = new Date(currentDate.getTime() + (9 * 60 * 60 * 1000));
    const dateYYYYMMDD = jstDate.toISOString().split('T')[0]; // yyyy-mm-dd in JST
    const timeHHMMSS = jstDate.toISOString().split('T')[1].split('.')[0]; // HH:mm:ss in JST
    
    const logEntry = {
      sessionID: sessionID,
      背番号: 背番号 || '',
      品番: 品番 || '',
      工場: 工場 || '',
      設備: 設備 || '',
      Action: Action,
      Status: Status || 'in-progress',
      Timestamp: currentDate.toISOString(), // ISO string format in UTC (for consistency)
      Date: dateYYYYMMDD, // yyyy-mm-dd in JST
      Time: timeHHMMSS, // HH:mm:ss in JST
      AdditionalData: AdditionalData || {}
    };
    
    const result = await tabletLogDB.insertOne(logEntry);
    
    console.log(`📝 Tablet log inserted: ${背番号} - ${Action} (Session: ${sessionID})`);
    
    // Broadcast to factory TV via SSE for in-progress updates
    if (工場) {
      broadcastToFactory(工場, {
        type: 'in_progress_update',
        collection: 'tabletLogDB',
        equipment: 設備,
        sebanggo: 背番号,
        hinban: 品番,
        action: Action,
        status: Status,
        sessionID: sessionID,
        timestamp: currentDate.toISOString()
      });
    }
    
    res.json({
      success: true,
      message: "Tablet log inserted successfully",
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("❌ Error inserting tablet log:", error);
    res.status(500).json({ 
      error: "Error inserting tablet log", 
      details: error.message 
    });
  }
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
    const normalizedUsername = username.trim().toLowerCase();

    const masterDB = client.db("Sasaki_Coating_MasterDB");
    const masterUsers = masterDB.collection("masterUsers");

    // Check if username already exists in master users
    const existsInMaster = await masterUsers.findOne({
      $or: [
        { username: normalizedUsername },
        { subUsernames: normalizedUsername }
      ]
    });

    if (existsInMaster) {
      return res.status(400).json({ error: "Username already exists (master level)" });
    }

    // Check if username exists in any customer DB
    const dbs = await client.db().admin().listDatabases();
    for (const db of dbs.databases) {
      if (["admin", "local", "config", "Sasaki_Coating_MasterDB"].includes(db.name)) continue;
      const userCol = client.db(db.name).collection("users");
      const existsInCustomer = await userCol.findOne({ username: normalizedUsername });
      if (existsInCustomer) {
        return res.status(400).json({ error: "Username already exists in a customer database" });
      }
    }

    // Check if dbName already exists
    const existingDb = dbs.databases.find(db => db.name === dbName);
    if (existingDb) return res.status(400).json({ error: "Database name already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await masterUsers.insertOne({
      username: normalizedUsername,
      password: hashedPassword,
      company,
      email,
      validUntil: new Date(validUntil),
      dbName,
      role: "masterUser",
      subUsernames: [],
      createdAt: new Date()
    });

    const customerDB = client.db(dbName);
    await customerDB.createCollection("masterDB");
    await customerDB.createCollection("submittedDB");
    await customerDB.createCollection("logs");
    await customerDB.createCollection("indexes");

    await customerDB.collection("logs").insertOne({
      action: "database initialized",
      by: normalizedUsername,
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

////////////////////////////////////////////
// ⬆⬆⬆ END of MASTER USER ROUTES
////////////////////////////////////////////

// 👇 Place all your existing `server.js` routes below this line (they are already present in your current file)
// Make sure you merge and paste it correctly under the existing `app.listen(port...)`


//Firebase Storage
const admin = require('firebase-admin');

// Option 1: Using the entire private key from an environment variable
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined, // Handle escaped newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

if (serviceAccount.private_key && serviceAccount.client_email) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`, // Optional: If you use Realtime Database
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Optional: If you use Firebase Storage
  });
  console.log('Firebase Admin SDK initialized successfully!');
} else if (process.env.FIREBASE_CREDENTIAL_PATH) {
  // Option 2: Using the path to the service account key JSON file
  admin.initializeApp({
    credential: admin.credential.cert(process.env.FIREBASE_CREDENTIAL_PATH),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`, // Optional
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Optional
  });
  console.log('Firebase Admin SDK initialized successfully using credential path!');
} else {
  console.error('Firebase Admin SDK initialization failed. Ensure either FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL or FIREBASE_CREDENTIAL_PATH are set in your .env file.');
}

// Now you can access Firebase services via the 'admin' object
// For example, to access the Firestore database:
const fdb = admin.firestore();



// Or Firebase Storage:
const storage = admin.storage();







//get setsubi list from mongodb
app.get("/getSetsubiList", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection("pressDB");

    const factory = req.query.factory;
    
    if (!factory) {
      return res.status(400).json({ error: "Factory parameter is required" });
    }
    
    const query = { 工場: factory };

    console.log(`📋 Fetching unique equipment for factory: ${factory}`);

    // Use aggregation pipeline to get unique equipment (API v1 compatible)
    const result = await collection.aggregate([
      { $match: query },
      { $group: { _id: "$設備" } },
      { $sort: { _id: 1 } },
      { $project: { 設備: "$_id", _id: 0 } }
    ]).toArray();
    
    console.log(`✅ Found ${result.length} unique equipment:`, result.map(r => r.設備).join(', '));
    
    res.json(result);
  } catch (error) {
    console.error("❌ Error retrieving equipment list:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ error: "Error retrieving data", details: error.message });
  }
});

// Get actual production totals by equipment for production TV
app.get("/getActualProductionByEquipment", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection("pressDB");

    const factory = req.query.factory;
    const date = req.query.date; // yyyy-mm-dd format
    
    if (!factory || !date) {
      return res.status(400).json({ error: "Factory and date parameters are required" });
    }
    
    const query = { 
      工場: factory,
      Date: date
    };

    console.log(`📊 Fetching actual production for factory: ${factory}, date: ${date}`);

    // Use aggregation pipeline to sum Total by equipment
    const result = await collection.aggregate([
      { $match: query },
      { $group: { 
          _id: "$設備",
          totalQuantity: { $sum: "$Total" },
          recordCount: { $sum: 1 }
        } 
      },
      { $sort: { _id: 1 } },
      { $project: { 
          設備: "$_id", 
          totalQuantity: 1,
          recordCount: 1,
          _id: 0 
        } 
      }
    ]).toArray();
    
    console.log(`✅ Found production data for ${result.length} equipment:`, result);
    
    res.json(result);
  } catch (error) {
    console.error("❌ Error retrieving actual production:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ error: "Error retrieving production data", details: error.message });
  }
});

//get sebanggo from mongoDB
app.get("/getSetsubiByProcess", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("setsubiList");

    let process = req.query.process; // The process to search for

    if (!process) {
      return res.status(400).send("Process parameter is required");
    }

    // Escape special regex characters in the process value
    process = process.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escapes special characters

    // Create a regex pattern to match the `process` value as part of a comma-separated list
    const query = {
      出来る設備: {
        $regex: new RegExp(`(^|,\\s*)${process}(,|$)`, "i"), // Match the `process` value between commas or at the start/end of the string
      },
    };

    const projection = { 背番号: 1, _id: 0 }; // Only return the `背番号` field

    const result = await collection.find(query).project(projection).toArray();
    res.json(result); // Send back the array of `背番号`
  } catch (error) {
    console.error("Error retrieving data:", error);
    res.status(500).send("Error retrieving data");
  }
});

///////////////////////////////////////////
//iREPORTER ROUTE
///////////////////////////////////
//this route will fetch every sebanggo


// Route to fetch all 背番号 from masterDB
app.get("/getSeBanggoList", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    const projection = { 背番号: 1, _id: 0 }; // Only fetch the 背番号 field
    const result = await collection.find({}).project(projection).toArray();

    // Map the results to an array of 背番号
    const seBanggoList = result.map((item) => item.背番号);

    res.json(seBanggoList);
  } catch (error) {
    console.error("Error retrieving 背番号 list:", error);
    res.status(500).send("Error retrieving 背番号 list");
  }
});

// New route to search for 背番号 in masterDB
app.post("/searchSebanggo", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    const { sebanggo } = req.body;

    if (!sebanggo) {
      return res.status(400).send("Sebanggo is required");
    }

    // Find all entries matching the scanned sebanggo
    const results = await collection.find({ 背番号: sebanggo }).toArray();

    if (results.length === 0) {
      return res.status(404).send("Sebanggo not found");
    }

    // Check for 工場 value "NFH" and prioritize results
    const nfhEntry = results.find((entry) => entry.工場 === "NFH");
    const notNfhEntry = results.find((entry) => entry.工場 !== "NFH");

    if (nfhEntry) {
      return res.json(nfhEntry);
    } else if (notNfhEntry) {
      return res.json(notNfhEntry);
    } else {
      return res.status(404).send("Sebanggo with valid 工場 not found");
    }
  } catch (error) {
    console.error("Error searching for sebanggo:", error);
    res.status(500).send("Error searching for sebanggo");
  }
});



// // iReporter route to submit data to pressDB
// app.post("/submitTopressDBiReporter", async (req, res) => {
//   try {
//     await client.connect();

//     const database = client.db("submittedDB");
//     const pressDB = database.collection("pressDB");
//     const formData = req.body;

//     // Validate required fields
//     const requiredFields = [
//       "品番",
//       "背番号",
//       "設備",
//       "Total",
//       "工場",
//       "Worker_Name",
//       "Process_Quantity",
//       "Date",
//       "Time_start",
//       "Time_end",
//       "材料ロット",
//       "疵引不良",
//       "加工不良",
//       "その他",
//       "Total_NG",
//       "Spare",
//       "Comment",
//       "Cycle_Time",
//     ];

//     const missingFields = requiredFields.filter(
//       (field) => formData[field] === undefined || formData[field] === null
//     );

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         error: `Missing required fields: ${missingFields.join(", ")}`,
//       });
//     }

//     // Insert form data into pressDB
//     const result = await pressDB.insertOne(formData);
//     if (!result.insertedId) {
//       throw new Error("Failed to save data to slitDB");
//     }

//     res.status(201).json({
//       message: "Data successfully saved to pressDB",
//       insertedId: result.insertedId,
//     });
//   } catch (error) {
//     console.error("Error saving data to pressDB:", error);
//     res.status(500).json({ error: "Error saving data to pressDB" });
//   }
// });

// app.post("/submitTopressDBiReporter", async (req, res) => {
//   try {
//     await client.connect();

//     const database = client.db("submittedDB");
//     const pressDB = database.collection("pressDB");
//     const formData = req.body;

//     // Extract and remove images array from formData
//     const images = formData.images || [];
//     delete formData.images;

//     // Upload each image and store its download URL in appropriate fields
//     const uploadedImages = {};

//     for (const img of images) {
//       const buffer = Buffer.from(img.base64, 'base64');
//       const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
//       const file = admin.storage().bucket().file(`CycleCheck/${img.factory}/${fileName}`);

//       await file.save(buffer, {
//         metadata: { contentType: 'image/jpeg' },
//         public: true,
//       });

//       const publicUrl = `https://storage.googleapis.com/${file.bucket.name}/${file.name}`;

//       if (img.label === '初物チェック') uploadedImages["初物チェック画像"] = publicUrl;
//       if (img.label === '終物チェック') uploadedImages["終物チェック画像"] = publicUrl;
//       if (img.label === '材料ラベル') uploadedImages["材料ラベル画像"] = publicUrl;
//     }

//     // Merge the image URLs into formData
//     Object.assign(formData, uploadedImages);

//     const result = await pressDB.insertOne(formData);

//     res.status(201).json({
//       message: "Data and images successfully saved to pressDB",
//       insertedId: result.insertedId,
//     });
//   } catch (error) {
//     console.error("Error saving data to pressDB:", error);
//     res.status(500).json({ error: "Error saving data to pressDB" });
//   }
//});

app.post("/submitTopressDBiReporter", async (req, res) => {
  try {
    await client.connect();

    const database = client.db("submittedDB");
    const pressDB = database.collection("pressDB");
    const formData = req.body;

    // Extract image arrays and remove from formData
    const images = formData.images || [];
    const maintenanceImages = formData.maintenanceImages || [];
    const materialLabelImages = formData.materialLabelImages || [];
    delete formData.images;
    delete formData.maintenanceImages;
    delete formData.materialLabelImages;

    const downloadToken = "masterDBToken69";

    // === PHASE 1: Upload all images atomically (cycle check images) ===
    const labelToField = {
      "初物チェック": "初物チェック画像",
      "終物チェック": "終物チェック画像",
      "材料ラベル": "材料ラベル画像",
    };

    for (const img of images) {
      if (!img.base64 || !img.label) continue;

      const buffer = Buffer.from(img.base64, 'base64');
      const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
      const filePath = `CycleCheck/${img.factory}/${fileName}`;
      const file = admin.storage().bucket().file(filePath);

      await file.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken
          }
        }
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
      const fieldName = labelToField[img.label] || `${img.label}画像`;
      formData[fieldName] = publicUrl;
    }

    // === PHASE 2: Upload material label images atomically ===
    if (materialLabelImages && materialLabelImages.length > 0) {
      console.log(`📸 Uploading ${materialLabelImages.length} material label images...`);
      
      const materialLabelImageURLs = [];
      
      for (const img of materialLabelImages) {
        if (!img.base64) continue;

        const buffer = Buffer.from(img.base64, 'base64');
        const fileName = `${formData.背番号}_${formData.Date}_${formData.Worker_Name}_${formData.工場}_${formData.設備}_materialLabel_${img.timestamp || Date.now()}.jpg`;
        const filePath = `materialLabel/${formData.工場}/${formData.設備}/${fileName}`;
        const file = admin.storage().bucket().file(filePath);

        await file.save(buffer, {
          metadata: {
            contentType: "image/jpeg",
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          }
        });

        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
        materialLabelImageURLs.push(publicUrl);
      }

      formData.materialLabelImages = materialLabelImageURLs;
      formData.materialLabelImageCount = materialLabelImageURLs.length;
      
      // First image becomes the legacy 材料ラベル画像 field
      if (materialLabelImageURLs.length > 0) {
        formData.材料ラベル画像 = materialLabelImageURLs[0];
      }
      
      console.log(`✅ Uploaded ${materialLabelImageURLs.length} material label images`);
    }

    // === PHASE 3: Upload maintenance images and build Maintenance_Data structure ===
    if (maintenanceImages && maintenanceImages.length > 0) {
      console.log(`📸 Uploading ${maintenanceImages.length} maintenance images...`);
      
      // Group images by maintenanceRecordId
      const imagesByRecordId = {};
      for (const img of maintenanceImages) {
        if (!img.base64 || !img.maintenanceRecordId) continue;
        
        if (!imagesByRecordId[img.maintenanceRecordId]) {
          imagesByRecordId[img.maintenanceRecordId] = [];
        }
        
        const buffer = Buffer.from(img.base64, 'base64');
        const fileName = `${formData.背番号}_${formData.Date}_${formData.Worker_Name}_${formData.工場}_${formData.設備}_maintenance_${img.id}.jpg`;
        const filePath = `maintenance/${formData.工場}/${formData.設備}/${fileName}`;
        const file = admin.storage().bucket().file(filePath);

        await file.save(buffer, {
          metadata: {
            contentType: "image/jpeg",
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          }
        });

        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
        imagesByRecordId[img.maintenanceRecordId].push(publicUrl);
      }

      // Add Firebase URLs to maintenance records
      if (formData.Maintenance_Data && formData.Maintenance_Data.records) {
        formData.Maintenance_Data.records = formData.Maintenance_Data.records.map(record => {
          const recordImages = imagesByRecordId[record.id] || [];
          return {
            ...record,
            images: recordImages
          };
        });
      }
      
      console.log(`✅ Uploaded maintenance images and updated Maintenance_Data structure`);
    }

    // === PHASE 4: Add timestamp ===
    formData.createdAt = new Date();

    // === PHASE 5: Insert to MongoDB ===
    const result = await pressDB.insertOne(formData);

    console.log(`✅ Successfully saved Press Cutting record with ID: ${result.insertedId}`);

    // === PHASE 6: Broadcast to factory TV via SSE ===
    if (formData.工場) {
      broadcastToFactory(formData.工場, {
        type: 'production_update',
        collection: 'pressDB',
        equipment: formData.設備,
        sebanggo: formData.背番号,
        hinban: formData.品番,
        quantity: formData.Total,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      message: "Data and images successfully saved to pressDB",
      insertedId: result.insertedId,
      materialLabelImageCount: formData.materialLabelImageCount || 0,
      maintenanceRecordCount: formData.Maintenance_Data?.records?.length || 0
    });
  } catch (error) {
    console.error("Error saving data to pressDB:", error);
    res.status(500).json({ error: "Error saving data to pressDB", details: error.message });
  }
});

// Presumed at the top of your server.js:
// const express = require("express");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb"); // ObjectId needed if you query by _id
// const admin = require('firebase-admin'); // For Firebase Storage
// const client = new MongoClient(uri, ...); // Your MongoDB client
// admin.initializeApp({ /* your firebase config */ });
// const bodyParser = require('body-parser'); // If not already used
// app.use(bodyParser.json({ limit: '10mb' })); // Increase limit for base64 images

app.post('/logPrintAndUpdateMaterialRequest', async (req, res) => {
    console.log("🟢 POST /logPrintAndUpdateMaterialRequest received");
    const {
        品番, // Used in query
        作業日, // Used in query
        生産順番, // ✅ Added to distinguish between multiple documents with same 品番 and 作業日
        numJustPrinted,
        printLogEntry, // { timestamp, lotNumbers, count, printedBy, factory, machine }
        lastPrintTimestamp,
        imagesToUpload, // Array of { base64, label, 品番ForFilename, dateForFilename, ... }
        targetProductionCountForStatusUpdate
    } = req.body;

    if (!品番 || !作業日 || numJustPrinted === undefined) {
        return res.status(400).json({ 
            status: "error", 
            message: "Missing required fields: 品番, 作業日, or numJustPrinted." 
        });
    }

    try {
        // await client.connect(); // Manage connection as per your setup
        const database = client.db("submittedDB"); // Hardcoded as per your frontend
        const collection = database.collection("materialRequestDB"); // Hardcoded

        // ✅ Include 生産順番 in query if provided to avoid conflicts
        const query = { "品番": 品番, "作業日": 作業日 };
        if (生産順番) {
            query["生産順番"] = 生産順番;
            console.log(`🔵 Using 生産順番 (${生産順番}) to distinguish documents`);
        }
        
        let updateDoc = {
            $inc: { "TotalLabelsPrintedForOrder": numJustPrinted },
            $set: { "LastPrintTimestamp": new Date(lastPrintTimestamp) }, // Ensure it's a Date object
            $push: { "PrintLog": { ...printLogEntry, timestamp: new Date(printLogEntry.timestamp) } }
        };

        // 1. Handle Image Uploads to Firebase Storage
        let uploadedImageURLs = [];
        if (imagesToUpload && imagesToUpload.length > 0) {
            console.log(`🔵 Uploading ${imagesToUpload.length} images to Firebase...`);
            const bucket = admin.storage().bucket(); // Get your default bucket

            for (const imgData of imagesToUpload) {
                if (!imgData.base64 || !imgData.label) {
                    console.warn("Skipping image due to missing base64 or label", imgData.label);
                    continue;
                }
                try {
                    const buffer = Buffer.from(imgData.base64, 'base64');
                    // Construct a more robust filename
                    const safe品番 = (imgData.品番ForFilename || 'unknown品番').replace(/[^a-zA-Z0-9-_]/g, '_');
                    const safe作業日 = (imgData.dateForFilename || 'unknownDate').replace(/[^a-zA-Z0-9-_]/g, '_');
                    const safeFactory = (imgData.factoryForFilename || 'unknownFactory').replace(/[^a-zA-Z0-9-_]/g, '_');
                    
                    const fileName = `materialLabels/${safeFactory}/${safe品番}_${safe作業日}_${imgData.timestampForFilename}_${imgData.label.replace(/[^a-zA-Z0-9-_]/g, '_')}.jpg`;
                    
                    const file = bucket.file(fileName);
                    const downloadToken = "materialLabelToken_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);

                    await file.save(buffer, {
                        metadata: {
                            contentType: 'image/jpeg',
                            metadata: { firebaseStorageDownloadTokens: downloadToken }
                        },
                        // public: true, // Optional: if you want direct public access without token
                    });
                    // Construct URL with token
                    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`;
                    uploadedImageURLs.push(publicUrl);
                    console.log(`✅ Image uploaded: ${publicUrl}`);
                } catch (uploadError) {
                    console.error(`Error uploading one image to Firebase (label: ${imgData.label}):`, uploadError);
                    // Continue with other images, or decide to fail the whole request
                }
            }
            if (uploadedImageURLs.length > 0) {
                updateDoc.$addToSet = { MaterialLabelImageURLs: { $each: uploadedImageURLs } };
            }
        }

        // 2. Perform the main MongoDB update
        console.log("🟠 Updating MongoDB document with query:", query, "and updateDoc:", JSON.stringify(updateDoc, null, 2));
        const updateResult = await collection.updateOne(query, updateDoc, { upsert: false }); // Consider upsert:true if the doc might not exist but should be created
        
        console.log(`✅ Main update result: matchedCount: ${updateResult.matchedCount}, modifiedCount: ${updateResult.modifiedCount}, upsertedId: ${updateResult.upsertedId}`);

        if (updateResult.matchedCount === 0 && !updateResult.upsertedId) {
             // If no document was matched and nothing was upserted, it means the target document for update wasn't found.
             // This could happen if the 品番 and 作業日 combination doesn't exist.
             // If upsert was true, this path wouldn't be hit if it created a new doc.
            console.warn("Target document not found for update, and upsert was false or failed to match.");
            // Decide on response: maybe it's an error, or maybe it's okay if an upsert was intended but didn't happen.
            // For now, let's assume it's an issue if no match and no upsert.
            return res.status(404).json({ 
                status: "not_found", 
                message: "Target document not found for update. No changes made to print counts or logs." 
            });
        }
        
        let finalStatus = "in_progress";
        let newTotalPrinted = 0;

        // 3. Fetch the updated document to check TotalLabelsPrintedForOrder
        const updatedDoc = await collection.findOne(query);
        if (updatedDoc) {
            newTotalPrinted = updatedDoc.TotalLabelsPrintedForOrder || 0;
            if (targetProductionCountForStatusUpdate > 0 && newTotalPrinted >= targetProductionCountForStatusUpdate) {
                if (updatedDoc.STATUS !== "Completed") { // Only update if not already completed
                    console.log(`🔵 Target production count met (${newTotalPrinted}/${targetProductionCountForStatusUpdate}). Updating STATUS to Completed.`);
                    await collection.updateOne(query, { $set: { STATUS: "Completed", CompletionTimestamp: new Date() } });
                    finalStatus = "completed";
                } else {
                    finalStatus = "completed"; // Already was completed
                    console.log("🔵 Target production count met, but STATUS was already Completed.");
                }
            } else {
                 finalStatus = updatedDoc.STATUS || "加工中"; // Keep existing status or default
            }
        } else {
            console.warn("Could not retrieve document after update to check status. This should not happen if update was successful.");
        }


        res.json({
            status: "success",
            message: "Print logged and material request updated successfully.",
            modifiedCount: updateResult.modifiedCount,
            matchedCount: updateResult.matchedCount,
            upsertedId: updateResult.upsertedId,
            imageUploadCount: uploadedImageURLs.length,
            finalDocStatus: finalStatus,
            newTotalPrintedCount: newTotalPrinted // Send back the new total
        });

    } catch (error) {
        console.error("❌ Error in /logPrintAndUpdateMaterialRequest:", error);
        res.status(500).json({ status: "error", message: "Error processing print log and update.", details: error.message });
    } 
    // finally { /* Handle client connection closing if necessary */ }
});




//this is the route for DCP submit, it has pressDB and kensaDB combined and handles image upload
// DCP Combined Route - Handles image upload + document creation in one transaction
app.post('/submitToDCP', async (req, res) => {
    console.log("🟢 POST /submitToDCP received");
    
    try {
        await client.connect();
        
        // Extract form data and images
        const formData = req.body;
        const maintenanceImages = formData.maintenanceImages || []; // Array of maintenance images with base64
        const cycleCheckImages = formData.images || []; // Existing cycle check images
        
        console.log("🔍 DCP submission received:", {
            品番: formData.品番,
            背番号: formData.背番号,
            工場: formData.工場,
            設備: formData.設備,
            Worker_Name: formData.Worker_Name,
            Date: formData.Date,
            Time_start: formData.Time_start,
            Time_end: formData.Time_end,
            maintenanceImageCount: maintenanceImages.length,
            cycleCheckImageCount: cycleCheckImages.length,
            isToggleChecked: formData.isToggleChecked
        });

        // 1. Upload all images to Firebase Storage first
        const bucket = admin.storage().bucket();
        let uploadedImageURLs = {};
        let maintenancePhotosUrls = [];

        // Upload cycle check images (existing logic)
        for (const img of cycleCheckImages) {
            if (!img.base64 || !img.label) continue;

            try {
                const buffer = Buffer.from(img.base64, 'base64');
                const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
                const filePath = `CycleCheck/${img.factory}/${fileName}`;
                const file = bucket.file(filePath);
                const downloadToken = "masterDBToken69";

                await file.save(buffer, {
                    metadata: {
                        contentType: "image/jpeg",
                        metadata: { firebaseStorageDownloadTokens: downloadToken }
                    },
                    validation: false
                });

                const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
                
                // Map to specific fields (removed 材料ラベル - now handled separately)
                if (img.label === "初物チェック") uploadedImageURLs["初物チェック画像"] = publicUrl;
                else if (img.label === "終物チェック") uploadedImageURLs["終物チェック画像"] = publicUrl;
                // 材料ラベル is now handled by the new multi-photo system below
                
                console.log(`✅ Cycle check image uploaded: ${img.label} -> ${publicUrl}`);
            } catch (uploadError) {
                console.error(`❌ Error uploading cycle check image ${img.label}:`, uploadError);
            }
        }

        // Upload maintenance images
        for (const imgData of maintenanceImages) {
            if (!imgData.base64 || !imgData.id || !imgData.timestamp) continue;

            try {
                const buffer = Buffer.from(imgData.base64, 'base64');
                console.log(`🔍 Processing maintenance image ${imgData.id}: buffer size = ${buffer.length} bytes`);

                // Create unique filename
                const fileName = `${formData.背番号}_${formData.Date}_${imgData.timestamp}_${imgData.id}_maintenanceImage.jpg`;
                const filePath = `maintenance/${formData.工場}/${formData.設備}/${fileName}`;
                const file = bucket.file(filePath);
                const downloadToken = "masterDBToken69";

                await file.save(buffer, {
                    metadata: {
                        contentType: "image/jpeg",
                        metadata: { firebaseStorageDownloadTokens: downloadToken }
                    },
                    validation: false
                });

                const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
                maintenancePhotosUrls.push({
                    url: publicUrl,
                    maintenanceRecordId: imgData.maintenanceRecordId,
                    id: imgData.id,
                    timestamp: imgData.timestamp
                });
                
                console.log(`✅ Maintenance image uploaded: ${publicUrl}`);
            } catch (uploadError) {
                console.error(`❌ Error uploading maintenance image ${imgData.id}:`, uploadError);
            }
        }

        // 2. Process maintenance data and attach photos to correct records
        const processedMaintenanceData = {
            records: (formData.Maintenance_Data?.records || []).map(record => {
                // Find photos for this specific maintenance record
                const recordPhotos = maintenancePhotosUrls
                    .filter(photo => photo.maintenanceRecordId === record.id)
                    .map(photo => photo.url);
                
                return {
                    id: record.id,
                    startTime: record.startTime,
                    endTime: record.endTime,
                    comment: record.comment,
                    timestamp: record.timestamp,
                    photos: recordPhotos // Array of Firebase URLs
                };
            }),
            totalMinutes: formData.Maintenance_Data?.totalMinutes || 0,
            totalHours: formData.Maintenance_Data?.totalHours || 0
        };

        // 2.5. Upload material label images and handle single vs multiple logic
        const materialLabelImages = formData.materialLabelImages || [];
        let materialLabelImageURLs = [];
        
        if (materialLabelImages.length > 0) {
            console.log(`🖼️ Processing ${materialLabelImages.length} material label images...`);
            
            for (const imgData of materialLabelImages) {
                if (!imgData.base64 || !imgData.id || !imgData.timestamp) continue;

                try {
                    const buffer = Buffer.from(imgData.base64, 'base64');
                    console.log(`🔍 Processing material label image ${imgData.id}: buffer size = ${buffer.length} bytes`);

                    // Create unique filename
                    const fileName = `${formData.背番号}_${formData.Date}_${imgData.timestamp}_${imgData.id}_materialLabelImage.jpg`;
                    const filePath = `materialLabel/${formData.工場}/${formData.設備}/${fileName}`;
                    const file = bucket.file(filePath);
                    const downloadToken = "masterDBToken69";

                    await file.save(buffer, {
                        metadata: {
                            contentType: "image/jpeg",
                            metadata: { firebaseStorageDownloadTokens: downloadToken }
                        },
                        validation: false
                    });

                    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
                    materialLabelImageURLs.push(publicUrl);
                    
                    console.log(`✅ Material label image uploaded: ${publicUrl}`);
                } catch (uploadError) {
                    console.error(`❌ Error uploading material label image ${imgData.id}:`, uploadError);
                }
            }
        }

        // Handle single vs multiple material label images logic
        if (materialLabelImageURLs.length === 1) {
            // Single image: Use existing structure for backwards compatibility AND populate array
            uploadedImageURLs["材料ラベル画像"] = materialLabelImageURLs[0];
            uploadedImageURLs["materialLabelImages"] = materialLabelImageURLs; // ✅ FIX: Also populate array for single images
            uploadedImageURLs["materialLabelImageCount"] = materialLabelImageURLs.length;
            console.log(`📄 Single material label image: stored in both 材料ラベル画像 field and materialLabelImages array`);
            console.log(`🔍 Single material label URLs being stored:`, {
                "材料ラベル画像": materialLabelImageURLs[0],
                "materialLabelImages": materialLabelImageURLs,
                "materialLabelImageCount": materialLabelImageURLs.length
            });
        } else if (materialLabelImageURLs.length > 1) {
            // Multiple images: Keep first in original field + add array
            uploadedImageURLs["材料ラベル画像"] = materialLabelImageURLs[0]; // First image for compatibility
            uploadedImageURLs["materialLabelImages"] = materialLabelImageURLs; // All images array
            uploadedImageURLs["materialLabelImageCount"] = materialLabelImageURLs.length; // Count for reference
            console.log(`📄 Multiple material label images: ${materialLabelImageURLs.length} images stored`);
            console.log(`🔍 Material label URLs being stored:`, {
                "材料ラベル画像": materialLabelImageURLs[0],
                "materialLabelImages": materialLabelImageURLs,
                "materialLabelImageCount": materialLabelImageURLs.length
            });
        }

        console.log(`🔍 Final uploadedImageURLs object:`, uploadedImageURLs);

        // 3. Prepare pressDB data (exclude inspection fields and other kensaDB-specific data)
        const pressDBData = {
            ...formData,
            ...uploadedImageURLs, // Add cycle check image URLs
            Maintenance_Data: processedMaintenanceData, // Add maintenance data with photo URLs
            createdAt: new Date().toISOString() // Add server timestamp
        };

        console.log(`🔍 pressDBData before cleanup contains these image fields:`, {
            "初物チェック画像": pressDBData["初物チェック画像"],
            "終物チェック画像": pressDBData["終物チェック画像"], 
            "材料ラベル画像": pressDBData["材料ラベル画像"],
            "materialLabelImages": pressDBData["materialLabelImages"]
        });

        // Remove the raw image arrays and inspection-specific data from pressDB
        delete pressDBData.images;
        delete pressDBData.maintenanceImages;
        delete pressDBData.Counters; // Counters are only for kensaDB, not pressDB
        delete pressDBData.isToggleChecked; // This is just a UI state flag, not data to store
        
        // Remove inspection-specific fields from pressDB (these belong only in kensaDB)
        delete pressDBData.Inspector_Name;
        delete pressDBData.Inspection_Date;
        delete pressDBData.Inspection_Time_start;
        delete pressDBData.Inspection_Time_end;
        delete pressDBData.Inspection_Comment;
        delete pressDBData.Inspection_Spare;
        delete pressDBData.Inspection_Total_NG;
        delete pressDBData.Inspection_Good_Total;
        
        console.log(`🧹 Cleaned pressDBData - removed inspection fields for pressDB-only storage`);

        // 4. Save to pressDB
        const database = client.db("submittedDB");
        const pressDB = database.collection("pressDB");
        
        const pressResult = await pressDB.insertOne(pressDBData);
        console.log(`✅ Data saved to pressDB with ID: ${pressResult.insertedId}`);

        // Broadcast to factory TV via SSE
        if (pressDBData.工場) {
          broadcastToFactory(pressDBData.工場, {
            type: 'production_update',
            collection: 'pressDB',
            equipment: pressDBData.設備,
            sebanggo: pressDBData.背番号,
            hinban: pressDBData.品番,
            quantity: pressDBData.Total,
            timestamp: new Date().toISOString()
          });
        }

        let kensaResult = null;
        
        // 5. Save to kensaDB if toggle is checked
        if (formData.isToggleChecked) {
            const kensaDB = database.collection("kensaDB");
            
            // Calculate kensa-specific values
            const counters = formData.Counters || {};
            const Total_NG_Kensa = Object.values(counters).reduce((sum, val) => sum + (parseInt(val) || 0), 0);
            const Total_KensaDB = formData.Total - Total_NG_Kensa;

            // Format Date to yyyymmdd for 製造ロット
            const dateStr = formData.Date || '';
            const formattedDate = dateStr.replace(/\D/g, ''); // Remove all non-digits to get yyyymmdd

            const kensaDBData = {
                品番: formData.品番,
                背番号: formData.背番号,
                工場: formData.工場,
                Total: Total_KensaDB,
                Worker_Name: formData.Inspector_Name || formData.Worker_Name, // Use Inspector_Name if available, fallback to Worker_Name
                Process_Quantity: formData.Process_Quantity,
                Remaining_Quantity: formData.Inspection_Good_Total || formData.Total,
                Date: formData.Inspection_Date || formData.Date, // Use Inspection_Date if available
                Time_start: formData.Inspection_Time_start || formData.Time_start, // Use Inspection times
                Time_end: formData.Inspection_Time_end || formData.Time_end,
                設備: formData.設備,
                Cycle_Time: formData.Cycle_Time,
                製造ロット: formattedDate, // Use formatted Date in yyyymmdd format instead of 材料ロット
                Comment: formData.Inspection_Comment || "", // Use Inspection_Comment, default to empty string if not provided
                Spare: formData.Inspection_Spare || formData.Spare, // Use Inspection_Spare if available
                Counters: counters,
                Total_NG: Total_NG_Kensa,
                Break_Time_Data: formData.Break_Time_Data,
                Total_Break_Minutes: formData.Total_Break_Minutes,
                Total_Break_Hours: formData.Total_Break_Hours,
                Maintenance_Data: processedMaintenanceData, // Same maintenance data with photos
                Total_Trouble_Minutes: formData.Total_Trouble_Minutes,
                Total_Trouble_Hours: formData.Total_Trouble_Hours,
                Total_Work_Hours: formData.Total_Work_Hours,
                createdAt: new Date().toISOString() // Add server timestamp
            };

            kensaResult = await kensaDB.insertOne(kensaDBData);
            console.log(`✅ Data saved to kensaDB with ID: ${kensaResult.insertedId}`);
        }

        // 6. Send success response
        res.status(201).json({
            status: "success",
            message: "DCP data submitted successfully",
            pressDB_id: pressResult.insertedId,
            kensaDB_id: kensaResult?.insertedId || null,
            uploadedImages: {
                cycleCheck: Object.keys(uploadedImageURLs).length,
                maintenance: maintenancePhotosUrls.length
            },
            maintenanceRecords: processedMaintenanceData.records.length,
            totalMaintenancePhotos: maintenancePhotosUrls.length
        });

    } catch (error) {
        console.error("❌ Error in /submitToDCP:", error);
        res.status(500).json({
            status: "error",
            message: "Error submitting DCP data",
            details: error.message
        });
    }
});




// iReporter route to submit data to kensaDB
app.post("/submitToKensaDBiReporter", async (req, res) => {
  try {
    await client.connect();

    const database = client.db("submittedDB");
    const kensaDB = database.collection("kensaDB");
    const formData = req.body;

    // Validate required fields
    const requiredFields = [
      "品番",
      "背番号",
      "Total",
      "工場",
      "Worker_Name",
      "Process_Quantity",
      "Remaining_Quantity",
      "Date",
      "Time_start",
      "Time_end",
      "設備",
      "Counters",
      "Total_NG",
      "製造ロット",
      "Cycle_Time",
    ];

    const missingFields = requiredFields.filter(
      (field) => formData[field] === undefined || formData[field] === null
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Add createdAt timestamp
    formData.createdAt = new Date().toISOString();

    // Insert form data into kensaDB
    const result = await kensaDB.insertOne(formData);
    if (!result.insertedId) {
      throw new Error("Failed to save data to kensaDB");
    }

    res.status(201).json({
      message: "Data successfully saved to kensaDB",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error saving data to kensaDB:", error);
    res.status(500).json({ error: "Error saving data to kensaDB" });
  }
});



// iReporter route to submit data to slitDB
app.post("/submitToSlitDBiReporter", async (req, res) => {
  try {
    await client.connect();

    const database = client.db("submittedDB");
    const slitDB = database.collection("slitDB");
    const formData = req.body;

    // 🔽 Extract and remove base64 image data
    const images = formData.images || [];
    delete formData.images;

    const labelToField = {
      "初物チェック": "初物チェック画像"
      // You can add others here like:
      // "終物チェック": "終物チェック画像",
      // "材料ラベル": "材料ラベル画像",
    };

    for (const img of images) {
      if (!img.base64 || !img.label) continue;

      const buffer = Buffer.from(img.base64, 'base64');
      const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
      const filePath = `CycleCheck/${img.factory}/${fileName}`;
      const file = admin.storage().bucket().file(filePath);

      const downloadToken = "masterDBToken69";

      await file.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken
          }
        }
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

      const fieldName = labelToField[img.label] || `${img.label}画像`;
      formData[fieldName] = publicUrl;
    }

    // ✅ Validate required fields
    const requiredFields = [
      "品番",
      "背番号",
      "Total",
      "工場",
      "Worker_Name",
      "Process_Quantity",
      "Date",
      "Time_start",
      "Time_end",
      "設備",
      "疵引不良",
      "加工不良",
      "その他",
      "Total_NG",
      "Spare",
      "Comment",
      "製造ロット",
      "Cycle_Time"
    ];

    const missingFields = requiredFields.filter(
      (field) => formData[field] === undefined || formData[field] === null
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`
      });
    }

    // Add createdAt timestamp
    formData.createdAt = new Date().toISOString();

    const result = await slitDB.insertOne(formData);

    res.status(201).json({
      message: "Data and images successfully saved to slitDB",
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("Error saving data to slitDB:", error);
    res.status(500).json({ error: "Error saving data to slitDB" });
  }
});



// iReporter route to submit data to SRSDB
// app.post("/submitToSRSDBiReporter", async (req, res) => {
//   try {
//     await client.connect();

//     const database = client.db("submittedDB");
//     const SRSDB = database.collection("SRSDB");
//     const formData = req.body;

//     // Validate required fields
//     const requiredFields = [
//       "品番",
//       "背番号",
//       "Total",
//       "工場",
//       "Worker_Name",
//       "Process_Quantity",
//       "Date",
//       "Time_start",
//       "Time_end",
//       "設備",
//       "SRSコード",
//       "くっつき・めくれ",
//       "シワ",
//       "転写位置ズレ",
//       "転写不良",
//       "その他",
//       "SRS_Total_NG",
//       "Spare",
//       "Comment",
//       "製造ロット",
//       "Cycle_Time",
//     ];

//     const missingFields = requiredFields.filter(
//       (field) => formData[field] === undefined || formData[field] === null
//     );

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         error: `Missing required fields: ${missingFields.join(", ")}`,
//       });
//     }

//     // Insert form data into SRSDB
//     const result = await SRSDB.insertOne(formData);
//     if (!result.insertedId) {
//       throw new Error("Failed to save data to slitDB");
//     }

//     res.status(201).json({
//       message: "Data successfully saved to slitDB",
//       insertedId: result.insertedId,
//     });
//   } catch (error) {
//     console.error("Error saving data to slitDB:", error);
//     res.status(500).json({ error: "Error saving data to slitDB" });
//   }
// });

app.post("/submitToSRSDBiReporter", async (req, res) => {
  try {
    await client.connect();

    const database = client.db("submittedDB");
    const SRSDB = database.collection("SRSDB");
    const formData = req.body;

    // Handle base64 images
    const images = formData.images || [];
    delete formData.images;

    const labelToField = {
      "初物チェック": "初物チェック画像",
      // Add more labels if needed
    };

    for (const img of images) {
      if (!img.base64 || !img.label) continue;

      const buffer = Buffer.from(img.base64, 'base64');
      const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
      const filePath = `CycleCheck/SRS/${fileName}`;
      const file = admin.storage().bucket().file(filePath);

      const downloadToken = "masterDBToken69";

      await file.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken
          }
        }
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
      const fieldName = labelToField[img.label] || `${img.label}画像`;

      formData[fieldName] = publicUrl;
    }

    // Add createdAt timestamp
    formData.createdAt = new Date().toISOString();

    const result = await SRSDB.insertOne(formData);

    res.status(201).json({
      message: "Data and images successfully saved to SRSDB",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error saving data to SRSDB:", error);
    res.status(500).json({ error: "Error saving data to SRSDB" });
  }
});


// This is for SRS LH
// Route to fetch all 背番号 with R/L = "LH" from masterDB
app.get("/getSeBanggoListLH", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    // Query to find documents where R/L = "LH"
    const query = { "R/L": "LH", SRS: "有り" };
    const projection = { 背番号: 1, _id: 0 }; // Only fetch the 背番号 field

    // Fetch matching documents
    const result = await collection.find(query).project(projection).toArray();

    // Map the results to an array of 背番号
    const seBanggoListLH = result.map((item) => item.背番号);

    res.json(seBanggoListLH); // Send the list as JSON
  } catch (error) {
    console.error("Error retrieving 背番号 list for LH:", error);
    res.status(500).send("Error retrieving 背番号 list for LH");
  }
});

//This is for SRS RSH
// Route to fetch all 背番号 with R/L = "RH" from masterDB
app.get("/getSeBanggoListRH", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    // Query to find documents where R/L = "LH"
    const query = { "R/L": "RH", SRS: "有り" };
    const projection = { 背番号: 1, _id: 0 }; // Only fetch the 背番号 field

    // Fetch matching documents
    const result = await collection.find(query).project(projection).toArray();

    // Map the results to an array of 背番号
    const seBanggoListLH = result.map((item) => item.背番号);

    res.json(seBanggoListLH); // Send the list as JSON
  } catch (error) {
    console.error("Error retrieving 背番号 list for RH:", error);
    res.status(500).send("Error retrieving 背番号 list for RH");
  }
});


//This route is to get sebanggo list for SLIT only
//fetch sebanggo list where slit = 有り
app.get("/getSeBanggoListSLIT", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    // Query to find documents where R/L = "LH"
    const query = { SLIT: "有り" };
    const projection = { 背番号: 1, _id: 0 }; // Only fetch the 背番号 field

    // Fetch matching documents
    const result = await collection.find(query).project(projection).toArray();

    // Map the results to an array of 背番号
    const seBanggoListLH = result.map((item) => item.背番号);

    res.json(seBanggoListLH); // Send the list as JSON
  } catch (error) {
    console.error("Error retrieving 背番号 list for RH:", error);
    res.status(500).send("Error retrieving 背番号 list for RH");
  }
});


//for press 工場 = value passed
//fetch sebanggo-only for press
app.get("/getSeBanggoListPress", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    let 工場 = req.query.工場; // Retrieve the 工場 value from the query

    // Check if 工場 is "小瀬" or "倉知"
    const query =
      工場 === "小瀬" || 工場 === "倉知"
        ? { 工場: { $in: ["小瀬", "倉知"] } } // Combine values for 小瀬 and 倉知
        : { 工場 }; // Otherwise, match the specific 工場 value

    const projection = { 背番号: 1, _id: 0 }; // Only fetch the 背番号 field

    // Fetch matching documents
    const result = await collection.find(query).project(projection).toArray();

    // Map the results to an array of 背番号
    const seBanggoList = result.map((item) => item.背番号);

    res.json(seBanggoList); // Send the list as JSON
  } catch (error) {
    console.error("Error retrieving 背番号 list for Press:", error);
    res.status(500).send("Error retrieving 背番号 list for Press");
  }
});



//fetch sebango and hinbang
app.get("/getSeBanggoListPressAndHinban", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("masterDB");

    let 工場 = req.query.工場; // Retrieve the 工場 value from the query

    // Check if 工場 is "小瀬" or "倉知"
    const query =
      工場 === "小瀬" || 工場 === "倉知"
        ? { 工場: { $in: ["小瀬", "倉知"] } } // Combine values for 小瀬 and 倉知
        : { 工場 }; // Otherwise, match the specific 工場 value

    const projection = { 背番号: 1, 品番: 1, _id: 0 }; // Fetch both 背番号 and 品番

    // Fetch matching documents
    const result = await collection.find(query).project(projection).toArray();

    res.json(result); // Send the list as JSON
  } catch (error) {
    console.error("Error retrieving 背番号 and 品番 list for Press:", error);
    res.status(500).send("Error retrieving 背番号 and 品番 list for Press");
  }
});

// Fetch SCNA Work Orders from SCNAWorkOrderDB
app.get("/getSCNAWorkOrders", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection("SCNAWorkOrderDB");

    // Fetch all work orders, sorted by date (newest first)
    const result = await collection.find({}).sort({ "Date and time": -1 }).toArray();

    res.json(result);
  } catch (error) {
    console.error("Error retrieving SCNA work orders:", error);
    res.status(500).send("Error retrieving SCNA work orders");
  }
});

// Fetch work order by number
app.get("/getWorkOrderByNumber", async (req, res) => {
  try {
    const workOrderNumber = req.query.number;
    
    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection("SCNAWorkOrderDB");

    const result = await collection.findOne({ "Number": workOrderNumber });

    if (!result) {
      return res.status(404).json({ error: "Work order not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("Error retrieving work order:", error);
    res.status(500).send("Error retrieving work order");
  }
});

///////////////////////////////////////////
//END of iREPORTER ROUTE
///////////////////////////////////




////////////////////////////////
//HIDASE LABEL PRINTER ROUTE////
///////////////////////////////


// Route to fetch all 背番号 from the hidaseTemporary collection
app.get("/getSeBanggoListH", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("hidaseTemporary"); // Corrected collection name

    const projection = { 品番: 1, _id: 0 }; // Assuming 背番号 refers to 品番
    const result = await collection.find({}).project(projection).toArray();

    // Map the results to an array of 品番
    const seBanggoList = result.map((item) => item.品番);

    res.json(seBanggoList);
  } catch (error) {
    console.error("Error retrieving 品番 list:", error);
    res.status(500).send("Error retrieving 品番 list");
  }
});


app.get("/getCapacityBySeBanggo", async (req, res) => {
  try {
    const seBanggo = req.query.seBanggo;

    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("hidaseTemporary");

    const result = await collection.find({ 品番: seBanggo }).toArray();

    res.json(result.map((item) => ({ 収容数: item.収容数 })));
  } catch (error) {
    console.error("Error retrieving 収容数:", error);
    res.status(500).send("Error retrieving 収容数");
  }
});



// Get product info from MongoDB (parameters are kojo and sebanggo)
// app.get("/getProductDetails", async (req, res) => {
//   try {
//     await client.connect();

//     // Query masterDB for product details
//     const masterDatabase = client.db("Sasaki_Coating_MasterDB");
//     const masterCollection = masterDatabase.collection("masterDB");

//     // Get values from the query parameters
//     const serialNumber = req.query.serialNumber; // 背番号 value from sub-dropdown
//     const factory = req.query.factory; // 工場 value from hidden input

//     if (!serialNumber) {
//       return res.status(400).send("Serial number is required");
//     }

//     // Check for duplicates of `背番号`
//     const duplicateCount = await masterCollection.countDocuments({
//       背番号: serialNumber,
//     });

//     // Query to match documents based on presence of duplicates
//     let query;
//     if (duplicateCount > 1) {
//       if (factory === "天徳" || factory === "第二工場") {
//         // Treat 天徳 and 第二工場 as the same factory
//         query = { 背番号: serialNumber, 工場: { $in: ["天徳", "第二工場"] } };
//       } else {
//         // Standard duplicate handling
//         query = { 背番号: serialNumber, 工場: factory };
//       }
//     } else {
//       query = { 背番号: serialNumber };
//     }

//     // Find the matching document in masterDB
//     const productDetails = await masterCollection.findOne(query, {
//       projection: {
//         品番: 1,
//         モデル: 1,
//         形状: 1,
//         "R/L": 1,
//         材料: 1,
//         材料背番号: 1,
//         色: 1,
//         送りピッチ: 1,
//         型番: 1,
//         収容数: 1,
//         SRS: 1,
//         SLIT: 1,
//         _id: 0,
//       },
//     });

//     // Query pictureDB for additional info
//     const pictureCollection = masterDatabase.collection("pictureDB");
//     const pictureDetails = await pictureCollection.findOne(
//       { 背番号: serialNumber },
//       { projection: { "html website": 1, _id: 0 } }
//     );

//     // Combine results
//     const combinedResult = {
//       ...productDetails,
//       htmlWebsite: pictureDetails ? pictureDetails["html website"] : null, // Include html website if found
//     };

//     // If no document is found in masterDB, return an empty response
//     if (!productDetails) {
//       return res.status(404).send("No matching product found");
//     }

//     // Send the combined result as JSON
//     res.json(combinedResult);
//   } catch (error) {
//     console.error("Error retrieving product details:", error);
//     res.status(500).send("Error retrieving product details");
//   }
// });

//getting product details using sebanggo or hinban
app.get("/getProductDetails", async (req, res) => {
  try {
    await client.connect();

    const masterDatabase = client.db("Sasaki_Coating_MasterDB");
    const masterCollection = masterDatabase.collection("masterDB");

    const serialNumber = req.query.serialNumber; // 背番号 value from sub-dropdown
    const factory = req.query.factory; // 工場 value from hidden input

    if (!serialNumber) {
      return res.status(400).send("Serial number is required");
    }

    // Check for duplicates of `背番号`
    let duplicateCount = await masterCollection.countDocuments({ 背番号: serialNumber });

    // Determine query conditions
    let query;
    if (duplicateCount > 1) {
      if (factory === "天徳" || factory === "第二工場") {
        query = { 背番号: serialNumber, 工場: { $in: ["天徳", "第二工場"] } };
      } else {
        query = { 背番号: serialNumber, 工場: factory };
      }
    } else {
      query = { 背番号: serialNumber };
    }

    // Search for product details using 背番号
    let productDetails = await masterCollection.findOne(query, {
      projection: {
        品番: 1,
        モデル: 1,
        形状: 1,
        "R/L": 1,
        材料: 1,
        材料背番号: 1,
        色: 1,
        送りピッチ: 1,
        型番: 1,
        収容数: 1,
        SRS: 1,
        SLIT: 1,
        _id: 0,
      },
    });

    // If no match in 背番号, try searching in 品番 instead
    if (!productDetails) {
      productDetails = await masterCollection.findOne({ 品番: serialNumber }, {
        projection: {
          品番: 1,
          モデル: 1,
          形状: 1,
          "R/L": 1,
          材料: 1,
          材料背番号: 1,
          色: 1,
          送りピッチ: 1,
          型番: 1,
          収容数: 1,
          SRS: 1,
          SLIT: 1,
          _id: 0,
        },
      });
    }

    // If still no match, return 404
    if (!productDetails) {
      return res.status(404).send("No matching product found");
    }

    // Query pictureDB for additional info using 背番号
    const pictureCollection = masterDatabase.collection("pictureDB");
    const pictureDetails = await pictureCollection.findOne(
      { 背番号: serialNumber },
      { projection: { "html website": 1, _id: 0 } }
    );

    // Combine results
    const combinedResult = {
      ...productDetails,
      htmlWebsite: pictureDetails ? pictureDetails["html website"] : null,
    };

    res.json(combinedResult);
  } catch (error) {
    console.error("Error retrieving product details:", error);
    res.status(500).send("Error retrieving product details");
  }
});





//get worker name
app.get("/getWorkerNames", async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("workerDB");

    // Get the factory value from the query parameters
    const selectedFactory = req.query.selectedFactory; // HTML value of id="selected工場"

    if (!selectedFactory) {
      return res.status(400).send("Factory is required");
    }

    // Find workers where `部署` contains the selected factory
    const workers = await collection
      .find(
        { 部署: { $regex: new RegExp(`(^|,)${selectedFactory}(,|$)`) } },
        { projection: { Name: 1, _id: 0 } } // Retrieve only the "Name" field
      )
      .toArray();

    if (workers.length === 0) {
      return res
        .status(404)
        .send("No matching workers found for the selected factory");
    }

    // Send the list of worker names as JSON
    res.json(workers.map((worker) => worker.Name));
  } catch (error) {
    console.error("Error retrieving worker names:", error);
    res.status(500).send("Error retrieving worker names");
  }
});

// Route to handle form submission for pressDB
app.post("/submitPressData", async (req, res) => {
  try {
    console.log("Raw Request Body:", req.body); // Debug the incoming request body

    await client.connect();
    const database = client.db("submittedDB");
    const pressDB = database.collection("pressDB");
    const currentCountDB = database.collection("currentCountDB");

    // Rename "Date" field to avoid conflict with JavaScript's Date constructor
    const {
      uniqueID,
      背番号,
      品番,
      Worker_Name,
      Date: dateField, // Rename Date to dateField
      Time_start,
      Time_end,
      設備,
      材料ロット,
      Remaining_Quantity,
      疵引不良,
      加工不良,
      Total_NG,
      Total,
      Spare,
      ScannedQR,
      Process_Quantity,
      その他,
      Cycle_Time,
      Process_Status,
    } = req.body;

    // Construct the document to insert into pressDB
    const document = {
      uniqueID,
      背番号,
      品番,
      Worker_Name,
      Date: new Date(dateField), // Use renamed dateField here
      Time_start,
      Time_end,
      設備,
      材料ロット,
      Remaining_Quantity: parseInt(Remaining_Quantity, 10),
      疵引不良: parseInt(疵引不良, 10),
      加工不良: parseInt(加工不良, 10),
      Total_NG: parseInt(Total_NG, 10),
      Total: parseInt(Total, 10),
      Spare: parseInt(Spare, 10),
      ScannedQR,
      Process_Quantity: parseInt(Process_Quantity, 10),
      その他: parseInt(その他, 10),
      Cycle_Time: parseFloat(Cycle_Time),
      Process_Status,
    };

    // Insert into pressDB
    const result = await pressDB.insertOne(document);

    // Check if uniqueID exists in currentCountDB
    let currentCountEntry = await currentCountDB.findOne({ uniqueID });

    if (!currentCountEntry) {
      // If no entry exists, create a new one
      await currentCountDB.insertOne({
        uniqueID,
        背番号,
        品番,
        pressDB_Remaining_Quantity: parseInt(Total, 10), // Initialize with Total from pressDB
        slitDB_Remaining_Quantity: 0,
        SRSDB_Remaining_Quantity: 0,
        pressDB_Date: new Date(dateField),
        ScannedQR,
      });
    } else {
      // If entry exists, update pressDB_Remaining_Quantity
      const updatedPressDBQuantity =
        (currentCountEntry.pressDB_Remaining_Quantity || 0) +
        parseInt(Total, 10);

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            pressDB_Remaining_Quantity: updatedPressDBQuantity, // Add Total to existing Remaining Quantity
            pressDB_Date: new Date(dateField), // Update Date field
            品番,
            ScannedQR,
          },
        }
      );
    }

    res.status(201).json({ insertedId: result.insertedId });
  } catch (error) {
    console.error("Error inserting press data:", error);
    res.status(500).send("Error inserting press data");
  }
});

//Route to check if processing
app.post("/checkQRStatus", async (req, res) => {
  try {
    const { ScannedQR } = req.body;

    if (!ScannedQR) {
      return res.status(400).json({ error: "ScannedQR is required" });
    }

    console.log(`Checking QR status for: ${ScannedQR}`); // Debug log

    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection("pressDB");

    // Check if ScannedQR exists with Process_Status = "processing"
    const existingEntry = await collection.findOne({
      ScannedQR,
      Process_Status: "processing",
    });

    console.log(`Query Result:`, existingEntry); // Log query result

    if (existingEntry) {
      return res.json({ isProcessing: true });
    }

    return res.json({ isProcessing: false });
  } catch (error) {
    console.error("Error checking QR status:", error);
    res.status(500).send("Error checking QR status");
  }
});

///////////////////////////////
// SRS ROUTE
//////////////////////////////

// SRS scan-button
//this route is to check if slit is ari, therefore get value from slit remaining qty else pressDB
app.post("/processSRS", async (req, res) => {
  try {
    const { ScannedQR } = req.body;

    if (!ScannedQR) {
      return res.status(400).json({ error: "ScannedQR is required" });
    }

    console.log(`Processing SRS QR: ${ScannedQR}`);

    await client.connect();
    const submittedDB = client.db("submittedDB");
    const pressDB = submittedDB.collection("pressDB");
    const currentCountDB = submittedDB.collection("currentCountDB");

    // Step 1: Find the row in pressDB with ScannedQR and Process_Status = "processing"
    const pressEntry = await pressDB.findOne({
      ScannedQR,
      Process_Status: "processing",
    });

    if (!pressEntry) {
      return res
        .status(404)
        .json({ error: "QR not found or not in processing state in pressDB" });
    }

    const {
      背番号,
      Remaining_Quantity: pressRemainingQuantity,
      uniqueID,
      Date,
    } = pressEntry;

    // Step 2: Check masterDB for the 背番号
    const masterDB = client
      .db("Sasaki_Coating_MasterDB")
      .collection("masterDB");
    const masterEntry = await masterDB.findOne({ 背番号 });

    if (!masterEntry) {
      return res.status(404).json({ error: "背番号 not found in masterDB" });
    }

    const { SRS, SLIT } = masterEntry;

    if (!SRS || SRS === "無し") {
      return res
        .status(400)
        .json({ error: "This product is not for SRS process" });
    }

    // Step 3: Handle SLIT and SRS logic
    if (SRS === "有り") {
      if (SLIT === "有り") {
        // Check currentCountDB for slitDB_Remaining_Quantity
        let currentCountEntry = await currentCountDB.findOne({ uniqueID });

        if (!currentCountEntry) {
          // Insert a new entry in currentCountDB if not found
          await currentCountDB.insertOne({
            uniqueID,
            背番号,
            ScannedQR,
            pressDB_Date: Date,
            pressDB_Remaining_Quantity: pressRemainingQuantity,
            slitDB_Remaining_Quantity: 0,
            SRSDB_Remaining_Quantity: 0,
          });

          currentCountEntry = await currentCountDB.findOne({ uniqueID });
        }

        const { slitDB_Remaining_Quantity } = currentCountEntry;

        if (slitDB_Remaining_Quantity === 0) {
          return res.status(400).json({
            error:
              "No remaining quantity in slitDB. Please process slits first.",
          });
        }

        return res.json({
          uniqueID,
          Remaining_Quantity: slitDB_Remaining_Quantity,
          背番号,
          source: "slitDB",
        });
      } else if (SLIT === "無し") {
        currentCountEntry = await currentCountDB.findOne({ uniqueID });
        const { pressDB_Remaining_Quantity } = currentCountEntry;
        // Check Remaining_Quantity in pressDB
        if (pressDB_Remaining_Quantity === 0) {
          return res.status(400).json({
            error: "No remaining quantity in pressDB. Process completed.",
          });
        }

        return res.json({
          uniqueID,
          Remaining_Quantity: pressDB_Remaining_Quantity,
          背番号,
          source: "pressDB",
        });
      }
    }

    // Handle unexpected cases
    return res
      .status(400)
      .json({ error: "Invalid process configuration for SRS" });
  } catch (error) {
    console.error("Error processing SRS QR:", error);
    res.status(500).send("Error processing SRS QR.");
  }
});

// This route submits data to SRSDB and updates the value of currentCountDB
app.post("/submitToSRSDB", async (req, res) => {
  try {
    const formData = req.body;
    const {
      uniqueID,
      Total,
      SRS_Total_NG,
      設備,
      ScannedQR,
      Date,
      Worker_Name,
    } = formData;

    await client.connect();
    const database = client.db("submittedDB");
    const SRSDB = database.collection("SRSDB");
    const currentCountDB = database.collection("currentCountDB");
    const deductionLogDB = database.collection("deduction_LogDB"); // Deduction Log collection

    // Step 1: Insert the new record into SRSDB
    formData.createdAt = new Date().toISOString(); // Add server timestamp
    const result = await SRSDB.insertOne(formData);

    // Step 2: Fetch current counts from currentCountDB
    const currentCountEntry = await currentCountDB.findOne({ uniqueID });

    if (!currentCountEntry) {
      return res
        .status(404)
        .json({ error: "UniqueID not found in currentCountDB" });
    }

    const { slitDB_Remaining_Quantity, pressDB_Remaining_Quantity } =
      currentCountEntry;

    // Step 3: Determine which quantity to update based on SLIT status
    const masterDB = client
      .db("Sasaki_Coating_MasterDB")
      .collection("masterDB");
    const masterEntry = await masterDB.findOne({
      背番号: currentCountEntry.背番号,
    });

    if (!masterEntry) {
      return res.status(404).json({ error: "背番号 not found in masterDB" });
    }

    const { SLIT } = masterEntry;

    // Calculate deduction quantity
    const deductionQty = Total + SRS_Total_NG; // Deduction amount

    // Insert deduction into deduction_LogDB
    const now = new global.Date();
    const deductionData = {
      uniqueID,
      Date: now.toISOString().split("T")[0], // YYYY-MM-DD
      Time: now.toTimeString().split(" ")[0], // HH:mm:ss
      Name: Worker_Name, // Replace with the appropriate worker name if needed
      Log: `Total:${Total}, SRS_Total_NG:${SRS_Total_NG} from ${設備 || "N/A"}`,
    };

    let updatedRemainingQuantity; // Variable to store the updated remaining quantity

    if (SLIT === "有り") {
      // Deduct from slitDB_Remaining_Quantity
      deductionData.slitDB_deduction_Qty = deductionQty;
      await deductionLogDB.insertOne(deductionData);

      // Calculate remaining quantity for slitDB
      updatedRemainingQuantity = await calculateRemainingQuantity(
        database,
        "slitDB",
        "Total",
        "slitDB_deduction_Qty",
        uniqueID
      );

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            slitDB_Remaining_Quantity: updatedRemainingQuantity,
          },
        }
      );
    } else {
      // Deduct from pressDB_Remaining_Quantity
      deductionData.pressDB_deduction_Qty = deductionQty;
      await deductionLogDB.insertOne(deductionData);

      // Calculate remaining quantity for pressDB
      updatedRemainingQuantity = await calculateRemainingQuantity(
        database,
        "pressDB",
        "Total",
        "pressDB_deduction_Qty",
        uniqueID
      );

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            pressDB_Remaining_Quantity: updatedRemainingQuantity,
          },
        }
      );
    }

    // Step 4: Calculate and update the remaining quantity for SRSDB
    const updatedSRSQuantity = await calculateRemainingQuantity(
      database,
      "SRSDB",
      "Total",
      "SRSDB_deduction_Qty",
      uniqueID
    );

    await currentCountDB.updateOne(
      { uniqueID },
      {
        $set: {
          SRSDB_Remaining_Quantity: updatedSRSQuantity,
        },
      }
    );

    res.status(201).json({
      insertedId: result.insertedId,
      message: "Form submitted and updated successfully",
    });
  } catch (error) {
    console.error("Error saving to SRSDB:", error);
    res.status(500).send("Error saving to SRSDB");
  }
});

/**
 * Helper function to calculate remaining quantity
 */
async function calculateRemainingQuantity(
  database,
  collectionName,
  totalField,
  deductionField,
  uniqueID
) {
  const totalAggregation = await database
    .collection(collectionName)
    .aggregate([
      { $match: { uniqueID } },
      { $group: { _id: "$uniqueID", total: { $sum: `$${totalField}` } } },
    ])
    .toArray();

  const totalInserted =
    totalAggregation.length > 0 ? totalAggregation[0].total : 0;

  const deductionAggregation = await database
    .collection("deduction_LogDB")
    .aggregate([
      { $match: { uniqueID } },
      {
        $group: {
          _id: "$uniqueID",
          totalDeducted: { $sum: `$${deductionField}` },
        },
      },
    ])
    .toArray();

  const totalDeducted =
    deductionAggregation.length > 0 ? deductionAggregation[0].totalDeducted : 0;

  return totalInserted - totalDeducted;
}

//////////////////////////////////////
//
// SLit ROUTE
//
//////////////////////////////////
//slit process scan-button route
// Process SLIT
app.post("/processSLIT", async (req, res) => {
  try {
    const { ScannedQR } = req.body;

    if (!ScannedQR) {
      return res.status(400).json({ error: "ScannedQR is required" });
    }

    console.log(`Processing SLIT QR: ${ScannedQR}`);

    await client.connect();
    const submittedDB = client.db("submittedDB");
    const pressDB = submittedDB.collection("pressDB");
    const currentCountDB = submittedDB.collection("currentCountDB");

    // Step 1: Find the row in pressDB with ScannedQR and Process_Status = "processing"
    const pressEntry = await pressDB.findOne({
      ScannedQR,
      Process_Status: "processing",
    });

    if (!pressEntry) {
      return res
        .status(404)
        .json({ error: "QR not found or not in processing state in pressDB" });
    }

    const { 背番号, Remaining_Quantity, uniqueID, Date } = pressEntry; // Include Date field

    // Step 2: Check masterDB for the 背番号
    const masterDB = client
      .db("Sasaki_Coating_MasterDB")
      .collection("masterDB");
    const masterEntry = await masterDB.findOne({ 背番号 });

    if (!masterEntry) {
      return res.status(404).json({ error: "背番号 not found in masterDB" });
    }

    const { SLIT } = masterEntry; // Check SLIT status

    if (!SLIT || SLIT === "無し") {
      return res.status(400).json({ error: "This is not for SLIT process" });
    }

    // Step 3: Ensure currentCountDB entry exists
    let currentCountEntry = await currentCountDB.findOne({ uniqueID });

    if (!currentCountEntry) {
      // Insert a new entry if not found
      await currentCountDB.insertOne({
        uniqueID,
        背番号,
        品番: masterEntry.品番 || "",
        ScannedQR,
        pressDB_Date: Date, // Include Date from pressDB
        pressDB_Remaining_Quantity: Remaining_Quantity, // Initialize Remaining_Quantity here
        slitDB_Remaining_Quantity: 0,
        SRSDB_Remaining_Quantity: 0,
      });

      // Fetch the newly created entry
      currentCountEntry = await currentCountDB.findOne({ uniqueID });
    }

    if (currentCountEntry.pressDB_Remaining_Quantity === 0) {
      return res.status(400).json({
        error:
          "No remaining quantity in pressDB. Please check press process first.",
      });
    }
    // Step 4: Return the required details
    return res.json({
      uniqueID,
      pressDB_Remaining_Quantity: currentCountEntry.pressDB_Remaining_Quantity,
      背番号,
      ScannedQR,
      pressDB_Date: Date, // Include pressDB's Date
      source: "pressDB",
    });
  } catch (error) {
    console.error("Error processing SLIT QR:", error);
    res.status(500).send("Error processing SLIT QR.");
  }
});

// Submit to slitDB and update currentCountDB and deduction_LogDB
app.post("/submitToSlitDB", async (req, res) => {
  try {
    const formData = req.body;
    const { uniqueID, Total, Total_NG, ScannedQR, Date, Worker_Name, 設備 } =
      formData;

    await client.connect();
    const database = client.db("submittedDB");
    const slitDB = database.collection("slitDB");
    const pressDB = database.collection("pressDB");
    const currentCountDB = database.collection("currentCountDB");
    const deductionLogDB = database.collection("deduction_LogDB"); // New collection

    // Step 1: Insert the new record into slitDB
    formData.createdAt = new Date().toISOString(); // Add server timestamp
    const result = await slitDB.insertOne(formData);

    // Step 2: Insert a new record into deduction_LogDB
    const now = new global.Date(); // Current date and time
    const deductionData = {
      uniqueID,
      pressDB_deduction_Qty: Total + Total_NG, // Deduction quantity for pressDB
      Date: now.toISOString().split("T")[0], // Extracts the date (YYYY-MM-DD)
      Time: now.toTimeString().split(" ")[0], // Extracts the time (HH:mm:ss)
      Name: Worker_Name,
      Log: `Total:${Total}, Total_NG:${Total_NG} from ${設備}`,
    };
    await deductionLogDB.insertOne(deductionData);

    // Step 3: Calculate the total "Total" value from pressDB for this uniqueID
    const pressAggregation = await pressDB
      .aggregate([
        { $match: { uniqueID } },
        { $group: { _id: "$uniqueID", totalPress: { $sum: "$Total" } } },
      ])
      .toArray();

    if (pressAggregation.length === 0) {
      return res
        .status(404)
        .json({ error: "No records found in pressDB for this uniqueID" });
    }

    const totalPress = pressAggregation[0].totalPress;

    // Step 4: Calculate the updated slitDB_Remaining_Quantity for this uniqueID
    const slitAggregation = await slitDB
      .aggregate([
        { $match: { uniqueID } },
        { $group: { _id: "$uniqueID", totalInserted: { $sum: "$Total" } } },
      ])
      .toArray();

    if (slitAggregation.length === 0) {
      return res
        .status(404)
        .json({ error: "No records found in slitDB for this uniqueID" });
    }

    const totalSlitInserted = slitAggregation[0].totalInserted;

    // Step 5: Calculate total deductions for slitDB and pressDB
    const deductionAggregation = await deductionLogDB
      .aggregate([
        { $match: { uniqueID } },
        {
          $group: {
            _id: "$uniqueID",
            totalPressDeducted: { $sum: "$pressDB_deduction_Qty" },
            totalSlitDeducted: { $sum: "$slitDB_deduction_Qty" },
          },
        },
      ])
      .toArray();

    const totalPressDeducted =
      deductionAggregation.length > 0
        ? deductionAggregation[0].totalPressDeducted
        : 0;
    const totalSlitDeducted =
      deductionAggregation.length > 0
        ? deductionAggregation[0].totalSlitDeducted
        : 0;

    // Corrected calculation for pressDB_Remaining_Quantity
    const pressDB_Remaining_Quantity = totalPress - totalPressDeducted;
    const slitDB_Remaining_Quantity = totalSlitInserted - totalSlitDeducted;

    console.log("Total press:", totalPress);
    console.log("Total deducted from pressDB:", totalPressDeducted);
    console.log("Total slit:", totalSlitInserted);
    console.log("Total deducted from slitDB:", totalSlitDeducted);

    // Step 6: Update pressDB_Remaining_Quantity and slitDB_Remaining_Quantity in currentCountDB
    const currentCountEntry = await currentCountDB.findOne({ uniqueID });

    if (!currentCountEntry) {
      return res
        .status(404)
        .json({ error: "UniqueID not found in currentCountDB" });
    }

    await currentCountDB.updateOne(
      { uniqueID },
      {
        $set: {
          pressDB_Remaining_Quantity, // Update calculated pressDB remaining quantity
          slitDB_Remaining_Quantity, // Update calculated slitDB remaining quantity
          ScannedQR, // Add or update ScannedQR
          pressDB_Date: Date, // Update or add Date
        },
      }
    );

    res.status(201).json({
      insertedId: result.insertedId,
      message: "Form submitted and updated successfully",
    });
  } catch (error) {
    console.error("Error processing submitToSlitDB:", error);
    res.status(500).send("Error processing submission to slitDB");
  }
});

////////////////////
//KENSA route
////////////////////

// Kensa scan-button
app.post("/processKensa", async (req, res) => {
  try {
    const { ScannedQR } = req.body;

    if (!ScannedQR) {
      return res.status(400).json({ error: "ScannedQR is required" });
    }

    console.log(`Processing Kensa QR: ${ScannedQR}`);

    await client.connect();
    const submittedDB = client.db("submittedDB");
    const pressDB = submittedDB.collection("pressDB");
    const currentCountDB = submittedDB.collection("currentCountDB");

    // Step 1: Find the row in pressDB with ScannedQR and Process_Status = "processing"
    const pressEntry = await pressDB.findOne({
      ScannedQR,
      Process_Status: "processing",
    });

    if (!pressEntry) {
      return res
        .status(404)
        .json({ error: "QR not found or not in processing state in pressDB" });
    }

    const { 背番号, uniqueID } = pressEntry;

    // Step 2: Check masterDB for the 背番号
    const masterDB = client
      .db("Sasaki_Coating_MasterDB")
      .collection("masterDB");
    const masterEntries = await masterDB.findOne({ 背番号 });

    if (masterEntries.length === 0) {
      return res.status(404).json({ error: "背番号 not found in masterDB" });
    }

    const { SLIT, SRS } = masterEntries;

    console.log(`SRS from DB: '${masterEntries.SRS}'`);
    console.log(`SLIT from DB: '${masterEntries.SLIT}'`);
    console.log(`Type of SRS: ${typeof masterEntries.SRS}`);
    console.log(`Type of SLIT: ${typeof masterEntries.SLIT}`);

    // Step 3: Determine source and remaining quantity
    let Remaining_Quantity = 0;
    let source = "";

    if (SLIT === "有り" && SRS === "有り") {
      // Use SRSDB_Remaining_Quantity
      const currentCountEntry = await currentCountDB.findOne({ uniqueID });

      if (!currentCountEntry) {
        return res
          .status(400)
          .json({ error: "No current count data found for SRS." });
      }

      const { SRSDB_Remaining_Quantity } = currentCountEntry;

      if (SRSDB_Remaining_Quantity === 0) {
        return res.status(400).json({
          error: "No remaining quantity in SRSDB. Process completed.",
        });
      }

      Remaining_Quantity = SRSDB_Remaining_Quantity;
      source = "SRSDB";
    } else if (SLIT === "有り" && (!SRS || SRS === "無し")) {
      // Use slitDB_Remaining_Quantity
      const currentCountEntry = await currentCountDB.findOne({ uniqueID });

      if (!currentCountEntry) {
        return res
          .status(400)
          .json({ error: "No current count data found for SLIT." });
      }

      const { slitDB_Remaining_Quantity } = currentCountEntry;

      if (slitDB_Remaining_Quantity === 0) {
        return res.status(400).json({
          error: "No remaining quantity in SLITDB. Process completed.",
        });
      }

      Remaining_Quantity = slitDB_Remaining_Quantity;
      source = "slitDB";
    } else if ((!SLIT || SLIT === "無し") && SRS === "有り") {
      // Use SRSDB_Remaining_Quantity
      const currentCountEntry = await currentCountDB.findOne({ uniqueID });

      if (!currentCountEntry) {
        return res
          .status(400)
          .json({ error: "No current count data found for SRS." });
      }

      const { SRSDB_Remaining_Quantity } = currentCountEntry;

      if (SRSDB_Remaining_Quantity === 0) {
        return res.status(400).json({
          error: "No remaining quantity in SRSDB. Process completed.",
        });
      }

      Remaining_Quantity = SRSDB_Remaining_Quantity;
      source = "SRSDB";
    } else if ((!SLIT || SLIT === "無し") && (!SRS || SRS === "無し")) {
      // Use pressDB_Remaining_Quantity
      const currentCountEntryPress = await currentCountDB.findOne({ uniqueID });
      if (currentCountEntryPress === 0) {
        return res.status(400).json({
          error: "No remaining quantity in pressDB. Process completed.",
        });
      }
      const { pressDB_Remaining_Quantity } = currentCountEntryPress;

      Remaining_Quantity = pressDB_Remaining_Quantity;
      source = "pressDB";
    } else {
      return res
        .status(400)
        .json({ error: "Invalid process configuration for Kensa" });
    }

    return res.json({
      uniqueID,
      Remaining_Quantity,
      背番号,
      source,
    });
  } catch (error) {
    console.error("Error processing Kensa QR:", error);
    res.status(500).send("Error processing Kensa QR.");
  }
});

// Submit data to kensaDB and update currentCountDB
app.post("/submitToKensaDB", async (req, res) => {
  try {
    const formData = req.body;
    const { uniqueID, Total, 設備, Total_NG, ScannedQR, Date, Worker_Name } =
      formData;

    await client.connect();
    const database = client.db("submittedDB");
    const kensaDB = database.collection("kensaDB");
    const currentCountDB = database.collection("currentCountDB");
    const pressDB = database.collection("pressDB"); // Add pressDB collection
    const deductionLogDB = database.collection("deduction_LogDB"); // Deduction Log collection

    // Step 1: Insert the new record into kensaDB
    formData.createdAt = new Date().toISOString(); // Add server timestamp
    const result = await kensaDB.insertOne(formData);

    // Step 2: Aggregate total process quantity in kensaDB
    const kensaAggregation = await kensaDB
      .aggregate([
        { $match: { uniqueID } },
        {
          $group: {
            _id: "$uniqueID",
            totalProcessQuantity: { $sum: "$Total" },
          },
        },
      ])
      .toArray();

    if (kensaAggregation.length === 0) {
      return res
        .status(404)
        .json({ error: "No records found in kensaDB for this uniqueID" });
    }

    const totalKensaProcessed = kensaAggregation[0].totalProcessQuantity;

    // Step 3: Fetch current counts from currentCountDB
    const currentCountEntry = await currentCountDB.findOne({ uniqueID });

    if (!currentCountEntry) {
      return res
        .status(404)
        .json({ error: "UniqueID not found in currentCountDB" });
    }

    const {
      SRSDB_Remaining_Quantity,
      slitDB_Remaining_Quantity,
      pressDB_Remaining_Quantity,
    } = currentCountEntry;

    // Step 4: Fetch the masterDB entry for SRS and SLIT checks
    const masterDB = client
      .db("Sasaki_Coating_MasterDB")
      .collection("masterDB");
    const masterEntry = await masterDB.findOne({
      背番号: currentCountEntry.背番号,
    });

    if (!masterEntry) {
      return res.status(404).json({ error: "背番号 not found in masterDB" });
    }

    const { SRS, SLIT } = masterEntry;

    // Calculate the deduction quantity
    const deductionQty = Total + Total_NG;

    // Insert into deduction_LogDB
    const now = new global.Date();
    const deductionData = {
      uniqueID,
      Date: now.toISOString().split("T")[0], // YYYY-MM-DD
      Time: now.toTimeString().split(" ")[0], // HH:mm:ss
      Name: Worker_Name, // Replace with appropriate worker name if needed
      Log: `Total:${Total}, Total_NG:${Total_NG} from ${設備}`,
    };

    // Step 5: Backward checking and deduction logic
    if (SRS === "有り") {
      // Deduct from SRSDB_Remaining_Quantity
      const updatedSRSQuantity = SRSDB_Remaining_Quantity - deductionQty;

      if (updatedSRSQuantity < 0) {
        return res.status(400).json({
          error: "Not enough quantity in SRSDB to process this submission",
        });
      }

      deductionData.SRSDB_deduction_Qty = deductionQty;
      await deductionLogDB.insertOne(deductionData);

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            SRSDB_Remaining_Quantity: updatedSRSQuantity,
            kensaDB_Total_Processed: totalKensaProcessed,
          },
        }
      );
    } else if (SLIT === "有り") {
      // Deduct from slitDB_Remaining_Quantity
      const updatedSlitQuantity = slitDB_Remaining_Quantity - deductionQty;

      if (updatedSlitQuantity < 0) {
        return res.status(400).json({
          error: "Not enough quantity in slitDB to process this submission",
        });
      }

      deductionData.slitDB_deduction_Qty = deductionQty;
      await deductionLogDB.insertOne(deductionData);

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            slitDB_Remaining_Quantity: updatedSlitQuantity,
            kensaDB_Total_Processed: totalKensaProcessed,
          },
        }
      );
    } else {
      // Deduct from pressDB_Remaining_Quantity
      const updatedPressQuantity = pressDB_Remaining_Quantity - deductionQty;

      if (updatedPressQuantity < 0) {
        return res.status(400).json({
          error: "Not enough quantity in pressDB to process this submission",
        });
      }

      deductionData.pressDB_deduction_Qty = deductionQty;
      await deductionLogDB.insertOne(deductionData);

      await currentCountDB.updateOne(
        { uniqueID },
        {
          $set: {
            pressDB_Remaining_Quantity: updatedPressQuantity,
            kensaDB_Total_Processed: totalKensaProcessed,
          },
        }
      );
    }

    // Step 6: Check if all remaining quantities are zero
    const updatedCurrentCount = await currentCountDB.findOne({ uniqueID });
    const {
      SRSDB_Remaining_Quantity: updatedSRSDB_Remaining_Quantity,
      slitDB_Remaining_Quantity: updatedSlitDB_Remaining_Quantity,
      pressDB_Remaining_Quantity: updatedPressDB_Remaining_Quantity,
    } = updatedCurrentCount;

    const totalRemainingQuantity =
      updatedSRSDB_Remaining_Quantity +
      updatedSlitDB_Remaining_Quantity +
      updatedPressDB_Remaining_Quantity;

    if (totalRemainingQuantity === 0) {
      // Update Process_Status in pressDB to "completed"
      await pressDB.updateOne(
        { uniqueID },
        {
          $set: {
            Process_Status: "completed",
          },
        }
      );
    }

    res.status(201).json({
      insertedId: result.insertedId,
      message: "Form submitted and updated successfully",
    });
  } catch (error) {
    console.error("Error saving to kensaDB:", error);
    res.status(500).send("Error saving to kensaDB");
  }
});

// THis code updates remaining quantity
//update Remaining_Quantity column for either slitDB or pressDB
app.post("/updateRemainingQuantity", async (req, res) => {
  try {
    const { source, Remaining_Quantity, uniqueID } = req.body;

    if (!source || !uniqueID) {
      return res
        .status(400)
        .json({ error: "Source and uniqueID are required" });
    }

    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection(source); // Either slitDB or pressDB

    // Update the Remaining_Quantity for the matching uniqueID
    const result = await collection.updateOne(
      { uniqueID }, // Match by uniqueID
      { $set: { Remaining_Quantity } }
    );

    if (result.matchedCount === 0) {
      console.log(`UniqueID ${uniqueID} not found in ${source}`);
      return res
        .status(404)
        .json({ error: `UniqueID ${uniqueID} not found in ${source}` });
    }

    res
      .status(200)
      .json({ message: "Remaining Quantity updated successfully" });
  } catch (error) {
    console.error("Error updating Remaining Quantity:", error);
    res.status(500).send("Error updating Remaining Quantity");
  }
});


app.post('/query', async (req, res) => {
  const { collectionName, query } = req.body;
  
  try {
    await client.connect();
    const database = client.db("submittedDB");
    const collection = database.collection(collectionName);

    // Run the query
    const results = await collection.find(query).toArray();
    res.json(results);
  } catch (error) {
    res.status(500).send({ error: error.toString() });
  } finally {
    await client.close();
  }
});



///////////////////////////////
/////THis is for the Inventory app react js
////////////////////////////////////

// Route to save scanned QR data to MongoDB
// Route to save scanned QR data to MongoDB
app.post("/saveScannedQRData", async (req, res) => {
  try {
    await client.connect();

    const database = client.db("submittedDB"); // Use the existing database
    const inventoryDB = database.collection("inventoryDB"); // Collection to store inventory data
    const masterDB = client.db("Sasaki_Coating_MasterDB").collection("masterDB"); // Collection to fetch 背番号 and 工場

    const { scannedBy, scannedResults } = req.body; // ✅ Include name from frontend

    if (!scannedBy || !scannedResults || scannedResults.length === 0) {
      return res.status(400).json({ error: "No scanned data or name provided" });
    }

    // ✅ Get current date and Japan time (JST)
    const now = new Date();
    now.setHours(now.getHours() + 9); // ✅ Convert UTC to JST

    const formattedDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
    const formattedTime = now.toTimeString().split(" ")[0]; // HH:MM:SS format

    // Transform scanned data by fetching `背番号` and `工場`
    const structuredData = await Promise.all(
      scannedResults.map(async (record) => {
        const { productName, quantity } = record;

        // Find the corresponding 背番号 and 工場 from masterDB
        const masterRecord = await masterDB.findOne({ 品番: productName });

        return {
          品番: productName,
          背番号: masterRecord ? masterRecord.背番号 : "-", // If not found, set to "-"
          工場: masterRecord ? masterRecord.工場 : "-", // ✅ Added 工場 field
          Date: formattedDate,
          Time: formattedTime,
          Quantity: parseInt(quantity, 10) || 0,
          ScannedBy: scannedBy, // ✅ Now saving the name
        };
      })
    );

    // Insert data into inventoryDB
    const result = await inventoryDB.insertMany(structuredData);

    res.status(201).json({
      message: "Scanned data saved successfully!",
      insertedCount: result.insertedCount,
    });
  } catch (error) {
    console.error("Error saving scanned QR data:", error);
    res.status(500).json({ error: "Error saving scanned QR data" });
  }
});





/////END OF INVENTORY///////////////

// Dynamic query. the parameters needed are 1. DB Name, Collection Name, JSON Query

// copy paste this:

// fetch("https://your-api-url.com/query", {
//   method: "POST",
//   headers: {
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     dbName: "Sasaki_Coating_MasterDB", // Select the DB dynamically
//     collectionName: "masterDB", // The collection to query
//     query: { 工場: "NFH" }, // Dynamic query
//     projection: { 品番: 1, 背番号: 1, _id: 0 }, // Optional fields to return
//   }),
// })
//   .then((response) => response.json())
//   .then((data) => console.log("Query Results:", data))
//   .catch((error) => console.error("Error:", error));

// app.post('/query', async (req, res) => {
//   const { dbName, collectionName, query, aggregation } = req.body;
  
//   try {
//     await client.connect();
//     const database = client.db(dbName);
//     const collection = database.collection(collectionName);

//     let results;

//     if (aggregation) {
//       // Run aggregation pipeline
//       results = await collection.aggregate(aggregation).toArray();
//     } else {
//       // Run a normal query
//       results = await collection.find(query).toArray();
//     }

//     res.json(results);
//     console.log(results);
//   } catch (error) {
//     console.error("Error executing query:", error);
//     res.status(500).json({ error: "Error executing query" });
//   }
// });


// // Dynamic query. the parameters needed are 1. DB Name, Collection Name, JSON Query
// app.post('/queries', async (req, res) => {
//   console.log("🟢 Received POST request to /queries");
//   const { dbName, collectionName, query, aggregation, insertData, update, delete: deleteFlag, username } = req.body;

//   try {
//     console.log("Received Request:", { dbName, collectionName, query, aggregation, insertData, update, deleteFlag, username });

//     await client.connect();
//     const database = client.db(dbName);
//     const collection = database.collection(collectionName);

//     let results;

//     if (insertData) {
//       // 🔵 INSERT logic
//       console.log("🔵 Inserting data into MongoDB...");
//       const insertResult = await collection.insertMany(insertData);
//       console.log(`✅ Successfully inserted ${insertResult.insertedCount} records.`);
//       res.json({ message: "Data inserted successfully", insertedCount: insertResult.insertedCount });
//       return;
//     }

//     if (update) {
//       // 🟠 UPDATE logic
//       console.log("🟠 Updating MongoDB document...");
//       const updateResult = await collection.updateOne(query, update);
//       console.log(`✅ Successfully updated ${updateResult.modifiedCount} records.`);
//       res.json({ message: "Data updated successfully", modifiedCount: updateResult.modifiedCount });
//       return;
//     }

//     if (deleteFlag) {
//       // 🔴 ARCHIVE instead of DELETE
//       if (!username) {
//         res.status(400).json({ error: "Username is required when attempting to delete (archive) data." });
//         return;
//       }

//       // ✅ Convert _id to ObjectId if necessary
//       if (query && query._id && typeof query._id === "string") {
//         try {
//           query._id = new ObjectId(query._id);
//         } catch (err) {
//           return res.status(400).json({ error: "Invalid _id format for deletion." });
//         }
//       }

//       console.log(`🔴 User "${username}" requested to archive matching documents...`);

//       const docsToArchive = await collection.find(query).toArray();

//       if (docsToArchive.length === 0) {
//         res.json({ message: "No documents found to archive." });
//         return;
//       }

//       const archiveCollection = database.collection(`${collectionName}_archives`);
//       const archivedDocs = docsToArchive.map(doc => ({
//         ...doc,
//         _originalId: doc._id,
//         deletedBy: username,
//         deletedAt: new Date(),
//       }));

//       await archiveCollection.insertMany(archivedDocs);
//       const deleteResult = await collection.deleteMany(query);

//       console.log(`✅ Archived ${archivedDocs.length} docs by "${username}" and deleted ${deleteResult.deletedCount} from original.`);
//       res.json({
//         message: "Documents archived instead of deleted.",
//         archivedCount: archivedDocs.length,
//         deletedFromOriginal: deleteResult.deletedCount,
//         archivedBy: username
//       });
//       return;
//     }

//     if (aggregation) {
//       // 🔵 Aggregation Query
//       console.log("🔵 Running Aggregation Pipeline...");
//       results = await collection.aggregate(aggregation).toArray();
//     } else {
//       // 🔵 Find Query
//       console.log("🔵 Running Find Query...");
//       results = await collection.find(query).toArray();
//     }

//     console.log("✅ Query Results:", JSON.stringify(results, null, 2));
//     res.json(results);
//   } catch (error) {
//     console.error("❌ Error executing query:", error);
//     res.status(500).json({ error: "Error executing query" });
//   } 
// });

// Ensure this is at the top of your server.js with other requires:
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const client = new MongoClient(uri, { ... }); // Your MongoDB client initialization

app.post('/queries', async (req, res) => {
  console.log("🟢 Received POST request to /queries");
  // Destructure query from req.body to modify it if needed
  let { dbName, collectionName, query, aggregation, insertData, update, delete: deleteFlag, username } = req.body;

  try {
    // Log the initial request for debugging
    // console.log("Initial Request Body:", JSON.parse(JSON.stringify(req.body)));

    // CENTRALIZED ObjectId CONVERSION for query._id
    // This should happen before update or delete operations that rely on _id
    if (query && query._id && typeof query._id === "string") {
      console.log(`Attempting to convert query._id: ${query._id} to ObjectId`);
      try {
        query._id = new ObjectId(query._id); // Modify the query object directly
        console.log(`Successfully converted query._id to:`, query._id);
      } catch (err) {
        console.error("Error converting query._id to ObjectId:", err.message);
        // If _id is invalid, it's a bad request for operations targeting a specific document by _id
        return res.status(400).json({ error: "Invalid _id format provided in query." });
      }
    }

    // Ensure client is connected (if you manage connections per request)
    // If you have a global connection, this might not be needed here.
    // await client.connect(); 

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    // Log the potentially modified query (with ObjectId) before operations
    // console.log("Processed Query (after potential ObjectId conversion):", query);

    if (insertData) {
      console.log("🔵 Inserting data into MongoDB...");
      // Handle both single document and array of documents for insertion
      const insertResult = Array.isArray(insertData) ? await collection.insertMany(insertData) : await collection.insertOne(insertData);
      const insertedCount = insertResult.insertedCount || (insertResult.insertedId ? 1 : 0);
      console.log(`✅ Successfully inserted ${insertedCount} records.`);
      res.json({ message: "Data inserted successfully", insertedCount: insertedCount, insertedId: insertResult.insertedId });
      return;
    }

    if (update) {
      // 🟠 UPDATE logic
      // query._id should now be an ObjectId if it was provided as a string
      console.log("🟠 Updating MongoDB document with query:", query, "and update:", update);
      const updateResult = await collection.updateOne(query, update);
      console.log(`✅ Update result: matchedCount: ${updateResult.matchedCount}, modifiedCount: ${updateResult.modifiedCount}`);
      
      if (updateResult.matchedCount === 0) {
          // This is the specific condition for "not found"
          return res.status(404).json({ message: "更新対象のデータが見つかりませんでした。", modifiedCount: 0, matchedCount: 0 });
      }
      res.json({ message: "Data updated successfully", modifiedCount: updateResult.modifiedCount, matchedCount: updateResult.matchedCount });
      return;
    }

    if (deleteFlag) {
      // 🔴 ARCHIVE (or delete) logic
      // query._id is already an ObjectId if it was provided, due to the centralized conversion
      if (!username) {
        return res.status(400).json({ error: "Username is required when attempting to delete (archive) data." });
      }
      console.log(`🔴 User "${username}" requested to archive/delete matching documents with query:`, query);
      
      // Example for archiving:
      const docsToArchive = await collection.find(query).toArray();

      if (docsToArchive.length === 0) {
        console.log("No documents found to archive/delete for query:", query);
        res.json({ message: "No documents found to archive/delete." });
        return;
      }
      
      const archiveCollectionName = `${collectionName}_archives`;
      console.log(`Archiving to collection: ${archiveCollectionName}`);
      const archiveCollection = database.collection(archiveCollectionName);
      
      const archivedDocs = docsToArchive.map(doc => ({
        ...doc,
        _originalId: doc._id, // _id is already an ObjectId here
        deletedBy: username,
        deletedAt: new Date(),
      }));

      await archiveCollection.insertMany(archivedDocs);
      const deleteResult = await collection.deleteMany(query);

      console.log(`✅ Archived ${archivedDocs.length} docs by "${username}" and deleted ${deleteResult.deletedCount} from original.`);
      res.json({
        message: "Documents archived successfully.",
        archivedCount: archivedDocs.length,
        deletedFromOriginal: deleteResult.deletedCount,
        archivedBy: username
      });
      return;
    }

    if (aggregation) {
      console.log("🔵 Running Aggregation Pipeline with pipeline:", aggregation);
      const results = await collection.aggregate(aggregation).toArray();
      console.log(`✅ Aggregation Results Count: ${results.length}`);
      res.json(results);
      return;
    }
    
    // Default to find if no other operation specified
    console.log("🔵 Running Find Query with query:", query);
    const results = await collection.find(query).toArray();
    console.log(`✅ Find Query Results Count: ${results.length}`);
    // console.log("✅ Query Results (Find):", JSON.stringify(results, null, 2)); // Can be verbose
    res.json(results);

  } catch (error) {
    console.error("❌ Error executing query in /queries route:", error);
    res.status(500).json({ error: "Error executing query", details: error.message });
  } 
  // finally {
  //   // If you are managing MongoDB client connections per request, uncomment to close.
  //   // Otherwise, if you have a global client, it's typically closed when the app shuts down.
  //   // if (client && client.topology && client.topology.isConnected()) {
  //   //   await client.close();
  //   //   console.log("MongoDB client connection closed.");
  //   // }
  // }
});






//FREYA ADMIN START



/**
 * Search manufacturing lot across multiple collections
 * POST /api/search-manufacturing-lot
 */
app.post('/api/search-manufacturing-lot', async (req, res) => {
    console.log("🟢 Received POST request to /api/search-manufacturing-lot");
    
    const { 
        factory, 
        from, 
        to, 
        manufacturingLot, 
        partNumbers = [], 
        serialNumbers = [],
        page = 1,
        limit = 50,
        maxLimit = 200
    } = req.body;

    try {
        // Validate required fields - only manufacturing lot is required
        if (!manufacturingLot || manufacturingLot.length < 3) {
            return res.status(400).json({ 
                success: false, 
                error: "Manufacturing lot must be at least 3 characters long" 
            });
        }

        const database = client.db("submittedDB");
        
        // Pagination settings
        const currentPage = parseInt(page, 10) || 1;
        const maxAllowedLimit = parseInt(maxLimit, 10) || 200;
        const itemsPerPage = Math.min(parseInt(limit, 10) || 50, maxAllowedLimit);
        const skip = (currentPage - 1) * itemsPerPage;

        console.log(`🔍 Searching manufacturing lot: "${manufacturingLot}" across ALL factories and dates`);

        // Define collections and their search fields
        const collectionsConfig = [
            {
                name: "pressDB",
                processName: "Press",
                lotField: "材料ロット",
                commentField: "Comment"
            },
            {
                name: "kensaDB", 
                processName: "Kensa",
                lotField: "製造ロット",
                commentField: "Comment"
            },
            {
                name: "SRSDB",
                processName: "SRS", 
                lotField: "製造ロット",
                commentField: "Comment"
            },
            {
                name: "slitDB",
                processName: "Slit",
                lotField: "製造ロット", 
                commentField: "Comment"
            },
            {
                name: "materialRequestDB",
                processName: "PSA",
                lotField: "PrintLog.lotNumbers", // Special handling needed
                commentField: null // No comment field for this collection
            }
        ];

        // Build base query - no factory or date restrictions for manufacturing lot search
        const baseQuery = {};

        // Add part number filter if provided
        if (partNumbers && partNumbers.length > 0) {
            baseQuery["品番"] = { $in: partNumbers };
        }

        // Add serial number filter if provided  
        if (serialNumbers && serialNumbers.length > 0) {
            baseQuery["背番号"] = { $in: serialNumbers };
        }

        // Create regex patterns that handle hyphen variations
        // If user inputs "250915-1", also search for "2509151" 
        // If user inputs "2509151", also search for "250915-1"
        function createHyphenVariationRegexes(searchTerm) {
            const patterns = [searchTerm]; // Always include original
            
            if (searchTerm.includes('-')) {
                // Remove all hyphens for alternate pattern
                patterns.push(searchTerm.replace(/-/g, ''));
            } else {
                // Try to intelligently add hyphens
                // Pattern: YYMMDD-N (6 digits followed by number)
                const match = searchTerm.match(/^(\d{6})(\d+)$/);
                if (match) {
                    patterns.push(`${match[1]}-${match[2]}`);
                }
            }
            
            // Create regex that matches any of the patterns
            const regexPattern = patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            return new RegExp(regexPattern, 'i');
        }

        const results = {};
        const lotRegex = createHyphenVariationRegexes(manufacturingLot);
        
        console.log(`🔍 Created regex pattern for "${manufacturingLot}":`, lotRegex.source);

        // Search each collection
        for (const config of collectionsConfig) {
            try {
                const collection = database.collection(config.name);
                let query = { ...baseQuery };
                
                if (config.name === "materialRequestDB") {
                    // Special handling for materialRequestDB - search all factories and dates
                    query = {
                        "PrintLog.lotNumbers": { $regex: lotRegex }
                    };
                    
                    // Part numbers for materialRequestDB
                    if (partNumbers && partNumbers.length > 0) {
                        query["品番"] = { $in: partNumbers };
                    }
                    
                    // No serial numbers for materialRequestDB as it uses different structure
                } else {
                    // Regular collections - no factory or date restrictions
                    query = { ...baseQuery };
                    
                    // Build OR query for lot field and comment field
                    const orConditions = [
                        { [config.lotField]: { $regex: lotRegex } }
                    ];
                    
                    if (config.commentField) {
                        orConditions.push({ [config.commentField]: { $regex: lotRegex } });
                    }
                    
                    query.$or = orConditions;
                }

                console.log(`🔍 Searching ${config.name} with query:`, JSON.stringify(query, null, 2));

                // Execute query with pagination
                const [data, totalCount] = await Promise.all([
                    collection.find(query)
                             .sort({ Date: -1, Time_start: -1 })
                             .skip(skip)
                             .limit(itemsPerPage)
                             .toArray(),
                    collection.countDocuments(query)
                ]);

                if (data && data.length > 0) {
                    results[config.processName] = data;
                    console.log(`✅ Found ${data.length}/${totalCount} records in ${config.name}`);
                } else {
                    console.log(`📭 No results found in ${config.name}`);
                }

            } catch (error) {
                console.error(`❌ Error searching ${config.name}:`, error.message);
                // Continue with other collections even if one fails
            }
        }

        // Calculate total results across all collections
        const totalResults = Object.values(results).reduce((sum, processData) => sum + processData.length, 0);

        console.log(`✅ Manufacturing lot search completed. Found ${totalResults} total results across ${Object.keys(results).length} processes.`);

        res.json({
            success: true,
            results: results,
            searchTerm: manufacturingLot,
            searchScope: "All factories and dates",
            totalResults: totalResults,
            processesFound: Object.keys(results),
            pagination: {
                currentPage,
                itemsPerPage,
                totalResults
            }
        });

    } catch (error) {
        console.error("❌ Error in manufacturing lot search:", error);
        res.status(500).json({ 
            success: false,
            error: "Error searching manufacturing lot", 
            details: error.message 
        });
    }
});

console.log("📦 Manufacturing lot search route loaded successfully");

// ==================== LABEL COMPARATOR CUSTOMER MANAGEMENT ====================

/**
 * Get all active customers for label comparator
 * GET /api/labelComparator/customers
 */
app.get('/api/labelComparator/customers', async (req, res) => {
  try {
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const customersCollection = database.collection("labelComparatorCustomerDB");
    
    const customers = await customersCollection
      .find({ isActive: true })
      .sort({ displayName: 1 })
      .toArray();
    
    res.json({ success: true, customers });
    
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch customers" 
    });
  }
});

/**
 * Add new customer for label comparator
 * POST /api/labelComparator/customers
 */
app.post('/api/labelComparator/customers', async (req, res) => {
  try {
    const { displayName, address, createdBy } = req.body;
    
    if (!displayName || !createdBy) {
      return res.status(400).json({
        success: false,
        error: "Display name and created by are required"
      });
    }
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const customersCollection = database.collection("labelComparatorCustomerDB");
    
    // Auto-generate customer code from display name
    const customerCode = generateCustomerCode(displayName);
    
    // Check if customer code already exists
    const existingCustomer = await customersCollection.findOne({ customerCode });
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        error: `Customer code '${customerCode}' already exists`
      });
    }
    
    // Create new customer
    const newCustomer = {
      customerCode,
      displayName,
      address: address || "",
      createdAt: new Date().toISOString(),
      createdBy,
      isActive: true
    };
    
    const result = await customersCollection.insertOne(newCustomer);
    
    if (result.insertedId) {
      res.json({ 
        success: true, 
        customer: newCustomer,
        message: `Customer '${displayName}' added successfully`
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to create customer"
      });
    }
    
  } catch (error) {
    console.error("Error adding customer:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to add customer" 
    });
  }
});

/**
 * Update customer (status, display name, address)
 * PUT /api/labelComparator/customers/:code
 */
app.put('/api/labelComparator/customers/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { isActive, displayName, address, updatedBy } = req.body;
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const customersCollection = database.collection("labelComparatorCustomerDB");
    
    // Build update object dynamically based on what fields are provided
    const updateFields = {
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'system'
    };
    
    // Only add fields that are provided
    if (isActive !== undefined) {
      updateFields.isActive = isActive;
    }
    if (displayName !== undefined && displayName.trim() !== '') {
      updateFields.displayName = displayName.trim();
    }
    if (address !== undefined) {
      updateFields.address = address.trim();
    }
    
    const result = await customersCollection.updateOne(
      { customerCode: code },
      { $set: updateFields }
    );
    
    if (result.modifiedCount > 0) {
      res.json({ 
        success: true, 
        message: 'Customer updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: "Customer not found or no changes made"
      });
    }
    
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update customer" 
    });
  }
});

/**
 * Generate customer code from display name
 * Converts Japanese/English to alphanumeric code
 */
function generateCustomerCode(displayName) {
  // Remove common suffixes and clean the name
  let cleanName = displayName
    .replace(/株式会社|会社|製作所|工業|産業|紡織/g, '')
    .trim();
  
  // Convert to romaji/english approximation
  const conversionMap = {
    'ティーエヌ': 'tn',
    'トヨタ': 'toyota', 
    '衣浦': 'kinuura',
    'アイシン': 'aisin',
    'デンソー': 'denso',
    'マツダ': 'mazda',
    'スバル': 'subaru',
    'ホンダ': 'honda',
    'ニッサン': 'nissan',
    '日産': 'nissan',
    'スズキ': 'suzuki',
    'ダイハツ': 'daihatsu',
    'イスズ': 'isuzu',
    'ミツビシ': 'mitsubishi',
    '三菱': 'mitsubishi'
  };
  
  // Check for direct matches first
  for (const [japanese, romaji] of Object.entries(conversionMap)) {
    if (cleanName.includes(japanese)) {
      return romaji;
    }
  }
  
  // If no direct match, create code from first few characters
  // Remove spaces and special characters, convert to lowercase
  let code = cleanName
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  
  // Take first 6 characters or less
  code = code.substring(0, 6);
  
  // If still empty or too short, generate from hash
  if (code.length < 2) {
    code = 'cust' + Math.random().toString(36).substr(2, 4);
  }
  
  return code;
}

console.log("🏢 Label Comparator Customer routes loaded successfully");

// ==================== MATERIAL LOT LOOKUP ====================

/**
 * Check if a 品番 has multiple 材料背番号 values
 * POST /api/check-material-sebanggo
 */
app.post('/api/check-material-sebanggo', async (req, res) => {
    try {
        const { 品番 } = req.body;
        
        console.log('🔍 Checking material sebanggo for:', { 品番 });
        
        if (!品番) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: 品番' 
            });
        }
        
        // Get 材料背番号 from masterDB
        const masterDb = client.db('Sasaki_Coating_MasterDB');
        const masterCollection = masterDb.collection('masterDB');
        
        const masterDoc = await masterCollection.findOne({ 品番 });
        
        if (!masterDoc || !masterDoc.材料背番号) {
            return res.json({ 
                success: false, 
                error: '品番 not found in masterDB or missing 材料背番号',
                multiple: false,
                材料背番号Array: []
            });
        }
        
        // Split 材料背番号 by comma and trim whitespace
        const 材料背番号Array = masterDoc.材料背番号
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        console.log(`✅ Found ${材料背番号Array.length} 材料背番号 values:`, 材料背番号Array);
        
        res.json({ 
            success: true, 
            multiple: 材料背番号Array.length > 1,
            材料背番号Array: 材料背番号Array,
            original: masterDoc.材料背番号
        });
        
    } catch (error) {
        console.error('❌ Error checking material sebanggo:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * Lookup materialRequestDB records by 材料ロット
 * This endpoint is used in the factory details sidebar to find material request info
 * Supports multiple 材料背番号 values by accepting an optional specific 材料背番号 parameter
 * POST /api/material-lot-lookup
 */
app.post('/api/material-lot-lookup', async (req, res) => {
    try {
        const { 品番, 材料ロット, 材料背番号: specified材料背番号 } = req.body;
        
        console.log('🔍 Material lot lookup request:', { 品番, 材料ロット, specified材料背番号 });
        
        if (!品番 || !材料ロット) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: 品番 and 材料ロット' 
            });
        }
        
        // Step 1: Get 材料背番号 from masterDB (or use specified one)
        let 材料背番号;
        
        if (specified材料背番号) {
            // Use the specific 材料背番号 provided by the user
            材料背番号 = specified材料背番号;
            console.log(`✅ Using specified 材料背番号: ${材料背番号}`);
        } else {
            // Get from masterDB
            const masterDb = client.db('Sasaki_Coating_MasterDB');
            const masterCollection = masterDb.collection('masterDB');
            
            const masterDoc = await masterCollection.findOne({ 品番 });
            
            if (!masterDoc || !masterDoc.材料背番号) {
                return res.json({ 
                    success: false, 
                    error: '品番 not found in masterDB or missing 材料背番号',
                    results: []
                });
            }
            
            材料背番号 = masterDoc.材料背番号;
            
            // Check if there are multiple values
            if (材料背番号.includes(',')) {
                // Multiple values found - should prompt user to select one
                const 材料背番号Array = 材料背番号.split(',').map(s => s.trim()).filter(s => s.length > 0);
                console.log(`⚠️ Multiple 材料背番号 values found: ${材料背番号Array.join(', ')}`);
                
                return res.json({
                    success: false,
                    error: '該当する材料リクエストが見つかりませんでした',
                    材料背番号: `Multiple values: ${材料背番号Array.join(', ')}`,
                    results: [],
                    multipleValues: true,
                    材料背番号Array: 材料背番号Array
                });
            }
            
            console.log(`✅ Found 材料背番号: ${材料背番号} for 品番: ${品番}`);
        }
        
        // Step 2: Query materialRequestDB
        const submittedDb = client.db('submittedDB');
        const materialCollection = submittedDb.collection('materialRequestDB');
        
        // Extract date from 材料ロット (handle multiple formats)
        // Formats: yymmdd-##, yyyymmdd-##, yyyy-mm-dd, yyyy-mm-dd-##
        const extractDate = (lotNumber) => {
            // Remove all non-digit characters to get just numbers
            const numbersOnly = lotNumber.replace(/[^\d]/g, '');
            
            // Try different patterns
            if (numbersOnly.length >= 6) {
                // Could be yymmdd or yyyymmdd
                if (numbersOnly.length >= 8) {
                    // Likely yyyymmdd format
                    const year = numbersOnly.substring(0, 4);
                    const month = numbersOnly.substring(4, 6);
                    const day = numbersOnly.substring(6, 8);
                    return `${year.substring(2)}${month}${day}`; // Return as yymmdd
                } else {
                    // Likely yymmdd format
                    return numbersOnly.substring(0, 6);
                }
            }
            return null;
        };
        
        const dateFromLot = extractDate(材料ロット);
        console.log(`📅 Extracted date from lot: ${dateFromLot}`);
        
        // Build query with multiple conditions
        const query = {
            材料背番号: 材料背番号,
            $or: []
        };
        
        // Condition 1: Search in lotNumbers array
        query.$or.push({
            'PrintLog.lotNumbers': { 
                $elemMatch: { 
                    $regex: new RegExp(材料ロット.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') 
                } 
            }
        });
        
        // Condition 2: Fallback to 作業日 if we could extract a date
        if (dateFromLot) {
            query.$or.push({
                作業日: { $regex: new RegExp(dateFromLot, 'i') }
            });
        }
        
        console.log('🔍 Querying materialRequestDB with:', JSON.stringify(query, null, 2));
        
        const results = await materialCollection.find(query)
            .sort({ LastPrintTimestamp: -1 })
            .limit(10) // Limit to 10 results to avoid too much data
            .toArray();
        
        console.log(`✅ Found ${results.length} matching records`);
        
        res.json({ 
            success: true, 
            results: results,
            材料背番号: 材料背番号,
            searchedLot: 材料ロット
        });
        
    } catch (error) {
        console.error('❌ Error in material lot lookup:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});


//PAGINATION
/**
 * Pagination API Routes for MongoDB Collections
 * Supports efficient pagination with sorting, filtering, and aggregation
 * 
 * Add these routes to your server.js file
 */

// Add this to your server.js after the existing /queries route

/**
 * Generic pagination route for any MongoDB collection
 * POST /api/paginate
 */
app.post('/api/paginate', async (req, res) => {
  console.log("🟢 Received POST request to /api/paginate");
  
  const { 
    dbName, 
    collectionName, 
    query = {}, 
    sort = {}, 
    page = 1, 
    limit = 15,        // Frontend can override this default
    maxLimit = 100,    // Frontend can set custom max limit
    aggregation = null,
    projection = null
  } = req.body;

  try {
    // Validate required parameters
    if (!dbName || !collectionName) {
      return res.status(400).json({ 
        error: "dbName and collectionName are required",
        success: false 
      });
    }

    // Convert page and limit to numbers with dynamic max limit
    const currentPage = parseInt(page, 10);
    const maxAllowedLimit = parseInt(maxLimit, 10) || 100; // Default max 100, but configurable
    const itemsPerPage = Math.min(parseInt(limit, 10), maxAllowedLimit);
    const skip = (currentPage - 1) * itemsPerPage;

    console.log(`📄 Pagination request: Page ${currentPage}, Limit ${itemsPerPage}/${maxAllowedLimit} for ${dbName}.${collectionName}`);

    // Convert string _id to ObjectId if present in query
    if (query._id && typeof query._id === "string") {
      try {
        query._id = new ObjectId(query._id);
      } catch (err) {
        return res.status(400).json({ 
          error: "Invalid _id format provided in query.",
          success: false
        });
      }
    }

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    let results = [];
    let totalCount = 0;

    if (aggregation && Array.isArray(aggregation)) {
      // Use aggregation pipeline for complex queries
      console.log("🔵 Running Aggregation Pipeline with pagination");
      
      // Create two pipelines: one for data, one for count
      const dataPipeline = [
        ...aggregation,
        { $sort: Object.keys(sort).length > 0 ? sort : { _id: -1 } },
        { $skip: skip },
        { $limit: itemsPerPage }
      ];

      const countPipeline = [
        ...aggregation,
        { $count: "total" }
      ];

      const [dataResult, countResult] = await Promise.all([
        collection.aggregate(dataPipeline).toArray(),
        collection.aggregate(countPipeline).toArray()
      ]);

      results = dataResult;
      totalCount = countResult.length > 0 ? countResult[0].total : 0;

    } else {
      // Use regular find with pagination
      console.log("🔵 Running Find Query with pagination");
      
      // Build the find query
      let findQuery = collection.find(query);
      
      // Apply projection if specified
      if (projection) {
        findQuery = findQuery.project(projection);
      }

      // Apply sort (default to newest first)
      const sortOptions = Object.keys(sort).length > 0 ? sort : { _id: -1 };
      findQuery = findQuery.sort(sortOptions);

      // Get both data and count in parallel for efficiency
      const [dataResult, countResult] = await Promise.all([
        findQuery.skip(skip).limit(itemsPerPage).toArray(),
        collection.countDocuments(query)
      ]);

      results = dataResult;
      totalCount = countResult;
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    console.log(`✅ Pagination Results: Page ${currentPage}/${totalPages}, ${results.length}/${totalCount} items`);

    res.json({
      data: results,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: totalCount,
        itemsPerPage,
        hasNext,
        hasPrevious,
        startIndex: skip + 1,
        endIndex: Math.min(skip + itemsPerPage, totalCount)
      },
      success: true
    });

  } catch (error) {
    console.error("❌ Error in pagination route:", error);
    res.status(500).json({ 
      error: "Error executing paginated query", 
      details: error.message,
      success: false
    });
  }
});

/**
 * Specialized sensor history pagination
 * POST /api/sensor-history
 */
app.post('/api/sensor-history', async (req, res) => {
  console.log("🟢 Received POST request to /api/sensor-history");
  
  const { 
    deviceId, 
    page = 1, 
    limit = 15,        // Frontend controlled page size
    maxLimit = 50,     // Frontend can set max limit for sensors
    startDate = null,
    endDate = null,
    factoryName = null,
    dbName = "submittedDB",           // Allow custom database
    collectionName = "tempHumidityDB" // Allow custom collection
  } = req.body;

  try {
    if (!deviceId) {
      return res.status(400).json({ 
        error: "deviceId is required",
        success: false
      });
    }

    // Build date range query (default to last 30 days)
    const queryEndDate = endDate ? new Date(endDate) : new Date();
    const queryStartDate = startDate ? new Date(startDate) : new Date();
    if (!startDate) {
      queryStartDate.setDate(queryStartDate.getDate() - 30);
    }

    const query = {
      device: deviceId,
      Date: {
        $gte: queryStartDate.toISOString().split("T")[0],
        $lte: queryEndDate.toISOString().split("T")[0]
      }
    };

    // Add factory filter if specified
    if (factoryName) {
      query.工場 = factoryName;
    }

    // Sort by date and time (newest first)
    const sort = { Date: -1, Time: -1 };

    const currentPage = parseInt(page, 10);
    const maxAllowedLimit = parseInt(maxLimit, 10) || 50; // Configurable max for sensors
    const itemsPerPage = Math.min(parseInt(limit, 10), maxAllowedLimit);
    const skip = (currentPage - 1) * itemsPerPage;

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    console.log(`🌡️ Sensor pagination: Device ${deviceId}, Page ${currentPage}, Limit ${itemsPerPage}/${maxAllowedLimit}`);

    // Get both data and count in parallel
    const [dataResult, countResult] = await Promise.all([
      collection.find(query).sort(sort).skip(skip).limit(itemsPerPage).toArray(),
      collection.countDocuments(query)
    ]);

    // Transform sensor data for frontend
    const transformedData = dataResult.map(record => ({
      id: record._id,
      date: record.Date,
      time: record.Time,
      temperature: parseFloat((record.Temperature || '0').toString().replace('°C', '').trim()),
      humidity: parseFloat((record.Humidity || '0').toString().replace('%', '').trim()),
      status: record.sensorStatus || 'OK',
      factory: record.工場,
      device: record.device,
      timestamp: new Date(`${record.Date} ${record.Time}`)
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(countResult / itemsPerPage);

    console.log(`✅ Sensor History: Device ${deviceId}, Page ${currentPage}/${totalPages}, ${transformedData.length}/${countResult} records`);

    res.json({
      data: transformedData,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: countResult,
        itemsPerPage,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1,
        startIndex: skip + 1,
        endIndex: Math.min(skip + itemsPerPage, countResult)
      },
      query: {
        deviceId,
        startDate: queryStartDate.toISOString().split("T")[0],
        endDate: queryEndDate.toISOString().split("T")[0],
        factoryName
      },
      success: true
    });

  } catch (error) {
    console.error("❌ Error in sensor history pagination:", error);
    res.status(500).json({ 
      error: "Error fetching sensor history", 
      details: error.message,
      success: false
    });
  }
});

/**
 * Specialized approval data pagination
 * POST /api/approval-paginate
 * 
 * IMPORTANT: Uses MongoDB ObjectId timestamp as the source of truth for date filtering
 * instead of the user-entered "Date" field. This prevents issues where workers input
 * the wrong date (e.g., entering 2/4 when it's actually 2/5).
 * 
 * ObjectId contains a 4-byte timestamp (Unix epoch) representing when the document was created.
 * This is reliable and cannot be manipulated by users.
 * 
 * TIMEZONE SUPPORT: Accepts timezoneOffset from frontend (in minutes) to filter by user's
 * local timezone. Supports global users (Japan JST, USA EST/PST, etc.)
 * - JST (UTC+9): timezoneOffset = -540
 * - EST (UTC-5): timezoneOffset = -300
 * - PST (UTC-8): timezoneOffset = -480
 * 
 * SMART SORTING (Priority-based FIFO):
 * 1. 🔴 Date mismatches (CRITICAL) - Always appear first
 * 2. ⚠️ Time mismatches (WARNING) - Appear second
 * 3. ✅ Correct data - Sorted OLDEST FIRST (FIFO queue for approvals)
 */
app.post('/api/approval-paginate', async (req, res) => {
  console.log("🟢 Received POST request to /api/approval-paginate");
  
  const { 
    collectionName,
    page = 1, 
    limit = 15,        // Frontend controlled page size
    maxLimit = 100,    // Frontend can set custom max limit
    filters = {},
    userRole = 'member',
    factoryAccess = [],
    dbName = "submittedDB" // Allow custom database
  } = req.body;

  try {
    if (!collectionName) {
      return res.status(400).json({ 
        error: "collectionName is required",
        success: false
      });
    }

    const currentPage = parseInt(page, 10);
    const maxAllowedLimit = parseInt(maxLimit, 10) || 100; // Configurable max limit
    const itemsPerPage = Math.min(parseInt(limit, 10), maxAllowedLimit);
    const skip = (currentPage - 1) * itemsPerPage;

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    console.log(`✅ Approval pagination: ${collectionName}, Page ${currentPage}, Limit ${itemsPerPage}/${maxAllowedLimit}`);

    // Build query based on filters and user access
    let matchStage = {};

    // Apply factory access restrictions based on user role
    if (userRole !== 'admin' && userRole !== '部長' && factoryAccess.length > 0) {
      matchStage.工場 = { $in: factoryAccess };
    }

    // Add non-date filters
    Object.keys(filters).forEach(key => {
      if (key !== 'Date' && key !== 'timezoneOffset') {
        matchStage[key] = filters[key];
      }
    });

    // Handle Date filter using ObjectId timestamp instead of user-entered Date
    // Use user's browser timezone for accurate filtering (supports global users)
    let dateMatchStage = {};
    if (filters.Date) {
      const targetDate = filters.Date; // Format: "YYYY-MM-DD"
      const timezoneOffset = filters.timezoneOffset || -540; // Default to JST (-540 min = UTC+9)
      
      // Convert timezone offset to hours (e.g., -480 min = -8 hours = PST)
      const offsetHours = -timezoneOffset / 60;
      const offsetSign = offsetHours >= 0 ? '+' : '';
      const offsetString = `${offsetSign}${String(Math.floor(Math.abs(offsetHours))).padStart(2, '0')}:${String(Math.abs(offsetHours) % 1 * 60).padStart(2, '0')}`;
      
      // Create date range in user's timezone
      const startOfDayLocal = new Date(targetDate + 'T00:00:00' + offsetString);
      const endOfDayLocal = new Date(targetDate + 'T23:59:59.999' + offsetString);
      
      // Create ObjectIds at start and end of the day for timestamp-based filtering
      const startObjectId = ObjectId.createFromTime(Math.floor(startOfDayLocal.getTime() / 1000));
      const endObjectId = ObjectId.createFromTime(Math.floor(endOfDayLocal.getTime() / 1000));
      
      dateMatchStage._id = { $gte: startObjectId, $lte: endObjectId };
      console.log(`📅 Date filter: ${targetDate} (Offset: ${offsetString}) → ObjectId range [${startObjectId}, ${endObjectId}]`);
      console.log(`   Start: ${startOfDayLocal.toISOString()} | End: ${endOfDayLocal.toISOString()}`);
    }

    // Combine match stages
    const finalMatchStage = { ...matchStage, ...dateMatchStage };

    // Use aggregation pipeline with smart sorting:
    // 1. Prioritize date mismatches (critical errors)
    // 2. Then time mismatches (warnings)
    // 3. Then FIFO - oldest submissions first
    const aggregationPipeline = [
      { $match: finalMatchStage },
      {
        $addFields: {
          // Extract date from ObjectId for comparison
          _objectIdDate: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $toDate: "$_id" }
            }
          },
          // Flag if user-entered Date doesn't match ObjectId date
          _hasDateMismatch: {
            $cond: {
              if: { $ne: ["$Date", { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } }] },
              then: 1,
              else: 0
            }
          },
          // Extract end time in minutes for time mismatch detection
          _objectIdTime: {
            $dateToString: {
              format: "%H:%M",
              date: { $toDate: "$_id" }
            }
          },
          // Flag if Time_end is off by more than 30 minutes
          _hasTimeMismatch: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$Time_end", null] },
                  { $ne: ["$Time_end", ""] }
                ]
              },
              then: {
                $cond: {
                  if: {
                    $gt: [
                      {
                        $abs: {
                          $subtract: [
                            // Convert Time_end to minutes
                            {
                              $add: [
                                { $multiply: [{ $toInt: { $substr: ["$Time_end", 0, 2] } }, 60] },
                                { $toInt: { $substr: ["$Time_end", 3, 2] } }
                              ]
                            },
                            // Convert ObjectId time to minutes
                            {
                              $add: [
                                { $multiply: [{ $hour: { $toDate: "$_id" } }, 60] },
                                { $minute: { $toDate: "$_id" } }
                              ]
                            }
                          ]
                        }
                      },
                      30 // 30 minutes threshold
                    ]
                  },
                  then: 1,
                  else: 0
                }
              },
              else: 0
            }
          }
        }
      },
      {
        // Sort with priority: Date errors → Time warnings → FIFO (oldest first)
        $sort: {
          _hasDateMismatch: -1,  // Date errors first (1 = error, 0 = no error)
          _hasTimeMismatch: -1,  // Time warnings second
          _id: 1                 // Then OLDEST first (ascending = FIFO)
        }
      },
      { $skip: skip },
      { $limit: itemsPerPage }
    ];

    const [dataResult, countResult] = await Promise.all([
      collection.aggregate(aggregationPipeline).toArray(),
      collection.countDocuments(finalMatchStage)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(countResult / itemsPerPage);

    // Count errors in current page for logging
    const dateErrors = dataResult.filter(doc => doc._hasDateMismatch === 1).length;
    const timeWarnings = dataResult.filter(doc => doc._hasTimeMismatch === 1).length;

    console.log(`✅ Approval Pagination: ${collectionName}, Page ${currentPage}/${totalPages}, ${dataResult.length}/${countResult} records`);
    console.log(`   🔴 Date errors: ${dateErrors}, ⚠️ Time warnings: ${timeWarnings}, ✅ Sorted by FIFO (oldest first)`);

    res.json({
      data: dataResult,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: countResult,
        itemsPerPage,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1,
        startIndex: skip + 1,
        endIndex: Math.min(skip + itemsPerPage, countResult)
      },
      filters: finalMatchStage,
      success: true
    });

  } catch (error) {
    console.error("❌ Error in approval pagination:", error);
    res.status(500).json({ 
      error: "Error fetching approval data", 
      details: error.message,
      success: false
    });
  }
});

/**
 * Master DB pagination with search
 * POST /api/master-paginate
 */
app.post('/api/master-paginate', async (req, res) => {
  console.log("🟢 Received POST request to /api/master-paginate");
  
  const { 
    page = 1, 
    limit = 15,        // Frontend controlled page size
    maxLimit = 100,    // Frontend can set custom max limit
    search = '',
    factory = '',
    category = '',
    dbName = "submittedDB",    // Allow custom database
    collectionName = "masterDB" // Allow custom collection
  } = req.body;

  try {
    const currentPage = parseInt(page, 10);
    const maxAllowedLimit = parseInt(maxLimit, 10) || 100; // Configurable max limit
    const itemsPerPage = Math.min(parseInt(limit, 10), maxAllowedLimit);
    const skip = (currentPage - 1) * itemsPerPage;

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    console.log(`🗂️ Master DB pagination: ${collectionName}, Page ${currentPage}, Limit ${itemsPerPage}/${maxAllowedLimit}`);

    // Build search query
    let query = {};

    if (search) {
      query.$or = [
        { 品番: { $regex: search, $options: 'i' } },
        { 背番号: { $regex: search, $options: 'i' } },
        { 工場: { $regex: search, $options: 'i' } }
      ];
    }

    if (factory) {
      query.工場 = factory;
    }

    if (category) {
      query.カテゴリ = category;
    }

    // Sort by factory and 品番
    const sort = { 工場: 1, 品番: 1 };

    const [dataResult, countResult] = await Promise.all([
      collection.find(query).sort(sort).skip(skip).limit(itemsPerPage).toArray(),
      collection.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(countResult / itemsPerPage);

    console.log(`✅ Master DB Pagination: Page ${currentPage}/${totalPages}, ${dataResult.length}/${countResult} records`);

    res.json({
      data: dataResult,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: countResult,
        itemsPerPage,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1,
        startIndex: skip + 1,
        endIndex: Math.min(skip + itemsPerPage, countResult)
      },
      query: {
        search,
        factory,
        category
      },
      success: true
    });

  } catch (error) {
    console.error("❌ Error in master DB pagination:", error);
    res.status(500).json({ 
      error: "Error fetching master DB data", 
      details: error.message,
      success: false
    });
  }
});

console.log("📄 Pagination routes loaded successfully");




/**
 * Get approval statistics using MongoDB aggregation
 * POST /api/approval-stats
 * 
 * IMPORTANT: Uses MongoDB ObjectId timestamp for date filtering instead of user-entered "Date" field.
 * This ensures accurate statistics based on actual document creation time, not user input.
 * 
 * TIMEZONE SUPPORT: Accepts timezoneOffset from frontend for accurate statistics in user's timezone.
 */
app.post('/api/approval-stats', async (req, res) => {
  console.log("🟢 Received POST request to /api/approval-stats");
  
  const { 
    collectionName,
    userRole = 'member',
    factoryAccess = [],
    filters = {},
    dbName = "submittedDB"
  } = req.body;

  try {
    if (!collectionName) {
      return res.status(400).json({ 
        error: "collectionName is required",
        success: false
      });
    }

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    console.log(`📊 Computing approval stats for: ${collectionName}, Role: ${userRole}`);

    // Build base query based on user access and filters
    let baseQuery = {};

    // Apply factory access restrictions based on user role
    if (userRole !== 'admin' && userRole !== '部長' && factoryAccess.length > 0) {
      baseQuery.工場 = { $in: factoryAccess };
    }

    // Add non-date filters
    Object.keys(filters).forEach(key => {
      if (key !== 'Date' && key !== 'timezoneOffset') {
        baseQuery[key] = filters[key];
      }
    });

    // Handle Date filter using ObjectId timestamp (User's timezone)
    if (filters.Date) {
      const targetDate = filters.Date; // Format: "YYYY-MM-DD"
      const timezoneOffset = filters.timezoneOffset || -540; // Default to JST
      
      const offsetHours = -timezoneOffset / 60;
      const offsetSign = offsetHours >= 0 ? '+' : '';
      const offsetString = `${offsetSign}${String(Math.floor(Math.abs(offsetHours))).padStart(2, '0')}:${String(Math.abs(offsetHours) % 1 * 60).padStart(2, '0')}`;
      
      const startOfDayLocal = new Date(targetDate + 'T00:00:00' + offsetString);
      const endOfDayLocal = new Date(targetDate + 'T23:59:59.999' + offsetString);
      
      const startObjectId = ObjectId.createFromTime(Math.floor(startOfDayLocal.getTime() / 1000));
      const endObjectId = ObjectId.createFromTime(Math.floor(endOfDayLocal.getTime() / 1000));
      
      baseQuery._id = { $gte: startObjectId, $lte: endObjectId };
      console.log(`📅 Stats date filter: ${targetDate} (Offset: ${offsetString}) → ObjectId range`);
    }

    // Get today's date for today's total calculation using ObjectId (User's timezone)
    const today = new Date().toISOString().split('T')[0];
    const todayTimezoneOffset = filters.timezoneOffset || -540;
    const todayOffsetHours = -todayTimezoneOffset / 60;
    const todayOffsetSign = todayOffsetHours >= 0 ? '+' : '';
    const todayOffsetString = `${todayOffsetSign}${String(Math.floor(Math.abs(todayOffsetHours))).padStart(2, '0')}:${String(Math.abs(todayOffsetHours) % 1 * 60).padStart(2, '0')}`;
    
    const todayStartLocal = new Date(today + 'T00:00:00' + todayOffsetString);
    const todayEndLocal = new Date(today + 'T23:59:59.999' + todayOffsetString);
    const todayStartObjectId = ObjectId.createFromTime(Math.floor(todayStartLocal.getTime() / 1000));
    const todayEndObjectId = ObjectId.createFromTime(Math.floor(todayEndLocal.getTime() / 1000));

    // Create aggregation pipeline for statistics
    const statsAggregation = [
      { $match: baseQuery },
      {
        $facet: {
          // Overall status statistics
          statusStats: [
            {
              $group: {
                _id: {
                  $switch: {
                    branches: [
                      { 
                        case: { $or: [{ $not: ["$approvalStatus"] }, { $eq: ["$approvalStatus", "pending"] }] },
                        then: "pending"
                      },
                      { 
                        case: { $eq: ["$approvalStatus", "hancho_approved"] },
                        then: "hancho_approved"
                      },
                      { 
                        case: { $eq: ["$approvalStatus", "fully_approved"] },
                        then: "fully_approved"
                      },
                      { 
                        case: { 
                          $or: [
                            { $eq: ["$approvalStatus", "correction_needed"] },
                            { $eq: ["$approvalStatus", "correction_needed_from_kacho"] }
                          ]
                        },
                        then: "correction_needed"
                      },
                      { 
                        case: { $eq: ["$approvalStatus", "correction_needed_from_kacho"] },
                        then: "correction_needed_from_kacho"
                      }
                    ],
                    default: "unknown"
                  }
                },
                count: { $sum: 1 }
              }
            }
          ],
          // Today's submissions (based on ObjectId timestamp)
          todayStats: [
            {
              $match: { 
                _id: { 
                  $gte: todayStartObjectId, 
                  $lte: todayEndObjectId 
                } 
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 }
              }
            }
          ],
          // Total count
          totalCount: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    const statsResult = await collection.aggregate(statsAggregation).toArray();
    const stats = statsResult[0];

    // Process status statistics
    const statusCounts = {
      pending: 0,
      hancho_approved: 0,
      fully_approved: 0,
      correction_needed: 0,
      correction_needed_from_kacho: 0
    };

    if (stats.statusStats && stats.statusStats.length > 0) {
      stats.statusStats.forEach(stat => {
        if (statusCounts.hasOwnProperty(stat._id)) {
          statusCounts[stat._id] = stat.count;
        }
      });
    }

    // Get today's total
    const todayTotal = stats.todayStats && stats.todayStats.length > 0 ? stats.todayStats[0].count : 0;
    
    // Get overall total
    const overallTotal = stats.totalCount && stats.totalCount.length > 0 ? stats.totalCount[0].count : 0;

    console.log(`✅ Approval Statistics computed: Total: ${overallTotal}, Today: ${todayTotal}`);
    console.log(`📊 Status breakdown:`, statusCounts);

    res.json({
      statistics: {
        pending: statusCounts.pending,
        hanchoApproved: statusCounts.hancho_approved,
        fullyApproved: statusCounts.fully_approved,
        correctionNeeded: statusCounts.correction_needed,
        correctionNeededFromKacho: statusCounts.correction_needed_from_kacho,
        todayTotal: todayTotal,
        overallTotal: overallTotal
      },
      query: baseQuery,
      success: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error in approval statistics route:", error);
    res.status(500).json({ 
      error: "Error calculating approval statistics", 
      details: error.message,
      success: false
    });
  }
});

/**
 * Get factory list for current user and collection
 * POST /api/approval-factories
 */
app.post('/api/approval-factories', async (req, res) => {
  console.log("🟢 Received POST request to /api/approval-factories");
  
  const { 
    collectionName,
    userRole = 'member',
    factoryAccess = [],
    dbName = "submittedDB"
  } = req.body;

  try {
    if (!collectionName) {
      return res.status(400).json({ 
        error: "collectionName is required",
        success: false
      });
    }

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    console.log(`🏭 Getting factory list for: ${collectionName}, Role: ${userRole}`);

    // Build base query based on user access
    let baseQuery = {};

    // Apply factory access restrictions based on user role
    if (userRole !== 'admin' && userRole !== '部長' && factoryAccess.length > 0) {
      baseQuery.工場 = { $in: factoryAccess };
    }

    // Get distinct factories using aggregation (API Version 1 compatible)
    const factoryAggregation = [
      { $match: baseQuery },
      {
        $group: {
          _id: "$工場"
        }
      },
      {
        $match: {
          _id: { $ne: null, $ne: "" }
        }
      },
      { $sort: { _id: 1 } }
    ];
    
    const factoryResults = await collection.aggregate(factoryAggregation).toArray();
    const factories = factoryResults.map(result => result._id);
    const filteredFactories = factories.filter(factory => factory && factory.trim() !== '');

    console.log(`✅ Found ${filteredFactories.length} factories:`, filteredFactories);

    res.json({
      factories: filteredFactories.sort(),
      success: true
    });

  } catch (error) {
    console.error("❌ Error in approval factories route:", error);
    res.status(500).json({ 
      error: "Error fetching factory list", 
      details: error.message,
      success: false
    });
  }
});

console.log("📊 Approval statistics routes loaded successfully");


//PAGINATION END


//ANALYTICS START

/**
 * Get comprehensive analytics data from kensaDB
 * POST /api/analytics-data
 */
app.post('/api/analytics-data', async (req, res) => {
  console.log("📊 Received POST request to /api/analytics-data");
  
  const { 
    fromDate,
    toDate,
    userRole = 'member',
    factoryAccess = [],
    factoryFilter, // CRITICAL: Factory filter parameter
    collectionName = 'kensaDB',
    dbName = "submittedDB"
  } = req.body;

  try {
    if (!fromDate || !toDate) {
      return res.status(400).json({ 
        error: "fromDate and toDate are required",
        success: false
      });
    }

    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    const tempHumidityCollection = database.collection('tempHumidityDB'); // Climate data collection

    console.log(`📊 Computing analytics data for: ${collectionName} from ${fromDate} to ${toDate}, Role: ${userRole}`, req.body.factoryFilter ? `Factory: ${req.body.factoryFilter}` : 'All factories');

    // Build base query based on user access and date range
    let baseQuery = {
      Date: {
        $gte: fromDate,
        $lte: toDate
      }
    };

    // CRITICAL FIX: Apply factory filter if specified
    if (req.body.factoryFilter) {
      baseQuery['工場'] = req.body.factoryFilter;
      console.log(`🏭 Applied factory filter: ${req.body.factoryFilter}`);
    } else if (userRole !== 'admin' && userRole !== '部長' && factoryAccess && factoryAccess.length > 0) {
      // Apply user role restrictions if no specific factory filter is provided
      baseQuery['工場'] = { $in: factoryAccess };
      console.log(`🔐 Applied role-based factory restriction: ${factoryAccess.join(', ')}`);
    }

    // Build climate data query (for temperature/humidity)
    let climateQuery = {
      Date: {
        $gte: fromDate,
        $lte: toDate
      }
    };

    // Apply same factory filtering to climate data
    if (req.body.factoryFilter) {
      climateQuery['工場'] = req.body.factoryFilter;
    } else if (userRole !== 'admin' && userRole !== '部長' && factoryAccess && factoryAccess.length > 0) {
      climateQuery['工場'] = { $in: factoryAccess };
    }

    // Collection-specific field mappings
    const getCollectionFields = (collectionName) => {
      switch (collectionName) {
        case 'kensaDB':
          return {
            defectFields: ['Total_NG'], // Use the actual Total_NG field
            counterFields: ['Counters.counter-1', 'Counters.counter-2', 'Counters.counter-3', 'Counters.counter-4', 
                           'Counters.counter-5', 'Counters.counter-6', 'Counters.counter-7', 'Counters.counter-8',
                           'Counters.counter-9', 'Counters.counter-10', 'Counters.counter-11', 'Counters.counter-12'],
            workerField: 'Worker_Name', // Actual field name
            equipmentField: '設備',
            cycleTimeField: 'Cycle_Time', // Actual field name
            productionField: 'Process_Quantity' // ✅ ADDED: Production quantity field
          };
        case 'pressDB':
          return {
            defectFields: ['Total_NG'], // Use actual Total_NG field
            individualDefectFields: ['疵引不良', '加工不良', 'その他'], // Individual defect breakdown
            counterFields: [],
            workerField: 'Worker_Name', // Actual field name
            equipmentField: '設備', // Actual field name
            cycleTimeField: 'Cycle_Time', // Actual field name
            productionField: 'Process_Quantity' // ✅ ADDED: Production quantity field
          };
        case 'slitDB':
          return {
            defectFields: ['Total_NG'], // Use actual Total_NG field
            individualDefectFields: ['疵引不良', '加工不良', 'その他'], // Individual defect breakdown
            counterFields: [],
            workerField: 'Worker_Name', // Actual field name
            equipmentField: '設備', // Actual field name
            cycleTimeField: 'Cycle_Time', // Actual field name
            productionField: 'Process_Quantity' // ✅ ADDED: Production quantity field
          };
        case 'SRSDB':
          return {
            defectFields: ['SRS_Total_NG'], // Use actual SRS_Total_NG field
            individualDefectFields: ['くっつき・めくれ', 'シワ', '転写位置ズレ', '転写不良', '文字欠け', 'その他'], // Individual defect breakdown
            counterFields: [],
            workerField: 'Worker_Name', // Actual field name
            equipmentField: '設備', // Actual field name
            cycleTimeField: 'Cycle_Time', // Actual field name
            productionField: 'Process_Quantity' // ✅ ADDED: Production quantity field
          };
        default:
          return {
            defectFields: ['Total_NG'],
            counterFields: ['Counters.counter-1', 'Counters.counter-2', 'Counters.counter-3', 'Counters.counter-4', 
                           'Counters.counter-5', 'Counters.counter-6', 'Counters.counter-7', 'Counters.counter-8',
                           'Counters.counter-9', 'Counters.counter-10', 'Counters.counter-11', 'Counters.counter-12'],
            workerField: 'Worker_Name',
            equipmentField: '設備',
            cycleTimeField: 'Cycle_Time',
            productionField: 'Process_Quantity' // ✅ ADDED: Production quantity field
          };
      }
    };

    const fields = getCollectionFields(collectionName);

    // Calculate total defects expression - use collection-specific defect fields
    const totalDefectsExpression = (() => {
      switch (collectionName) {
        case 'kensaDB':
          return { $ifNull: ["$Total_NG", 0] }; // For kensaDB, use Total_NG field
        case 'pressDB':
        case 'slitDB':
          return { $ifNull: ["$Total_NG", 0] }; // For pressDB and slitDB, use Total_NG field
        case 'SRSDB':
          return { $ifNull: ["$SRS_Total_NG", 0] }; // For SRSDB, use SRS_Total_NG field
        default:
          return { $add: fields.defectFields.map(field => ({ $ifNull: [`$${field}`, 0] })) };
      }
    })();

    // Enhanced aggregation pipeline with proper field mapping
    const analyticsAggregation = [
      { $match: baseQuery },
      {
        $facet: {
          // Debug: Sample a few records to see the actual structure
          sampleRecords: [
            { $limit: 2 }
          ],
          
          // Summary statistics - ✅ FIXED: Use Process_Quantity instead of counting records
          summary: [
            {
              $group: {
                _id: null,
                totalProduction: { $sum: "$Process_Quantity" }, // ✅ FIXED: Sum Process_Quantity
                totalDefects: { $sum: totalDefectsExpression },
                avgCycleTime: { $avg: "$Cycle_Time" },
                factories: { $addToSet: "$工場" },
                workers: { $addToSet: "$Worker_Name" }
              }
            },
            {
              $project: {
                _id: 0,
                totalProduction: 1,
                totalDefects: 1,
                avgDefectRate: { 
                  $cond: {
                    if: { $gt: ["$totalProduction", 0] },
                    then: { $multiply: [{ $divide: ["$totalDefects", "$totalProduction"] }, 100] },
                    else: 0
                  }
                },
                avgCycleTime: { $round: ["$avgCycleTime", 2] },
                totalFactories: { $size: "$factories" },
                totalWorkers: { $size: "$workers" }
              }
            }
          ],
          
          // Daily trend analysis - ✅ FIXED: Use Process_Quantity instead of counting records
          dailyTrend: [
            {
              $group: {
                _id: "$Date",
                totalProduction: { $sum: "$Process_Quantity" }, // ✅ FIXED: Sum Process_Quantity
                totalDefects: { $sum: totalDefectsExpression },
                avgCycleTime: { $avg: "$Cycle_Time" }
              }
            },
            {
              $project: {
                _id: 0,
                date: "$_id",
                totalProduction: 1,
                totalDefects: 1,
                defectRate: { 
                  $cond: {
                    if: { $gt: ["$totalProduction", 0] },
                    then: { $multiply: [{ $divide: ["$totalDefects", "$totalProduction"] }, 100] },
                    else: 0
                  }
                },
                avgCycleTime: { $round: ["$avgCycleTime", 2] }
              }
            },
            { $sort: { date: 1 } }
          ],
          
          // Factory comparison - ✅ FIXED: Use Process_Quantity instead of counting records
          factoryStats: [
            {
              $group: {
                _id: "$工場",
                totalProduction: { $sum: "$Process_Quantity" }, // ✅ FIXED: Sum Process_Quantity
                totalDefects: { $sum: totalDefectsExpression },
                avgCycleTime: { $avg: "$Cycle_Time" }
              }
            },
            {
              $project: {
                _id: 0,
                factory: "$_id",
                totalProduction: 1,
                totalDefects: 1,
                defectRate: { 
                  $cond: {
                    if: { $gt: ["$totalProduction", 0] },
                    then: { $multiply: [{ $divide: ["$totalDefects", "$totalProduction"] }, 100] },
                    else: 0
                  }
                },
                avgCycleTime: { $round: ["$avgCycleTime", 2] }
              }
            },
            { $sort: { totalProduction: -1 } }
          ],
          
          // Worker performance (top 10) - ✅ FIXED: Use Process_Quantity instead of counting records
          workerStats: [
            {
              $group: {
                _id: "$Worker_Name",
                totalProduction: { $sum: "$Process_Quantity" }, // ✅ FIXED: Sum Process_Quantity
                totalDefects: { $sum: totalDefectsExpression },
                avgCycleTime: { $avg: "$Cycle_Time" }
              }
            },
            {
              $project: {
                _id: 0,
                worker: "$_id",
                totalProduction: 1,
                totalDefects: 1,
                defectRate: { 
                  $cond: {
                    if: { $gt: ["$totalProduction", 0] },
                    then: { $multiply: [{ $divide: ["$totalDefects", "$totalProduction"] }, 100] },
                    else: 0
                  }
                },
                avgCycleTime: { $round: ["$avgCycleTime", 2] }
              }
            },
            { $sort: { totalProduction: -1 } },
            { $limit: 10 }
          ],
          
          // Equipment efficiency - ✅ FIXED: Use Process_Quantity instead of counting records
          equipmentStats: [
            {
              $group: {
                _id: "$設備",
                totalProduction: { $sum: "$Process_Quantity" }, // ✅ FIXED: Sum Process_Quantity
                avgCycleTime: { $avg: "$Cycle_Time" }
              }
            },
            {
              $project: {
                _id: 0,
                equipment: "$_id",
                totalProduction: 1,
                avgCycleTime: { $round: ["$avgCycleTime", 2] }
              }
            },
            { $sort: { avgCycleTime: 1 } },
            { $limit: 10 }
          ],
          
          // Defect analysis (collection-specific breakdown) - standardized for frontend
          defectAnalysis: (() => {
            switch (collectionName) {
              case 'kensaDB':
                return [
                  {
                    $group: {
                      _id: null,
                      counter1Total: { $sum: { $ifNull: ["$Counters.counter-1", 0] } },
                      counter2Total: { $sum: { $ifNull: ["$Counters.counter-2", 0] } },
                      counter3Total: { $sum: { $ifNull: ["$Counters.counter-3", 0] } },
                      counter4Total: { $sum: { $ifNull: ["$Counters.counter-4", 0] } },
                      counter5Total: { $sum: { $ifNull: ["$Counters.counter-5", 0] } },
                      counter6Total: { $sum: { $ifNull: ["$Counters.counter-6", 0] } },
                      counter7Total: { $sum: { $ifNull: ["$Counters.counter-7", 0] } },
                      counter8Total: { $sum: { $ifNull: ["$Counters.counter-8", 0] } },
                      counter9Total: { $sum: { $ifNull: ["$Counters.counter-9", 0] } },
                      counter10Total: { $sum: { $ifNull: ["$Counters.counter-10", 0] } },
                      counter11Total: { $sum: { $ifNull: ["$Counters.counter-11", 0] } },
                      counter12Total: { $sum: { $ifNull: ["$Counters.counter-12", 0] } }
                    }
                  },
                  {
                    $addFields: {
                      // Add metadata for frontend
                      defectLabels: ['カウンター1', 'カウンター2', 'カウンター3', 'カウンター4', 'カウンター5', 'カウンター6', 'カウンター7', 'カウンター8', 'カウンター9', 'カウンター10', 'カウンター11', 'カウンター12'],
                      defectFields: ['counter1Total', 'counter2Total', 'counter3Total', 'counter4Total', 'counter5Total', 'counter6Total', 'counter7Total', 'counter8Total', 'counter9Total', 'counter10Total', 'counter11Total', 'counter12Total']
                    }
                  }
                ];
              case 'pressDB':
              case 'slitDB':
                return [
                  {
                    $group: {
                      _id: null,
                      // Map to consistent field names for frontend compatibility
                      counter1Total: { $sum: { $ifNull: ["$疵引不良", 0] } },
                      counter2Total: { $sum: { $ifNull: ["$加工不良", 0] } },
                      counter3Total: { $sum: { $ifNull: ["$その他", 0] } },
                      counter4Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter5Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter6Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter7Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter8Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter9Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter10Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter11Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter12Total: { $sum: { $ifNull: [null, 0] } } // Set to 0
                    }
                  },
                  {
                    $addFields: {
                      // Add metadata for frontend with actual labels
                      defectLabels: ['疵引不良', '加工不良', 'その他'],
                      defectFields: ['counter1Total', 'counter2Total', 'counter3Total']
                    }
                  }
                ];
              case 'SRSDB':
                return [
                  {
                    $group: {
                      _id: null,
                      // Map to consistent field names for frontend compatibility
                      counter1Total: { $sum: { $ifNull: ["$くっつき・めくれ", 0] } },
                      counter2Total: { $sum: { $ifNull: ["$シワ", 0] } },
                      counter3Total: { $sum: { $ifNull: ["$転写位置ズレ", 0] } },
                      counter4Total: { $sum: { $ifNull: ["$転写不良", 0] } },
                      counter5Total: { $sum: { $ifNull: ["$文字欠け", 0] } },
                      counter6Total: { $sum: { $ifNull: ["$その他", 0] } },
                      counter7Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter8Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter9Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter10Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter11Total: { $sum: { $ifNull: [null, 0] } }, // Set to 0
                      counter12Total: { $sum: { $ifNull: [null, 0] } } // Set to 0
                    }
                  },
                  {
                    $addFields: {
                      // Add metadata for frontend with actual labels
                      defectLabels: ['くっつき・めくれ', 'シワ', '転写位置ズレ', '転写不良', '文字欠け', 'その他'],
                      defectFields: ['counter1Total', 'counter2Total', 'counter3Total', 'counter4Total', 'counter5Total', 'counter6Total']
                    }
                  }
                ];
              default:
                return [
                  {
                    $group: {
                      _id: null,
                      counter1Total: { $sum: "$counter1" },
                      counter2Total: { $sum: "$counter2" },
                      counter3Total: { $sum: "$counter3" },
                      counter4Total: { $sum: "$counter4" },
                      counter5Total: { $sum: "$counter5" },
                      counter6Total: { $sum: "$counter6" },
                      counter7Total: { $sum: "$counter7" },
                      counter8Total: { $sum: "$counter8" },
                      counter9Total: { $sum: "$counter9" },
                      counter10Total: { $sum: "$counter10" },
                      counter11Total: { $sum: "$counter11" },
                      counter12Total: { $sum: "$counter12" }
                    }
                  },
                  {
                    $addFields: {
                      defectLabels: ['Counter1', 'Counter2', 'Counter3', 'Counter4', 'Counter5', 'Counter6', 'Counter7', 'Counter8', 'Counter9', 'Counter10', 'Counter11', 'Counter12'],
                      defectFields: ['counter1Total', 'counter2Total', 'counter3Total', 'counter4Total', 'counter5Total', 'counter6Total', 'counter7Total', 'counter8Total', 'counter9Total', 'counter10Total', 'counter11Total', 'counter12Total']
                    }
                  }
                ];
            }
          })()
        }
      }
    ];

    // Climate data aggregation pipeline with SAFE PARSING
    const climateAggregation = [
      { $match: climateQuery },
      {
        $addFields: {
          // Safe temperature parsing with error handling
          tempValue: {
            $convert: {
              input: {
                $arrayElemAt: [
                  { $split: ["$Temperature", " "] },
                  0
                ]
              },
              to: "double",
              onError: 0 // Default to 0 if conversion fails
            }
          },
          // Safe humidity parsing with error handling
          humidityValue: {
            $convert: {
              input: {
                $trim: { 
                  input: "$Humidity", 
                  chars: "%" 
                }
              },
              to: "double",
              onError: 0 // Default to 0 if conversion fails
            }
          }
        }
      },
      {
        $facet: {
          // Daily temperature trend
          temperatureTrend: [
            {
              $group: {
                _id: { 
                  date: "$Date",
                  device: "$device"
                },
                avgTemp: { $avg: "$tempValue" },
                minTemp: { $min: "$tempValue" },
                maxTemp: { $max: "$tempValue" },
                factory: { $first: "$工場" },
                device: { $first: "$device" },
                readings: { $sum: 1 }
              }
            },
            {
              $group: {
                _id: "$_id.date",
                avgTemp: { $avg: "$avgTemp" },
                minTemp: { $min: "$minTemp" },
                maxTemp: { $max: "$maxTemp" },
                deviceReadings: {
                  $push: {
                    device: "$device",
                    avgTemp: "$avgTemp",
                    factory: "$factory"
                  }
                }
              }
            },
            {
              $project: {
                _id: 0,
                date: "$_id",
                avgTemp: { $round: ["$avgTemp", 2] },
                minTemp: { $round: ["$minTemp", 2] },
                maxTemp: { $round: ["$maxTemp", 2] },
                deviceReadings: 1
              }
            },
            { $sort: { date: 1 } }
          ],
          
          // Daily humidity trend
          humidityTrend: [
            {
              $group: {
                _id: { 
                  date: "$Date",
                  device: "$device"
                },
                avgHumidity: { $avg: "$humidityValue" },
                minHumidity: { $min: "$humidityValue" },
                maxHumidity: { $max: "$humidityValue" },
                factory: { $first: "$工場" },
                device: { $first: "$device" },
                readings: { $sum: 1 }
              }
            },
            {
              $group: {
                _id: "$_id.date",
                avgHumidity: { $avg: "$avgHumidity" },
                minHumidity: { $min: "$minHumidity" },
                maxHumidity: { $max: "$maxHumidity" },
                deviceReadings: {
                  $push: {
                    device: "$device",
                    avgHumidity: "$avgHumidity",
                    factory: "$factory"
                  }
                }
              }
            },
            {
              $project: {
                _id: 0,
                date: "$_id",
                avgHumidity: { $round: ["$avgHumidity", 2] },
                minHumidity: { $round: ["$minHumidity", 2] },
                maxHumidity: { $round: ["$maxHumidity", 2] },
                deviceReadings: 1
              }
            },
            { $sort: { date: 1 } }
          ],

          // Factory climate summary
          factoryClimate: [
            {
              $group: {
                _id: "$工場",
                avgTemp: { $avg: "$tempValue" },
                avgHumidity: { $avg: "$humidityValue" },
                minTemp: { $min: "$tempValue" },
                maxTemp: { $max: "$tempValue" },
                minHumidity: { $min: "$humidityValue" },
                maxHumidity: { $max: "$humidityValue" },
                sensorCount: { $addToSet: "$device" },
                totalReadings: { $sum: 1 }
              }
            },
            {
              $project: {
                _id: 0,
                factory: "$_id",
                avgTemp: { $round: ["$avgTemp", 2] },
                avgHumidity: { $round: ["$avgHumidity", 2] },
                minTemp: { $round: ["$minTemp", 2] },
                maxTemp: { $round: ["$maxTemp", 2] },
                minHumidity: { $round: ["$minHumidity", 2] },
                maxHumidity: { $round: ["$maxHumidity", 2] },
                sensorCount: { $size: "$sensorCount" },
                totalReadings: 1
              }
            }
          ]
        }
      }
    ];

    // Execute both aggregations in parallel
    console.log('🔄 Running production analytics aggregation...');
    const [productionResult, climateResult] = await Promise.all([
      collection.aggregate(analyticsAggregation).toArray(),
      tempHumidityCollection.aggregate(climateAggregation).toArray()
    ]);
    
    // Handle empty climate results
    const climateData = climateResult && climateResult.length > 0 ? climateResult[0] : {
      temperatureTrend: [],
      humidityTrend: [],
      factoryClimate: []
    };

    // Handle empty production results
    if (!productionResult || productionResult.length === 0) {
      console.log('⚠️ No production data found');
      
      // Return combined empty data with climate data
      const emptyProductionData = {
        summary: [{ totalProduction: 0, totalDefects: 0, avgDefectRate: 0, avgCycleTime: 0, totalFactories: 0, totalWorkers: 0 }],
        dailyTrend: [],
        factoryStats: [],
        workerStats: [],
        equipmentStats: [],
        defectAnalysis: [{}],
        temperatureTrend: climateData.temperatureTrend || [],
        humidityTrend: climateData.humidityTrend || [],
        factoryClimate: climateData.factoryClimate || []
      };

      return res.json({
        success: true,
        data: emptyProductionData,
        appliedFilters: {
          dateRange: `${fromDate} to ${toDate}`,
          factory: req.body.factoryFilter || 'All factories',
          collection: collectionName,
          userRole: userRole
        }
      });
    }

    const productionData = productionResult[0] || {
      summary: [{ totalProduction: 0, totalDefects: 0, avgDefectRate: 0, avgCycleTime: 0, totalFactories: 0, totalWorkers: 0 }],
      dailyTrend: [],
      factoryStats: [],
      workerStats: [],
      equipmentStats: [],
      defectAnalysis: [{}]
    };

    // Combine production and climate data
    const combinedData = {
      ...productionData,
      temperatureTrend: climateData.temperatureTrend || [],
      humidityTrend: climateData.humidityTrend || [],
      factoryClimate: climateData.factoryClimate || []
    };
    
    console.log('✅ Analytics data computed successfully');
    console.log(`📊 Production Summary: ${combinedData.summary?.[0]?.totalProduction || 0} production quantity, ${combinedData.summary?.[0]?.totalDefects || 0} defects`);
    console.log(`🌡️ Climate Data: ${climateData.temperatureTrend?.length || 0} temperature readings, ${climateData.humidityTrend?.length || 0} humidity readings`);
    
    // Debug: Log sample records to understand data structure
    if (combinedData.sampleRecords && combinedData.sampleRecords.length > 0) {
      console.log(`🔍 Sample ${collectionName} records:`, JSON.stringify(combinedData.sampleRecords, null, 2));
    }
    
    // Debug: Log production calculation details
    console.log(`🧮 Production calculation using ${fields.productionField} field for ${collectionName}`);
    console.log(`🧮 Defect calculation using ${collectionName === 'SRSDB' ? 'SRS_Total_NG' : 'Total_NG'} field for ${collectionName}`);
    console.log('📊 Worker field:', fields.workerField, '| Equipment field:', fields.equipmentField, '| Cycle time field:', fields.cycleTimeField);
    
    return res.json({
      success: true,
      data: combinedData,
      appliedFilters: {
        dateRange: `${fromDate} to ${toDate}`,
        factory: req.body.factoryFilter || 'All factories',
        collection: collectionName,
        userRole: userRole
      }
    });

  } catch (error) {
    console.error('❌ Error computing analytics data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to compute analytics data"
    });
  }
});


/**
 * Backend Route: Top Defect Parts per Factory
 * 
 * Add this route to your Express server to provide real part-level defect data
 * This should be added alongside the existing /api/analytics-data route
 */


// POST /api/analytics/top-defect-parts
app.post('/api/analytics/top-defect-parts', async (req, res) => {
    try {
        const { 
            fromDate, 
            toDate, 
            factoryFilter, 
            collectionName = 'kensaDB',
            dbName = 'submittedDB',
            userRole = 'member',
            factoryAccess = []
        } = req.body;
        
        if (!fromDate || !toDate) {
            return res.json({
                success: false,
                error: 'fromDate and toDate are required'
            });
        }

        // Collection-specific field mappings (same as analytics route)
        const getCollectionFields = (collectionName) => {
            switch (collectionName) {
                case 'kensaDB':
                    return {
                        defectField: 'Total_NG',
                        productionField: 'Process_Quantity',
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'pressDB':
                    return {
                        defectField: 'Total_NG',
                        productionField: 'Process_Quantity',
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'slitDB':
                    return {
                        defectField: 'Total_NG',
                        productionField: 'Process_Quantity',
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'SRSDB':
                    return {
                        defectField: 'Total_NG',
                        productionField: 'Process_Quantity',
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                default:
                    return {
                        defectField: 'Total_NG',
                        productionField: 'Process_Quantity',
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
            }
        };

        const fields = getCollectionFields(collectionName);
        const db = client.db(dbName);
        const coll = db.collection(collectionName);

        // Build base match stage with date range
        const matchStage = {
            Date: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        // Apply factory filter (same logic as analytics route)
        if (factoryFilter && factoryFilter !== 'all') {
            matchStage[fields.factoryField] = factoryFilter;
            console.log(`Applied factory filter: ${factoryFilter}`);
        } else if (userRole !== 'admin' && userRole !== '部長' && factoryAccess && factoryAccess.length > 0) {
            // Apply role-based restrictions
            matchStage[fields.factoryField] = { $in: factoryAccess };
            console.log(`Applied role-based factory restriction: ${factoryAccess.join(', ')}`);
        }

        console.log(`Fetching top defect parts from ${collectionName}:`, matchStage);

        // Aggregate top defect parts per factory
        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        factory: `$${fields.factoryField}`,
                        partNumber: `$${fields.partNumberField}`,
                        serialNumber: `$${fields.serialNumberField}`
                    },
                    totalProduction: { $sum: `$${fields.productionField}` },
                    totalDefects: { $sum: `$${fields.defectField}` }
                }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id.factory',
                    partNumber: '$_id.partNumber',
                    serialNumber: '$_id.serialNumber',
                    totalProduction: 1,
                    totalDefects: 1,
                    defectRate: {
                        $cond: {
                            if: { $gt: ['$totalProduction', 0] },
                            then: { 
                                $multiply: [
                                    { $divide: ['$totalDefects', '$totalProduction'] },
                                    100
                                ]
                            },
                            else: 0
                        }
                    }
                }
            },
            // Filter out parts with zero defects for cleaner results
            { $match: { totalDefects: { $gt: 0 } } },
            { $sort: { factory: 1, totalDefects: -1 } }
        ];

        const results = await coll.aggregate(pipeline).toArray();

        console.log(`Found ${results.length} defect parts across all factories`);

        // Group by factory and take top 5 for each
        const factoryMap = new Map();
        
        results.forEach(item => {
            const factory = item.factory || 'Unknown';
            
            if (!factoryMap.has(factory)) {
                factoryMap.set(factory, []);
            }
            
            const factoryParts = factoryMap.get(factory);
            if (factoryParts.length < 5) {
                factoryParts.push({
                    partNumber: item.partNumber,
                    serialNumber: item.serialNumber,
                    totalProduction: item.totalProduction,
                    totalDefects: item.totalDefects,
                    defectRate: item.defectRate
                });
            }
        });

        // Convert map to array format
        const factoryPartsArray = Array.from(factoryMap.entries()).map(([factory, topParts]) => ({
            factory,
            topParts
        }));

        console.log(`Returning top defect parts for ${factoryPartsArray.length} factories`);

        res.json({
            success: true,
            data: factoryPartsArray
        });

    } catch (error) {
        console.error('Error fetching top defect parts:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});


// POST /api/analytics/defect-part-details
// Get detailed records for a specific part (品番 + 背番号)
app.post('/api/analytics/defect-part-details', async (req, res) => {
    try {
        const { 
            fromDate, 
            toDate, 
            partNumber,
            serialNumber,
            factory,
            collectionName = 'kensaDB',
            dbName = 'submittedDB'
        } = req.body;
        
        if (!fromDate || !toDate || !partNumber) {
            return res.json({
                success: false,
                error: 'fromDate, toDate, and partNumber are required'
            });
        }

        // Collection-specific field mappings (same as above)
        const getCollectionFields = (collectionName) => {
            switch (collectionName) {
                case 'kensaDB':
                    return {
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'pressDB':
                    return {
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'slitDB':
                    return {
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                case 'SRSDB':
                    return {
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
                default:
                    return {
                        partNumberField: '品番',
                        serialNumberField: '背番号',
                        factoryField: '工場'
                    };
            }
        };

        const fields = getCollectionFields(collectionName);
        const db = client.db(dbName);
        const coll = db.collection(collectionName);

        // Build match query
        const matchQuery = {
            Date: {
                $gte: fromDate,
                $lte: toDate
            },
            [fields.partNumberField]: partNumber
        };

        // Add serial number if provided
        if (serialNumber) {
            matchQuery[fields.serialNumberField] = serialNumber;
        }

        // Add factory filter if provided
        if (factory) {
            matchQuery[fields.factoryField] = factory;
        }

        console.log(`Fetching detailed records from ${collectionName}:`, matchQuery);

        // Fetch all matching records
        const records = await coll.find(matchQuery)
            .sort({ Date: -1 })
            .toArray();

        console.log(`Found ${records.length} detailed records`);

        // Get field names dynamically from the first record
        let fieldNames = [];
        if (records.length > 0) {
            fieldNames = Object.keys(records[0]).filter(key => key !== '_id');
        }

        res.json({
            success: true,
            data: {
                records: records,
                fieldNames: fieldNames,
                totalRecords: records.length,
                collectionName: collectionName
            }
        });

    } catch (error) {
        console.error('Error fetching defect part details:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});








//ANALYTICS END




// For Inventory app
app.post('/inventoryChat', async (req, res) => {
  const { message, roomId } = req.body;
  const apiKey = process.env.CHATWORK_API_KEY;
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        body: message
      })
    });

    if (response.ok) {
      const result = await response.json();
      res.status(200).json({ message: 'Message sent successfully', result });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ message: 'Failed to send message', error: errorText });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});



// For Inventory app
app.post('/tempChat', async (req, res) => {
  const { message, roomId } = req.body;
  const apiKey = process.env.CHATWORK_API_KEY;
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        body: message
      })
    });

    if (response.ok) {
      const result = await response.json();
      res.status(200).json({ message: 'Message sent successfully', result });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ message: 'Failed to send message', error: errorText });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


//Chatwork API endpoint to get contacts
app.get('/chatworkContacts', async (req, res) => {
  const apiKey = process.env.CHATWORK_API_KEY;
  const url = 'https://api.chatwork.com/v2/contacts';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-ChatWorkToken': apiKey
      }
    });

    if (response.ok) {
      const contacts = await response.json();
      res.status(200).json({ message: 'Contacts retrieved successfully', contacts });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ message: 'Failed to retrieve contacts', error: errorText });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


//Chatwork API endpoint to send messages
app.post('/chatWorkSend', async (req, res) => {
  const { account_id, messageBody } = req.body;
  const apiKey = process.env.CHATWORK_API_KEY;

  try {
    await client.connect(); // ✅ Use shared MongoDB client

    const db = client.db("Sasaki_Coating_MasterDB");
    const chatWorkDB = db.collection("chatWorkDB");

    const contact = await chatWorkDB.findOne({ account_id: Number(account_id) });

    if (!contact) {
      return res.status(404).json({ message: 'Account ID not found in database' });
    }

    const { room_id, name } = contact;

    const chatworkURL = `https://api.chatwork.com/v2/rooms/${room_id}/messages`;
    const formattedMessage = `[To:${account_id}]${name}\n${messageBody}`;

    const response = await fetch(chatworkURL, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        body: formattedMessage
      })
    });

    if (response.ok) {
      const result = await response.json();
      res.status(200).json({ message: 'Message sent successfully', result });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ message: 'Failed to send message', error: errorText });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


// Login endpoint
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const users = db.collection("users");

    const user = await users.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ username: user.username, role: user.role });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// ==================== Production Goals ====================
app.get('/api/production-goals', async (req, res) => {
    try {
        const { factory, date, startDate, endDate } = req.query;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        // Build query
        const query = {};
        if (factory) query.factory = factory;
        
        if (date) {
            query.date = date;
        } else if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            query.date = { $gte: startDate };
        } else if (endDate) {
            query.date = { $lte: endDate };
        }
        
        const goals = await collection.find(query).sort({ date: 1, 背番号: 1 }).toArray();
        
        res.json({ success: true, data: goals });
    } catch (error) {
        console.error('Error fetching production goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CREATE GOAL (Single) ====================
app.post('/api/production-goals', async (req, res) => {
    try {
        const { factory, date, 背番号, 品番, 品名, targetQuantity, createdBy } = req.body;
        
        if (!factory || !date || !targetQuantity || (!背番号 && !品番)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: factory, date, targetQuantity, and either 背番号 or 品番' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        const goal = {
            factory,
            date,
            背番号: 背番号 || '',
            品番: 品番 || '',
            品名: 品名 || '',
            targetQuantity: parseInt(targetQuantity),
            remainingQuantity: parseInt(targetQuantity),
            scheduledQuantity: 0,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: createdBy || 'system'
        };
        
        const result = await collection.insertOne(goal);
        
        res.json({ success: true, data: { ...goal, _id: result.insertedId } });
    } catch (error) {
        console.error('Error creating production goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CREATE MULTIPLE GOALS (Batch) ====================
app.post('/api/production-goals/batch', async (req, res) => {
    try {
        const { goals, createdBy } = req.body;
        
        if (!goals || !Array.isArray(goals) || goals.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid goals array' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        // Process each goal
        const goalsToInsert = goals.map(g => ({
            factory: g.factory,
            date: g.date,
            背番号: g.背番号 || '',
            品番: g.品番 || '',
            品名: g.品名 || '',
            targetQuantity: parseInt(g.targetQuantity),
            remainingQuantity: parseInt(g.targetQuantity),
            scheduledQuantity: 0,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: createdBy || 'system'
        }));
        
        const result = await collection.insertMany(goalsToInsert);
        
        res.json({ 
            success: true, 
            insertedCount: result.insertedCount,
            data: goalsToInsert 
        });
    } catch (error) {
        console.error('Error creating multiple production goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== UPDATE GOAL ====================
app.put('/api/production-goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        // Remove _id from updates if present
        delete updates._id;
        
        // Update timestamp
        updates.updatedAt = new Date();
        
        // Get current goal to calculate proper remaining quantity and status
        const currentGoal = await collection.findOne({ _id: new ObjectId(id) });
        if (!currentGoal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        
        // If targetQuantity is being updated, recalculate remainingQuantity
        if (updates.targetQuantity !== undefined) {
            const newTargetQuantity = parseInt(updates.targetQuantity);
            const currentScheduled = currentGoal.scheduledQuantity || 0;
            updates.remainingQuantity = newTargetQuantity - currentScheduled;
        }
        
        // Calculate final quantities for status determination
        const finalTargetQuantity = updates.targetQuantity || currentGoal.targetQuantity;
        const finalScheduledQuantity = updates.scheduledQuantity || currentGoal.scheduledQuantity || 0;
        const finalRemainingQuantity = updates.remainingQuantity !== undefined ? updates.remainingQuantity : (finalTargetQuantity - finalScheduledQuantity);
        
        // Update status based on final quantities
        if (finalRemainingQuantity <= 0) {
            updates.status = 'completed';
        } else if (finalScheduledQuantity > 0) {
            updates.status = 'in-progress';
        } else {
            updates.status = 'pending';
        }
        
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error('Error updating production goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== UPDATE GOAL QUANTITIES ====================
app.post('/api/production-goals/:id/schedule', async (req, res) => {
    try {
        const { id } = req.params;
        const { quantityToSchedule } = req.body;
        
        if (!quantityToSchedule || quantityToSchedule <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid quantity to schedule' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        // Get current goal
        const goal = await collection.findOne({ _id: new ObjectId(id) });
        
        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        
        if (goal.remainingQuantity < quantityToSchedule) {
            return res.status(400).json({ 
                success: false, 
                error: 'Quantity to schedule exceeds remaining quantity' 
            });
        }
        
        // Update quantities
        const newRemaining = goal.remainingQuantity - quantityToSchedule;
        const newScheduled = goal.scheduledQuantity + quantityToSchedule;
        const newStatus = newRemaining === 0 ? 'completed' : 'in-progress';
        
        await collection.updateOne(
            { _id: new ObjectId(id) },
            { 
                $set: { 
                    remainingQuantity: newRemaining,
                    scheduledQuantity: newScheduled,
                    status: newStatus,
                    updatedAt: new Date()
                } 
            }
        );
        
        res.json({ 
            success: true, 
            remainingQuantity: newRemaining,
            scheduledQuantity: newScheduled,
            status: newStatus
        });
    } catch (error) {
        console.error('Error scheduling quantity:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== DELETE GOAL ====================
app.delete('/api/production-goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }
        
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        console.error('Error deleting production goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CHECK FOR DUPLICATES ====================
app.post('/api/production-goals/check-duplicates', async (req, res) => {
    try {
        const { factory, items } = req.body; // items = array of {背番号 or 品番, date}
        
        if (!factory || !items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: factory and items array' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        const duplicates = [];
        
        for (const item of items) {
            // Each item now has its own date
            const query = { factory };
            
            // Use the item's date if provided
            if (item.date) {
                query.date = item.date;
            }
            
            if (item.背番号) {
                query.背番号 = item.背番号;
            } else if (item.品番) {
                query.品番 = item.品番;
            }
            
            const existing = await collection.findOne(query);
            
            if (existing) {
                duplicates.push(existing);
            }
        }
        
        res.json({ 
            success: true, 
            hasDuplicates: duplicates.length > 0,
            duplicates 
        });
    } catch (error) {
        console.error('Error checking duplicates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== LOOKUP MASTER DATA (for CSV auto-fill) ====================
app.post('/api/production-goals/lookup', async (req, res) => {
    try {
        const { searchType, searchValue, factory } = req.body; // searchType: '背番号' or '品番'
        
        if (!searchType || !searchValue) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing search parameters' 
            });
        }
        
        // Lookup from masterDB - always use Sasaki_Coating_MasterDB for all factories
        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');
        
        const query = { [searchType]: searchValue };
        const product = await collection.findOne(query);
        
        if (!product) {
            return res.json({ 
                success: false, 
                error: 'Product not found in master database' 
            });
        }
        
        res.json({ 
            success: true, 
            data: {
                背番号: product.背番号,
                品番: product.品番,
                品名: product.品名,
                収容数: product.収容数,
                pcPerCycle: product.pcPerCycle || 1,
                '秒数(1pcs何秒)': product['秒数(1pcs何秒)'] || 22.5
            }
        });
    } catch (error) {
        console.error('Error looking up master data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== UPDATE PRODUCTION PLAN ====================
app.post('/api/production-plans/update', async (req, res) => {
    try {
        const { planId, factory, date, products, breaks, updatedBy } = req.body;
        
        if (!planId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Plan ID is required' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionPlansDB');
        
        const updateData = {
            updatedAt: new Date()
        };
        
        if (factory) updateData.factory = factory;
        if (date) updateData.date = date;
        if (products) updateData.products = products;
        if (breaks) updateData.breaks = breaks;
        if (updatedBy) updateData.updatedBy = updatedBy;
        
        const result = await collection.updateOne(
            { _id: new ObjectId(planId) },
            { $set: updateData }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Plan not found' 
            });
        }
        
        res.json({ 
            success: true, 
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Error updating production plan:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== GET PRODUCTION PLANS ====================
app.get('/api/production-plans', async (req, res) => {
    try {
        const { factory, date, startDate, endDate } = req.query;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionPlansDB');
        
        const query = {};
        if (factory) query.factory = factory;
        
        if (date) {
            query.date = date;
        } else if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            query.date = { $gte: startDate };
        } else if (endDate) {
            query.date = { $lte: endDate };
        }
        
        const plans = await collection.find(query).sort({ date: 1 }).toArray();
        
        res.json({ success: true, data: plans });
    } catch (error) {
        console.error('Error fetching production plans:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CREATE PRODUCTION PLAN ====================
app.post('/api/production-plans', async (req, res) => {
    try {
        const { factory, date, products, breaks, createdBy } = req.body;
        
        if (!factory || !date) {
            return res.status(400).json({ 
                success: false, 
                error: 'Factory and date are required' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionPlansDB');
        
        const plan = {
            factory,
            date,
            products: products || [],
            breaks: breaks || [],
            createdBy: createdBy || 'system',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await collection.insertOne(plan);
        
        res.json({ 
            success: true, 
            data: { ...plan, _id: result.insertedId } 
        });
    } catch (error) {
        console.error('Error creating production plan:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== DELETE PRODUCTION PLAN ====================
app.delete('/api/production-plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionPlansDB');
        
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Plan not found' 
            });
        }
        
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        console.error('Error deleting production plan:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==================== BARCODE SCANNER LOOKUP ====================
app.post('/api/production-goals/barcode-lookup', async (req, res) => {
    try {
        const { seiban, factory } = req.body; // seiban = 背番号
        
        console.log('=== BARCODE LOOKUP API DEBUG START ===');
        console.log('背番号 (seiban):', seiban);
        console.log('Factory:', factory);
        
        if (!seiban) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing 背番号 (seiban) parameter' 
            });
        }
        
        // Lookup from masterDB
        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');
        
        const query = { '背番号': seiban };
        
        // Add factory filter if provided
        if (factory) {
            query['工場'] = factory;
        }
        
        console.log('Query:', JSON.stringify(query));
        
        const product = await collection.findOne(query);
        
        if (!product) {
            console.log('Product not found in masterDB');
            console.log('=== BARCODE LOOKUP API DEBUG END ===');
            return res.json({ 
                success: false, 
                error: `背番号 "${seiban}" not found in master database` 
            });
        }
        
        console.log('Product found:', product['品番']);
        console.log('収容数:', product['収容数']);
        console.log('=== BARCODE LOOKUP API DEBUG END ===');
        
        res.json({ 
            success: true, 
            data: {
                '背番号': product['背番号'],
                '品番': product['品番'],
                '品名': product['品名'],
                '収容数': product['収容数'],
                '秒数(1pcs何秒)': product['秒数(1pcs何秒)'] || 22.5,
                'pcPerCycle': product.pcPerCycle || 1,
                '工場': product['工場'],
                '加工設備': product['加工設備'],
                // Return full product for additional info if needed
                fullProduct: product
            }
        });
    } catch (error) {
        console.error('Error in barcode lookup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// ==================== GET PRESS HISTORY (for smart scheduling) ====================
app.post('/api/production-goals/press-history', async (req, res) => {
    try {
        const { factory, items } = req.body; // items = array of {背番号 or 品番}
        
        console.log('=== PRESS HISTORY API DEBUG START ===');
        console.log('Factory:', factory);
        console.log('Items:', items);
        
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid items array' 
            });
        }
        
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Get last 30 days in YYYY-MM-DD format (pressDB uses Date field as string)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const dateThreshold = thirtyDaysAgo.toISOString().split('T')[0]; // "YYYY-MM-DD"
        
        console.log('Date threshold (30 days ago):', dateThreshold);
        
        const trends = {};
        
        for (const item of items) {
            const query = {
                Date: { $gte: dateThreshold }  // Changed from createdAt to Date (string field)
            };
            
            if (factory) {
                query.工場 = factory;
            }
            
            if (item.背番号) {
                query.背番号 = item.背番号;
            } else if (item.品番) {
                query.品番 = item.品番;
            }
            
            console.log(`Query for ${item.背番号 || item.品番}:`, JSON.stringify(query));
            
            // Get all records and count by equipment
            const records = await collection.find(query).toArray();
            console.log(`  Found ${records.length} records`);
            
            if (records.length > 0) {
                console.log('  Sample record:', records[0]);
            }
            
            const equipmentCounts = {};
            records.forEach(record => {
                const equipment = record.設備;
                if (equipment) {
                    equipmentCounts[equipment] = (equipmentCounts[equipment] || 0) + 1;
                }
            });
            
            console.log('  Equipment distribution:', equipmentCounts);
            
            // Find most frequent equipment
            let maxCount = 0;
            let mostFrequentEquipment = null;
            
            for (const [equipment, count] of Object.entries(equipmentCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    mostFrequentEquipment = equipment;
                }
            }
            
            console.log(`  Most frequent: ${mostFrequentEquipment} (${maxCount} times)`);
            
            const identifier = item.背番号 || item.品番;
            trends[identifier] = {
                mostFrequentEquipment,
                frequency: maxCount,
                totalRecords: records.length,
                equipmentDistribution: equipmentCounts
            };
        }
        
        console.log('Final trends:', trends);
        console.log('=== PRESS HISTORY API DEBUG END ===');
        
        res.json({ success: true, trends });
    } catch (error) {
        console.error('Error fetching press history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== FACTORY STATUS API ROUTES ====================
// For real-time factory production progress visualization

// Get list of factories from production goals
app.get('/api/production-goals/factories', async (req, res) => {
    try {
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        const factories = await collection.distinct('factory');
        
        res.json({ success: true, factories: factories.sort() });
    } catch (error) {
        console.error('Error fetching factories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get production goals summary by factory for factory status graph
app.get('/api/production-goals/summary', async (req, res) => {
    try {
        const { factory, date } = req.query;
        
        const db = client.db('submittedDB');
        const collection = db.collection('productionGoalsDB');
        
        const matchStage = {};
        
        // Filter by factory if not "all"
        if (factory && factory !== 'all') {
            matchStage.factory = factory;
        }
        
        // Filter by specific date
        if (date) {
            matchStage.date = date;
        }
        
        // Aggregate goals by factory
        const summary = await collection.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$factory',
                    totalTargetQuantity: { $sum: '$targetQuantity' },
                    totalScheduledQuantity: { $sum: '$scheduledQuantity' },
                    totalRemainingQuantity: { $sum: '$remainingQuantity' },
                    goalCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();
        
        res.json({ success: true, data: summary });
    } catch (error) {
        console.error('Error fetching production goals summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});







//FREYA ACESS BACKEND
// Token validation endpoint
app.post("/validateToken", async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    // If you're using JWT
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Fetch user from database
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const masterUsers = database.collection("masterUsers");
    
    const user = await masterUsers.findOne({ 
      username: decoded.username 
    }, {
      projection: { password: 0 } // Exclude password
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json(user);
    
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});


// app.post("/loginCustomer", async (req, res) => {
//   const { username, password } = req.body;

//   try {
//     await client.connect();

//     const globalDB = client.db("Sasaki_Coating_MasterDB");
//     const masterUser = await globalDB.collection("masterUsers").findOne({ username });

//     // 1️⃣ MasterUser login
//     if (masterUser) {
//       const passwordMatch = await bcrypt.compare(password, masterUser.password);
//       if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

//       const today = new Date();
//       const validUntil = new Date(masterUser.validUntil);
//       if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

//       return res.status(200).json({
//         username: masterUser.username,
//         role: masterUser.role,
//         dbName: masterUser.dbName
//       });
//     }

//     // 2️⃣ Sub-user login (loop all master users)
//     const allMasterUsers = await globalDB.collection("masterUsers").find({}).toArray();

//     for (const mu of allMasterUsers) {
//       const customerDB = client.db(mu.dbName);
//       const subUser = await customerDB.collection("users").findOne({ username });

//       if (subUser) {
//         // Check password
//         const passwordMatch = await bcrypt.compare(password, subUser.password);
//         if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

//         // Check if master account is valid
//         const today = new Date();
//         const validUntil = new Date(mu.validUntil);
//         if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

//         return res.status(200).json({
//           username: subUser.username,
//           role: subUser.role,
//           dbName: mu.dbName,
//           masterUsername: mu.username
//         });
//       }
//     }

//     // Not found
//     return res.status(401).json({ error: "Account not found" });

//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

app.post("/loginCustomer", async (req, res) => {
  const { username, password } = req.body;

  try {
    await client.connect();

    const globalDB = client.db("Sasaki_Coating_MasterDB");
    const masterUser = await globalDB.collection("masterUsers").findOne({ username });

    // JWT Secret (use environment variable in production)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const jwt = require('jsonwebtoken');

    // 1️⃣ MasterUser login
    if (masterUser) {
      const passwordMatch = await bcrypt.compare(password, masterUser.password);
      if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

      const today = new Date();
      const validUntil = new Date(masterUser.validUntil);
      if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

      // Generate JWT token
      const token = jwt.sign(
        { 
          username: masterUser.username, 
          role: masterUser.role,
          company: masterUser.company || masterUser.dbName,
          dbName: masterUser.dbName
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.status(200).json({
        username: masterUser.username,
        role: masterUser.role,
        dbName: masterUser.dbName,
        company: masterUser.company || masterUser.dbName,
        token: token,
        authToken: token
      });
    }

    // 2️⃣ Sub-user login (loop all master users)
    const allMasterUsers = await globalDB.collection("masterUsers").find({}).toArray();

    for (const mu of allMasterUsers) {
      const customerDB = client.db(mu.dbName);
      const subUser = await customerDB.collection("users").findOne({ username });

      if (subUser) {
        // Check password
        const passwordMatch = await bcrypt.compare(password, subUser.password);
        if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

        // Check if master account is valid
        const today = new Date();
        const validUntil = new Date(mu.validUntil);
        if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

        // Generate JWT token for sub-user
        const token = jwt.sign(
          { 
            username: subUser.username, 
            role: subUser.role,
            company: mu.company || mu.dbName,
            dbName: mu.dbName,
            masterUsername: mu.username
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        return res.status(200).json({
          username: subUser.username,
          role: subUser.role,
          dbName: mu.dbName,
          company: mu.company || mu.dbName,
          masterUsername: mu.username,
          token: token,
          authToken: token
        });
      }
    }

    // Not found
    return res.status(401).json({ error: "Account not found" });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/createUser", async (req, res) => {
  const { firstName, lastName, email, username, password, role, factory } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email || !username || !password || !role) {
    console.log("missing required fields!!!:", { firstName, lastName, email, username, password, role, factory });
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate factory for 班長 and 係長 users
  if ((role === '班長' || role === '係長') && (!factory || factory.length === 0)) {
    return res.status(400).json({ error: `Factory is required for ${role} users` });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterUsers = db.collection("users");

    // Check if username already exists
    const existing = await masterUsers.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      username,
      password: hashedPassword,
      role,
      createdAt: new Date()
    };

    // Add 工場 field for 班長 and 係長 users
    if ((role === '班長' || role === '係長') && factory) {
      userData['工場'] = factory;
    }

    // Insert master user
    await masterUsers.insertOne(userData);

    console.log("✅ New master user created:", username);
    res.json({ message: "Master user created successfully" });
  } catch (err) {
    console.error("❌ Error creating master user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// app.post("/updateUser", async (req, res) => {
//   const { userId, firstName, lastName, email, role, username } = req.body;

//   if (!userId || !role) {
//     console.log("❌ Missing userId or role:", { userId, firstName, lastName, email, role, factory, username });
//     return res.status(400).json({ error: "User ID and role are required" });
//   }

//   try {
//     await client.connect();
//     const db = client.db("Sasaki_Coating_MasterDB");
//     const users = db.collection("users");

//     const updateFields = {
//       ...(firstName && { firstName }),
//       ...(lastName && { lastName }),
//       ...(email && { email }),
//       ...(username && { username }),
//       ...(role && { role })
//     };

//     // Handle 工場 field for 班長 users
//     if (role === '班長') {
//       if (factory && factory.length > 0) {
//         // Store factory array in 工場 field  
//         updateFields['工場'] = Array.isArray(factory) ? factory : [factory];
//       } else {
//         // If no factory provided for 班長, set empty array
//         console.warn("班長 user without factory assignment");
//         updateFields['工場'] = [];
//       }
//     } else {
//       // For non-班長 users, we'll unset the 工場 field
//       // Don't include it in updateFields, handle separately
//     }

//     let updateOperation;
    
//     if (role !== '班長') {
//       // For non-班長 users, remove 工場 field
//       updateOperation = {
//         $set: updateFields,
//         $unset: { '工場': "" }
//       };
//     } else {
//       // For 班長 users, just set the fields
//       updateOperation = { $set: updateFields };
//     }

//     console.log("Update operation:", updateOperation);

//     const result = await users.updateOne(
//       { _id: new ObjectId(userId) },
//       updateOperation
//     );

//     if (result.modifiedCount === 0) {
//       return res.status(404).json({ error: "User not found or no changes made" });
//     }

//     res.json({ message: "User updated successfully" });
//   } catch (err) {
//     console.error("Error updating user:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

app.post("/updateUser", async (req, res) => {
  const { userId, firstName, lastName, email, role, username, factory } = req.body; // Added factory to destructuring

  if (!userId || !role) {
    console.log("❌ Missing userId or role:", { userId, firstName, lastName, email, role, factory, username });
    return res.status(400).json({ error: "User ID and role are required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const users = db.collection("users");

    const updateFields = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(email && { email }),
      ...(username && { username }),
      ...(role && { role })
    };

    // Handle 工場 field for 班長 and 係長 users
    if (role === '班長' || role === '係長') {
      if (factory && factory.length > 0) {
        // Store factory array in 工場 field  
        updateFields['工場'] = Array.isArray(factory) ? factory : [factory];
      } else {
        // If no factory provided for 班長/係長, set empty array
        console.warn(`${role} user without factory assignment`);
        updateFields['工場'] = [];
      }
    } else {
      // For non-班長/係長 users, we'll unset the 工場 field
      // Don't include it in updateFields, handle separately
    }

    let updateOperation;
    
    if (role !== '班長' && role !== '係長') {
      // For non-班長/係長 users, remove 工場 field
      updateOperation = {
        $set: updateFields,
        $unset: { '工場': "" }
      };
    } else {
      // For 班長/係長 users, just set the fields
      updateOperation = { $set: updateFields };
    }

    console.log("Update operation:", updateOperation);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      updateOperation
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "User not found or no changes made" });
    }

    console.log(`✅ User ${userId} updated successfully with role: ${role}`);
    if (role === '班長' || role === '係長') {
      console.log(`✅ Factory assignments: ${JSON.stringify(updateFields['工場'])}`);
    }

    res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// New route for resetting user password
app.post("/resetUserPassword", async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ error: "User ID and new password are required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const usersCollection = db.collection("users");

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (result.modifiedCount === 0) {
      return res.status(200).json({ message: "Password is the same as the old one, no update needed." });
    }

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Error resetting user password:", err);
    res.status(500).json({ error: "Internal server error during password reset." });
  }
});


// Verify leader by username and role for QR authentication
app.post("/verifyLeader", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const usersCollection = db.collection("users");

    // Find user by username
    const user = await usersCollection.findOne({ username: username });

    if (!user) {
      return res.status(404).json({ error: "User not found", authorized: false });
    }

    // Check if user has an authorized role
    const authorizedRoles = ["班長", "admin", "課長", "部長"];
    const isAuthorized = authorizedRoles.includes(user.role);

    if (isAuthorized) {
      res.json({ 
        authorized: true, 
        message: "Leader verified successfully",
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      });
    } else {
      res.status(403).json({ 
        authorized: false, 
        error: "User does not have leader privileges",
        role: user.role
      });
    }
  } catch (err) {
    console.error("Error verifying leader:", err);
    res.status(500).json({ error: "Internal server error during leader verification." });
  }
});


// Create new worker
app.post("/createWorker", async (req, res) => {
  const { Name, "ID number": idNumber, 部署, Picture } = req.body;

  // Validate required fields
  if (!Name) {
    console.log("missing required fields!!!:", { Name, idNumber, 部署, Picture });
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const workerDB = db.collection("workerDB");

    // Check if worker name already exists (optional, depending on your requirements)
    const existing = await workerDB.findOne({ Name: Name });
    if (existing) {
      return res.status(400).json({ error: "Worker name already exists" });
    }

    // Prepare worker data
    const workerData = {
      Name: Name,
      "ID number": idNumber || "",
      部署: 部署 || "",
      Picture: Picture || "",
      createdAt: new Date()
    };

    // Insert worker
    await workerDB.insertOne(workerData);

    console.log("✅ New worker created:", Name);
    res.json({ message: "Worker created successfully" });
  } catch (err) {
    console.error("❌ Error creating worker:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Update worker
app.post("/updateWorker", async (req, res) => {
  const { workerId, Name, "ID number": idNumber, 部署, Picture } = req.body;

  if (!workerId) {
    console.log("❌ Missing workerId:", { workerId, Name, idNumber, 部署, Picture });
    return res.status(400).json({ error: "Worker ID is required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const workerDB = db.collection("workerDB");

    const updateFields = {
      ...(Name && { Name }),
      ...(idNumber !== undefined && { "ID number": idNumber }),
      ...(部署 !== undefined && { 部署 }),
      ...(Picture !== undefined && { Picture }),
      updatedAt: new Date()
    };

    console.log("Update operation:", updateFields);

    const result = await workerDB.updateOne(
      { _id: new ObjectId(workerId) },
      { $set: updateFields }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Worker not found or no changes made" });
    }

    console.log(`✅ Worker ${workerId} updated successfully`);
    res.json({ message: "Worker updated successfully" });
  } catch (err) {
    console.error("Error updating worker:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Delete worker
app.post("/deleteWorker", async (req, res) => {
  const { workerId } = req.body;

  if (!workerId) {
    return res.status(400).json({ error: "Worker ID is required" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const workerDB = db.collection("workerDB");

    const result = await workerDB.deleteOne({ _id: new ObjectId(workerId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Worker not found" });
    }

    console.log(`✅ Worker ${workerId} deleted successfully`);
    res.json({ message: "Worker deleted successfully" });
  } catch (err) {
    console.error("Error deleting worker:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Delete selected records from submitted DB (masterUser only)
app.post('/deleteCustomerSubmittedRecords', async (req, res) => {
    try {
        const { dbName, recordIds, role, username } = req.body;

        // Validation
        if (!dbName || !recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
            return res.status(400).json({ error: 'Missing required fields: dbName, recordIds (array)' });
        }

        if (!role || !username) {
            return res.status(400).json({ error: 'Missing authentication fields: role, username' });
        }

        // Authorization - only masterUser can delete records
        if (role !== 'masterUser') {
            return res.status(403).json({ error: 'Access denied. Only masterUser can delete records.' });
        }

        // Connect to the customer's database
        const customerDb = client.db(dbName);
        const submittedCollection = customerDb.collection('submittedDB');

        // Convert string IDs to ObjectId
        const { ObjectId } = require('mongodb');
        const objectIds = recordIds.map(id => {
            try {
                return new ObjectId(id);
            } catch (err) {
                throw new Error(`Invalid record ID format: ${id}`);
            }
        });

        // Delete the records
        const deleteResult = await submittedCollection.deleteMany({
            _id: { $in: objectIds }
        });

        // Log the deletion activity (optional)
        const logCollection = customerDb.collection('activityLogs');
        try {
            await logCollection.insertOne({
                action: 'delete_submitted_records',
                performedBy: username,
                performedByRole: role,
                recordsDeleted: deleteResult.deletedCount,
                recordIds: recordIds,
                timestamp: new Date(),
                ip: req.ip || req.connection.remoteAddress
            });
        } catch (logError) {
            console.warn('Failed to log deletion activity:', logError);
            // Don't fail the main operation if logging fails
        }

        res.json({
            success: true,
            deletedCount: deleteResult.deletedCount,
            message: `Successfully deleted ${deleteResult.deletedCount} record(s)`
        });

    } catch (error) {
        console.error('Error deleting submitted records:', error);
        res.status(500).json({ 
            error: 'Failed to delete records',
            details: error.message 
        });
    }
});



app.post('/saveImageURL', async (req, res) => {
  const { imageUrl, label, factory, machine, worker, date, sebanggo } = req.body;

  try {
    await client.connect();
    const database = client.db("submittedDB"); // Use the correct DB name as a string
    const imageUploads = database.collection('imageUploads'); // Correct reference to the collection

    await imageUploads.insertOne({
      imageUrl,
      label,
      factory,
      machine,
      worker,
      date,
      sebanggo,
      uploadedAt: new Date()
    });

    res.json({ status: 'success' });
  } catch (err) {
    console.error("Error saving image URL:", err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});


// //updates masterDB
// app.post("/updateMasterRecord", async (req, res) => {
//   const { recordId, updates, username } = req.body;

//   if (!recordId || !updates || !username) {
//     return res.status(400).json({ error: "Missing required fields" });
//   }

//   try {
//     await client.connect();
//     const db = client.db("Sasaki_Coating_MasterDB");
//     const masterColl = db.collection("masterDB");
//     const logColl = db.collection("masterDB_Log");

//     const objectId = new ObjectId(recordId);

//     // Fetch old record
//     const oldRecord = await masterColl.findOne({ _id: objectId });
//     if (!oldRecord) {
//       return res.status(404).json({ error: "Record not found" });
//     }

//     // Perform update
//     const updateResult = await masterColl.updateOne(
//       { _id: objectId },
//       { $set: updates }
//     );

//     if (updateResult.modifiedCount === 0) {
//       return res.status(304).json({ message: "No changes made" });
//     }

//     // Log the change
//     await logColl.insertOne({
//       _id: new ObjectId(),
//       masterId: objectId,
//       username,
//       timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000), // JST = UTC + 9 hours
//       oldData: oldRecord,
//       newData: updates
//     });

//     res.json({ success: true, modifiedCount: updateResult.modifiedCount });
//   } catch (err) {
//     console.error("Update failed:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });


//updates masterDB
app.post("/updateMasterRecord", async (req, res) => {
  const { recordId, updates, username, collectionName } = req.body; // Add collectionName

  if (!recordId || !updates || !username || !collectionName) { // Add collectionName to validation
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterColl = db.collection(collectionName); // Use dynamic collection name
    const logColl = db.collection(`${collectionName}_Log`); // Use dynamic log collection

    const objectId = new ObjectId(recordId);

    // Fetch old record
    const oldRecord = await masterColl.findOne({ _id: objectId });
    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    // Perform update
    const updateResult = await masterColl.updateOne(
      { _id: objectId },
      { $set: updates }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(304).json({ message: "No changes made" });
    }

    // Log the change
    await logColl.insertOne({
      _id: new ObjectId(),
      masterId: objectId,
      username,
      timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000), // JST = UTC + 9 hours
      oldData: oldRecord,
      newData: updates
    });

    res.json({ success: true, modifiedCount: updateResult.modifiedCount });
  } catch (err) {
    console.error("Update failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


//updates masterDB but in batch
// Batch update multiple masterDB records
app.post("/batchUpdateMasterRecords", async (req, res) => {
  const { recordIds, updates, username, collectionName } = req.body;

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0 || !updates || !username || !collectionName) {
    return res.status(400).json({ error: "Missing required fields or invalid recordIds array" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterColl = db.collection(collectionName);
    const logColl = db.collection(`${collectionName}_Log`);

    // Convert string IDs to ObjectIds
    const objectIds = recordIds.map(id => new ObjectId(id));

    // Fetch old records for logging
    const oldRecords = await masterColl.find({ _id: { $in: objectIds } }).toArray();
    
    if (oldRecords.length === 0) {
      return res.status(404).json({ error: "No records found" });
    }

    // Perform batch update
    const updateResult = await masterColl.updateMany(
      { _id: { $in: objectIds } },
      { $set: updates }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(304).json({ message: "No changes made" });
    }

    // Log each change
    const logEntries = oldRecords.map(oldRecord => ({
      _id: new ObjectId(),
      masterId: oldRecord._id,
      username,
      timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000), // JST = UTC + 9 hours
      oldData: oldRecord,
      newData: updates,
      batchUpdate: true // Flag to indicate this was part of a batch update
    }));

    await logColl.insertMany(logEntries);

    res.json({ 
      success: true, 
      modifiedCount: updateResult.modifiedCount,
      matchedCount: updateResult.matchedCount 
    });
  } catch (err) {
    console.error("Batch update failed:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});


// //this uploads or updates the image in the masterDB mongoDB
// app.post("/uploadMasterImage", async (req, res) => {
//   const { base64, label, recordId, username } = req.body;

//   if (!base64 || !recordId || !username) {
//     return res.status(400).json({ error: "Missing required fields" });
//   }

//   try {
//     await client.connect();
//     const db = client.db("Sasaki_Coating_MasterDB");
//     const masterDB = db.collection("masterDB");
//     const logColl = db.collection("masterDB_Log");

//     const objectId = new ObjectId(recordId);
//     const oldRecord = await masterDB.findOne({ _id: objectId });

//     if (!oldRecord) {
//       return res.status(404).json({ error: "Record not found" });
//     }

//     const 品番 = oldRecord["品番"] || "unknownPart";
//     const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
//     const fileName = `${品番}.jpg`;
//     const filePath = `masterImage/${fileName}`;
//     const file = admin.storage().bucket().file(filePath);

//     const buffer = Buffer.from(base64, "base64");

//     // Use a random token or constant token (example below)
//     const downloadToken = "masterDBToken69";

//     await file.save(buffer, {
//       metadata: {
//         contentType: "image/jpeg",
//         metadata: {
//           firebaseStorageDownloadTokens: downloadToken
//         }
//       }
//     });

//     // ✅ Firebase-style URL (supports preview/download with token)
//     const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

//     // Update masterDB document
//     await masterDB.updateOne({ _id: objectId }, { $set: { imageURL: firebaseUrl } });

//     // Log the update
//     await logColl.insertOne({
//       _id: new ObjectId(),
//       masterId: objectId,
//       username,
//       timestamp: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })),
//       oldData: oldRecord,
//       newData: { imageURL: firebaseUrl }
//     });

//     res.json({ message: "Image uploaded and record updated", imageURL: firebaseUrl });
//   } catch (error) {
//     console.error("Error uploading master image:", error);
//     res.status(500).json({ error: "Error uploading image" });
//   }
// });


//this uploads or updates the image in the masterDB mongoDB
app.post("/uploadMasterImage", async (req, res) => {
  const { base64, label, recordId, username, collectionName } = req.body; // Add collectionName

  if (!base64 || !recordId || !username || !collectionName) { // Add collectionName to validation
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const collection = db.collection(collectionName); // Use dynamic collection name
    const logColl = db.collection(`${collectionName}_Log`); // Use dynamic log collection

    const objectId = new ObjectId(recordId);
    const oldRecord = await collection.findOne({ _id: objectId }); // Use dynamic collection

    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    const 品番 = oldRecord["品番"] || oldRecord["材料品番"] || "unknownPart"; // Support both 品番 and 材料品番
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${品番}.jpg`;
    const filePath = `masterImage/${fileName}`;
    const file = admin.storage().bucket().file(filePath);

    const buffer = Buffer.from(base64, "base64");

    // Use a random token or constant token (example below)
    const downloadToken = "masterDBToken69";

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    // ✅ Firebase-style URL (supports preview/download with token)
    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

    // Update document in the specified collection
    await collection.updateOne({ _id: objectId }, { $set: { imageURL: firebaseUrl } });

    // Log the update
    await logColl.insertOne({
      _id: new ObjectId(),
      masterId: objectId,
      username,
      timestamp: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })),
      oldData: oldRecord,
      newData: { imageURL: firebaseUrl }
    });

    res.json({ message: "Image uploaded and record updated", imageURL: firebaseUrl });
  } catch (error) {
    console.error("Error uploading master image:", error);
    res.status(500).json({ error: "Error uploading image" });
  }
});



// //inserts data to masterDB
// app.post("/submitToMasterDB", async (req, res) => {
//   const { data, username } = req.body;

//   if (!data || !username) {
//     return res.status(400).json({ error: "Missing data or username" });
//   }

//   try {
//     await client.connect();
//     const db = client.db("Sasaki_Coating_MasterDB");
//     const masterDB = db.collection("masterDB");
//     const logColl = db.collection("masterDB_Log");

//     // Insert the data
//     const result = await masterDB.insertOne(data);

//     // Log the insert
//     await logColl.insertOne({
//       _id: new ObjectId(),
//       masterId: result.insertedId,
//       action: "insert",
//       username,
//       timestamp: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })),
//       newData: data
//     });

//     res.status(201).json({
//       message: "Data inserted and logged successfully",
//       insertedId: result.insertedId,
//     });
//   } catch (error) {
//     console.error("Error inserting to masterDB:", error);
//     res.status(500).json({ error: "Error inserting to masterDB" });
//   }
// });

//inserts data to masterDB
app.post("/submitToMasterDB", async (req, res) => {
  const { data, username, collectionName } = req.body; // Add collectionName

  if (!data || !username || !collectionName) { // Add collectionName to validation
    return res.status(400).json({ error: "Missing data, username, or collectionName" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const collection = db.collection(collectionName); // Use dynamic collection name
    const logColl = db.collection(`${collectionName}_Log`); // Use dynamic log collection

    // Insert the data
    const result = await collection.insertOne(data);

    // Log the insert
    await logColl.insertOne({
      _id: new ObjectId(),
      masterId: result.insertedId,
      action: "insert",
      username,
      timestamp: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })),
      newData: data
    });

    res.status(201).json({
      message: "Data inserted and logged successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error inserting to masterDB:", error);
    res.status(500).json({ error: "Error inserting to masterDB" });
  }
});

// API Route for Fetching Unique Factory Values from Different Collections
// Usage: GET /api/factories/:collection
// Collections supported: kensaDB, pressDB, SRSDB, slitDB

app.get('/api/factories/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        
        // Validate collection name to prevent injection
        const validCollections = ['kensaDB', 'pressDB', 'SRSDB', 'slitDB'];
        if (!validCollections.includes(collection)) {
            return res.status(400).json({ 
                error: 'Invalid collection name',
                validCollections: validCollections
            });
        }

        console.log(`📋 Fetching unique factory values from ${collection}...`);

        // Connect to submittedDB database
        const db = client.db('submittedDB');
        const targetCollection = db.collection(collection);

        // Aggregate to get unique factory (工場) values
        const uniqueFactories = await targetCollection.aggregate([
            {
                $match: {
                    '工場': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$工場'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueFactories.length} unique factories in ${collection}`);

        res.json({
            success: true,
            collection: collection,
            factories: uniqueFactories.map(item => item.factory),
            count: uniqueFactories.length
        });

    } catch (error) {
        console.error(`❌ Error fetching factories from ${req.params.collection}:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch factory list',
            message: error.message,
            collection: req.params.collection
        });
    }
});

// Alternative route with query parameter instead of path parameter
// Usage: GET /api/factories?collection=kensaDB
app.get('/api/factories', async (req, res) => {
    try {
        const { collection } = req.query;
        
        if (!collection) {
            return res.status(400).json({ 
                error: 'Collection parameter is required',
                usage: 'GET /api/factories?collection=kensaDB'
            });
        }

        // Validate collection name to prevent injection
        const validCollections = ['kensaDB', 'pressDB', 'SRSDB', 'slitDB'];
        if (!validCollections.includes(collection)) {
            return res.status(400).json({ 
                error: 'Invalid collection name',
                validCollections: validCollections
            });
        }

        console.log(`📋 Fetching unique factory values from ${collection}...`);

        // Connect to submittedDB database
        const db = client.db('submittedDB');
        const targetCollection = db.collection(collection);

        // Aggregate to get unique factory (工場) values
        const uniqueFactories = await targetCollection.aggregate([
            {
                $match: {
                    '工場': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$工場'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueFactories.length} unique factories in ${collection}`);

        res.json({
            success: true,
            collection: collection,
            factories: uniqueFactories.map(item => item.factory),
            count: uniqueFactories.length
        });

    } catch (error) {
        console.error(`❌ Error fetching factories from ${req.query.collection}:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch factory list',
            message: error.message,
            collection: req.query.collection
        });
    }
});




// Batch route to get factories from multiple collections at once
// Usage: POST /api/factories/batch with body: { collections: ['kensaDB', 'pressDB'] }


/*

Start of unique dropdown values for filtering

*/
app.post('/api/factories/batch', async (req, res) => {
    try {
        const { collections } = req.body;
        
        if (!collections || !Array.isArray(collections)) {
            return res.status(400).json({ 
                error: 'Collections array is required',
                usage: 'POST /api/factories/batch with body: { collections: ["kensaDB", "pressDB"] }'
            });
        }

        // Validate all collection names
        const validCollections = ['kensaDB', 'pressDB', 'SRSDB', 'slitDB'];
        const invalidCollections = collections.filter(col => !validCollections.includes(col));
        
        if (invalidCollections.length > 0) {
            return res.status(400).json({ 
                error: 'Invalid collection names found',
                invalidCollections: invalidCollections,
                validCollections: validCollections
            });
        }

        console.log(`📋 Fetching unique factory values from multiple collections: ${collections.join(', ')}`);

        const db = client.db('submittedDB');
        const results = {};

        // Process each collection
        for (const collectionName of collections) {
            try {
                const targetCollection = db.collection(collectionName);

                const uniqueFactories = await targetCollection.aggregate([
                    {
                        $match: {
                            '工場': { $exists: true, $ne: null, $ne: '' }
                        }
                    },
                    {
                        $group: {
                            _id: '$工場'
                        }
                    },
                    {
                        $sort: { '_id': 1 }
                    },
                    {
                        $project: {
                            _id: 0,
                            factory: '$_id'
                        }
                    }
                ]).toArray();

                results[collectionName] = {
                    factories: uniqueFactories.map(item => item.factory),
                    count: uniqueFactories.length
                };

                console.log(`✅ Found ${uniqueFactories.length} unique factories in ${collectionName}`);

            } catch (collectionError) {
                console.error(`❌ Error processing ${collectionName}:`, collectionError);
                results[collectionName] = {
                    error: collectionError.message,
                    factories: [],
                    count: 0
                };
            }
        }

        res.json({
            success: true,
            results: results,
            totalCollections: collections.length
        });

    } catch (error) {
        console.error('❌ Error in batch factory fetch:', error);
        res.status(500).json({ 
            error: 'Failed to fetch factory lists',
            message: error.message
        });
    }
});


// Route to get unique factory values from Master DB
app.get('/api/masterdb/factories', async (req, res) => {
    try {
        console.log('📋 Fetching unique factory values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueFactories = await collection.aggregate([
            {
                $match: {
                    '工場': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$工場'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueFactories.length} unique factories in Master DB`);

        res.json({
            success: true,
            data: uniqueFactories.map(item => item.value),
            count: uniqueFactories.length
        });

    } catch (error) {
        console.error('❌ Error fetching factories from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch factory list',
            message: error.message
        });
    }
});

// Route to get unique R/L values from Master DB
app.get('/api/masterdb/rl', async (req, res) => {
    try {
        console.log('📋 Fetching unique R/L values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueRL = await collection.aggregate([
            {
                $match: {
                    'R/L': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$R/L'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueRL.length} unique R/L values in Master DB`);

        res.json({
            success: true,
            data: uniqueRL.map(item => item.value),
            count: uniqueRL.length
        });

    } catch (error) {
        console.error('❌ Error fetching R/L values from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch R/L list',
            message: error.message
        });
    }
});

// Route to get unique color values from Master DB
app.get('/api/masterdb/colors', async (req, res) => {
    try {
        console.log('📋 Fetching unique color values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueColors = await collection.aggregate([
            {
                $match: {
                    '色': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$色'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueColors.length} unique colors in Master DB`);

        res.json({
            success: true,
            data: uniqueColors.map(item => item.value),
            count: uniqueColors.length
        });

    } catch (error) {
        console.error('❌ Error fetching colors from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch color list',
            message: error.message
        });
    }
});

// Route to get unique equipment values from Master DB
app.get('/api/masterdb/equipment', async (req, res) => {
    try {
        console.log('📋 Fetching unique equipment values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueEquipment = await collection.aggregate([
            {
                $match: {
                    '加工設備': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$加工設備'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueEquipment.length} unique equipment values in Master DB`);

        res.json({
            success: true,
            data: uniqueEquipment.map(item => item.value),
            count: uniqueEquipment.length
        });

    } catch (error) {
        console.error('❌ Error fetching equipment from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch equipment list',
            message: error.message
        });
    }
});

// Route to get unique model values from Master DB
app.get('/api/masterdb/models', async (req, res) => {
    try {
        console.log('📋 Fetching unique model values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueModels = await collection.aggregate([
            {
                $match: {
                    'モデル': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$モデル'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueModels.length} unique models in Master DB`);

        res.json({
            success: true,
            data: uniqueModels.map(item => item.value),
            count: uniqueModels.length
        });

    } catch (error) {
        console.error('❌ Error fetching models from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch model list',
            message: error.message
        });
    }
});

// Route to get unique shape values from Master DB
app.get('/api/masterdb/shapes', async (req, res) => {
    try {
        console.log('📋 Fetching unique shape values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueShapes = await collection.aggregate([
            {
                $match: {
                    '形状': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$形状'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueShapes.length} unique shapes in Master DB`);

        res.json({
            success: true,
            data: uniqueShapes.map(item => item.value),
            count: uniqueShapes.length
        });

    } catch (error) {
        console.error('❌ Error fetching shapes from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch shape list',
            message: error.message
        });
    }
});

// Route to get unique material values from Master DB
app.get('/api/masterdb/materials', async (req, res) => {
    try {
        console.log('📋 Fetching unique material values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        const uniqueMaterials = await collection.aggregate([
            {
                $match: {
                    '材料': { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$材料'
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();

        console.log(`✅ Found ${uniqueMaterials.length} unique materials in Master DB`);

        res.json({
            success: true,
            data: uniqueMaterials.map(item => item.value),
            count: uniqueMaterials.length
        });

    } catch (error) {
        console.error('❌ Error fetching materials from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch material list',
            message: error.message
        });
    }
});

// Batch route to get all filter values at once (more efficient)
app.get('/api/masterdb/filters', async (req, res) => {
    try {
        console.log('📋 Fetching all filter values from Master DB...');

        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('masterDB');

        // Define all the fields we want to get unique values for
        const fields = [
            { field: '工場', key: 'factories' },
            { field: 'R/L', key: 'rl' },
            { field: '色', key: 'colors' },
            { field: '加工設備', key: 'equipment' },
            { field: 'モデル', key: 'models' },
            { field: '形状', key: 'shapes' },
            { field: '材料', key: 'materials' }
        ];

        const results = {};

        // Process each field
        for (const { field, key } of fields) {
            try {
                const uniqueValues = await collection.aggregate([
                    {
                        $match: {
                            [field]: { $exists: true, $ne: null, $ne: '' }
                        }
                    },
                    {
                        $group: {
                            _id: `$${field}`
                        }
                    },
                    {
                        $sort: { '_id': 1 }
                    },
                    {
                        $project: {
                            _id: 0,
                            value: '$_id'
                        }
                    }
                ]).toArray();

                results[key] = {
                    data: uniqueValues.map(item => item.value),
                    count: uniqueValues.length
                };

                console.log(`✅ Found ${uniqueValues.length} unique ${key} values`);

            } catch (fieldError) {
                console.error(`❌ Error processing field ${field}:`, fieldError);
                results[key] = {
                    data: [],
                    count: 0,
                    error: fieldError.message
                };
            }
        }

        res.json({
            success: true,
            filters: results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching all filter values from Master DB:', error);
        res.status(500).json({ 
            error: 'Failed to fetch filter values',
            message: error.message
        });
    }
});



// ==================== NODA WAREHOUSE MANAGEMENT API ROUTES ====================
// Copy this entire section to your server.js file

// NODA Requests API Route
app.post("/api/noda-requests", async (req, res) => {
  const { action, filters = {}, page = 1, limit = 10, sort = {}, requestId, data } = req.body;

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const requestsCollection = db.collection("nodaRequestDB");
    const inventoryCollection = db.collection("nodaInventoryDB");

    switch (action) {
      case 'getNodaRequests':
        try {
          // Build MongoDB query from filters
          let query = {};

          // Status filter
          if (filters.status) {
            query.status = filters.status;
          }

          // Part number filter
          if (filters['品番']) {
            query['品番'] = filters['品番'];
          }

          // Back number filter
          if (filters['背番号']) {
            query['背番号'] = filters['背番号'];
          }

          // Date range filter (using 納入指示日 deadline field)
          if (filters.dateRange) {
            query['納入指示日'] = {};
            if (filters.dateRange.from) {
              query['納入指示日'].$gte = filters.dateRange.from;
            }
            if (filters.dateRange.to) {
              query['納入指示日'].$lte = filters.dateRange.to;
            }
          }

          // Search filter (searches across multiple fields)
          if (filters.search) {
            const searchRegex = new RegExp(filters.search, 'i');
            query.$or = [
              { 'requestNumber': searchRegex },
              { '品番': searchRegex },
              { '背番号': searchRegex },
              { 'status': searchRegex }
            ];
          }

          console.log('NODA Requests Query:', JSON.stringify(query, null, 2));

          // Build sort object
          let sortObj = {};
          if (sort.column) {
            sortObj[sort.column] = sort.direction || 1;
          } else {
            sortObj['createdAt'] = -1; // Default sort by creation date descending
          }

          // Get total count for pagination
          const totalCount = await requestsCollection.countDocuments(query);

          // Get paginated data
          const skip = (page - 1) * limit;
          const requests = await requestsCollection
            .find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();

          // ===== FIFO INVENTORY CALCULATION =====
          // Calculate which requests can actually be picked based on PHYSICAL inventory
          // Priority: deadline date (納入指示日) - earliest deadline first
          // IMPORTANT: Only consider requests with deadline >= today (ignore past deadlines)
          
          // Get today's date in YYYY-MM-DD format (matching the 納入指示日 format)
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          
          // Step 1: Get ALL active requests with deadline >= today, sorted by deadline (for FIFO calculation)
          const allActiveRequests = await requestsCollection
            .find({ 
              status: { $nin: ['completed', 'cancelled'] },
              // Only include requests where deadline is today or in the future
              納入指示日: { $gte: todayStr }
            })
            .sort({ '納入指示日': 1, createdAt: 1 }) // Sort by deadline first, then createdAt for same deadline
            .toArray();
          
          // Step 2: Get current PHYSICAL inventory for all unique 背番号
          const allBackNumbers = [...new Set(allActiveRequests.flatMap(r => 
            r.lineItems ? r.lineItems.map(li => li.背番号) : [r.背番号]
          ).filter(Boolean))];
          
          // ✅ OPTIMIZED: Single batch query for ALL inventory records instead of N separate queries
          const inventoryMap = new Map();
          
          if (allBackNumbers.length > 0) {
            const batchInventoryResults = await inventoryCollection.aggregate([
              { $match: { 背番号: { $in: allBackNumbers } } },
              {
                $addFields: {
                  timeStampDate: {
                    $cond: {
                      if: { $type: "$timeStamp" },
                      then: {
                        $cond: {
                          if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                          then: { $dateFromString: { dateString: "$timeStamp" } },
                          else: "$timeStamp"
                        }
                      },
                      else: new Date()
                    }
                  }
                }
              },
              { $sort: { timeStampDate: -1 } },
              // Group by 背番号 and take the latest record for each
              {
                $group: {
                  _id: "$背番号",
                  latestRecord: { $first: "$$ROOT" }
                }
              }
            ]).toArray();
            
            // Build inventory map from batch results
            for (const result of batchInventoryResults) {
              const inv = result.latestRecord;
              inventoryMap.set(result._id, {
                physicalQuantity: inv.physicalQuantity || inv.runningQuantity || 0,
                reservedQuantity: inv.reservedQuantity || 0,
                availableQuantity: inv.availableQuantity || inv.runningQuantity || 0
              });
            }
            
            // Set default for any back numbers not found in inventory
            for (const backNumber of allBackNumbers) {
              if (!inventoryMap.has(backNumber)) {
                inventoryMap.set(backNumber, { physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0 });
              }
            }
          }
          
          // Step 3: Calculate FIFO allocation for each request
          // Track remaining physical inventory per 背番号 as we allocate
          const remainingPhysical = new Map();
          for (const [backNumber, inv] of inventoryMap) {
            remainingPhysical.set(backNumber, inv.physicalQuantity);
          }
          
          // Calculate pickable quantities for each request in FIFO order
          const fifoAllocation = new Map(); // requestId -> { canPick, totalNeeded, shortfall, lineItemStatus }
          
          for (const request of allActiveRequests) {
            const requestId = request._id.toString();
            const lineItems = request.lineItems || [{ 背番号: request.背番号, quantity: request.quantity, status: 'pending' }];
            
            let totalCanPick = 0;
            let totalNeeded = 0;
            let lineItemStatuses = [];
            
            for (const lineItem of lineItems) {
              const backNumber = lineItem.背番号;
              const lineStatus = lineItem.status || 'pending';
              
              // ✅ FIX: Skip completed/cancelled line items - they don't need physical inventory
              if (lineStatus === 'completed' || lineStatus === 'cancelled') {
                lineItemStatuses.push({
                  背番号: backNumber,
                  lineNumber: lineItem.lineNumber,
                  needed: 0,
                  canPick: 0,
                  shortfall: 0,
                  fifoStatus: 'completed' // Mark as completed
                });
                continue;
              }
              
              // For pending/in-progress items, use the full quantity
              const needed = lineItem.quantity || 0;
              const remaining = remainingPhysical.get(backNumber) || 0;
              const canPick = Math.min(remaining, needed);
              
              totalCanPick += canPick;
              totalNeeded += needed;
              
              // Deduct from remaining physical for next requests
              remainingPhysical.set(backNumber, Math.max(0, remaining - canPick));
              
              lineItemStatuses.push({
                背番号: backNumber,
                lineNumber: lineItem.lineNumber,
                needed: needed,
                canPick: canPick,
                shortfall: needed - canPick,
                fifoStatus: canPick === 0 ? 'waiting' : canPick < needed ? 'partial' : 'sufficient'
              });
            }
            
            // Determine overall FIFO status for this request
            let fifoStatus;
            if (totalNeeded === 0) {
              // All line items are completed
              fifoStatus = 'completed';
            } else if (totalCanPick === 0) {
              fifoStatus = 'waiting-for-inventory';
            } else if (totalCanPick < totalNeeded) {
              fifoStatus = 'partial-inventory';
            } else {
              fifoStatus = 'sufficient';
            }
            
            fifoAllocation.set(requestId, {
              fifoStatus: fifoStatus,
              totalCanPick: totalCanPick,
              totalNeeded: totalNeeded,
              shortfall: totalNeeded - totalCanPick,
              lineItemStatuses: lineItemStatuses
            });
          }
          
          // Step 4: Enrich the paginated requests with FIFO allocation data
          const enrichedRequests = requests.map(request => {
            const requestId = request._id.toString();
            
            // ✅ FIX: Completed/cancelled requests don't need FIFO calculation
            // They're already done - no inventory allocation needed
            if (request.status === 'completed' || request.status === 'cancelled') {
              return {
                ...request,
                fifoAllocation: {
                  fifoStatus: 'completed', // Special status for completed
                  totalCanPick: 0,
                  totalNeeded: 0,
                  shortfall: 0,
                  lineItemStatuses: []
                },
                dynamicInventoryStatus: 'completed' // Don't show inventory warnings
              };
            }
            
            // ✅ NEW: Check if deadline has passed
            const requestDeadline = request.納入指示日;
            const isPastDeadline = requestDeadline && requestDeadline < todayStr;
            
            if (isPastDeadline) {
              // Past deadline - mark as missed/overdue, don't show inventory status
              return {
                ...request,
                fifoAllocation: {
                  fifoStatus: 'past-deadline',
                  totalCanPick: 0,
                  totalNeeded: 0,
                  shortfall: 0,
                  lineItemStatuses: []
                },
                dynamicInventoryStatus: 'past-deadline',
                isPastDeadline: true
              };
            }
            
            const fifoData = fifoAllocation.get(requestId);
            
            if (fifoData) {
              return {
                ...request,
                fifoAllocation: fifoData,
                // Add a computed field for display
                dynamicInventoryStatus: fifoData.fifoStatus
              };
            }
            
            // Fallback for requests not in FIFO (shouldn't happen for active requests with valid deadlines)
            return {
              ...request,
              fifoAllocation: {
                fifoStatus: request.overallInventoryStatus || 'unknown',
                totalCanPick: 0,
                totalNeeded: 0,
                shortfall: 0,
                lineItemStatuses: []
              },
              dynamicInventoryStatus: request.overallInventoryStatus || 'unknown'
            };
          });

          // Calculate statistics - use base query WITHOUT status filter
          // so card counts always show totals, not filtered counts
          const statsQuery = { ...query };
          delete statsQuery.status; // Remove status filter for statistics
          const statistics = await calculateNodaStatistics(requestsCollection, statsQuery);

          res.json({
            success: true,
            data: enrichedRequests,
            statistics: statistics,
            pagination: {
              currentPage: page,
              totalPages: Math.ceil(totalCount / limit),
              totalItems: totalCount,
              itemsPerPage: limit
            }
          });

        } catch (error) {
          console.error("Error in getNodaRequests:", error);
          res.status(500).json({ error: "Failed to fetch requests", details: error.message });
        }
        break;

      case 'getRequestById':
        try {
          if (!requestId) {
            return res.status(400).json({ error: "Request ID is required" });
          }

          const request = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          
          if (!request) {
            return res.status(404).json({ error: "Request not found" });
          }

          // ===== DYNAMICALLY RECALCULATE RESERVED & SHORTFALL =====
          // Based on PHYSICAL inventory and deadline-based FIFO allocation
          
          // Get today's date in YYYY-MM-DD format
          const detailToday = new Date();
          const detailTodayStr = `${detailToday.getFullYear()}-${String(detailToday.getMonth() + 1).padStart(2, '0')}-${String(detailToday.getDate()).padStart(2, '0')}`;
          
          // Get all active requests with deadline >= today, sorted by deadline
          const activeRequestsForFifo = await requestsCollection
            .find({ 
              status: { $nin: ['completed', 'cancelled'] },
              納入指示日: { $gte: detailTodayStr }
            })
            .sort({ '納入指示日': 1, createdAt: 1 })
            .toArray();
          
          // Get all unique 背番号 from active requests
          const allSebanForFifo = [...new Set(activeRequestsForFifo.flatMap(r => 
            r.lineItems ? r.lineItems.map(li => li.背番号) : [r.背番号]
          ).filter(Boolean))];
          
          // Get current PHYSICAL inventory for all 背番号
          const fifoInventoryMap = new Map();
          if (allSebanForFifo.length > 0) {
            const invResults = await inventoryCollection.aggregate([
              { $match: { 背番号: { $in: allSebanForFifo } } },
              {
                $addFields: {
                  timeStampDate: {
                    $cond: {
                      if: { $type: "$timeStamp" },
                      then: {
                        $cond: {
                          if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                          then: { $dateFromString: { dateString: "$timeStamp" } },
                          else: "$timeStamp"
                        }
                      },
                      else: new Date()
                    }
                  }
                }
              },
              { $sort: { timeStampDate: -1 } },
              { $group: { _id: "$背番号", latestRecord: { $first: "$$ROOT" } } }
            ]).toArray();
            
            for (const result of invResults) {
              const inv = result.latestRecord;
              fifoInventoryMap.set(result._id, inv.physicalQuantity || inv.runningQuantity || 0);
            }
          }
          
          // Track remaining physical inventory as we allocate in FIFO order
          const remainingPhysicalForFifo = new Map(fifoInventoryMap);
          
          // Process all requests in deadline order to calculate what's available for THIS request
          let enrichedLineItems = null;
          
          for (const activeReq of activeRequestsForFifo) {
            const isCurrentRequest = activeReq._id.toString() === requestId;
            const lineItems = activeReq.lineItems || [{ 背番号: activeReq.背番号, quantity: activeReq.quantity, status: 'pending' }];
            
            if (isCurrentRequest && request.lineItems) {
              // Calculate reserved/shortfall for THIS request's line items
              enrichedLineItems = request.lineItems.map(lineItem => {
                const lineStatus = lineItem.status || 'pending';
                
                // Completed/cancelled line items don't need inventory
                if (lineStatus === 'completed' || lineStatus === 'cancelled') {
                  return {
                    ...lineItem,
                    reservedQuantity: lineItem.quantity, // Already picked
                    shortfallQuantity: 0,
                    inventoryStatus: 'sufficient'
                  };
                }
                
                const backNumber = lineItem.背番号;
                const needed = lineItem.quantity || 0;
                const remaining = remainingPhysicalForFifo.get(backNumber) || 0;
                const canReserve = Math.min(remaining, needed);
                const shortfall = Math.max(0, needed - remaining);
                
                // Deduct from remaining for next requests
                remainingPhysicalForFifo.set(backNumber, Math.max(0, remaining - canReserve));
                
                // Determine inventory status
                let inventoryStatus;
                if (remaining === 0) {
                  inventoryStatus = 'none';
                } else if (remaining < needed) {
                  inventoryStatus = 'insufficient';
                } else {
                  inventoryStatus = 'sufficient';
                }
                
                return {
                  ...lineItem,
                  reservedQuantity: canReserve,
                  shortfallQuantity: shortfall,
                  inventoryStatus: inventoryStatus
                };
              });
              
              // We've processed the current request, can break if we only need this one
              break;
            } else {
              // This is a prior request (earlier deadline) - deduct its quantities
              for (const lineItem of lineItems) {
                const lineStatus = lineItem.status || 'pending';
                if (lineStatus === 'completed' || lineStatus === 'cancelled') continue;
                
                const backNumber = lineItem.背番号;
                const needed = lineItem.quantity || 0;
                const remaining = remainingPhysicalForFifo.get(backNumber) || 0;
                const deduct = Math.min(remaining, needed);
                remainingPhysicalForFifo.set(backNumber, Math.max(0, remaining - deduct));
              }
            }
          }
          
          // If request has past deadline, still show inventory info but mark it
          if (!enrichedLineItems && request.lineItems) {
            // Request has past deadline - show physical inventory without FIFO deduction
            enrichedLineItems = await Promise.all(request.lineItems.map(async (lineItem) => {
              const lineStatus = lineItem.status || 'pending';
              
              if (lineStatus === 'completed' || lineStatus === 'cancelled') {
                return {
                  ...lineItem,
                  reservedQuantity: lineItem.quantity,
                  shortfallQuantity: 0,
                  inventoryStatus: 'sufficient'
                };
              }
              
              // Get current physical inventory for this item
              const invResult = await inventoryCollection.aggregate([
                { $match: { 背番号: lineItem.背番号 } },
                {
                  $addFields: {
                    timeStampDate: {
                      $cond: {
                        if: { $type: "$timeStamp" },
                        then: {
                          $cond: {
                            if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                            then: { $dateFromString: { dateString: "$timeStamp" } },
                            else: "$timeStamp"
                          }
                        },
                        else: new Date()
                      }
                    }
                  }
                },
                { $sort: { timeStampDate: -1 } },
                { $limit: 1 }
              ]).toArray();
              
              const physicalQty = invResult.length > 0 ? (invResult[0].physicalQuantity || invResult[0].runningQuantity || 0) : 0;
              const needed = lineItem.quantity || 0;
              
              return {
                ...lineItem,
                reservedQuantity: Math.min(physicalQty, needed),
                shortfallQuantity: Math.max(0, needed - physicalQty),
                inventoryStatus: physicalQty === 0 ? 'none' : physicalQty < needed ? 'insufficient' : 'sufficient',
                pastDeadline: true // Mark as past deadline
              };
            }));
          }
          
          // Return enriched request
          const enrichedRequest = {
            ...request,
            lineItems: enrichedLineItems || request.lineItems
          };

          res.json({
            success: true,
            data: enrichedRequest
          });

        } catch (error) {
          console.error("Error in getRequestById:", error);
          res.status(500).json({ error: "Failed to fetch request", details: error.message });
        }
        break;

      case 'createRequest':
        try {
          if (!data || !data.品番 || !data.背番号 || !data.quantity || !data.date) {
            return res.status(400).json({ error: "Missing required fields" });
          }

          // Get user information from request (assuming it's passed in the data)
          const userName = data.userName || 'Unknown User';

          // Check two-stage inventory availability
          const inventoryItem = await inventoryCollection.findOne({ 
            背番号: data.背番号 
          }, { 
            sort: { timeStamp: -1 } 
          });

          if (!inventoryItem) {
            return res.status(400).json({ error: "Item not found in inventory" });
          }

          // Check available quantity (not physical quantity)
          const availableQuantity = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;
          if (availableQuantity < data.quantity) {
            return res.status(400).json({ 
              error: `Insufficient inventory. Available: ${availableQuantity}, Requested: ${data.quantity}` 
            });
          }

          // Generate request number
          const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const todayCount = await requestsCollection.countDocuments({
            createdAt: {
              $gte: todayStart,
              $lte: todayEnd
            }
          });

          const requestNumber = `NODAPO-${today}-${String(todayCount + 1).padStart(3, '0')}`;

          // Create request
          const newRequest = {
            requestNumber: requestNumber,
            品番: data.品番,
            背番号: data.背番号,
            date: data.date,
            quantity: parseInt(data.quantity),
            status: 'pending',
            createdBy: userName,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const result = await requestsCollection.insertOne(newRequest);

          // Insert two-stage inventory transaction record (banking style)
          const currentPhysical = inventoryItem.physicalQuantity || inventoryItem.runningQuantity || 0;
          const currentReserved = inventoryItem.reservedQuantity || 0;
          const currentAvailable = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;

          const newReservedQuantity = currentReserved + parseInt(data.quantity);
          const newAvailableQuantity = currentAvailable - parseInt(data.quantity);

          const inventoryTransaction = {
            背番号: data.背番号,
            品番: data.品番,
            timeStamp: new Date(),
            Date: data.date,
            
            // Two-stage inventory fields
            physicalQuantity: currentPhysical, // Physical stock unchanged
            reservedQuantity: newReservedQuantity, // Increase reserved
            availableQuantity: newAvailableQuantity, // Decrease available
            
            // Legacy field for compatibility
            runningQuantity: newAvailableQuantity,
            lastQuantity: currentAvailable,
            
            action: `Reservation (+${data.quantity})`,
            source: `Freya Admin - ${userName}`,
            requestId: result.insertedId.toString(),
            note: `Reserved ${data.quantity} units for picking request ${requestNumber}`
          };

          await inventoryCollection.insertOne(inventoryTransaction);

          res.json({
            success: true,
            data: { ...newRequest, _id: result.insertedId }
          });

        } catch (error) {
          console.error("Error in createRequest:", error);
          res.status(500).json({ error: "Failed to create request", details: error.message });
        }
        break;

      case 'checkDuplicateRequest':
        try {
          const { deliveryNote, deliveryOrder, deadlineDate } = req.body;
          
          if (!deliveryNote || !deliveryOrder || !deadlineDate) {
            return res.json({ success: true, exists: false });
          }

          // Search for existing request with same 納品書番号, 便, and 納入指示日
          const existingRequest = await requestsCollection.findOne({
            納品書番号: deliveryNote,
            便: deliveryOrder,
            納入指示日: deadlineDate
          });

          if (existingRequest) {
            res.json({
              success: true,
              exists: true,
              request: {
                _id: existingRequest._id.toString(),
                requestNumber: existingRequest.requestNumber,
                status: existingRequest.status,
                納品書番号: existingRequest.納品書番号,
                便: existingRequest.便,
                納入指示日: existingRequest.納入指示日,
                totalItems: existingRequest.totalItems || (existingRequest.lineItems ? existingRequest.lineItems.length : 0),
                createdAt: existingRequest.createdAt,
                createdBy: existingRequest.createdBy
              }
            });
          } else {
            res.json({
              success: true,
              exists: false
            });
          }

        } catch (error) {
          console.error("Error in checkDuplicateRequest:", error);
          res.status(500).json({ error: "Failed to check duplicate", details: error.message });
        }
        break;

      case 'bulkCreateRequests':
        try {
          if (!data || !Array.isArray(data.items) || data.items.length === 0) {
            return res.status(400).json({ error: "No request items provided" });
          }

          if (!data.pickupDate) {
            return res.status(400).json({ error: "Pickup date is required for bulk request" });
          }

          // Get user information from request body
          const userName = req.body.userName || 'Unknown User';
          
          // Get mode and existingRequestId for duplicate handling
          const mode = data.mode || 'create'; // 'create', 'overwrite', or 'createNew'
          const existingRequestId = data.existingRequestId || null;
          
          let oldRequestNumber = null; // Store the old request number for overwrite mode
          
          // CRITICAL: Handle overwrite mode FIRST - unreserve inventory before validation
          if (mode === 'overwrite' && existingRequestId) {
            try {
              const existingRequest = await requestsCollection.findOne({ _id: new ObjectId(existingRequestId) });
              if (existingRequest) {
                // Store the old request number to reuse it
                oldRequestNumber = existingRequest.requestNumber;
                console.log(`🔄 Overwriting existing request: ${oldRequestNumber}`);
                
                // Reverse inventory reservations for existing request
                if (existingRequest.lineItems && existingRequest.lineItems.length > 0) {
                  console.log(`📦 Unreserving ${existingRequest.lineItems.length} items from old request`);
                  for (const lineItem of existingRequest.lineItems) {
                    // Get the latest inventory state for this item
                    const latestInventory = await inventoryCollection.aggregate([
                      { $match: { 背番号: lineItem.背番号 } },
                      {
                        $addFields: {
                          timeStampDate: {
                            $cond: {
                              if: { $type: "$timeStamp" },
                              then: {
                                $cond: {
                                  if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                                  then: { $dateFromString: { dateString: "$timeStamp" } },
                                  else: "$timeStamp"
                                }
                              },
                              else: new Date()
                            }
                          }
                        }
                      },
                      { $sort: { timeStampDate: -1 } },
                      { $limit: 1 }
                    ]).toArray();

                    if (latestInventory.length > 0) {
                      const currentInventory = latestInventory[0];
                      const currentPhysical = currentInventory.physicalQuantity || currentInventory.runningQuantity || 0;
                      const currentReserved = currentInventory.reservedQuantity || 0;
                      const currentAvailable = currentInventory.availableQuantity || currentInventory.runningQuantity || 0;

                      // ✅ FIXED: Unreserve the FULL requested quantity (not just what was available)
                      // The lineItem.quantity contains the full requested amount
                      const unreserveAmount = lineItem.quantity;
                      const newReservedQuantity = Math.max(0, currentReserved - unreserveAmount);
                      // Only add back to available what was actually reserved from it
                      const actualReservedFromAvailable = lineItem.reservedQuantity || Math.min(currentReserved, unreserveAmount);
                      const newAvailableQuantity = currentAvailable + actualReservedFromAvailable;

                      console.log(`  📤 ${lineItem.背番号}: Unreserving ${unreserveAmount} units (Reserved: ${currentReserved} → ${newReservedQuantity}, Available: ${currentAvailable} → ${newAvailableQuantity})`);

                      // Create inventory transaction to unreserve
                      const unreserveTransaction = {
                        背番号: lineItem.背番号,
                        品番: lineItem.品番,
                        timeStamp: new Date(),
                        Date: new Date().toISOString().split('T')[0],
                        
                        physicalQuantity: currentPhysical,
                        reservedQuantity: newReservedQuantity, // Decrease by FULL requested amount
                        availableQuantity: newAvailableQuantity, // Increase by what was actually taken from available
                        
                        runningQuantity: newAvailableQuantity,
                        lastQuantity: currentAvailable,
                        
                        action: `Bulk Unreservation (-${unreserveAmount})`,
                        source: `Freya Admin - ${userName}`,
                        requestId: existingRequestId,
                        bulkRequestNumber: existingRequest.requestNumber,
                        note: `Unreserved ${unreserveAmount} units - overwriting request ${existingRequest.requestNumber}`
                      };

                      await inventoryCollection.insertOne(unreserveTransaction);
                    }
                  }
                }

                // Delete the existing request
                await requestsCollection.deleteOne({ _id: new ObjectId(existingRequestId) });
                console.log(`✅ Deleted existing request ${existingRequestId} for overwrite`);
              }
            } catch (error) {
              console.error("❌ Error handling overwrite mode:", error);
              return res.status(500).json({ error: "Failed to overwrite existing request", details: error.message });
            }
          }

          let failedItems = [];
          let validItems = [];

          // First pass: Validate all items and check inventory (ALLOW PARTIAL/NO INVENTORY)
          for (const item of data.items) {
            try {
              // Validate required fields
              if (!item.品番 || !item.背番号 || !item.quantity) {
                failedItems.push({
                  背番号: item.背番号 || 'Unknown',
                  error: 'Missing required fields'
                });
                continue;
              }

              // Check inventory using aggregation pipeline for proper timestamp sorting
              const inventoryResults = await inventoryCollection.aggregate([
                { $match: { 背番号: item.背番号 } },
                {
                  $addFields: {
                    timeStampDate: {
                      $cond: {
                        if: { $type: "$timeStamp" },
                        then: {
                          $cond: {
                            if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                            then: { $dateFromString: { dateString: "$timeStamp" } },
                            else: "$timeStamp"
                          }
                        },
                        else: new Date()
                      }
                    }
                  }
                },
                { $sort: { timeStampDate: -1 } },
                { $limit: 1 }
              ]).toArray();

              if (inventoryResults.length === 0) {
                // ✅ NEW: Item not in inventory, but still add it with 0 availability
                console.log(`⚠️ ${item.背番号} not found in inventory - adding with 0 availability`);
                validItems.push({
                  ...item,
                  inventoryItem: null,
                  availableQuantity: 0,
                  reservedQuantity: 0,
                  shortfallQuantity: parseInt(item.quantity),
                  inventoryStatus: 'none'
                });
                continue;
              }

              const inventoryItem = inventoryResults[0];
              const availableQuantity = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;
              const requestedQuantity = parseInt(item.quantity);
              
              // ✅ NEW: Calculate partial reservation amounts
              const reservedQuantity = Math.min(availableQuantity, requestedQuantity);
              const shortfallQuantity = Math.max(0, requestedQuantity - availableQuantity);
              
              // Determine line item inventory status
              let inventoryStatus;
              if (availableQuantity === 0) {
                inventoryStatus = 'none'; // No inventory available
              } else if (availableQuantity < requestedQuantity) {
                inventoryStatus = 'insufficient'; // Partial inventory
              } else {
                inventoryStatus = 'sufficient'; // Full inventory available
              }

              // ✅ Item is always valid - we allow requests without inventory
              validItems.push({
                ...item,
                inventoryItem: inventoryItem,
                availableQuantity: availableQuantity,
                reservedQuantity: reservedQuantity,
                shortfallQuantity: shortfallQuantity,
                inventoryStatus: inventoryStatus
              });

            } catch (error) {
              // ✅ NEW: Even if inventory check fails, still add item with 0 inventory
              console.log(`⚠️ Error checking inventory for ${item.背番号}: ${error.message} - Adding with 0 inventory`);
              validItems.push({
                ...item,
                inventoryItem: null,
                availableQuantity: 0,
                reservedQuantity: 0,
                shortfallQuantity: parseInt(item.quantity),
                inventoryStatus: 'none'
              });
            }
          }

          // If no valid items, return error
          if (validItems.length === 0) {
            return res.status(400).json({ 
              success: false,
              error: "No valid items to process",
              failedItems: failedItems
            });
          }

          // Generate bulk request number
          let bulkRequestNumber;
          
          // Generate request number based on mode
          if (mode === 'overwrite' && oldRequestNumber) {
            // Reuse the old request number for overwrite
            bulkRequestNumber = oldRequestNumber;
          } else if (data.deliveryNote && data.deliveryOrder && data.deadlineDate) {
            // New format: 納品書番号-YYYYMMDD-便
            const deadlineFormatted = data.deadlineDate.replace(/-/g, ''); // Convert YYYY-MM-DD to YYYYMMDD
            bulkRequestNumber = `${data.deliveryNote}-${deadlineFormatted}-${data.deliveryOrder}`;
            
            // Handle createNew mode - find highest suffix and increment
            if (mode === 'createNew') {
              const baseRequestNumber = bulkRequestNumber;
              let suffix = 1;
              
              // Find all requests with this base number (with or without suffix)
              const existingRequests = await requestsCollection.find({
                requestNumber: { $regex: `^${baseRequestNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
              }).toArray();
              
              console.log(`Found ${existingRequests.length} existing requests with base: ${baseRequestNumber}`);
              
              // Find the highest suffix
              for (const req of existingRequests) {
                console.log(`Checking request: ${req.requestNumber}`);
                const match = req.requestNumber.match(/\((\d+)\)$/);
                if (match) {
                  const currentSuffix = parseInt(match[1]);
                  console.log(`Found suffix: ${currentSuffix}`);
                  if (currentSuffix >= suffix) {
                    suffix = currentSuffix + 1;
                  }
                } else if (req.requestNumber === baseRequestNumber) {
                  // Base request exists without suffix, next should be (1)
                  console.log(`Found base request without suffix`);
                  // suffix is already 1
                }
              }
              
              bulkRequestNumber = `${baseRequestNumber}(${suffix})`;
              console.log(`Created new request number with suffix: ${bulkRequestNumber}`);
            }
          } else {
            // Fallback to old format: NODAPO-YYYYMMDD-001
            const deadlineDate = data.deadlineDate || new Date().toISOString().split('T')[0];
            const deadlineFormatted = deadlineDate.replace(/-/g, '');
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const todayCount = await requestsCollection.countDocuments({
              createdAt: {
                $gte: todayStart,
                $lte: todayEnd
              }
            });

            bulkRequestNumber = `NODAPO-${deadlineFormatted}-${String(todayCount + 1).padStart(3, '0')}`;
          }

          // ✅ Calculate overall inventory status for the request
          const hasNoInventory = validItems.every(item => item.inventoryStatus === 'none');
          const hasPartialInventory = validItems.some(item => item.inventoryStatus === 'insufficient' || item.inventoryStatus === 'none');
          const hasSufficientInventory = validItems.every(item => item.inventoryStatus === 'sufficient');
          
          let overallInventoryStatus;
          let requestStatus;
          if (hasNoInventory) {
            overallInventoryStatus = 'waiting-for-inventory';
            requestStatus = 'waiting-for-inventory';
          } else if (hasPartialInventory) {
            overallInventoryStatus = 'partial-inventory';
            requestStatus = 'partial-inventory';
          } else {
            overallInventoryStatus = 'sufficient';
            requestStatus = 'pending';
          }

          // Create bulk request with line items
          const bulkRequest = {
            requestNumber: bulkRequestNumber,
            requestType: 'bulk',
            pickupDate: data.pickupDate,
            status: requestStatus, // Overall request status based on inventory
            overallInventoryStatus: overallInventoryStatus, // NEW: Track inventory availability
            createdBy: userName,
            createdAt: new Date(),
            updatedAt: new Date(),
            totalItems: validItems.length,
            
            // Additional fields from CSV import
            便: data.deliveryOrder || null,
            納品書番号: data.deliveryNote || null,
            納入指示日: data.deadlineDate || null,
            
            // Line items with individual statuses
            lineItems: validItems.map((item, index) => ({
              lineNumber: index + 1,
              品番: item.品番,
              背番号: item.背番号,
              quantity: parseInt(item.quantity),
              reservedQuantity: item.reservedQuantity, // NEW: Amount actually reserved
              shortfallQuantity: item.shortfallQuantity, // NEW: Amount still needed
              inventoryStatus: item.inventoryStatus, // NEW: 'none', 'insufficient', 'sufficient'
              status: 'pending', // Individual line item status
              createdAt: new Date(),
              updatedAt: new Date()
            }))
          };

          // Insert the bulk request
          const bulkResult = await requestsCollection.insertOne(bulkRequest);
          const bulkRequestId = bulkResult.insertedId.toString();

          // Process inventory transactions for all valid items (including partial reservations)
          for (const item of validItems) {
            const currentPhysical = item.inventoryItem ? (item.inventoryItem.physicalQuantity || item.inventoryItem.runningQuantity || 0) : 0;
            const currentReserved = item.inventoryItem ? (item.inventoryItem.reservedQuantity || 0) : 0;
            const currentAvailable = item.availableQuantity;
            const requestedQuantity = parseInt(item.quantity);

            // ✅ FIXED: reservedQuantity in inventory should be the FULL requested amount, not just what's available
            const newReservedQuantity = currentReserved + requestedQuantity; // Reserve FULL amount (including shortfall)
            const newAvailableQuantity = Math.max(0, currentAvailable - item.reservedQuantity); // Only deduct what's actually available

            const inventoryTransaction = {
              背番号: item.背番号,
              品番: item.品番,
              timeStamp: new Date(),
              Date: data.pickupDate,
              
              // Two-stage inventory fields
              physicalQuantity: currentPhysical, // Physical stock unchanged
              reservedQuantity: newReservedQuantity, // Reserve FULL requested amount (450)
              availableQuantity: newAvailableQuantity, // Deduct only what's available (300 → 0)
              
              // Legacy field for compatibility
              runningQuantity: newAvailableQuantity,
              lastQuantity: currentAvailable,
              
              action: `Bulk Reservation (+${requestedQuantity})`,
              source: `Freya Admin - ${userName}`,
              requestId: bulkRequestId,
              bulkRequestNumber: bulkRequestNumber,
              note: item.shortfallQuantity > 0 
                ? `Partial reservation: ${item.reservedQuantity}/${requestedQuantity} units available for ${bulkRequestNumber} (Shortfall: ${item.shortfallQuantity} - will be fulfilled when inventory arrives)`
                : `Reserved ${requestedQuantity} units for bulk picking request ${bulkRequestNumber}`
            };

            await inventoryCollection.insertOne(inventoryTransaction);
            
            if (item.shortfallQuantity > 0) {
              console.log(`⏳ ${item.背番号}: Reserved ${item.reservedQuantity} available, waiting for ${item.shortfallQuantity} more units`);
            }
          }

          res.json({
            success: true,
            bulkRequestNumber: bulkRequestNumber,
            bulkRequestId: bulkRequestId,
            processedItems: validItems.length,
            failedItems: failedItems.length,
            failedItemDetails: failedItems
          });

        } catch (error) {
          console.error("Error in bulkCreateRequests:", error);
          res.status(500).json({ error: "Failed to create bulk request", details: error.message });
        }
        break;

      case 'addItemsToRequest':
        try {
          if (!requestId || !data || !Array.isArray(data.items) || data.items.length === 0) {
            return res.status(400).json({ error: "Request ID and items are required" });
          }

          // Get existing request
          const existingRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!existingRequest) {
            return res.status(404).json({ error: "Request not found" });
          }

          // Check if request is still pending
          if (existingRequest.status !== 'pending') {
            return res.status(400).json({ 
              error: `Cannot add items to request with status: ${existingRequest.status}. Only pending requests can be modified.` 
            });
          }

          // Verify it's a bulk request
          if (existingRequest.requestType !== 'bulk') {
            return res.status(400).json({ error: "Can only add items to bulk requests" });
          }

          // Get user information
          const userName = req.body.userName || 'Unknown User';

          let failedItems = [];
          let validItems = [];

          // Validate all items and check inventory
          for (const item of data.items) {
            try {
              // Validate required fields
              if (!item.品番 || !item.背番号 || !item.quantity) {
                failedItems.push({
                  背番号: item.背番号 || 'Unknown',
                  error: 'Missing required fields'
                });
                continue;
              }

              // Check if item already exists in this request
              const existingLineItem = existingRequest.lineItems.find(lineItem => lineItem.背番号 === item.背番号);
              if (existingLineItem) {
                failedItems.push({
                  背番号: item.背番号,
                  error: 'Item already exists in this request'
                });
                continue;
              }

              // Check inventory using aggregation pipeline
              const inventoryResults = await inventoryCollection.aggregate([
                { $match: { 背番号: item.背番号 } },
                {
                  $addFields: {
                    timeStampDate: {
                      $cond: {
                        if: { $type: "$timeStamp" },
                        then: {
                          $cond: {
                            if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                            then: { $dateFromString: { dateString: "$timeStamp" } },
                            else: "$timeStamp"
                          }
                        },
                        else: new Date()
                      }
                    }
                  }
                },
                { $sort: { timeStampDate: -1 } },
                { $limit: 1 }
              ]).toArray();

              if (inventoryResults.length === 0) {
                failedItems.push({
                  背番号: item.背番号,
                  error: 'Item not found in inventory'
                });
                continue;
              }

              const inventoryItem = inventoryResults[0];
              const availableQuantity = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;
              const requestedQuantity = parseInt(item.quantity);
              
              // ✅ NEW: Calculate partial reservation amounts (same as bulk creation)
              const reservedQuantity = Math.min(availableQuantity, requestedQuantity);
              const shortfallQuantity = Math.max(0, requestedQuantity - availableQuantity);
              
              // Determine line item inventory status
              let inventoryStatus;
              if (availableQuantity === 0) {
                inventoryStatus = 'none';
              } else if (availableQuantity < requestedQuantity) {
                inventoryStatus = 'insufficient';
              } else {
                inventoryStatus = 'sufficient';
              }

              // ✅ Item is always valid - we allow requests without full inventory
              validItems.push({
                ...item,
                inventoryItem: inventoryItem,
                availableQuantity: availableQuantity,
                reservedQuantity: reservedQuantity,
                shortfallQuantity: shortfallQuantity,
                inventoryStatus: inventoryStatus
              });

            } catch (error) {
              failedItems.push({
                背番号: item.背番号 || 'Unknown',
                error: error.message
              });
            }
          }

          // If no valid items, return error
          if (validItems.length === 0) {
            return res.status(400).json({ 
              success: false,
              error: "No valid items to add",
              failedItems: failedItems
            });
          }

          // Get the next line number
          const currentMaxLineNumber = Math.max(...existingRequest.lineItems.map(item => item.lineNumber));
          
          // Create new line items
          const newLineItems = validItems.map((item, index) => ({
            lineNumber: currentMaxLineNumber + index + 1,
            品番: item.品番,
            背番号: item.背番号,
            quantity: parseInt(item.quantity),
            reservedQuantity: item.reservedQuantity, // NEW: Amount actually reserved
            shortfallQuantity: item.shortfallQuantity, // NEW: Amount still needed
            inventoryStatus: item.inventoryStatus, // NEW: 'none', 'insufficient', 'sufficient'
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          }));

          // Update the bulk request with new line items
          const updateResult = await requestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { 
              $push: { lineItems: { $each: newLineItems } },
              $set: { 
                totalItems: existingRequest.totalItems + validItems.length,
                updatedAt: new Date(),
                lastModifiedBy: userName
              }
            }
          );

          if (updateResult.matchedCount === 0) {
            return res.status(404).json({ error: "Failed to update request" });
          }

          // Process inventory transactions for all valid items
          for (const item of validItems) {
            const currentPhysical = item.inventoryItem.physicalQuantity || item.inventoryItem.runningQuantity || 0;
            const currentReserved = item.inventoryItem.reservedQuantity || 0;
            const currentAvailable = item.availableQuantity;
            const requestedQuantity = parseInt(item.quantity);

            // ✅ FIXED: Reserve FULL requested amount in inventory
            const newReservedQuantity = currentReserved + requestedQuantity; // Reserve FULL amount (including shortfall)
            const newAvailableQuantity = Math.max(0, currentAvailable - item.reservedQuantity); // Only deduct what's actually available

            const inventoryTransaction = {
              背番号: item.背番号,
              品番: item.品番,
              timeStamp: new Date(),
              Date: existingRequest.pickupDate,
              
              // Two-stage inventory fields
              physicalQuantity: currentPhysical, // Physical stock unchanged
              reservedQuantity: newReservedQuantity, // Reserve FULL requested amount
              availableQuantity: newAvailableQuantity, // Decrease available by what's actually reserved
              
              // Legacy field for compatibility
              runningQuantity: newAvailableQuantity,
              lastQuantity: currentAvailable,
              
              action: `Additional Reservation (+${requestedQuantity})`,
              source: `Freya Admin - ${userName}`,
              requestId: requestId,
              bulkRequestNumber: existingRequest.requestNumber,
              note: item.shortfallQuantity > 0
                ? `Added ${item.reservedQuantity}/${requestedQuantity} units to ${existingRequest.requestNumber} (Shortfall: ${item.shortfallQuantity})`
                : `Added ${requestedQuantity} units to existing bulk picking request ${existingRequest.requestNumber}`
            };

            await inventoryCollection.insertOne(inventoryTransaction);
          }

          res.json({
            success: true,
            requestNumber: existingRequest.requestNumber,
            addedItems: validItems.length,
            failedItems: failedItems.length,
            failedItemDetails: failedItems,
            newLineItems: newLineItems
          });

        } catch (error) {
          console.error("Error in addItemsToRequest:", error);
          res.status(500).json({ error: "Failed to add items to request", details: error.message });
        }
        break;

      case 'updateRequest':
        try {
          if (!requestId || !data) {
            return res.status(400).json({ error: "Request ID and data are required" });
          }

          // Handle pickup date updates for bulk requests
          if (data.pickupDate) {
            const result = await requestsCollection.updateOne(
              { _id: new ObjectId(requestId) },
              { 
                $set: { 
                  pickupDate: data.pickupDate,
                  updatedAt: new Date()
                } 
              }
            );

            if (result.matchedCount === 0) {
              return res.status(404).json({ error: "Request not found" });
            }

            return res.json({ success: true, message: "Pickup date updated successfully" });
          }

          // If quantity or back number changed, check inventory
          if (data.quantity || data.背番号) {
            const existingRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
            const backNumber = data.背番号 || existingRequest.背番号;
            const quantity = data.quantity || existingRequest.quantity;

            const inventoryItem = await inventoryCollection.findOne({ 
              背番号: backNumber 
            }, { 
              sort: { timeStamp: -1 } 
            });

            if (!inventoryItem) {
              return res.status(400).json({ error: "Item not found in inventory" });
            }

            if (inventoryItem.runningQuantity < quantity) {
              return res.status(400).json({ 
                error: `Insufficient inventory. Available: ${inventoryItem.runningQuantity}, Requested: ${quantity}` 
              });
            }
          }

          const updateData = {
            ...data,
            updatedAt: new Date()
          };

          const result = await requestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: updateData }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Request not found" });
          }

          res.json({ success: true });

        } catch (error) {
          console.error("Error in updateRequest:", error);
          res.status(500).json({ error: "Failed to update request", details: error.message });
        }
        break;

      case 'changeRequestStatus':
        try {
          if (!requestId || !data || !data.status) {
            return res.status(400).json({ error: "Request ID and status are required" });
          }

          const request = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!request) {
            return res.status(404).json({ error: "Request not found" });
          }

          const userName = data.userName || 'Unknown User';
          const oldStatus = request.status;
          const newStatus = data.status;

          // Handle inventory changes based on status transition
          if (oldStatus !== newStatus) {
            const inventoryItem = await inventoryCollection.findOne({ 
              背번호: request.背번号 
            }, { 
              sort: { timeStamp: -1 } 
            });

            if (inventoryItem) {
              const currentPhysical = inventoryItem.physicalQuantity || inventoryItem.runningQuantity || 0;
              const currentReserved = inventoryItem.reservedQuantity || 0;
              const currentAvailable = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;

              let newPhysical = currentPhysical;
              let newReserved = currentReserved;
              let newAvailable = currentAvailable;
              let action = '';
              let note = '';

              // Handle different status transitions
              if (newStatus === 'complete' && (oldStatus === 'pending' || oldStatus === 'active')) {
                // Completing pickup: reduce physical and reserved quantities
                newPhysical = currentPhysical - request.quantity;
                newReserved = Math.max(0, currentReserved - request.quantity);
                // Available stays the same (already reduced when request was created)
                action = `Picking Completed (-${request.quantity})`;
                note = `Physically picked ${request.quantity} units for request ${request.requestNumber}`;

              } else if (newStatus === 'failed' && (oldStatus === 'pending' || oldStatus === 'active')) {
                // Failed pickup: restore available, reduce reserved
                newReserved = Math.max(0, currentReserved - request.quantity);
                newAvailable = currentAvailable + request.quantity;
                // Physical stays the same (nothing was actually picked)
                action = `Picking Failed (Restored +${request.quantity})`;
                note = `Failed to pick ${request.quantity} units, restored to available inventory`;

              } else if (newStatus === 'active' && oldStatus === 'pending') {
                // No inventory change, just status update
                action = `Status Change: ${oldStatus} → ${newStatus}`;
                note = `Request ${request.requestNumber} status changed to active`;

              } else {
                // Other status changes that don't affect inventory
                action = `Status Change: ${oldStatus} → ${newStatus}`;
                note = `Request ${request.requestNumber} status updated`;
              }

              // Create inventory transaction if there was a quantity change
              if (newPhysical !== currentPhysical || newReserved !== currentReserved || newAvailable !== currentAvailable) {
                const statusTransaction = {
                  背番号: request.背番号,
                  品番: request.品番,
                  timeStamp: new Date(),
                  Date: new Date().toISOString().split('T')[0],
                  
                  // Two-stage inventory fields
                  physicalQuantity: newPhysical,
                  reservedQuantity: newReserved,
                  availableQuantity: newAvailable,
                  
                  // Legacy field for compatibility
                  runningQuantity: newAvailable,
                  lastQuantity: currentAvailable,
                  
                  action: action,
                  source: `Freya Admin - ${userName}`,
                  requestId: requestId,
                  note: note
                };

                await inventoryCollection.insertOne(statusTransaction);
              }
            }
          }

          // Update request status
          const updateData = {
            status: newStatus,
            updatedAt: new Date(),
            updatedBy: userName
          };

          if (newStatus === 'complete') {
            updateData.completedAt = new Date();
          }

          const result = await requestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: updateData }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Request not found" });
          }

          res.json({ 
            success: true,
            message: `Request status changed from ${oldStatus} to ${newStatus}`
          });

        } catch (error) {
          console.error("Error in changeRequestStatus:", error);
          res.status(500).json({ error: "Failed to change request status", details: error.message });
        }
        break;

      case 'updateLineItemStatus':
        try {
          if (!requestId || !data || !data.lineNumber || !data.status) {
            return res.status(400).json({ error: "Request ID, line number, and status are required" });
          }

          // Find the bulk request
          const bulkRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!bulkRequest) {
            return res.status(404).json({ error: "Bulk request not found" });
          }

          if (bulkRequest.requestType !== 'bulk') {
            return res.status(400).json({ error: "This operation is only for bulk requests" });
          }

          // Find the current line item
          const currentLineItem = bulkRequest.lineItems.find(item => item.lineNumber === data.lineNumber);
          if (!currentLineItem) {
            return res.status(404).json({ error: "Line item not found" });
          }

          const currentStatus = currentLineItem.status;
          const newStatus = data.status;

          // Prevent admin from changing in-progress to completed (only ESP32/IoT device should do this)
          if (currentStatus === 'in-progress' && newStatus === 'completed') {
            return res.status(400).json({ 
              error: "Cannot change status from 'in-progress' to 'completed' via admin interface. Only ESP32/IoT device can complete in-progress items to prevent inventory mismatches." 
            });
          }

          // Handle inventory transactions when changing from completed to pending/in-progress
          if (currentStatus === 'completed' && (newStatus === 'pending' || newStatus === 'in-progress')) {
            console.log(`🔄 Reversing inventory transaction for line item ${data.lineNumber}: ${currentStatus} → ${newStatus}`);
            
            // Get current inventory state
            const inventoryResults = await inventoryCollection.aggregate([
              { $match: { 背番号: currentLineItem.背番号 } },
              {
                $addFields: {
                  timeStampDate: {
                    $cond: {
                      if: { $type: "$timeStamp" },
                      then: {
                        $cond: {
                          if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                          then: { $dateFromString: { dateString: "$timeStamp" } },
                          else: "$timeStamp"
                        }
                      },
                      else: new Date()
                    }
                  }
                }
              },
              { $sort: { timeStampDate: -1 } },
              { $limit: 1 }
            ]).toArray();

            if (inventoryResults.length > 0) {
              const currentInventory = inventoryResults[0];
              const quantity = currentLineItem.quantity;

              // Calculate reversed inventory quantities
              // When reversing a picking operation (completed → pending/in-progress), we need to:
              // 1. Restore the physical quantity (items go back to stock)
              // 2. Restore the reserved quantity (items become reserved again for this request)
              // 3. Keep available quantity unchanged (items are reserved, not available for others)
              
              // From the original flow:
              // - When reserved: physical unchanged, reserved increased, available decreased
              // - When picked: physical decreased, reserved decreased, available unchanged
              // - When reversing pick: physical increased, reserved increased, available unchanged
              
              const newPhysicalQuantity = (currentInventory.physicalQuantity || 0) + quantity;
              const newReservedQuantity = (currentInventory.reservedQuantity || 0) + quantity;
              const newAvailableQuantity = currentInventory.availableQuantity || 0; // Available stays the same

              // Create reverse inventory transaction
              const reverseTransaction = {
                背番号: currentLineItem.背番号,
                品番: currentLineItem.品番,
                timeStamp: new Date(),
                Date: new Date().toISOString().split('T')[0],
                
                // Two-stage inventory fields
                physicalQuantity: newPhysicalQuantity,
                reservedQuantity: newReservedQuantity,
                availableQuantity: newAvailableQuantity,
                
                // Legacy field for compatibility
                runningQuantity: newAvailableQuantity,
                lastQuantity: currentInventory.physicalQuantity || 0,
                
                action: `Admin Status Reversal (+${quantity} physical, +${quantity} reserved)`,
                source: `Freya Admin - Status Change (${currentStatus} → ${newStatus})`,
                requestId: requestId,
                bulkRequestNumber: bulkRequest.requestNumber,
                lineNumber: data.lineNumber,
                note: `Reversed picking transaction for request ${bulkRequest.requestNumber} line ${data.lineNumber}. Status changed from ${currentStatus} to ${newStatus}. Physical: ${currentInventory.physicalQuantity || 0} → ${newPhysicalQuantity}, Reserved: ${currentInventory.reservedQuantity || 0} → ${newReservedQuantity}`
              };

              await inventoryCollection.insertOne(reverseTransaction);
              console.log(`✅ Inventory transaction reversed for ${currentLineItem.背番号}: +${quantity} units`);
            } else {
              console.warn(`⚠️ No inventory record found for ${currentLineItem.背番号}`);
            }
          }

          // Update the specific line item status
          const updateFields = {
            "lineItems.$.status": data.status,
            "lineItems.$.updatedAt": new Date(),
            updatedAt: new Date()
          };

          // Clear completion fields if moving away from completed status
          if (currentStatus === 'completed' && newStatus !== 'completed') {
            updateFields["lineItems.$.completedAt"] = null;
            updateFields["lineItems.$.completedBy"] = null;
          }

          const result = await requestsCollection.updateOne(
            { 
              _id: new ObjectId(requestId),
              "lineItems.lineNumber": data.lineNumber
            },
            { $set: updateFields }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Line item not found" });
          }

          // Check if all line items are completed to update bulk request status
          const updatedRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          const allCompleted = updatedRequest.lineItems.every(item => item.status === 'completed');
          const anyInProgress = updatedRequest.lineItems.some(item => item.status === 'in-progress');

          let newBulkStatus = updatedRequest.status;
          let bulkUpdateFields = { updatedAt: new Date() };

          if (allCompleted) {
            newBulkStatus = 'completed';
            if (updatedRequest.status !== 'completed') {
              bulkUpdateFields.status = 'completed';
              bulkUpdateFields.completedAt = new Date();
            }
          } else if (anyInProgress) {
            newBulkStatus = 'in-progress';
            if (updatedRequest.status !== 'in-progress') {
              bulkUpdateFields.status = 'in-progress';
              // Clear completion timestamp if moving away from completed
              if (updatedRequest.status === 'completed') {
                bulkUpdateFields.completedAt = null;
              }
            }
          } else {
            // All items are pending
            newBulkStatus = 'pending';
            if (updatedRequest.status !== 'pending') {
              bulkUpdateFields.status = 'pending';
              // Clear completion and start timestamps
              bulkUpdateFields.completedAt = null;
              bulkUpdateFields.startedAt = null;
              bulkUpdateFields.startedBy = null;
            }
          }

          // Update bulk request status if needed
          if (Object.keys(bulkUpdateFields).length > 1) { // More than just updatedAt
            const updateOperation = { $set: {} };
            const unsetFields = {};
            
            // Separate fields to set vs unset
            for (const [key, value] of Object.entries(bulkUpdateFields)) {
              if (value === null) {
                unsetFields[key] = "";
              } else {
                updateOperation.$set[key] = value;
              }
            }
            
            if (Object.keys(unsetFields).length > 0) {
              updateOperation.$unset = unsetFields;
            }
            
            await requestsCollection.updateOne(
              { _id: new ObjectId(requestId) },
              updateOperation
            );
          }

          res.json({
            success: true,
            message: "Line item status updated successfully",
            previousStatus: currentStatus,
            newStatus: data.status,
            bulkStatus: newBulkStatus,
            inventoryReversed: currentStatus === 'completed' && (newStatus === 'pending' || newStatus === 'in-progress')
          });

        } catch (error) {
          console.error("Error in updateLineItemStatus:", error);
          res.status(500).json({ error: "Failed to update line item status", details: error.message });
        }
        break;

      case 'updateLineItemQuantity':
        try {
          if (!requestId || !data || !data.lineNumber || !data.newQuantity || !data.originalQuantity || !data.背番号) {
            return res.status(400).json({ error: "Missing required fields" });
          }

          const newQuantity = parseInt(data.newQuantity);
          const originalQuantity = parseInt(data.originalQuantity);
          const quantityDiff = newQuantity - originalQuantity;

          if (newQuantity <= 0) {
            return res.status(400).json({ error: "Quantity must be greater than 0" });
          }

          // Get the bulk request
          const bulkRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!bulkRequest) {
            return res.status(404).json({ error: "Request not found" });
          }

          // Find the line item
          const lineItem = bulkRequest.lineItems.find(item => item.lineNumber === data.lineNumber);
          if (!lineItem) {
            return res.status(404).json({ error: "Line item not found" });
          }

          const userName = req.body.userName || 'Unknown User';

          // Get current inventory state
          const inventoryResults = await inventoryCollection.aggregate([
            { $match: { 背番号: data.背番号 } },
            {
              $addFields: {
                timeStampDate: {
                  $cond: {
                    if: { $type: "$timeStamp" },
                    then: {
                      $cond: {
                        if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                        then: { $dateFromString: { dateString: "$timeStamp" } },
                        else: "$timeStamp"
                      }
                    },
                    else: new Date()
                  }
                }
              }
            },
            { $sort: { timeStampDate: -1 } },
            { $limit: 1 }
          ]).toArray();

          if (inventoryResults.length === 0) {
            return res.status(404).json({ error: "Item not found in inventory" });
          }

          const currentInventory = inventoryResults[0];
          const currentPhysical = currentInventory.physicalQuantity || currentInventory.runningQuantity || 0;
          const currentReserved = currentInventory.reservedQuantity || 0;
          const currentAvailable = currentInventory.availableQuantity || currentInventory.runningQuantity || 0;

          // Handle inventory adjustment based on quantity difference
          let newReservedQuantity, newAvailableQuantity;
          let action, note;

          if (quantityDiff > 0) {
            // Increasing quantity - check availability and reserve more
            if (currentAvailable < quantityDiff) {
              return res.status(400).json({ 
                error: "Insufficient inventory available",
                availableQuantity: currentAvailable,
                requestedIncrease: quantityDiff
              });
            }

            newReservedQuantity = currentReserved + quantityDiff;
            newAvailableQuantity = currentAvailable - quantityDiff;
            action = `Bulk Reservation (+${quantityDiff})`;
            note = `Increased reservation by ${quantityDiff} units for line ${data.lineNumber} in request ${bulkRequest.requestNumber}`;
          } else {
            // Decreasing quantity - unreserve the difference
            const unreserveAmount = Math.abs(quantityDiff);
            newReservedQuantity = Math.max(0, currentReserved - unreserveAmount);
            newAvailableQuantity = currentAvailable + unreserveAmount;
            action = `Bulk Unreservation (-${unreserveAmount})`;
            note = `Decreased reservation by ${unreserveAmount} units for line ${data.lineNumber} in request ${bulkRequest.requestNumber}`;
          }

          console.log(`📦 Updating line item quantity: ${originalQuantity} → ${newQuantity} (diff: ${quantityDiff})`);
          console.log(`   Inventory: Reserved ${currentReserved} → ${newReservedQuantity}, Available ${currentAvailable} → ${newAvailableQuantity}`);

          // Create inventory transaction
          const inventoryTransaction = {
            背番号: data.背番号,
            品番: lineItem.品番,
            timeStamp: new Date(),
            Date: new Date().toISOString().split('T')[0],
            
            physicalQuantity: currentPhysical,
            reservedQuantity: newReservedQuantity,
            availableQuantity: newAvailableQuantity,
            
            runningQuantity: newAvailableQuantity,
            lastQuantity: currentAvailable,
            
            action: action,
            source: `Freya Admin - ${userName}`,
            requestId: requestId,
            bulkRequestNumber: bulkRequest.requestNumber,
            note: note
          };

          await inventoryCollection.insertOne(inventoryTransaction);

          // Update the line item quantity in the request
          const updateResult = await requestsCollection.updateOne(
            { 
              _id: new ObjectId(requestId),
              'lineItems.lineNumber': data.lineNumber
            },
            {
              $set: {
                'lineItems.$.quantity': newQuantity,
                'lineItems.$.updatedAt': new Date()
              }
            }
          );

          if (updateResult.modifiedCount === 0) {
            return res.status(500).json({ error: "Failed to update line item quantity" });
          }

          res.json({
            success: true,
            message: "Line item quantity updated successfully",
            lineNumber: data.lineNumber,
            originalQuantity: originalQuantity,
            newQuantity: newQuantity,
            quantityDiff: quantityDiff,
            inventoryUpdated: true
          });

        } catch (error) {
          console.error("Error in updateLineItemQuantity:", error);
          res.status(500).json({ error: "Failed to update line item quantity", details: error.message });
        }
        break;

      case 'deleteLineItem':
        try {
          if (!requestId || !data || !data.lineNumber || !data.背番号 || !data.quantity) {
            return res.status(400).json({ error: "Missing required fields" });
          }

          // Get the bulk request
          const bulkRequest = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!bulkRequest) {
            return res.status(404).json({ error: "Request not found" });
          }

          // Check if this is the last line item
          if (bulkRequest.lineItems.length <= 1) {
            return res.status(400).json({ 
              error: "Cannot delete the last line item. Please delete the entire request instead." 
            });
          }

          // Find the line item
          const lineItem = bulkRequest.lineItems.find(item => item.lineNumber === data.lineNumber);
          if (!lineItem) {
            return res.status(404).json({ error: "Line item not found" });
          }

          const userName = req.body.userName || 'Unknown User';

          // Get current inventory state
          const inventoryResults = await inventoryCollection.aggregate([
            { $match: { 背番号: data.背番号 } },
            {
              $addFields: {
                timeStampDate: {
                  $cond: {
                    if: { $type: "$timeStamp" },
                    then: {
                      $cond: {
                        if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                        then: { $dateFromString: { dateString: "$timeStamp" } },
                        else: "$timeStamp"
                      }
                    },
                    else: new Date()
                  }
                }
              }
            },
            { $sort: { timeStampDate: -1 } },
            { $limit: 1 }
          ]).toArray();

          if (inventoryResults.length > 0) {
            const currentInventory = inventoryResults[0];
            const currentPhysical = currentInventory.physicalQuantity || currentInventory.runningQuantity || 0;
            const currentReserved = currentInventory.reservedQuantity || 0;
            const currentAvailable = currentInventory.availableQuantity || currentInventory.runningQuantity || 0;

            // Unreserve the quantity
            const newReservedQuantity = Math.max(0, currentReserved - data.quantity);
            const newAvailableQuantity = currentAvailable + data.quantity;

            console.log(`🗑️ Deleting line item ${data.lineNumber}, unreserving ${data.quantity} units`);
            console.log(`   Inventory: Reserved ${currentReserved} → ${newReservedQuantity}, Available ${currentAvailable} → ${newAvailableQuantity}`);

            // Create inventory transaction to unreserve
            const unreserveTransaction = {
              背番号: data.背番号,
              品番: lineItem.品番,
              timeStamp: new Date(),
              Date: new Date().toISOString().split('T')[0],
              
              physicalQuantity: currentPhysical,
              reservedQuantity: newReservedQuantity,
              availableQuantity: newAvailableQuantity,
              
              runningQuantity: newAvailableQuantity,
              lastQuantity: currentAvailable,
              
              action: `Bulk Unreservation (-${data.quantity})`,
              source: `Freya Admin - ${userName}`,
              requestId: requestId,
              bulkRequestNumber: bulkRequest.requestNumber,
              note: `Unreserved ${data.quantity} units - deleted line ${data.lineNumber} from request ${bulkRequest.requestNumber}`
            };

            await inventoryCollection.insertOne(unreserveTransaction);
          }

          // Remove the line item from the request
          const updateResult = await requestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            {
              $pull: { lineItems: { lineNumber: data.lineNumber } },
              $set: { 
                updatedAt: new Date(),
                totalItems: bulkRequest.lineItems.length - 1
              }
            }
          );

          if (updateResult.modifiedCount === 0) {
            return res.status(500).json({ error: "Failed to delete line item" });
          }

          res.json({
            success: true,
            message: "Line item deleted successfully",
            lineNumber: data.lineNumber,
            inventoryUnreserved: data.quantity,
            remainingItems: bulkRequest.lineItems.length - 1
          });

        } catch (error) {
          console.error("Error in deleteLineItem:", error);
          res.status(500).json({ error: "Failed to delete line item", details: error.message });
        }
        break;

      case 'deleteRequest':
        try {
          if (!requestId) {
            return res.status(400).json({ error: "Request ID is required" });
          }

          // Get the request details first
          const request = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
          if (!request) {
            return res.status(404).json({ error: "Request not found" });
          }

          // Get user information for transaction
          const userName = req.body.userName || 'Unknown User';
          let restoredItems = 0;
          let totalQuantityRestored = 0;

          const isBulkRequest = request.requestType === 'bulk';
          
          if (isBulkRequest && request.lineItems) {
            // ============ BULK REQUEST DELETION WITH LINE-ITEM-LEVEL RESTORATION ============
            console.log(`🗑️ Deleting bulk request ${request.requestNumber} with ${request.lineItems.length} line items`);
            
            // Loop through each line item and restore inventory ONLY for items that were NOT completed
            for (const lineItem of request.lineItems) {
              try {
                // ✅ KEY FIX: Check individual LINE ITEM status, not bulk request status
                if (lineItem.status === 'completed') {
                  console.log(`⏭️ Skipping line ${lineItem.lineNumber} (${lineItem.背番号}): Already completed (physically picked)`);
                  continue; // Skip completed items - they were already picked physically
                }
                
                // Only restore inventory for pending/in-progress/active line items
                console.log(`🔄 Restoring line ${lineItem.lineNumber} (${lineItem.背番号}): Status = ${lineItem.status}`);
                
                // Get current inventory state using aggregation pipeline
                const inventoryResults = await inventoryCollection.aggregate([
                  { $match: { 背番号: lineItem.背番号 } },
                  {
                    $addFields: {
                      timeStampDate: {
                        $cond: {
                          if: { $type: "$timeStamp" },
                          then: {
                            $cond: {
                              if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                              then: { $dateFromString: { dateString: "$timeStamp" } },
                              else: "$timeStamp"
                            }
                          },
                          else: new Date()
                        }
                      }
                    }
                  },
                  { $sort: { timeStampDate: -1 } },
                  { $limit: 1 }
                ]).toArray();

                if (inventoryResults.length > 0) {
                  const inventoryItem = inventoryResults[0];
                  
                  // Create inventory restoration transaction for this line item
                  const currentPhysical = inventoryItem.physicalQuantity || inventoryItem.runningQuantity || 0;
                  const currentReserved = inventoryItem.reservedQuantity || 0;
                  const currentAvailable = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;

                  // Restore inventory: Decrease reserved, Increase available
                  const newReservedQuantity = Math.max(0, currentReserved - lineItem.quantity);
                  const newAvailableQuantity = currentAvailable + lineItem.quantity;

                  const restorationTransaction = {
                    背番号: lineItem.背番号,
                    品番: lineItem.品番,
                    timeStamp: new Date(),
                    Date: new Date().toISOString().split('T')[0],
                    
                    // Two-stage inventory fields
                    physicalQuantity: currentPhysical, // Physical stock unchanged (item was never picked)
                    reservedQuantity: newReservedQuantity, // Decrease reserved
                    availableQuantity: newAvailableQuantity, // Increase available
                    
                    // Legacy field for compatibility
                    runningQuantity: newAvailableQuantity,
                    lastQuantity: currentAvailable,
                    
                    action: `Delete Restoration (-${lineItem.quantity} reserved, +${lineItem.quantity} available)`,
                    source: `Freya Admin - ${userName}`,
                    requestId: requestId,
                    bulkRequestNumber: request.requestNumber,
                    lineNumber: lineItem.lineNumber,
                    note: `Restored ${lineItem.quantity} units from DELETED request ${request.requestNumber} line ${lineItem.lineNumber} (status: ${lineItem.status}). Reserved: ${currentReserved} → ${newReservedQuantity}, Available: ${currentAvailable} → ${newAvailableQuantity}`
                  };

                  await inventoryCollection.insertOne(restorationTransaction);
                  restoredItems++;
                  totalQuantityRestored += lineItem.quantity;
                  
                  console.log(`✅ Restored ${lineItem.quantity} units for ${lineItem.背番号} (line ${lineItem.lineNumber})`);
                } else {
                  console.warn(`⚠️ No inventory found for ${lineItem.背番号} (line ${lineItem.lineNumber})`);
                }
              } catch (error) {
                console.error(`❌ Error restoring inventory for line item ${lineItem.lineNumber} (${lineItem.背番号}):`, error);
              }
            }
            
          } else if (!isBulkRequest) {
            // ============ SINGLE REQUEST DELETION (ORIGINAL LOGIC) ============
            console.log(`🗑️ Deleting single request ${request.requestNumber}`);
            
            // Only restore inventory if request is still pending/active (not completed)
            if (request.status === 'pending' || request.status === 'active' || request.status === 'in-progress') {
              
              // Get current inventory state using aggregation pipeline
              const inventoryResults = await inventoryCollection.aggregate([
                { $match: { 背番号: request.背番号 } },
                {
                  $addFields: {
                    timeStampDate: {
                      $cond: {
                        if: { $type: "$timeStamp" },
                        then: {
                          $cond: {
                            if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                            then: { $dateFromString: { dateString: "$timeStamp" } },
                            else: "$timeStamp"
                          }
                        },
                        else: new Date()
                      }
                    }
                  }
                },
                { $sort: { timeStampDate: -1 } },
                { $limit: 1 }
              ]).toArray();

              if (inventoryResults.length > 0) {
                const inventoryItem = inventoryResults[0];
                
                // Create inventory restoration transaction
                const currentPhysical = inventoryItem.physicalQuantity || inventoryItem.runningQuantity || 0;
                const currentReserved = inventoryItem.reservedQuantity || 0;
                const currentAvailable = inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0;

                const newReservedQuantity = Math.max(0, currentReserved - request.quantity);
                const newAvailableQuantity = currentAvailable + request.quantity;

                const restorationTransaction = {
                  背番号: request.背番号,
                  品番: request.品番,
                  timeStamp: new Date(),
                  Date: new Date().toISOString().split('T')[0],
                  
                  // Two-stage inventory fields
                  physicalQuantity: currentPhysical, // Physical stock unchanged
                  reservedQuantity: newReservedQuantity, // Decrease reserved
                  availableQuantity: newAvailableQuantity, // Increase available
                  
                  // Legacy field for compatibility
                  runningQuantity: newAvailableQuantity,
                  lastQuantity: currentAvailable,
                  
                  action: `Reservation Cancelled (-${request.quantity})`,
                  source: `Freya Admin - ${userName}`,
                  requestId: requestId,
                  note: `Restored ${request.quantity} units from cancelled request ${request.requestNumber}`
                };

                await inventoryCollection.insertOne(restorationTransaction);
                restoredItems = 1;
                totalQuantityRestored = request.quantity;
                
                console.log(`✅ Restored ${request.quantity} units for ${request.背番号}`);
              }
            } else {
              console.log(`⏭️ Skipping restoration: Single request status is '${request.status}' (completed requests are not restored)`);
            }
          }

          // Delete the request from database
          const result = await requestsCollection.deleteOne({ _id: new ObjectId(requestId) });

          // Build response message
          let message = '';
          if (isBulkRequest) {
            if (restoredItems > 0) {
              message = `✅ Bulk request deleted. Restored ${restoredItems} unpicked line items (${totalQuantityRestored} total units). Completed items were not restored.`;
            } else {
              message = `✅ Bulk request deleted. All line items were already completed - no inventory restoration needed.`;
            }
          } else {
            if (restoredItems > 0) {
              message = `✅ Request deleted and ${totalQuantityRestored} units restored to inventory.`;
            } else {
              message = `✅ Request deleted (no inventory restoration - request was already completed).`;
            }
          }

          res.json({ 
            success: true,
            message: message,
            restoredItems: restoredItems,
            totalQuantityRestored: totalQuantityRestored
          });

        } catch (error) {
          console.error("Error in deleteRequest:", error);
          res.status(500).json({ error: "Failed to delete request", details: error.message });
        }
        break;

      case 'autoCheckInventory':
        try {
          console.log('🔍 Starting auto-check inventory process...');
          
          // Get user information
          const userName = req.body.userName || 'System Auto-Check';
          
          // Find all requests waiting for inventory or with partial inventory
          // Sort by createdAt for first-come-first-served priority
          const requestsNeedingInventory = await requestsCollection.find({
            $or: [
              { overallInventoryStatus: 'waiting-for-inventory' },
              { overallInventoryStatus: 'partial-inventory' }
            ],
            status: { $nin: ['completed', 'cancelled'] } // Only active requests
          }).sort({ createdAt: 1 }).toArray(); // First-come-first-served
          
          console.log(`📋 Found ${requestsNeedingInventory.length} requests needing inventory check`);
          
          let totalReservations = 0;
          let updatedRequests = 0;
          const updateResults = [];
          
          // Process each request
          for (const request of requestsNeedingInventory) {
            let requestUpdated = false;
            let requestReservations = 0;
            
            // Check each line item with shortfall
            for (const lineItem of request.lineItems) {
              if (lineItem.shortfallQuantity > 0) {
                // Get current inventory availability
                const inventoryResults = await inventoryCollection.aggregate([
                  { $match: { 背番号: lineItem.背番号 } },
                  {
                    $addFields: {
                      timeStampDate: {
                        $cond: {
                          if: { $type: "$timeStamp" },
                          then: {
                            $cond: {
                              if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                              then: { $dateFromString: { dateString: "$timeStamp" } },
                              else: "$timeStamp"
                            }
                          },
                          else: new Date()
                        }
                      }
                    }
                  },
                  { $sort: { timeStampDate: -1 } },
                  { $limit: 1 }
                ]).toArray();
                
                if (inventoryResults.length > 0) {
                  const currentInventory = inventoryResults[0];
                  const availableQty = currentInventory.availableQuantity || currentInventory.runningQuantity || 0;
                  
                  if (availableQty > 0) {
                    // Calculate how much we can reserve
                    const canReserve = Math.min(availableQty, lineItem.shortfallQuantity);
                    
                    console.log(`  ✅ ${lineItem.背番号}: Can reserve ${canReserve}/${lineItem.shortfallQuantity} units (Available: ${availableQty})`);
                    
                    // Update inventory - reserve the amount
                    const currentPhysical = currentInventory.physicalQuantity || currentInventory.runningQuantity || 0;
                    const currentReserved = currentInventory.reservedQuantity || 0;
                    const newReservedQuantity = currentReserved + canReserve;
                    const newAvailableQuantity = availableQty - canReserve;
                    
                    // Create inventory transaction
                    const reservationTransaction = {
                      背番号: lineItem.背番号,
                      品番: lineItem.品番,
                      timeStamp: new Date(),
                      Date: request.pickupDate,
                      
                      physicalQuantity: currentPhysical,
                      reservedQuantity: newReservedQuantity,
                      availableQuantity: newAvailableQuantity,
                      
                      runningQuantity: newAvailableQuantity,
                      lastQuantity: availableQty,
                      
                      action: `Auto-Check Reservation (+${canReserve})`,
                      source: `Freya Admin - ${userName}`,
                      requestId: request._id.toString(),
                      bulkRequestNumber: request.requestNumber,
                      note: `Auto-reserved ${canReserve} units for ${request.requestNumber} (${lineItem.reservedQuantity + canReserve}/${lineItem.quantity} total)`
                    };
                    
                    await inventoryCollection.insertOne(reservationTransaction);
                    
                    // Update line item in request
                    const newReservedQty = lineItem.reservedQuantity + canReserve;
                    const newShortfallQty = lineItem.shortfallQuantity - canReserve;
                    
                    // Determine new inventory status for line item
                    let newInventoryStatus;
                    if (newShortfallQty === 0) {
                      newInventoryStatus = 'sufficient';
                    } else if (newReservedQty > 0) {
                      newInventoryStatus = 'insufficient';
                    } else {
                      newInventoryStatus = 'none';
                    }
                    
                    // Update the line item
                    await requestsCollection.updateOne(
                      { 
                        _id: request._id,
                        'lineItems.lineNumber': lineItem.lineNumber
                      },
                      {
                        $set: {
                          'lineItems.$.reservedQuantity': newReservedQty,
                          'lineItems.$.shortfallQuantity': newShortfallQty,
                          'lineItems.$.inventoryStatus': newInventoryStatus,
                          'lineItems.$.updatedAt': new Date()
                        }
                      }
                    );
                    
                    requestUpdated = true;
                    requestReservations++;
                    totalReservations++;
                  }
                }
              }
            }
            
            // If request was updated, recalculate overall inventory status
            if (requestUpdated) {
              // Get updated request
              const updatedRequest = await requestsCollection.findOne({ _id: request._id });
              
              // Calculate new overall status
              const hasNoInventory = updatedRequest.lineItems.every(item => item.inventoryStatus === 'none');
              const hasPartialInventory = updatedRequest.lineItems.some(item => 
                item.inventoryStatus === 'insufficient' || item.inventoryStatus === 'none'
              );
              
              let newOverallStatus;
              let newRequestStatus;
              if (hasNoInventory) {
                newOverallStatus = 'waiting-for-inventory';
                newRequestStatus = 'waiting-for-inventory';
              } else if (hasPartialInventory) {
                newOverallStatus = 'partial-inventory';
                newRequestStatus = 'partial-inventory';
              } else {
                newOverallStatus = 'sufficient';
                newRequestStatus = 'pending';
              }
              
              // Update overall status
              await requestsCollection.updateOne(
                { _id: request._id },
                {
                  $set: {
                    overallInventoryStatus: newOverallStatus,
                    status: newRequestStatus,
                    updatedAt: new Date()
                  }
                }
              );
              
              updatedRequests++;
              updateResults.push({
                requestNumber: request.requestNumber,
                reservations: requestReservations,
                newStatus: newOverallStatus
              });
              
              console.log(`  📦 Updated ${request.requestNumber}: ${requestReservations} line items reserved, status: ${newOverallStatus}`);
            }
          }
          
          console.log(`✅ Auto-check complete: ${totalReservations} reservations across ${updatedRequests} requests`);
          
          res.json({
            success: true,
            totalReservations: totalReservations,
            updatedRequests: updatedRequests,
            details: updateResults
          });

        } catch (error) {
          console.error("Error in autoCheckInventory:", error);
          res.status(500).json({ error: "Failed to auto-check inventory", details: error.message });
        }
        break;

      case 'getFilterOptions':
        try {
          // Use aggregation instead of distinct for API Version 1 compatibility
          const partNumbersResult = await requestsCollection.aggregate([
            { $group: { _id: "$品番" } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } }
          ]).toArray();

          const backNumbersResult = await requestsCollection.aggregate([
            { $group: { _id: "$背番号" } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } }
          ]).toArray();

          const partNumbers = partNumbersResult.map(item => item._id);
          const backNumbers = backNumbersResult.map(item => item._id);

          res.json({
            success: true,
            data: {
              partNumbers: partNumbers,
              backNumbers: backNumbers
            }
          });

        } catch (error) {
          console.error("Error in getFilterOptions:", error);
          res.status(500).json({ error: "Failed to fetch filter options", details: error.message });
        }
        break;

      case 'checkInventory':
        try {
          const { 背番号 } = req.body;
          
          if (!背番号) {
            return res.status(400).json({ error: "背番号 is required" });
          }

          // Use aggregation pipeline for proper timestamp sorting (same as inventory management)
          const inventoryResults = await inventoryCollection.aggregate([
            { $match: { 背番号: 背番号 } },
            {
              $addFields: {
                timeStampDate: {
                  $cond: {
                    if: { $type: "$timeStamp" },
                    then: {
                      $cond: {
                        if: { $eq: [{ $type: "$timeStamp" }, "string"] },
                        then: { $dateFromString: { dateString: "$timeStamp" } },
                        else: "$timeStamp"
                      }
                    },
                    else: new Date()
                  }
                }
              }
            },
            { $sort: { timeStampDate: -1 } },
            { $limit: 1 }
          ]).toArray();

          if (inventoryResults.length === 0) {
            return res.json({ success: false, message: "Item not found in inventory" });
          }

          const inventoryItem = inventoryResults[0];

          // Return two-stage inventory information
          const inventoryInfo = {
            背番号: inventoryItem.背番号,
            品番: inventoryItem.品番,
            physicalQuantity: inventoryItem.physicalQuantity || inventoryItem.runningQuantity || 0,
            reservedQuantity: inventoryItem.reservedQuantity || 0,
            availableQuantity: inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0,
            lastUpdated: inventoryItem.timeStamp,
            
            // Legacy field for compatibility
            runningQuantity: inventoryItem.availableQuantity || inventoryItem.runningQuantity || 0
          };

          console.log(`📊 CheckInventory for ${背番号}: Physical=${inventoryInfo.physicalQuantity}, Reserved=${inventoryInfo.reservedQuantity}, Available=${inventoryInfo.availableQuantity}`);

          res.json({
            success: true,
            inventory: inventoryInfo,
            message: `Physical: ${inventoryInfo.physicalQuantity}, Reserved: ${inventoryInfo.reservedQuantity}, Available: ${inventoryInfo.availableQuantity}`
          });

        } catch (error) {
          console.error("Error in checkInventory:", error);
          res.status(500).json({ error: "Failed to check inventory", details: error.message });
        }
        break;

      case 'lookupMasterData':
        try {
          const { 品番, 背番号 } = req.body;
          
          if (!品番 && !背番号) {
            return res.status(400).json({ error: "Either 品番 or 背番号 is required" });
          }

          // Connect to master database
          const masterDb = client.db("Sasaki_Coating_MasterDB");
          const masterCollection = masterDb.collection("masterDB");

          let query = {};
          if (品番) {
            query.品番 = 品番;
          } else if (背番号) {
            query.背番号 = 背番号;
          }

          const masterItem = await masterCollection.findOne(query);

          if (!masterItem) {
            return res.json({ 
              success: false, 
              message: `No master data found for ${品番 ? '品番: ' + 品番 : '背番号: ' + 背番号}` 
            });
          }

          res.json({
            success: true,
            data: {
              品番: masterItem.品番,
              背番号: masterItem.背番号,
              品名: masterItem.品名,
              モデル: masterItem.モデル,
              形状: masterItem.形状,
              色: masterItem.色
            }
          });

        } catch (error) {
          console.error("Error in lookupMasterData:", error);
          res.status(500).json({ error: "Failed to lookup master data", details: error.message });
        }
        break;

      case 'exportRequests':
        try {
          // Build query from filters (same as getNodaRequests)
          let query = {};

          if (filters.status) {
            query.status = filters.status;
          }

          if (filters['品番']) {
            query['品番'] = filters['品番'];
          }

          if (filters['背番号']) {
            query['背番号'] = filters['背番号'];
          }

          // Date range filter (using 納入指示日 deadline field)
          if (filters.dateRange) {
            query['納入指示日'] = {};
            if (filters.dateRange.from) {
              query['納入指示日'].$gte = filters.dateRange.from;
            }
            if (filters.dateRange.to) {
              query['納入指示日'].$lte = filters.dateRange.to;
            }
          }

          if (filters.search) {
            const searchRegex = new RegExp(filters.search, 'i');
            query.$or = [
              { 'requestNumber': searchRegex },
              { '品番': searchRegex },
              { '背番号': searchRegex },
              { 'status': searchRegex }
            ];
          }

          // Get all matching requests (no pagination for export)
          const requests = await requestsCollection
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

          res.json({
            success: true,
            data: requests
          });

        } catch (error) {
          console.error("Error in exportRequests:", error);
          res.status(500).json({ error: "Failed to export requests", details: error.message });
        }
        break;

      default:
        res.status(400).json({ error: "Invalid action" });
    }

  } catch (error) {
    console.error("Error in NODA requests API:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Calculate NODA statistics
 */
async function calculateNodaStatistics(collection, baseQuery = {}) {
  try {
    const stats = await collection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const statistics = {
      all: 0,
      pending: 0,
      'in-progress': 0,
      completed: 0,
      'partial-inventory': 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      if (stat._id && statistics.hasOwnProperty(stat._id)) {
        statistics[stat._id] = stat.count;
      }
      // Count all requests
      statistics.all += stat.count;
    });

    return statistics;
  } catch (error) {
    console.error("Error calculating NODA statistics:", error);
    return { all: 0, pending: 0, 'in-progress': 0, completed: 0, 'partial-inventory': 0, cancelled: 0 };
  }
}

// ==================== END OF NODA API ROUTES ====================








// ==================== INVENTORY MANAGEMENT API ROUTES ====================
// Copy this entire section to your server.js file

// Inventory Management API Route
app.post("/api/inventory-management", async (req, res) => {
  const { action, filters = {}, page = 1, limit = 10, sort = {}, 背番号 } = req.body;

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const inventoryCollection = db.collection("nodaInventoryDB");

    switch (action) {
      case 'getInventoryData':
        try {
          // Get latest inventory state for each unique 背番号
          const pipeline = [
            // First convert timeStamp to Date for proper sorting
            {
              $addFields: {
                timeStampDate: {
                  $cond: {
                    if: { $type: "$timeStamp" },
                    then: { $toDate: "$timeStamp" },
                    else: new Date()
                  }
                }
              }
            },
            // Sort by 背番号 and timestamp (newest first)
            {
              $sort: { 背番号: 1, timeStampDate: -1 }
            },
            // Group by 背番号 and get the latest record
            {
              $group: {
                _id: "$背番号",
                latestRecord: { $first: "$$ROOT" }
              }
            },
            // Replace root with the latest record
            {
              $replaceRoot: { newRoot: "$latestRecord" }
            }
          ];

          // Apply filters if provided
          const matchStage = {};
          if (filters['品番']) {
            matchStage['品番'] = filters['品番'];
          }
          if (filters['背番号']) {
            matchStage['背番号'] = filters['背番号'];
          }
          if (filters.search) {
            const searchRegex = new RegExp(filters.search, 'i');
            matchStage.$or = [
              { '品番': searchRegex },
              { '背番号': searchRegex }
            ];
          }

          // Add match stage if filters exist
          if (Object.keys(matchStage).length > 0) {
            pipeline.unshift({ $match: matchStage });
          }

          // Get filtered results
          const inventoryItems = await inventoryCollection.aggregate(pipeline).toArray();
          
          // Debug logging
          console.log(`📊 Found ${inventoryItems.length} inventory items`);
          if (inventoryItems.length > 0) {
            console.log('📝 Sample inventory item:', JSON.stringify(inventoryItems[0], null, 2));
          }

          // Calculate summary statistics
          const summary = calculateInventorySummary(inventoryItems);

          // Apply sorting
          if (sort.column) {
            inventoryItems.sort((a, b) => {
              let aVal = a[sort.column];
              let bVal = b[sort.column];
              
              // Handle numeric fields
              if (['physicalQuantity', 'reservedQuantity', 'availableQuantity', 'runningQuantity'].includes(sort.column)) {
                aVal = Number(aVal) || 0;
                bVal = Number(bVal) || 0;
              }
              
              // Handle date fields
              if (['timeStamp', 'lastUpdated'].includes(sort.column)) {
                aVal = new Date(aVal || 0);
                bVal = new Date(bVal || 0);
              }
              
              if (aVal < bVal) return -sort.direction;
              if (aVal > bVal) return sort.direction;
              return 0;
            });
          }

          // Apply pagination
          const totalItems = inventoryItems.length;
          const totalPages = Math.ceil(totalItems / limit);
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedItems = inventoryItems.slice(startIndex, endIndex);

          // Format data for frontend
          const formattedItems = paginatedItems.map(item => ({
            品番: item.品番,
            背番号: item.背番号,
            工場: item.工場,
            physicalQuantity: item.physicalQuantity || item.runningQuantity || 0,
            reservedQuantity: item.reservedQuantity || 0,
            availableQuantity: item.availableQuantity || item.runningQuantity || 0,
            lastUpdated: item.timeStamp
          }));

          res.json({
            success: true,
            data: formattedItems,
            summary: summary,
            pagination: {
              currentPage: page,
              totalPages: totalPages,
              totalItems: totalItems,
              itemsPerPage: limit
            }
          });

        } catch (error) {
          console.error("Error in getInventoryData:", error);
          res.status(500).json({ error: "Failed to fetch inventory data", details: error.message });
        }
        break;

      case 'getItemTransactions':
        try {
          if (!背番号) {
            return res.status(400).json({ error: "背番号 is required" });
          }

          // Get all transactions for the specific item, sorted by timestamp (newest first)
          const transactions = await inventoryCollection
            .find({ 背番号: 背番号 })
            .sort({ timeStamp: -1 })
            .toArray();

          if (transactions.length === 0) {
            return res.json({
              success: true,
              data: [],
              message: `No transactions found for ${背番号}`
            });
          }

          res.json({
            success: true,
            data: transactions
          });

        } catch (error) {
          console.error("Error in getItemTransactions:", error);
          res.status(500).json({ error: "Failed to fetch item transactions", details: error.message });
        }
        break;

      case 'getFilterOptions':
        try {
          // Get unique values for filters from latest inventory records
          const pipeline = [
            {
              $sort: { 背番号: 1, timeStamp: -1 }
            },
            {
              $group: {
                _id: "$背番号",
                latestRecord: { $first: "$$ROOT" }
              }
            },
            {
              $replaceRoot: { newRoot: "$latestRecord" }
            }
          ];

          const latestInventory = await inventoryCollection.aggregate(pipeline).toArray();

          const partNumbers = [...new Set(latestInventory.map(item => item.品番).filter(Boolean))].sort();
          const backNumbers = [...new Set(latestInventory.map(item => item.背番号).filter(Boolean))].sort();

          res.json({
            success: true,
            data: {
              partNumbers: partNumbers,
              backNumbers: backNumbers
            }
          });

        } catch (error) {
          console.error("Error in getFilterOptions:", error);
          res.status(500).json({ error: "Failed to fetch filter options", details: error.message });
        }
        break;

      case 'exportInventoryData':
        try {
          // Get latest inventory state for all items (no pagination for export)
          const pipeline = [
            {
              $sort: { 背番号: 1, timeStamp: -1 }
            },
            {
              $group: {
                _id: "$背番号",
                latestRecord: { $first: "$$ROOT" }
              }
            },
            {
              $replaceRoot: { newRoot: "$latestRecord" }
            }
          ];

          // Apply filters if provided
          const matchStage = {};
          if (filters['品番']) {
            matchStage['品番'] = filters['品番'];
          }
          if (filters['背番号']) {
            matchStage['背番号'] = filters['背番号'];
          }
          if (filters.search) {
            const searchRegex = new RegExp(filters.search, 'i');
            matchStage.$or = [
              { '品番': searchRegex },
              { '背番号': searchRegex }
            ];
          }

          if (Object.keys(matchStage).length > 0) {
            pipeline.unshift({ $match: matchStage });
          }

          const inventoryItems = await inventoryCollection.aggregate(pipeline).toArray();

          // Format data for export
          const exportData = inventoryItems.map(item => ({
            品番: item.品番,
            背番号: item.背番号,
            physicalQuantity: item.physicalQuantity || item.runningQuantity || 0,
            reservedQuantity: item.reservedQuantity || 0,
            availableQuantity: item.availableQuantity || item.runningQuantity || 0,
            lastUpdated: item.timeStamp
          }));

          res.json({
            success: true,
            data: exportData
          });

        } catch (error) {
          console.error("Error in exportInventoryData:", error);
          res.status(500).json({ error: "Failed to export inventory data", details: error.message });
        }
        break;

      default:
        res.status(400).json({ error: "Invalid action" });
    }

  } catch (error) {
    console.error("Error in inventory management API:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Calculate inventory summary statistics
 */
function calculateInventorySummary(inventoryItems) {
  const summary = {
    totalItems: inventoryItems.length,
    totalPhysicalStock: 0,
    totalReservedStock: 0,
    totalAvailableStock: 0
  };

  inventoryItems.forEach(item => {
    summary.totalPhysicalStock += item.physicalQuantity || item.runningQuantity || 0;
    summary.totalReservedStock += item.reservedQuantity || 0;
    summary.totalAvailableStock += item.availableQuantity || item.runningQuantity || 0;
  });

  return summary;
}

// Add Inventory API Route
app.post("/api/inventory/add", async (req, res) => {
  try {
    const { 品番, 背番号, physicalQuantityChange, action, source, Date, timeStamp } = req.body;

    // Validation
    if (!品番 || !背番号 || !physicalQuantityChange || physicalQuantityChange <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: 品番, 背番号, and physicalQuantityChange (must be > 0)" 
      });
    }

    if (!action || !source || !Date) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: action, source, and Date" 
      });
    }

    await client.connect();
    const db = client.db("submittedDB");
    const inventoryCollection = db.collection("nodaInventoryDB");

    // Get current inventory state for this item
    const currentInventory = await inventoryCollection.findOne(
      { 背番号: 背番号 },
      { sort: { timeStamp: -1 } }
    );

    const currentPhysicalQuantity = currentInventory ? (currentInventory.physicalQuantity || currentInventory.runningQuantity || 0) : 0;
    const currentReservedQuantity = currentInventory ? (currentInventory.reservedQuantity || 0) : 0;

    // Calculate new quantities
    const newPhysicalQuantity = currentPhysicalQuantity + physicalQuantityChange;
    const newAvailableQuantity = newPhysicalQuantity - currentReservedQuantity;

    // Create new inventory transaction record
    const inventoryTransaction = {
      背番号: 背番号,
      品番: 品番,
      timeStamp: timeStamp || new Date(),
      Date: Date,
      physicalQuantity: newPhysicalQuantity,
      reservedQuantity: currentReservedQuantity,
      availableQuantity: newAvailableQuantity,
      runningQuantity: newPhysicalQuantity, // For backward compatibility
      lastQuantity: currentPhysicalQuantity,
      action: `${action} (+${physicalQuantityChange})`,
      source: source
    };

    // Insert the transaction
    const insertResult = await inventoryCollection.insertOne(inventoryTransaction);

    if (insertResult.acknowledged) {
      res.json({
        success: true,
        message: `Successfully added ${physicalQuantityChange} units to inventory`,
        data: {
          品番: 品番,
          背番号: 背番号,
          previousPhysicalQuantity: currentPhysicalQuantity,
          newPhysicalQuantity: newPhysicalQuantity,
          availableQuantity: newAvailableQuantity
        }
      });
    } else {
      throw new Error("Failed to insert inventory transaction");
    }

  } catch (error) {
    console.error("Error adding inventory:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error", 
      details: error.message 
    });
  }
});

// ==================== END OF INVENTORY MANAGEMENT API ROUTES ====================




// ==================== API ROUTES FOR DYNAMIC FILTER SYSTEM ====================
// Copy and paste these routes into your server.js file

/**
 * API Route: Get distinct values from a collection field
 * Used for auto-populating dropdown filters
 * 
 * POST /api/distinct
 * Body: {
 *   dbName: "submittedDB",
 *   collectionName: "kensaDB" | "pressDB" | "SRSDB" | "slitDB",
 *   field: "Worker_Name" | "設備" | "モデル" | etc,
 *   filter: { "工場": "第二工場" } // optional additional filters
 * }
 * 
 * Response: {
 *   values: ["value1", "value2", ...],
 *   count: 123
 * }
 */
app.post('/api/distinct', async (req, res) => {
    try {
        const { dbName, collectionName, field, filter } = req.body;
        
        console.log(`📋 Fetching distinct values for ${field} from ${collectionName}...`);
        
        // Validate required parameters
        if (!dbName || !collectionName || !field) {
            return res.status(400).json({ 
                error: 'Missing required parameters: dbName, collectionName, and field are required' 
            });
        }
        
        // Use existing client connection (don't create new connection)
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        
        // Build query - use provided filter or default to empty object
        const query = filter || {};
        
        // Use aggregation for better performance (similar to your masterdb/filters route)
        const uniqueValues = await collection.aggregate([
            {
                $match: {
                    ...query,
                    [field]: { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: `$${field}`
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: '$_id'
                }
            }
        ]).toArray();
        
        const cleanedValues = uniqueValues.map(item => item.value);
        
        console.log(`✅ Found ${cleanedValues.length} unique ${field} values`);
        
        res.json({
            values: cleanedValues,
            count: cleanedValues.length,
            field: field,
            collection: collectionName
        });
        
    } catch (error) {
        console.error('❌ Error fetching distinct values:', error);
        res.status(500).json({ 
            error: 'Failed to fetch distinct values',
            details: error.message 
        });
    }
});

/**
 * Enhanced /queries endpoint documentation
 * 
 * This endpoint already exists in your server.js but now supports more complex queries
 * with dynamic filters. Here are examples of the MongoDB queries it can handle:
 * 
 * POST /queries
 * Body: {
 *   dbName: "submittedDB",
 *   collectionName: "kensaDB",
 *   query: {
 *     // Basic filters
 *     "工場": "第二工場",
 *     "Date": { "$gte": "2025-10-30", "$lte": "2025-10-30" },
 *     
 *     // Text filters
 *     "品番": "83719-59S20-WM6",                      // Exact match
 *     "品番": { "$regex": "83719", "$options": "i" }, // Contains (case-insensitive)
 *     "品番": { "$in": ["GN200-A0400", "GN200-B0500"] }, // Multiple values
 *     
 *     // Number filters
 *     "Total": 100,                    // Exact match
 *     "Total": { "$gt": 100 },         // Greater than
 *     "Total": { "$lt": 100 },         // Less than
 *     "Total": { "$gte": 50, "$lte": 100 }, // Range
 *     
 *     // Select/Dropdown filters
 *     "Worker_Name": "平野",           // Single selection
 *     "Worker_Name": { "$in": ["平野", "田中"] }, // Multiple selections
 *     "設備": "検査テーブル 1",
 *     "モデル": { "$in": ["Model A", "Model B"] },
 *     
 *     // Time filters (as strings)
 *     "Time_start": "08:57",
 *     "Time_start": { "$gte": "08:00", "$lte": "17:00" },
 *     
 *     // Status filters
 *     "approvalStatus": "hancho_approved",
 *     "approvalStatus": { "$in": ["pending", "hancho_approved"] }
 *   }
 * }
 * 
 * Example Complex Query:
 * {
 *   "dbName": "submittedDB",
 *   "collectionName": "kensaDB",
 *   "query": {
 *     "工場": "第二工場",
 *     "Date": { "$gte": "2025-10-01", "$lte": "2025-10-31" },
 *     "Worker_Name": { "$in": ["平野", "田中"] },
 *     "Total": { "$gte": 100 },
 *     "Total_NG": { "$gt": 0 },
 *     "品番": { "$regex": "83719", "$options": "i" },
 *     "approvalStatus": "hancho_approved"
 *   }
 * }
 * 
 * This query finds all records where:
 * - Factory is 第二工場
 * - Date is in October 2025
 * - Worker is either 平野 or 田中
 * - Total quantity is at least 100
 * - Has at least 1 NG item
 * - Part number contains "83719"
 * - Status is hancho_approved
 */

/**
 * Test endpoint to verify the API is working
 * GET /api/distinct/test
 */
app.get('/api/distinct/test', async (req, res) => {
    try {
        console.log('🧪 Testing /api/distinct endpoint...');
        
        // Use existing client connection
        const db = client.db('submittedDB');
        const collection = db.collection('kensaDB');
        
        // Test query: Get distinct worker names from 第二工場
        const workers = await collection.distinct('Worker_Name', { '工場': '第二工場' });
        
        const cleanedWorkers = workers.filter(w => w);
        
        console.log(`✅ Test successful! Found ${cleanedWorkers.length} workers`);
        
        res.json({
            status: 'success',
            message: 'API is working correctly',
            test_data: {
                field: 'Worker_Name',
                factory: '第二工場',
                distinct_values: cleanedWorkers,
                count: cleanedWorkers.length
            }
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});





//FREYA ADMIN BACKEND END




//SCNA ADMIN BACKEND START



// Get work orders with filters, pagination, and sorting
app.post("/api/workorders", async (req, res) => {
  const { action, filters = {}, page = 1, limit = 10, sort = {} } = req.body;

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");

    if (action === 'getWorkOrders') {
      // Build MongoDB query from filters
      let query = {};

      // Status filter
      if (filters.Status) {
        query.Status = filters.Status;
      }

      // Customer filter
      if (filters['Customer-Custom fields']) {
        query['Customer-Custom fields'] = filters['Customer-Custom fields'];
      }

      // Assignee filter
      if (filters['Assign to-Custom fields']) {
        query['Assign to-Custom fields'] = filters['Assign to-Custom fields'];
      }

      // Date range filter (filter by Deadline, not Date and time)
      if (filters.dateRange) {
        query['Deadline'] = {};
        if (filters.dateRange.from) {
          // Handle both string and Date formats for deadline comparison
          query['Deadline'].$gte = filters.dateRange.from + 'T00:00:00';
        }
        if (filters.dateRange.to) {
          // Handle both string and Date formats for deadline comparison
          query['Deadline'].$lte = filters.dateRange.to + 'T23:59:59.999';
        }
        
        // Debug: Log date range query
        console.log('📅 Date range query (Deadline):', {
          original: filters.dateRange,
          query: query['Deadline']
        });
      }

      // Search filter (searches across multiple fields)
      if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        query.$or = [
          { 'Number': searchRegex },
          { 'Customer-Custom fields': searchRegex },
          { 'P_SKU-Custom fields': searchRegex },
          { 'Assign to-Custom fields': searchRegex },
          { 'Owner': searchRegex },
          { 'Status': searchRegex }
        ];
      }

      console.log('Work Order Query:', JSON.stringify(query, null, 2));

      // Build sort object
      let sortObj = {};
      if (sort.column) {
        sortObj[sort.column] = sort.direction || 1;
      } else {
        sortObj['Date and time'] = -1; // Default sort by date descending
      }

      // Get total count for pagination
      const totalCount = await collection.countDocuments(query);

      // Get paginated data
      const skip = (page - 1) * limit;
      const data = await collection
        .find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      console.log('Work Order Query Results:', {
        totalCount,
        returnedCount: data.length,
        sampleDeadlines: data.slice(0, 3).map(d => ({ 
          number: d.Number, 
          deadline: d['Deadline'],
          deadlineType: typeof d['Deadline']
        }))
      });

      // Get statistics
      const statistics = await calculateWorkOrderStatistics(collection, query);

      res.json({
        success: true,
        data: data,
        statistics: statistics,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      });

    } else if (action === 'getWorkOrderById') {
      const { workOrderId } = req.body;
      
      if (!workOrderId) {
        return res.status(400).json({ error: "Work Order ID is required" });
      }

      const workOrder = await collection.findOne({ _id: new ObjectId(workOrderId) });
      
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      res.json({
        success: true,
        data: workOrder
      });

    } else {
      res.status(400).json({ error: "Invalid action" });
    }

  } catch (error) {
    console.error("Error in work orders API:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Get unique assignee options
app.get("/api/workorders/assignees", async (req, res) => {
  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");

    // Use aggregation pipeline instead of distinct() for API Version 1 compatibility
    const assignees = await collection.aggregate([
      {
        $match: {
          "Assign to-Custom fields": { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: "$Assign to-Custom fields"
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray();
    
    // Extract the assignee values from the aggregation result
    const assigneeList = assignees.map(item => item._id).filter(assignee => 
      assignee && assignee.trim() !== ''
    );

    console.log('📋 Assignee options loaded:', assigneeList.length, 'unique assignees');

    res.json({
      success: true,
      data: assigneeList
    });

  } catch (error) {
    console.error("Error getting assignee options:", error);
    res.status(500).json({ error: "Error getting assignee options", details: error.message });
  }
});

// Update work order
app.put("/api/workorders/:id", async (req, res) => {
  const { id } = req.params;
  const { data, username } = req.body;

  if (!data || !username) {
    return res.status(400).json({ error: "Missing data or username" });
  }

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");
    const logCollection = db.collection("SCNAWorkOrderDB_Log");

    // Get original document for logging
    const originalDoc = await collection.findOne({ _id: new ObjectId(id) });
    
    if (!originalDoc) {
      return res.status(404).json({ error: "Work order not found" });
    }

    // Update the document
    const updateData = {
      ...data,
      'Last Updated': new Date(),
      'Last Updated By': username
    };

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Work order not found" });
    }

    // Log the update
    await logCollection.insertOne({
      _id: new ObjectId(),
      workOrderId: new ObjectId(id),
      action: "update",
      username,
      timestamp: new Date(),
      originalData: originalDoc,
      newData: updateData,
      changes: getChangedFields(originalDoc, updateData)
    });

    res.json({
      success: true,
      message: "Work order updated successfully",
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("Error updating work order:", error);
    res.status(500).json({ error: "Error updating work order", details: error.message });
  }
});

// Create new work order
app.post("/api/workorders/create", async (req, res) => {
  const { data, username } = req.body;

  if (!data || !username) {
    return res.status(400).json({ error: "Missing data or username" });
  }

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");
    const logCollection = db.collection("SCNAWorkOrderDB_Log");

    // Add metadata
    const workOrderData = {
      ...data,
      'Date and time': new Date(),
      'Created By': username,
      'Last Updated': new Date(),
      'Last Updated By': username
    };

    // Insert the work order
    const result = await collection.insertOne(workOrderData);

    // Log the creation
    await logCollection.insertOne({
      _id: new ObjectId(),
      workOrderId: result.insertedId,
      action: "create",
      username,
      timestamp: new Date(),
      newData: workOrderData
    });

    res.status(201).json({
      success: true,
      message: "Work order created successfully",
      insertedId: result.insertedId
    });

  } catch (error) {
    console.error("Error creating work order:", error);
    res.status(500).json({ error: "Error creating work order", details: error.message });
  }
});

// Delete work order
app.delete("/api/workorders/:id", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");
    const logCollection = db.collection("SCNAWorkOrderDB_Log");

    // Get the document before deletion for logging
    const originalDoc = await collection.findOne({ _id: new ObjectId(id) });
    
    if (!originalDoc) {
      return res.status(404).json({ error: "Work order not found" });
    }

    // Delete the document
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Work order not found" });
    }

    // Log the deletion
    await logCollection.insertOne({
      _id: new ObjectId(),
      workOrderId: new ObjectId(id),
      action: "delete",
      username,
      timestamp: new Date(),
      deletedData: originalDoc
    });

    res.json({
      success: true,
      message: "Work order deleted successfully",
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error("Error deleting work order:", error);
    res.status(500).json({ error: "Error deleting work order", details: error.message });
  }
});

// Get work order statistics
app.post("/api/workorders/statistics", async (req, res) => {
  const { filters = {} } = req.body;

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");

    // Build base query from filters (excluding status filter for comprehensive stats)
    let baseQuery = {};

    if (filters['Customer-Custom fields']) {
      baseQuery['Customer-Custom fields'] = filters['Customer-Custom fields'];
    }

    if (filters['Assign to-Custom fields']) {
      baseQuery['Assign to-Custom fields'] = filters['Assign to-Custom fields'];
    }

    if (filters.dateRange) {
      baseQuery['Deadline'] = {};
      if (filters.dateRange.from) {
        baseQuery['Deadline'].$gte = filters.dateRange.from + 'T00:00:00';
      }
      if (filters.dateRange.to) {
        baseQuery['Deadline'].$lte = filters.dateRange.to + 'T23:59:59.999';
      }
    }

    if (filters.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      baseQuery.$or = [
        { 'Number': searchRegex },
        { 'Customer-Custom fields': searchRegex },
        { 'P_SKU-Custom fields': searchRegex },
        { 'Assign to-Custom fields': searchRegex },
        { 'Owner': searchRegex }
      ];
    }

    const statistics = await calculateWorkOrderStatistics(collection, baseQuery);

    res.json({
      success: true,
      statistics: statistics
    });

  } catch (error) {
    console.error("Error getting work order statistics:", error);
    res.status(500).json({ error: "Error getting statistics", details: error.message });
  }
});

// Helper function to calculate work order statistics
async function calculateWorkOrderStatistics(collection, baseQuery) {
  const now = new Date();
  
  // Get status counts
  const statusCounts = await collection.aggregate([
    { $match: baseQuery },
    {
      $group: {
        _id: "$Status",
        count: { $sum: 1 }
      }
    }
  ]).toArray();

  // Convert to object for easier access
  const statusMap = {};
  statusCounts.forEach(item => {
    statusMap[item._id] = item.count;
  });

  // Get overdue orders
  const overdueQuery = {
    ...baseQuery,
    Deadline: { $lt: now },
    Status: { $nin: ['Completed', 'Cancelled'] }
  };
  const overdueCount = await collection.countDocuments(overdueQuery);

  // Calculate total
  const total = statusCounts.reduce((sum, item) => sum + item.count, 0);

  return {
    total: total,
    entered: statusMap['Entered'] || 0,
    inProgress: statusMap['In Progress'] || 0,
    completed: statusMap['Completed'] || 0,
    cancelled: statusMap['Cancelled'] || 0,
    overdue: overdueCount
  };
}

// Helper function to get changed fields
function getChangedFields(original, updated) {
  const changes = [];
  
  for (const key in updated) {
    if (original[key] !== updated[key]) {
      changes.push({
        field: key,
        oldValue: original[key],
        newValue: updated[key]
      });
    }
  }
  
  return changes;
}

console.log('✅ SCNA Work Order routes loaded');


/**
 * FREYA TABLET ROUTES - Updated with Server-side Pagination
 * Copy these routes to your server.js file to replace the existing Freya Tablet routes
 */

// Get production records from pressDB filtered by SCNA factory with pagination and sorting
app.get('/api/freya-tablet-data', async (req, res) => {
    try {
        console.log('🏭 Fetching Freya Tablet production records...');
        
        // Extract pagination and sort parameters from query
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortField = req.query.sortField || 'Date';
        const sortDirection = parseInt(req.query.sortDirection) || -1;
        
        // Extract filter parameters
        const equipment = req.query.equipment;
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;
        const search = req.query.search;
        
        await client.connect();
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Build match filter for SCNA factory
        const matchFilter = {
            "工場": "SCNA"
        };
        
        // Add equipment filter
        if (equipment) {
            matchFilter["設備"] = equipment;
        }
        
        // Add date range filter
        if (dateFrom || dateTo) {
            const dateFilter = {};
            
            if (dateFrom) {
                // For Date field in "yyyy-mm-dd" format, use string comparison
                dateFilter.$gte = dateFrom;
            }
            
            if (dateTo) {
                dateFilter.$lte = dateTo;
            }
            
            // Use the Date field which is in "yyyy-mm-dd" format
            matchFilter["Date"] = dateFilter;
        }
        
        // Add search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            const searchConditions = [
                { "設備": searchRegex },
                { "品番": searchRegex },
                { "背番号": searchRegex },
                { "Worker_Name": searchRegex },
                { "材料ロット": searchRegex },
                { "Comment": searchRegex }
            ];
            
            // If we already have an $or condition for dates, we need to use $and
            if (matchFilter.$or) {
                matchFilter.$and = [
                    { $or: matchFilter.$or },
                    { $or: searchConditions }
                ];
                delete matchFilter.$or;
            } else {
                matchFilter.$or = searchConditions;
            }
        }
        
        console.log('🔍 Match filter:', JSON.stringify(matchFilter, null, 2));
        
        // Build sort object
        const sortObject = {};
        sortObject[sortField] = sortDirection;
        
        // Add default secondary sorts for consistency
        if (sortField !== 'Date') sortObject['Date'] = -1;
        if (sortField !== '_id') sortObject['_id'] = -1;
        
        // Get total count for pagination AFTER applying filters
        const totalItems = await collection.countDocuments(matchFilter);
        const totalPages = Math.ceil(totalItems / limit);
        const skip = (page - 1) * limit;
        
        console.log(`📊 Pagination calculation: ${totalItems} total items, ${limit} per page = ${totalPages} pages, skipping ${skip} items`);
        
        // Build aggregation pipeline with pagination
        const pipeline = [
            {
                $match: matchFilter
            },
            {
                $sort: sortObject
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            }
        ];
        
        // Execute aggregation
        const records = await collection.aggregate(pipeline).toArray();
        
        console.log(`Found ${records.length} production records for SCNA factory (page ${page}/${totalPages})`);
        
        res.json({
            success: true,
            data: records,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            statistics: {
                totalRecords: totalItems,
                currentPageRecords: records.length
            },
            total: records.length,
            message: `Retrieved ${records.length} production records (page ${page}/${totalPages})`
        });
        
    } catch (error) {
        console.error('Error fetching Freya Tablet data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch production records: ' + error.message,
            data: [],
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: limit || 10,
                hasNextPage: false,
                hasPrevPage: false
            }
        });
    }
});

// Get equipment options for filter dropdown
app.get('/api/freya-tablet-equipment-options', async (req, res) => {
    try {
        console.log('🔧 Fetching equipment options for Freya Tablet...');
        
        await client.connect();
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Use aggregation to get distinct equipment values for SCNA factory
        const pipeline = [
            {
                $match: {
                    "工場": "SCNA",
                    "設備": { $exists: true, $ne: null, $ne: "" }
                }
            },
            {
                $group: {
                    _id: "$設備"
                }
            },
            {
                $sort: { _id: 1 }
            }
        ];
        
        const equipmentDocs = await collection.aggregate(pipeline).toArray();
        const equipment = equipmentDocs.map(doc => doc._id);
        
        console.log(`Found ${equipment.length} unique equipment options`);
        
        res.json({
            success: true,
            data: equipment
        });
        
    } catch (error) {
        console.error('Error fetching equipment options:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch equipment options: ' + error.message,
            data: []
        });
    }
});

// Get production statistics for SCNA factory
app.get('/api/freya-tablet-statistics', async (req, res) => {
    try {
        const { dateFrom, dateTo, equipment } = req.query;
        
        console.log('📈 Fetching Freya Tablet statistics...');
        
        await client.connect();
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Build match criteria
        const matchCriteria = {
            "工場": "SCNA"
        };
        
        // Add date filter if provided
        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom) {
                dateFilter.$gte = new Date(dateFrom);
            }
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                dateFilter.$lte = toDate;
            }
            
            // Try multiple date field names
            matchCriteria.$or = [
                { "作成日時": dateFilter },
                { "日時": dateFilter },
                { "時刻": dateFilter }
            ];
        }
        
        // Add equipment filter if provided
        if (equipment) {
            matchCriteria["設備"] = equipment;
        }
        
        // Aggregation pipeline for statistics
        const pipeline = [
            { $match: matchCriteria },
            {
                $group: {
                    _id: null,
                    totalRecords: { $sum: 1 },
                    totalQuantity: {
                        $sum: {
                            $toInt: {
                                $ifNull: ["$数量", 0]
                            }
                        }
                    },
                    totalNG: {
                        $sum: {
                            $toInt: {
                                $ifNull: ["$NG数", 0]
                            }
                        }
                    },
                    avgCycleTime: {
                        $avg: {
                            $toDouble: {
                                $ifNull: ["$サイクルタイム", 0]
                            }
                        }
                    }
                }
            }
        ];
        
        const result = await collection.aggregate(pipeline).toArray();
        const stats = result.length > 0 ? result[0] : {
            totalRecords: 0,
            totalQuantity: 0,
            totalNG: 0,
            avgCycleTime: 0
        };
        
        console.log('Statistics calculated:', stats);
        
        res.json({
            success: true,
            data: {
                totalRecords: stats.totalRecords || 0,
                totalQuantity: stats.totalQuantity || 0,
                totalNG: stats.totalNG || 0,
                avgCycleTime: Math.round((stats.avgCycleTime || 0) * 100) / 100
            }
        });
        
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics: ' + error.message,
            data: {
                totalRecords: 0,
                totalQuantity: 0,
                totalNG: 0,
                avgCycleTime: 0
            }
        });
    }
});

console.log("🏭 Freya Tablet routes with server-side pagination loaded successfully");


// ==================== BULK UPLOAD ROUTE FOR WORK ORDERS ====================
// Add this route to your existing server.js file

/**
 * Helper function to format any date to YYYY-MM-DD format
 */
function formatDateToYYYYMMDD(dateInput) {
  if (!dateInput) return null;
  
  let date;
  
  // Handle different input types
  if (typeof dateInput === 'string') {
    // Parse ISO string or other date string formats
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    console.warn('Invalid date input:', dateInput);
    return null;
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    console.warn('Invalid date parsed:', dateInput);
    return null;
  }
  
  // Format to YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Bulk upload work orders from JSON
app.post("/api/workorders/bulk-upload", async (req, res) => {
  const { workOrders, username, overwrite = false } = req.body;

  if (!workOrders || !Array.isArray(workOrders) || workOrders.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid work orders data. Must be a non-empty array." 
    });
  }

  if (!username) {
    return res.status(400).json({ 
      success: false, 
      error: "Username is required for bulk upload." 
    });
  }

  try {
    await client.connect();
    const db = client.db("submittedDB");
    const collection = db.collection("SCNAWorkOrderDB");
    const logCollection = db.collection("SCNAWorkOrderDB_Log");

    const currentTime = new Date();
    let insertedCount = 0;
    let duplicates = [];
    let errors = [];
    let uploadedNumbers = []; // Track successfully uploaded work order numbers

    // Check for existing work orders first
    const workOrderNumbers = workOrders.map(wo => wo.Number);
    const existingOrders = await collection.find(
      { Number: { $in: workOrderNumbers } }
    ).toArray();

    const existingNumbers = new Set(existingOrders.map(order => order.Number));

    // Separate new orders from duplicates
    const newOrders = [];
    workOrders.forEach(order => {
      if (existingNumbers.has(order.Number)) {
        duplicates.push(order);
      } else {
        newOrders.push(order);
      }
    });

    // If not overwriting and duplicates exist, only process new orders
    if (!overwrite && duplicates.length > 0) {
      console.log(`📋 Found ${duplicates.length} duplicate work orders, processing ${newOrders.length} new orders`);
    }

    // Process orders to insert
    const ordersToProcess = overwrite ? workOrders : newOrders;

    for (const orderData of ordersToProcess) {
      try {
        // Validate required fields
        const requiredFields = ['Number', 'Status', 'Customer-Custom fields', 'P_SKU-Custom fields'];
        const missingFields = requiredFields.filter(field => 
          !orderData.hasOwnProperty(field) || orderData[field] === null || orderData[field] === ''
        );

        if (missingFields.length > 0) {
          errors.push({
            workOrderNumber: orderData.Number || 'Unknown',
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Prepare work order data with metadata
        const workOrderWithMetadata = {
          ...orderData,
          // Keep date formats consistent - convert to simple date format
          'Date and time': orderData['Date and time'] || currentTime.toISOString(),
          'Deadline': orderData['Deadline'] ? formatDateToYYYYMMDD(orderData['Deadline']) : null,
          'Created By': orderData['Created By'] || username,
          'Last Updated': currentTime,
          'Last Updated By': username,
          // Ensure numeric fields are properly typed
          'Material loading (%)': Number(orderData['Material loading (%)']) || 0,
          'Finished goods note (%)': Number(orderData['Finished goods note (%)']) || 0,
          'Estimated cost': Number(orderData['Estimated cost']) || 0
        };

        if (overwrite && existingNumbers.has(orderData.Number)) {
          // Update existing work order
          const existingOrder = existingOrders.find(order => order.Number === orderData.Number);
          
          const result = await collection.updateOne(
            { Number: orderData.Number },
            { $set: workOrderWithMetadata }
          );

          if (result.modifiedCount > 0) {
            insertedCount++;
            uploadedNumbers.push(orderData.Number); // Track uploaded work order

            // Log the update
            await logCollection.insertOne({
              _id: new ObjectId(),
              workOrderId: existingOrder._id,
              action: "bulk_update",
              username,
              timestamp: currentTime,
              originalData: existingOrder,
              newData: workOrderWithMetadata,
              source: "json_upload"
            });
          }
        } else {
          // Insert new work order
          const result = await collection.insertOne(workOrderWithMetadata);

          if (result.insertedId) {
            insertedCount++;
            uploadedNumbers.push(orderData.Number); // Track uploaded work order

            // Log the creation
            await logCollection.insertOne({
              _id: new ObjectId(),
              workOrderId: result.insertedId,
              action: "bulk_create",
              username,
              timestamp: currentTime,
              newData: workOrderWithMetadata,
              source: "json_upload"
            });
          }
        }

      } catch (orderError) {
        console.error(`Error processing work order ${orderData.Number}:`, orderError);
        errors.push({
          workOrderNumber: orderData.Number || 'Unknown',
          error: orderError.message
        });
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: `Bulk upload completed. ${insertedCount} work orders processed.`,
      inserted: insertedCount,
      total: workOrders.length,
      uploadedNumbers: uploadedNumbers, // Include list of uploaded work order numbers
      errors: errors
    };

    // Include duplicates info if not overwriting
    if (!overwrite && duplicates.length > 0) {
      response.duplicates = duplicates;
      response.message += ` ${duplicates.length} duplicates found.`;
    }

    console.log(`✅ Bulk upload completed:`, {
      totalReceived: workOrders.length,
      inserted: insertedCount,
      uploadedNumbers: uploadedNumbers,
      duplicates: duplicates.length,
      duplicateNumbers: duplicates.map(d => d.Number),
      errors: errors.length
    });

    res.json(response);

  } catch (error) {
    console.error("❌ Error in bulk upload:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error during bulk upload", 
      details: error.message 
    });
  }
});

console.log('✅ Bulk upload route for work orders loaded');



// SCNA Machine Analytics API Route

// Get SCNA machine analytics data
app.post('/api/scna/machine-analytics', async (req, res) => {
    let client;
    
    try {
        const { dateFrom, dateTo, machine } = req.body;
        
        console.log('📊 Fetching SCNA machine analytics...', { dateFrom, dateTo, machine });
        
        client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
        await client.connect();
        
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Build match criteria
        const matchCriteria = {
            "工場": "SCNA"
        };
        
        // Add date filter
        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom) {
                dateFilter.$gte = dateFrom;
            }
            if (dateTo) {
                dateFilter.$lte = dateTo;
            }
            matchCriteria.Date = dateFilter;
        }
        
        // Add machine filter
        if (machine && machine !== 'all') {
            matchCriteria.設備 = machine;
        }
        
        console.log('🔍 Match criteria:', matchCriteria);
        
        // Fetch machine data with all necessary fields
        const machineData = await collection.find(matchCriteria)
            .sort({ Date: 1, Time_start: 1 })
            .toArray();
        
        console.log(`✅ Found ${machineData.length} machine records`);
        
        // Calculate summary statistics
        const summary = {
            totalRecords: machineData.length,
            machines: [...new Set(machineData.map(item => item.設備))].filter(Boolean),
            dateRange: {
                from: dateFrom,
                to: dateTo
            },
            totalWorkHours: machineData.reduce((sum, item) => sum + (item.Total_Work_Hours || 0), 0),
            totalBreakHours: machineData.reduce((sum, item) => sum + (item.Total_Break_Hours || 0), 0),
            totalProduction: machineData.reduce((sum, item) => sum + (item.Total || 0), 0)
        };
        
        res.json({
            success: true,
            data: machineData,
            summary: summary,
            message: `Retrieved ${machineData.length} machine records`
        });
        
    } catch (error) {
        console.error('❌ Error fetching SCNA machine analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch machine analytics: ' + error.message,
            data: []
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// ==================== EQUIPMENT PAGE OPTIMIZED ENDPOINTS ====================

/**
 * GET /api/equipment/list
 * Returns unique equipment names grouped by factory
 * Optimized: Uses aggregation instead of fetching all records
 */
app.get('/api/equipment/list', async (req, res) => {
    try {
        console.log('🔧 Fetching equipment list (optimized)...');
        
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Use aggregation to get unique equipment-factory combinations efficiently
        const results = await collection.aggregate([
            {
                $match: {
                    設備: { $exists: true, $ne: null, $ne: '' },
                    工場: { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: { equipment: '$設備', factory: '$工場' }
                }
            },
            {
                $group: {
                    _id: '$_id.factory',
                    equipment: { $addToSet: '$_id.equipment' }
                }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id',
                    equipment: 1
                }
            },
            { $sort: { factory: 1 } }
        ]).toArray();
        
        // Transform to object format: { factory: [equipment1, equipment2, ...] }
        const equipmentByFactory = {};
        const allEquipment = [];
        
        results.forEach(item => {
            equipmentByFactory[item.factory] = item.equipment.sort();
            allEquipment.push(...item.equipment);
        });
        
        console.log(`✅ Found ${allEquipment.length} unique equipment across ${results.length} factories`);
        
        res.json({
            success: true,
            equipmentByFactory: equipmentByFactory,
            allEquipment: [...new Set(allEquipment)].sort(),
            factoryCount: results.length
        });
        
    } catch (error) {
        console.error('❌ Error fetching equipment list:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch equipment list: ' + error.message
        });
    }
});

/**
 * POST /api/equipment/data
 * Returns filtered equipment data with server-side aggregation
 * Optimized: Only fetches needed fields and performs grouping on server
 */
app.post('/api/equipment/data', async (req, res) => {
    try {
        const { startDate, endDate, equipment } = req.body;
        
        console.log('📊 Fetching equipment data (optimized)...');
        console.log(`   Date range: ${startDate} to ${endDate}`);
        console.log(`   Equipment count: ${equipment?.length || 'all'}`);
        
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Build match query
        const matchQuery = {};
        
        if (startDate || endDate) {
            matchQuery.Date = {};
            if (startDate) matchQuery.Date.$gte = startDate;
            if (endDate) matchQuery.Date.$lte = endDate;
        }
        
        if (equipment && equipment.length > 0) {
            matchQuery.設備 = { $in: equipment };
        }
        
        // Fetch data with only needed fields (projection)
        const results = await collection.find(matchQuery, {
            projection: {
                設備: 1,
                工場: 1,
                Date: 1,
                品番: 1,
                背番号: 1,
                ショット数: 1,
                Process_Quantity: 1,
                Total_NG: 1,
                Time_start: 1,
                Time_end: 1,
                作業者: 1,
                STATUS: 1
            }
        }).toArray();
        
        console.log(`✅ Found ${results.length} records`);
        
        res.json({
            success: true,
            data: results,
            count: results.length
        });
        
    } catch (error) {
        console.error('❌ Error fetching equipment data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch equipment data: ' + error.message
        });
    }
});

// ==================== END EQUIPMENT PAGE ENDPOINTS ====================

// ==================== FACTORY OVERVIEW OPTIMIZED ENDPOINTS ====================

/**
 * GET /api/factory-overview/stats
 * Returns production stats (total, totalNG, defectRate) for ALL factories in ONE query
 * Optimized: Single aggregation instead of 8 separate queries
 */
app.get('/api/factory-overview/stats', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        console.log(`🏭 Fetching factory overview stats for date: ${date}`);
        
        const db = client.db('submittedDB');
        const collection = db.collection('kensaDB');
        
        // Single aggregation to get stats for ALL factories
        const results = await collection.aggregate([
            {
                $match: { Date: date }
            },
            {
                $group: {
                    _id: '$工場',
                    total: { $sum: { $ifNull: ['$Process_Quantity', 0] } },
                    totalNG: { $sum: { $ifNull: ['$Total_NG', 0] } },
                    recordCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id',
                    total: 1,
                    totalNG: 1,
                    recordCount: 1,
                    defectRate: {
                        $cond: {
                            if: { $gt: ['$total', 0] },
                            then: { $round: [{ $multiply: [{ $divide: ['$totalNG', '$total'] }, 100] }, 2] },
                            else: 0
                        }
                    }
                }
            },
            { $sort: { factory: 1 } }
        ]).toArray();
        
        // Convert to object keyed by factory name for easy lookup
        const factoryStats = {};
        results.forEach(item => {
            if (item.factory) {
                factoryStats[item.factory] = {
                    total: item.total,
                    totalNG: item.totalNG,
                    defectRate: item.defectRate,
                    recordCount: item.recordCount
                };
            }
        });
        
        console.log(`✅ Factory stats loaded for ${Object.keys(factoryStats).length} factories`);
        
        res.json({
            success: true,
            date: date,
            data: factoryStats
        });
        
    } catch (error) {
        console.error('❌ Error fetching factory overview stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch factory stats: ' + error.message
        });
    }
});

/**
 * GET /api/factory-overview/sensors
 * Returns sensor data for ALL factories in ONE query
 * Optimized: Single query instead of 8+ separate queries
 */
app.get('/api/factory-overview/sensors', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        console.log(`🌡️ Fetching sensor data for all factories on date: ${date}`);
        
        const db = client.db('submittedDB');
        const collection = db.collection('tempHumidityDB');
        
        // Get latest sensor readings for each device, grouped by factory
        const results = await collection.aggregate([
            {
                $match: { Date: date }
            },
            {
                $addFields: {
                    temperatureNum: {
                        $toDouble: {
                            $trim: {
                                input: { $replaceAll: { input: { $ifNull: ['$Temperature', '0'] }, find: '°C', replacement: '' } }
                            }
                        }
                    },
                    humidityNum: {
                        $toDouble: {
                            $trim: {
                                input: { $replaceAll: { input: { $ifNull: ['$Humidity', '0'] }, find: '%', replacement: '' } }
                            }
                        }
                    }
                }
            },
            {
                $sort: { Date: -1, Time: -1 }
            },
            {
                $group: {
                    _id: { factory: '$工場', device: '$device' },
                    latestReading: { $first: '$$ROOT' }
                }
            },
            {
                $group: {
                    _id: '$_id.factory',
                    sensors: { $push: '$latestReading' },
                    highestTemp: { $max: '$latestReading.temperatureNum' },
                    avgTemp: { $avg: '$latestReading.temperatureNum' },
                    avgHumidity: { $avg: '$latestReading.humidityNum' },
                    sensorCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    factory: '$_id',
                    highestTemp: { $round: ['$highestTemp', 2] },
                    avgTemp: { $round: ['$avgTemp', 2] },
                    avgHumidity: { $round: ['$avgHumidity', 1] },
                    sensorCount: 1,
                    hasData: { $gt: ['$sensorCount', 0] }
                }
            }
        ]).toArray();
        
        // Convert to object keyed by factory
        const sensorData = {};
        results.forEach(item => {
            if (item.factory) {
                // Calculate WBGT (simplified formula)
                let wbgt = null;
                if (item.highestTemp !== null && item.avgHumidity !== null) {
                    // Simplified indoor WBGT formula
                    wbgt = Math.round((0.7 * item.highestTemp + 0.3 * (item.avgHumidity / 100 * item.highestTemp)) * 10) / 10;
                }
                
                sensorData[item.factory] = {
                    highestTemp: item.highestTemp,
                    avgTemp: item.avgTemp,
                    avgHumidity: item.avgHumidity,
                    wbgt: wbgt,
                    sensorCount: item.sensorCount,
                    hasData: item.hasData
                };
            }
        });
        
        // Also check which factories have ANY historical data (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const historicalCheck = await collection.aggregate([
            {
                $match: {
                    Date: { $gte: startDateStr }
                }
            },
            {
                $group: {
                    _id: '$工場',
                    hasHistory: { $sum: 1 }
                }
            }
        ]).toArray();
        
        const factoriesWithHistory = new Set(
            historicalCheck.filter(h => h.hasHistory > 0).map(h => h._id)
        );
        
        // Add hasHistory flag to each factory
        Object.keys(sensorData).forEach(factory => {
            sensorData[factory].hasHistory = factoriesWithHistory.has(factory);
        });
        
        console.log(`✅ Sensor data loaded for ${Object.keys(sensorData).length} factories`);
        
        res.json({
            success: true,
            date: date,
            data: sensorData,
            factoriesWithHistory: Array.from(factoriesWithHistory)
        });
        
    } catch (error) {
        console.error('❌ Error fetching sensor data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sensor data: ' + error.message
        });
    }
});

// ==================== END FACTORY OVERVIEW ENDPOINTS ====================

// Get unique machine names for filter dropdown
app.get('/api/scna/machines', async (req, res) => {
    let client;
    
    try {
        console.log('🔧 Fetching SCNA machine list...');
        
        client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
        await client.connect();
        
        const db = client.db('submittedDB');
        const collection = db.collection('pressDB');
        
        // Get unique machine names
        const machines = await collection.distinct('設備', { "工場": "SCNA" });
        
        console.log(`✅ Found ${machines.length} unique machines:`, machines);
        
        res.json({
            success: true,
            data: machines.filter(Boolean), // Remove any null/undefined values
            message: `Found ${machines.length} machines`
        });
        
    } catch (error) {
        console.error('❌ Error fetching SCNA machines:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch machines: ' + error.message,
            data: []
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});




//SCNA ADMIN BACKEND END






//FREYA CUSTOMER ACCESS BACKEND


app.post("/customerGetDeviceStats", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "Missing dbName" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const submittedDB = db.collection("submittedDB");

    const stats = await submittedDB.aggregate([
      { $match: { deviceId: { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: "$deviceId",
          total: { $sum: "$quantity" },
          totalNG: { $sum: "$NG" }
        }
      },
      {
        $project: {
          deviceId: "$_id",
          total: 1,
          totalNG: 1,
          defectRate: {
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$totalNG", "$total"] }, 100] }, 2] }
            ]
          }
        }
      }
    ]).toArray();

    res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching device stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/customerUploadMasterImage", async (req, res) => {
  const { base64, recordId, username, dbName } = req.body;

  if (!base64 || !recordId || !username || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const objectId = new ObjectId(recordId);
    const oldRecord = await masterDB.findOne({ _id: objectId });

    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    const 品番 = oldRecord["品番"] || "unknownPart";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${品番}_${timestamp}.jpg`;
    const filePath = `${dbName}/masterImages/${fileName}`;
    const file = admin.storage().bucket().file(filePath);

    const buffer = Buffer.from(base64, "base64");
    const downloadToken = "customerMasterImageToken"; // Or generate UUID

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

    // Update imageURL in customer masterDB
    await masterDB.updateOne({ _id: objectId }, { $set: { imageURL: firebaseUrl } });

    res.json({ message: "Customer image uploaded successfully", imageURL: firebaseUrl });
  } catch (error) {
    console.error("Error uploading customer master image:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get users for customer database
app.post("/customerGetUsers", async (req, res) => {
  const { dbName, role } = req.body;
  console.log("Received request to get users:", { dbName, role });

  if (!dbName) {
    return res.status(400).json({ error: "Missing dbName" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection("users");

    const result = await users.find({}, { projection: { password: 0 } }).toArray(); // hide password
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/customerGetMasterDB", async (req, res) => {
  const { dbName, role } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "Missing dbName" });
  }

  // Optional: protect access
  if (role && !["admin", "masterUser", "班長"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const allDocs = await masterDB.find({}).toArray();
    res.status(200).json(allDocs);
  } catch (error) {
    console.error("Error fetching customer masterDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post("/customerInsertMasterDB", async (req, res) => {
  const { data, role, dbName, username } = req.body;

  if (!data || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const result = await masterDB.insertOne(data);

    res.status(201).json({
      message: "Data inserted into customer masterDB",
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("Error inserting to customer masterDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/customerInsertSubmittedDB", async (req, res) => {
  const { data, collectionName, role, dbName, username } = req.body;

  if (!data || !dbName || !collectionName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const targetCollection = db.collection(collectionName);

    const result = await targetCollection.insertOne(data);

    res.status(201).json({
      message: "Data inserted into customer submittedDB",
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("Error inserting to customer submittedDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post("/customerCreateUser", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    username,
    password,
    role,
    dbName,
    creatorRole
  } = req.body;

  if (!firstName || !lastName || !email || !username || !password || !role || !dbName || !creatorRole) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(creatorRole)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();

    const normalizedUsername = username.trim().toLowerCase();

    const customerDB = client.db(dbName);
    const masterDB = client.db("Sasaki_Coating_MasterDB");

    const users = customerDB.collection("users");
    const masterUsers = masterDB.collection("masterUsers");

    // 1. Check in customer DB
    const existingInCustomer = await users.findOne({ username: normalizedUsername });
    if (existingInCustomer) {
      return res.status(400).json({ error: "Username already exists in this customer database" });
    }

    // 2. Check in masterUsers (username or subUsernames)
    const conflictInMaster = await masterUsers.findOne({
      $or: [
        { username: normalizedUsername },
        { subUsernames: normalizedUsername }
      ]
    });
    if (conflictInMaster) {
      return res.status(400).json({ error: "Username already exists in a master account" });
    }

    // 3. Check across all other customer DBs
    const dbs = await client.db().admin().listDatabases();
    for (const db of dbs.databases) {
      if (["admin", "local", "config", "Sasaki_Coating_MasterDB", dbName].includes(db.name)) continue;
      const userCol = client.db(db.name).collection("users");
      const existsElsewhere = await userCol.findOne({ username: normalizedUsername });
      if (existsElsewhere) {
        return res.status(400).json({ error: "Username already exists in another customer company" });
      }
    }

    // 4. Insert user in customer DB
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({
      firstName,
      lastName,
      email,
      username: normalizedUsername,
      password: hashedPassword,
      role,
      createdAt: new Date()
    });

    // 5. Track sub-user in masterUsers
    await masterUsers.updateOne(
      { dbName },
      { $addToSet: { subUsernames: normalizedUsername } }
    );

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating customer user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/customerUpdateMasterDB", async (req, res) => {
  const { recordId, updateData, role, dbName, username } = req.body;

  if (!recordId || !updateData || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const result = await masterDB.updateOne(
      { _id: new ObjectId(recordId) },
      { $set: updateData }
    );

    res.status(200).json({
      message: "Customer masterDB record updated",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating masterDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/customerDeleteMasterDB", async (req, res) => {
  const { recordId, role, dbName, username } = req.body;

  if (!recordId || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const result = await masterDB.deleteOne({ _id: new ObjectId(recordId) });

    res.status(200).json({
      message: "Customer masterDB record deleted",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting from masterDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post("/customerUpdateRecord", async (req, res) => {
  const { recordId, updateData, dbName, collectionName, role, username } = req.body;

  if (!recordId || !updateData || !dbName || !collectionName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { _id: new ObjectId(recordId) },
      { $set: updateData }
    );

    res.status(200).json({
      message: `Record updated in ${collectionName}`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// app.post("/customerDeleteUser", async (req, res) => {
//   const { recordId, dbName, role, username } = req.body;

//   if (!recordId || !dbName || !username) {
//     return res.status(400).json({ error: "Missing required fields" });
//   }

//   if (!["admin", "masterUser"].includes(role)) {
//     return res.status(403).json({ error: "Access denied" });
//   }

//   try {
//     await client.connect();
//     const db = client.db(dbName);
//     const users = db.collection("users");

//     const result = await users.deleteOne({ _id: new ObjectId(recordId) });

//     res.status(200).json({
//       message: "User record deleted",
//       deletedCount: result.deletedCount
//     });
//   } catch (error) {
//     console.error("Error deleting user:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

app.post("/customerDeleteUser", async (req, res) => {
  const { recordId, dbName, role, username } = req.body;

  if (!recordId || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const customerDB = client.db(dbName);
    const masterDB = client.db("Sasaki_Coating_MasterDB");
    
    const users = customerDB.collection("users");
    const masterUsers = masterDB.collection("masterUsers");

    // 1. Get the user to be deleted first to get their username
    const userToDelete = await users.findOne({ _id: new ObjectId(recordId) });
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2. Delete user from customer database
    const result = await users.deleteOne({ _id: new ObjectId(recordId) });

    // 3. Remove username from subUsernames in master database
    if (result.deletedCount > 0) {
      await masterUsers.updateOne(
        { dbName },
        { $pull: { subUsernames: userToDelete.username } }
      );
    }

    res.status(200).json({
      message: "User record deleted",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post("/customerBulkDelete", async (req, res) => {
  const { recordIds, dbName, collectionName, role, username } = req.body;

  if (!recordIds || !Array.isArray(recordIds) || !dbName || !collectionName || !username) {
    return res.status(400).json({ error: "Missing required fields or invalid input" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const objectIds = recordIds.map(id => new ObjectId(id));
    const result = await collection.deleteMany({ _id: { $in: objectIds } });

    res.status(200).json({
      message: `Bulk delete from ${collectionName} completed`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error in bulk delete:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/customerResetUserPassword", async (req, res) => {
  const { userId, newPassword, dbName, role, username } = req.body;

  if (!userId || !newPassword || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection("users");

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (result.modifiedCount === 0) {
      return res.status(200).json({ message: "Password is the same as the old one, no update needed." });
    }

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Error resetting customer user password:", err);
    res.status(500).json({ error: "Internal server error during password reset." });
  }
});



app.post('/aggregateCustomerDashboardWidgetData', async (req, res) => {
    console.log("🟢 Received POST request to /aggregateCustomerDashboardWidgetData");
    const {
        dbName,
        collectionName = 'submittedDB', // Default to submittedDB
        // queryConfig contains all details for this specific widget's data
        queryConfig = { 
            //deviceIdField: 'ユニークID', // Actual field name for device identifier
            //deviceIdValue: 'DEVICE_XYZ_ID',
            //dateField: '日付',          // Actual field name for date
            //dateValue: 'YYYY-MM-DD',    // Today's date string
            //sourceField: 'アクション',    // The field to analyze for the widget
            //summaryType: 'percentageBreakdown', // e.g., sum, average, countUnique
            //additionalFilters: {}     // Optional, e.g., { "LH/RH": "LH" }
        }
    } = req.body;

    if (!dbName || !queryConfig || !queryConfig.deviceIdField || !queryConfig.deviceIdValue || !queryConfig.dateField || !queryConfig.dateValue || !queryConfig.sourceField || !queryConfig.summaryType) {
        return res.status(400).json({ error: "Missing required fields in request (dbName or queryConfig details)." });
    }

    try {
        const database = client.db(dbName);
        const collection = database.collection(collectionName);

        // Construct the base match stage
        let matchStage = {
            [queryConfig.deviceIdField]: queryConfig.deviceIdValue,
            [queryConfig.dateField]: queryConfig.dateValue
        };

        if (queryConfig.additionalFilters && Object.keys(queryConfig.additionalFilters).length > 0) {
            matchStage = { ...matchStage, ...queryConfig.additionalFilters };
        }

        const pipeline = [{ $match: matchStage }];
        let results;

        console.log(`Aggregating for widget: ${queryConfig.sourceField}, type: ${queryConfig.summaryType}`);
        console.log("Initial match stage:", JSON.stringify(matchStage));

        // Add aggregation stages based on summaryType
        switch (queryConfig.summaryType) {
            case 'sum':
            case 'average':
            case 'min':
            case 'max':
                pipeline.push({
                    $group: {
                        _id: null, // Group all matched documents
                        value: { [`$${queryConfig.summaryType}`]: `$${queryConfig.sourceField}` }
                    }
                });
                results = await collection.aggregate(pipeline).toArray();
                // Result will be like [{ _id: null, value: X }] or []
                break;
            
            case 'countRecords': // Counts records where the sourceField has a non-null value
                 pipeline.push({ $match: { [queryConfig.sourceField]: { $exists: true, $ne: null, $ne: "" } } });
                 pipeline.push({ $count: "value" });
                 results = await collection.aggregate(pipeline).toArray();
                 // Result will be like [{ value: X }] or []
                break;

            case 'countUnique':
                pipeline.push({
                    $match: { [queryConfig.sourceField]: { $exists: true, $ne: null } } // Ensure field exists for $addToSet
                });
                pipeline.push({
                    $group: {
                        _id: null,
                        uniqueValues: { $addToSet: `$${queryConfig.sourceField}` }
                    }
                });
                pipeline.push({
                    $project: {
                        _id: 0,
                        value: { $size: "$uniqueValues" }
                    }
                });
                results = await collection.aggregate(pipeline).toArray();
                // Result will be like [{ value: X }] or []
                break;

            case 'percentageBreakdown': // Returns counts for each unique value
                 pipeline.push({ $match: { [queryConfig.sourceField]: { $exists: true, $ne: null, $ne: "" } } });
                 pipeline.push({
                    $group: {
                        _id: `$${queryConfig.sourceField}`, // Group by the source field's values
                        count: { $sum: 1 }
                    }
                });
                pipeline.push({ $sort: { _id: 1 } }); // Sort by the grouped value
                results = await collection.aggregate(pipeline).toArray();
                // Result will be like [{ _id: "ValueA", count: X }, { _id: "ValueB", count: Y }]
                break;

            default:
                return res.status(400).json({ error: `Unsupported summaryType: ${queryConfig.summaryType}` });
        }
        
        console.log(`✅ Aggregation results for ${queryConfig.sourceField}:`, results);
        res.json(results);

    } catch (error) {
        console.error(`❌ Error in /aggregateDashboardWidgetData for ${queryConfig.sourceField}:`, error);
        res.status(500).json({ error: "Error aggregating dashboard widget data", details: error.message });
    }
});


app.post('/fetchCustomerSubmittedLogs', async (req, res) => {
    console.log("🟢 Received POST request to /fetchSubmittedLogs");
    const { 
        dbName, 
        filters = {}, // Default to empty object if not provided
        sort = { date: -1, time: -1 }, // Default sort
        limit = 50,   // Default limit
        skip = 0,     // Default skip
        getTotalCount = false, // Flag to request total count
        idsToFetch = [] // Array of _id strings to fetch specific documents
    } = req.body;

    if (!dbName) {
        return res.status(400).json({ error: "dbName is required" });
    }

    try {
        // await client.connect(); // Manage connection as per your full setup
        const database = client.db(dbName);
        const collection = database.collection('submittedDB');

        let queryToExecute = filters;

        // If specific IDs are requested, override other filters
        if (idsToFetch && idsToFetch.length > 0) {
            try {
                queryToExecute = { 
                    _id: { 
                        $in: idsToFetch.map(idStr => {
                            if (typeof idStr === 'string' && ObjectId.isValid(idStr)) {
                                return new ObjectId(idStr);
                            }
                            // Log or handle invalid ID strings if necessary
                            console.warn(`Invalid ObjectId string in idsToFetch: ${idStr}`);
                            return idStr; // Or skip/throw error
                        }) 
                    } 
                };
                 console.log("Fetching specific IDs:", queryToExecute._id.$in);
            } catch (e) {
                console.error("Error converting one or more IDs in idsToFetch:", e);
                return res.status(400).json({ error: "Invalid ID format in idsToFetch array."});
            }
        } else {
            // Ensure date filters are handled correctly if they exist in `filters`
            if (filters.date) {
                // No specific conversion needed here if dates are already in ISO string format
                // MongoDB can compare ISO date strings directly in many cases
            }
            // Ensure '品番' regex is handled if it exists
            if (filters['品番'] && typeof filters['品番'].$regex === 'string') {
                // The client should send the regex string and options correctly
            }
        }
        
        console.log("Executing query on submittedDB:", JSON.stringify(queryToExecute, null, 2));
        console.log("Sort:", sort, "Limit:", limit, "Skip:", skip);

        const findQuery = collection.find(queryToExecute)
                                .sort(sort)
                                .skip(skip)
                                .limit(limit);
        
        const data = await findQuery.toArray();
        let totalCount = 0;

        if (getTotalCount) {
            // If specific IDs were fetched, totalCount is just the number of IDs found
            if (idsToFetch && idsToFetch.length > 0) {
                totalCount = data.length; // Or could re-query with the ID list, but data.length is fine here
            } else {
                totalCount = await collection.countDocuments(filters);
            }
            console.log(`✅ Returning ${data.length} records, totalCount: ${totalCount}`);
            return res.json({ data: data, totalCount: totalCount });
        } else {
            console.log(`✅ Returning ${data.length} records (no totalCount requested)`);
            return res.json(data); // If totalCount not requested, just send data array
        }

    } catch (error) {
        console.error("❌ Error in /fetchCustomerSubmittedLogs route:", error);
        return res.status(500).json({ error: "Error fetching submitted logs", details: error.message });
    }
    // finally {
    //     // if (client && client.topology && client.topology.isConnected()) {
    //     //     await client.close();
    //     // }
    // }
});

// Update customer masterDB with history
app.post("/customerUpdateMasterDBWithHistory", async (req, res) => {
  const { recordId, updateData, changes, role, dbName, username } = req.body;

  if (!recordId || !updateData || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    // First, get the current document to check changeHistory field
    const currentDoc = await masterDB.findOne({ _id: new ObjectId(recordId) });
    
    if (!currentDoc) {
      return res.status(404).json({ error: "Record not found" });
    }

    // Update the record with the new data
    const result = await masterDB.updateOne(
      { _id: new ObjectId(recordId) },
      { $set: updateData }
    );

    // Add history entry
    if (result.modifiedCount > 0) {
      const historyEntry = {
        timestamp: new Date(),
        changedBy: username,
        action: "更新",
        changes: changes
      };

      // Check if changeHistory exists and is an array
      if (!currentDoc.changeHistory || !Array.isArray(currentDoc.changeHistory)) {
        // Initialize changeHistory as an empty array if it doesn't exist or is not an array
        await masterDB.updateOne(
          { _id: new ObjectId(recordId) },
          { $set: { changeHistory: [historyEntry] } }
        );
      } else {
        // Push to existing array
        await masterDB.updateOne(
          { _id: new ObjectId(recordId) },
          { $push: { changeHistory: historyEntry } }
        );
      }
    }

    res.status(200).json({
      message: "Customer masterDB record updated with history",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating masterDB with history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Get masterDB change history for a specific record
app.post("/customerGetMasterHistory", async (req, res) => {
  const { recordId, dbName } = req.body;

  if (!recordId || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const record = await masterDB.findOne(
      { _id: new ObjectId(recordId) },
      { projection: { changeHistory: 1 } }
    );

    let history = [];
    if (record && record.changeHistory) {
      // Ensure changeHistory is an array
      if (Array.isArray(record.changeHistory)) {
        history = record.changeHistory;
      } else {
        // If it's not an array, convert it or initialize as empty
        history = [];
      }
    }

    // Sort by timestamp descending (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json(history);
  } catch (error) {
    console.error("Error fetching masterDB history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Upload customer master image with history
app.post("/customerUploadMasterImageWithHistory", async (req, res) => {
  const { base64, recordId, username, dbName, oldImageURL } = req.body;

  if (!base64 || !recordId || !username || !dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");

    const objectId = new ObjectId(recordId);
    const oldRecord = await masterDB.findOne({ _id: objectId });

    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    const 品番 = oldRecord["品番"] || "unknownPart";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${品番}_${timestamp}.jpg`;
    const filePath = `${dbName}/masterImages/${fileName}`;
    const file = admin.storage().bucket().file(filePath);

    const buffer = Buffer.from(base64, "base64");
    const downloadToken = "customerMasterImageToken";

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

    // Update imageURL in customer masterDB
    await masterDB.updateOne({ _id: objectId }, { $set: { imageURL: firebaseUrl } });

    // Add history entry
    const historyEntry = {
      timestamp: new Date(),
      changedBy: username,
      action: "画像更新",
      changes: [{
        field: "製品画像",
        oldValue: oldImageURL || "(なし)",
        newValue: firebaseUrl
      }]
    };

    // Check if changeHistory exists and is an array
    if (!oldRecord.changeHistory || !Array.isArray(oldRecord.changeHistory)) {
      // Initialize changeHistory as an empty array if it doesn't exist or is not an array
      await masterDB.updateOne(
        { _id: objectId },
        { $set: { changeHistory: [historyEntry] } }
      );
    } else {
      // Push to existing array
      await masterDB.updateOne(
        { _id: objectId },
        { $push: { changeHistory: historyEntry } }
      );
    }

    res.json({ message: "Customer image uploaded successfully with history", imageURL: firebaseUrl });
  } catch (error) {
    console.error("Error uploading customer master image with history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Insert customer masterDB with history
app.post("/customerInsertMasterDBWithHistory", async (req, res) => {
  const { data, role, dbName, username, action = "新規作成" } = req.body;

  if (!data || !dbName || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterDB = db.collection("masterDB");
    const logs = db.collection("logs");

    // Insert the record
    const result = await masterDB.insertOne(data);

    // Log the creation
    await logs.insertOne({
      timestamp: new Date(),
      action: action,
      createdBy: username,
      recordId: result.insertedId,
      recordData: data,
      collection: "masterDB"
    });

    res.status(201).json({
      message: "Data inserted into customer masterDB with history",
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("Error inserting to customer masterDB with history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get masterDB creation history
app.post("/customerGetMasterDBHistory", async (req, res) => {
  const { dbName } = req.body;

  if (!dbName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const logs = db.collection("logs");

    const history = await logs.find(
      { collection: "masterDB" },
      { sort: { timestamp: -1 } }
    ).toArray();

    res.status(200).json(history);
  } catch (error) {
    console.error("Error fetching masterDB creation history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Bulk delete with history tracking
app.post("/customerBulkDeleteWithHistory", async (req, res) => {
  const { recordIds, recordsData, dbName, collectionName, role, username } = req.body;

  if (!recordIds || !Array.isArray(recordIds) || !dbName || !collectionName || !username) {
    return res.status(400).json({ error: "Missing required fields or invalid input" });
  }

  if (!["admin", "masterUser"].includes(role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const logs = db.collection("logs");

    const objectIds = recordIds.map(id => new ObjectId(id));

    // If recordsData wasn't provided, fetch the records before deletion
    let recordsToLog = recordsData;
    if (!recordsData || recordsData.length === 0) {
      recordsToLog = await collection.find({ _id: { $in: objectIds } }).toArray();
    }

    // Perform the deletion
    const result = await collection.deleteMany({ _id: { $in: objectIds } });

    // Log each deletion
    if (result.deletedCount > 0 && recordsToLog && recordsToLog.length > 0) {
      const deletionLogs = recordsToLog.map(record => ({
        timestamp: new Date(),
        action: "削除",
        deletedBy: username,
        recordId: record._id,
        recordData: record,
        collection: collectionName
      }));

      // Insert all deletion logs
      await logs.insertMany(deletionLogs);
    }

    res.status(200).json({
      message: `Bulk delete from ${collectionName} completed with history`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error in bulk delete with history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


//FREYA CUSTOMER ACCESS BACKEND END


// ============================================
// QR LEARNING SYSTEM BACKEND
// ============================================

// Validate user permissions for learning mode
app.post('/qr-learning/validate-user', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const users = database.collection("users");
    
    // Find user by username
    const user = await users.findOne({ username: username });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user has authorized role
    const authorizedRoles = ['係長', '課長', '部長', 'admin'];
    const hasPermission = authorizedRoles.includes(user.role);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        userRole: user.role,
        requiredRoles: authorizedRoles
      });
    }
    
    res.json({
      success: true,
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Error validating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pattern hash for a specific customer
app.get('/qr-patterns/hash/:customerType', async (req, res) => {
  try {
    const { customerType } = req.params;
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Only return hash for DEPLOYED patterns
    const pattern = await patterns.findOne({ 
      customerType: customerType,
      status: 'deployed'
    });
    
    if (!pattern) {
      return res.status(404).json({ error: 'No deployed patterns found for customer' });
    }
    
    res.json({ hash: pattern.hash });
    
  } catch (error) {
    console.error('Error getting pattern hash:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if pattern exists for customer (for testing)
app.get('/qr-learning/check-pattern/:customerType', async (req, res) => {
  try {
    const { customerType } = req.params;
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Check if ANY pattern exists (draft or deployed)
    const pattern = await patterns.findOne({ customerType: customerType });
    
    if (!pattern) {
      return res.json({ exists: false });
    }
    
    res.json({ 
      exists: true,
      status: pattern.status,
      hash: pattern.hash,
      lastUpdated: pattern.lastUpdated
    });
    
  } catch (error) {
    console.error('Error checking pattern:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patterns for a specific customer
app.get('/qr-patterns/:customerType', async (req, res) => {
  try {
    const { customerType } = req.params;
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Only fetch DEPLOYED patterns for tablets
    const pattern = await patterns.findOne({ 
      customerType: customerType,
      status: 'deployed'
    });
    
    if (!pattern) {
      return res.status(404).json({ error: 'No deployed patterns found for customer' });
    }
    
    res.json(pattern);
    
  } catch (error) {
    console.error('Error getting patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Learn patterns from training data
app.post('/qr-learning/learn-patterns', async (req, res) => {
  try {
    console.log('=== QR Learning Request ===');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Customer type:', req.body.customerType);
    console.log('Customer samples count:', req.body.customerSamples?.length);
    console.log('Internal samples count:', req.body.internalSamples?.length);
    console.log('Mismatch samples count:', req.body.mismatchSamples?.length);
    console.log('Trained by:', req.body.trainedBy);
    
    const { customerType, customerSamples, internalSamples, mismatchSamples, trainedBy } = req.body;
    
    if (!customerType || !customerSamples || !internalSamples || !trainedBy) {
      console.log('❌ Missing required data:', {
        hasCustomerType: !!customerType,
        hasCustomerSamples: !!customerSamples,
        hasInternalSamples: !!internalSamples,
        hasTrainedBy: !!trainedBy
      });
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    if (customerSamples.length < 3 || internalSamples.length < 3) {
      console.log('❌ Insufficient samples:', {
        customerSamplesCount: customerSamples.length,
        internalSamplesCount: internalSamples.length
      });
      return res.status(400).json({ error: 'Need at least 3 samples of each type' });
    }
    
    // Analyze patterns using the pattern analysis algorithm
    const analysisResult = await analyzeQRPatterns(customerSamples, internalSamples);
    
    if (!analysisResult.success) {
      return res.status(400).json({ 
        error: 'Pattern analysis failed',
        conflicts: analysisResult.conflicts,
        message: analysisResult.message
      });
    }
    
    // Generate hash for the pattern
    const patternHash = generatePatternHash(analysisResult);
    
    // Prepare pattern record for database
    const patternRecord = {
      customerType: customerType,
      status: 'draft', // New patterns start as draft (not deployed)
      hash: patternHash,
      extractionRules: analysisResult.extractionRules,
      detectionRules: analysisResult.detectionRules,
      trainingData: {
        customerSamples: customerSamples,
        internalSamples: internalSamples,
        mismatchSamples: mismatchSamples || [] // Include negative examples
      },
      metadata: {
        trainedBy: trainedBy,
        trainingDate: new Date().toISOString(),
        confidence: analysisResult.confidence,
        sampleCount: {
          customer: customerSamples.length,
          internal: internalSamples.length,
          mismatch: mismatchSamples?.length || 0
        }
      },
      lastUpdated: new Date().toISOString()
    };
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Upsert the pattern (update if exists, insert if not)
    await patterns.replaceOne(
      { customerType: customerType },
      patternRecord,
      { upsert: true }
    );
    
    res.json({
      success: true,
      hash: patternHash,
      confidence: analysisResult.confidence,
      extractionRules: analysisResult.extractionRules,
      detectionRules: analysisResult.detectionRules
    });
    
  } catch (error) {
    console.error('Error learning patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Extract product from customer QR using learned patterns
app.post('/qr-learning/extract-product', async (req, res) => {
  try {
    console.log('=== Extract Product Request ===');
    const { customerType, customerQR } = req.body;
    
    if (!customerType || !customerQR) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Get learned pattern for this customer
    const learnedPattern = await patterns.findOne({ customerType: customerType });
    
    if (!learnedPattern) {
      return res.status(404).json({ 
        success: false,
        error: 'No learned pattern found for this customer' 
      });
    }
    
    // Try to extract product using extraction rules
    let extractedProduct = null;
    
    for (const rule of learnedPattern.extractionRules) {
      if (rule.type === 'regex') {
        const regex = new RegExp(rule.pattern);
        const match = customerQR.match(regex);
        
        if (match && match[rule.captureGroup || 0]) {
          extractedProduct = match[rule.captureGroup || 0];
          
          // Apply formatting if specified
          if (rule.formatting) {
            extractedProduct = applyFormattingServer(extractedProduct, rule.formatting);
          }
          
          console.log('✅ Product extracted via regex:', extractedProduct);
          break;
        }
      } else if (rule.type === 'position') {
        // Position-based extraction (e.g., third part of space-separated QR)
        const delimiter = new RegExp(rule.delimiter || '\\s+');
        const parts = customerQR.split(delimiter);
        
        console.log(`Position extraction: split into ${parts.length} parts, looking for part ${rule.partIndex}`);
        
        if (parts.length > rule.partIndex) {
          let part = parts[rule.partIndex];
          
          // Apply substring extraction if specified
          if (rule.substring) {
            part = part.substring(rule.substring.start, rule.substring.end);
            console.log(`Substring extracted: ${part}`);
          }
          
          // Apply formatting if specified
          if (rule.formatting) {
            part = applyFormattingServer(part, rule.formatting);
            console.log(`After formatting: ${part}`);
          }
          
          extractedProduct = part;
          console.log('✅ Product extracted via position:', extractedProduct);
          break;
        } else {
          console.log(`❌ Position extraction failed: only ${parts.length} parts found`);
        }
      }
    }
    
    if (extractedProduct) {
      res.json({
        success: true,
        product: extractedProduct,
        customerQR: customerQR
      });
    } else {
      res.json({
        success: false,
        error: 'Could not extract product from customer QR',
        customerQR: customerQR
      });
    }
    
  } catch (error) {
    console.error('Error extracting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deploy learned pattern (make it available for tablets)
app.post('/qr-learning/deploy-pattern', async (req, res) => {
  try {
    console.log('=== Deploy Pattern Request ===');
    const { customerType, deployedBy } = req.body;
    
    if (!customerType || !deployedBy) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    // Find the draft pattern
    const draftPattern = await patterns.findOne({ 
      customerType: customerType,
      status: 'draft'
    });
    
    if (!draftPattern) {
      return res.status(404).json({ 
        success: false,
        error: 'No draft pattern found for this customer' 
      });
    }
    
    // Generate new hash for deployment (to invalidate caches)
    const deploymentHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(draftPattern.extractionRules) + Date.now())
      .digest('hex')
      .substring(0, 16);
    
    // Update pattern to deployed status
    const updateResult = await patterns.updateOne(
      { customerType: customerType, status: 'draft' },
      { 
        $set: { 
          status: 'deployed',
          hash: deploymentHash,
          deployedBy: deployedBy,
          deployedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        } 
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      console.log('✅ Pattern deployed:', customerType);
      res.json({
        success: true,
        message: 'Pattern deployed successfully',
        customerType: customerType,
        hash: deploymentHash,
        status: 'deployed'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to deploy pattern'
      });
    }
    
  } catch (error) {
    console.error('Error deploying pattern:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test learned patterns
app.post('/qr-learning/test-patterns', async (req, res) => {
  try {
    const { customerType, testSamples } = req.body;
    
    if (!customerType || !testSamples) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    const pattern = await patterns.findOne({ customerType: customerType });
    
    if (!pattern) {
      return res.status(404).json({ error: 'No patterns found for customer' });
    }
    
    // Test each sample against the learned patterns
    const testResults = testSamples.map(sample => {
      const extractionResult = testExtraction(sample.qr, pattern.extractionRules);
      const detectionResult = testDetection(sample.qr, pattern.detectionRules);
      
      return {
        qr: sample.qr,
        expectedProduct: sample.expectedProduct,
        extractedProduct: extractionResult,
        detectionPassed: detectionResult,
        match: extractionResult === sample.expectedProduct
      };
    });
    
    const successCount = testResults.filter(r => r.match).length;
    const accuracy = (successCount / testResults.length) * 100;
    
    res.json({
      success: true,
      accuracy: accuracy,
      testResults: testResults,
      summary: {
        total: testResults.length,
        passed: successCount,
        failed: testResults.length - successCount
      }
    });
    
  } catch (error) {
    console.error('Error testing patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patterns for a customer
app.delete('/qr-patterns/:customerType', async (req, res) => {
  try {
    const { customerType } = req.params;
    
    await client.connect();
    const database = client.db("Sasaki_Coating_MasterDB");
    const patterns = database.collection("learnedQRDB");
    
    const result = await patterns.deleteOne({ customerType: customerType });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No patterns found for customer' });
    }
    
    res.json({ success: true, message: `Patterns deleted for ${customerType}` });
    
  } catch (error) {
    console.error('Error deleting patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// QR PATTERN ANALYSIS ALGORITHMS
// ============================================

// Analyze QR patterns from training samples
async function analyzeQRPatterns(customerSamples, internalSamples) {
  console.log('Starting pattern analysis...');
  console.log('Customer samples:', customerSamples.length);
  console.log('Internal samples:', internalSamples.length);
  
  try {
    // Step 1: Analyze customer QR patterns
    const customerAnalysis = analyzeCustomerPatterns(customerSamples);
    customerAnalysis.samples = customerSamples; // Keep reference to original samples
    
    // Step 2: Analyze internal QR patterns  
    const internalAnalysis = analyzeInternalPatterns(internalSamples);
    internalAnalysis.samples = internalSamples; // Keep reference to original samples
    
    // Step 3: Check for conflicts in customer patterns
    const conflicts = detectPatternConflicts(customerAnalysis);
    
    if (conflicts.length > 0) {
      // Only fail on severe conflicts, not warnings
      const severeConflicts = conflicts.filter(c => c.severity === 'error');
      if (severeConflicts.length > 0) {
        return {
          success: false,
          conflicts: conflicts,
          message: 'Inconsistent patterns detected in customer QRs'
        };
      }
    }
    
    // Step 4: Generate extraction rules
    const extractionRules = generateExtractionRules(customerAnalysis, internalAnalysis);
    
    // Step 5: Generate detection rules
    const detectionRules = generateDetectionRules(customerAnalysis);
    
    // Step 6: Calculate confidence score
    const confidence = calculateConfidence(customerAnalysis, extractionRules);
    
    console.log('Pattern analysis complete. Extraction rules:', extractionRules.length);
    
    return {
      success: true,
      extractionRules: extractionRules,
      detectionRules: detectionRules,
      confidence: confidence,
      analysis: {
        customer: customerAnalysis,
        internal: internalAnalysis
      }
    };
    
  } catch (error) {
    console.error('Error in pattern analysis:', error);
    return {
      success: false,
      message: 'Pattern analysis failed',
      error: error.message
    };
  }
}

// Analyze customer QR patterns
function analyzeCustomerPatterns(samples) {
  const analysis = {
    lengths: [],
    structures: [],
    commonSubstrings: [],
    patterns: []
  };
  
  // Analyze each sample
  samples.forEach((sample, index) => {
    const qr = sample.qr;
    
    // Length analysis
    analysis.lengths.push(qr.length);
    
    // Structure analysis (spaces, delimiters)
    const spaceCount = (qr.match(/\s+/g) || []).length;
    const parts = qr.split(/\s+/);
    
    analysis.structures.push({
      index: index,
      spaceCount: spaceCount,
      partCount: parts.length,
      parts: parts,
      hasNumbers: /\d/.test(qr),
      hasLetters: /[A-Za-z]/.test(qr),
      upperCase: qr === qr.toUpperCase()
    });
  });
  
  // Find common patterns
  analysis.commonLength = getMostCommon(analysis.lengths);
  analysis.commonStructure = findCommonStructure(analysis.structures);
  analysis.commonSubstrings = findCommonSubstrings(samples.map(s => s.qr));
  
  return analysis;
}

// Analyze internal QR patterns
function analyzeInternalPatterns(samples) {
  const analysis = {
    products: [],
    patterns: []
  };
  
  samples.forEach(sample => {
    // Extract product code (assume it's before first comma or the whole string)
    const product = sample.qr.includes(',') ? 
      sample.qr.split(',')[0].trim() : 
      sample.qr.trim();
    
    analysis.products.push(product);
    
    // Analyze product pattern
    const pattern = {
      length: product.length,
      hasGN: product.includes('GN'),
      hasDash: product.includes('-'),
      hasSlash: product.includes('/'),
      format: analyzeProductFormat(product)
    };
    
    analysis.patterns.push(pattern);
  });
  
  return analysis;
}

// Analyze product code format
function analyzeProductFormat(product) {
  // Check for common patterns like GN520-02530
  if (/^GN\d{3}[\-\/]\d{5}$/.test(product)) {
    return 'GN-standard';
  }
  
  if (/^GN\d{8}$/.test(product)) {
    return 'GN-continuous';
  }
  
  return 'unknown';
}

// Detect conflicts in patterns
function detectPatternConflicts(analysis) {
  const conflicts = [];
  
  // Check length consistency
  const lengths = analysis.lengths;
  const lengthVariance = Math.max(...lengths) - Math.min(...lengths);
  if (lengthVariance > 10) { // Allow some variance
    conflicts.push({
      type: 'length_variance',
      message: `QR lengths vary significantly: ${Math.min(...lengths)} to ${Math.max(...lengths)}`,
      severity: 'warning'
    });
  }
  
  // Check structure consistency
  const structures = analysis.structures;
  const partCounts = structures.map(s => s.partCount);
  const partVariance = Math.max(...partCounts) - Math.min(...partCounts);
  if (partVariance > 1) {
    conflicts.push({
      type: 'structure_variance',
      message: `Inconsistent number of parts: ${Math.min(...partCounts)} to ${Math.max(...partCounts)}`,
      severity: 'error'
    });
  }
  
  // Check for common patterns
  if (analysis.commonSubstrings.length === 0) {
    conflicts.push({
      type: 'no_common_pattern',
      message: 'No common patterns found across customer QRs',
      severity: 'error'
    });
  }
  
  return conflicts;
}

// Generate extraction rules from analysis
function generateExtractionRules(customerAnalysis, internalAnalysis) {
  const rules = [];
  
  // First, try to find product anywhere in the QR (for formats like Toyota)
  const directPattern = findProductAnywhere(
    customerAnalysis.samples || [], 
    internalAnalysis.samples || []
  );
  
  if (directPattern) {
    rules.push(directPattern);
  }
  
  // Try to find product code extraction pattern for structured formats
  const structure = customerAnalysis.commonStructure;
  
  if (structure && structure.partCount === 3) {
    // Three-part structure (like TN format)
    const rule = {
      type: 'position',
      delimiter: '\\s+',
      partIndex: 2, // Third part
      confidence: 0.9
    };
    
    // Check if we need substring extraction
    const thirdParts = customerAnalysis.structures.map(s => s.parts[2]);
    const productPattern = findProductInThirdPart(thirdParts, internalAnalysis.products);
    
    if (productPattern) {
      rule.substring = productPattern.substring;
      rule.formatting = productPattern.formatting;
      rule.confidence = productPattern.confidence;
      rules.push(rule);
    }
  }
  
  // Add regex-based rules as fallback
  const regexPattern = generateRegexPattern(customerAnalysis, internalAnalysis);
  if (regexPattern) {
    rules.push({
      type: 'regex',
      pattern: regexPattern.pattern,
      captureGroup: regexPattern.captureGroup,
      confidence: regexPattern.confidence
    });
  }
  
  return rules;
}

// Find product pattern in QR parts or anywhere in the QR
function findProductInThirdPart(thirdParts, products) {
  // Look for patterns like "0019GN5200253000..." where GN520-02530 should be extracted
  for (let i = 0; i < thirdParts.length && i < products.length; i++) {
    const part = thirdParts[i];
    const product = products[i];
    
    // Remove formatting from product for comparison
    const cleanProduct = product.replace(/[\-\/,]/g, '');
    
    if (part.includes(cleanProduct)) {
      const startPos = part.indexOf(cleanProduct);
      return {
        substring: {
          start: startPos,
          end: startPos + cleanProduct.length
        },
        formatting: {
          insert: [{
            position: 5, // After GN520
            character: '-'
          }]
        },
        confidence: 0.95
      };
    }
  }
  
  return null;
}

// Find product pattern anywhere in customer QR
function findProductAnywhere(customerSamples, internalSamples) {
  // Analyze multiple samples to find a common pattern
  const productMatches = [];
  
  for (let i = 0; i < customerSamples.length && i < internalSamples.length; i++) {
    const customerQR = customerSamples[i].qr;
    const internalQR = internalSamples[i].qr;
    
    // Extract product code from internal QR (before comma)
    const product = internalQR.includes(',') ? internalQR.split(',')[0].trim() : internalQR.trim();
    
    // Check if product appears directly in customer QR (with dashes)
    if (customerQR.includes(product)) {
      const startPos = customerQR.indexOf(product);
      // Find what comes before and after the product
      const before = customerQR.substring(Math.max(0, startPos - 10), startPos);
      const after = customerQR.substring(startPos + product.length, startPos + product.length + 10);
      
      productMatches.push({
        product,
        startPos,
        before,
        after,
        hasDirectMatch: true
      });
    }
  }
  
  // If we found direct matches in all samples, create a generic pattern
  if (productMatches.length > 0 && productMatches.every(m => m.hasDirectMatch)) {
    // Analyze the pattern: product codes like "67161-X1B39-B0"
    // Format: 5 digits - alphanumeric - alphanumeric
    const firstProduct = productMatches[0].product;
    
    // Detect the format pattern
    const parts = firstProduct.split('-');
    let pattern;
    let captureGroup = 1;
    
    if (parts.length === 3) {
      // Pattern: NNNNN-AAAAAA-AA format (like 67161-X1B39-B0)
      // Create a flexible regex that captures this format
      pattern = `([0-9]{5}-[A-Z0-9]{5,6}-[A-Z0-9]{2})`;
    } else if (parts.length === 2) {
      // Pattern: AAAAA-AAAAA format
      pattern = `([A-Z0-9]{4,6}-[A-Z0-9]{4,6})`;
    } else {
      // Fallback: just capture alphanumeric with dashes
      pattern = `([A-Z0-9\\-]{10,20})`;
    }
    
    console.log('✅ Created generic product pattern:', pattern);
    
    return {
      type: 'regex',
      pattern: pattern,
      captureGroup: captureGroup,
      confidence: 0.95,
      extraction: {
        method: 'pattern_match',
        format: parts.length === 3 ? 'NNNNN-AAAAAA-AA' : 'variable'
      }
    };
  }
  
  return null;
}

// Generate regex pattern for extraction
function generateRegexPattern(customerAnalysis, internalAnalysis) {
  // Look for GN pattern in customer QRs
  const hasGN = customerAnalysis.commonSubstrings.some(s => s.includes('GN'));
  
  if (hasGN) {
    return {
      pattern: 'GN(\\d{3})[\\-\\/]?(\\d{5})',
      captureGroup: 0, // Full match
      confidence: 0.8
    };
  }
  
  return null;
}

// Generate detection rules
function generateDetectionRules(analysis) {
  const rules = [];
  
  // Length-based rule
  if (analysis.commonLength) {
    rules.push({
      type: 'length',
      min: analysis.commonLength - 5,
      max: analysis.commonLength + 5,
      confidence: 0.7
    });
  }
  
  // Structure rule
  if (analysis.commonStructure) {
    rules.push({
      type: 'structure',
      delimiter: '\\s+',
      partCount: analysis.commonStructure.partCount,
      confidence: 0.8
    });
  }
  
  // Pattern-based rules
  analysis.commonSubstrings.forEach(substring => {
    if (substring.length > 3) { // Only meaningful substrings
      rules.push({
        type: 'contains',
        text: substring,
        confidence: 0.9
      });
    }
  });
  
  return rules;
}

// Calculate confidence score
function calculateConfidence(analysis, rules) {
  let confidence = 0.5; // Base confidence
  
  // Boost confidence based on consistency
  const structures = analysis.structures;
  const partCounts = structures.map(s => s.partCount);
  const lengthVariance = Math.max(...analysis.lengths) - Math.min(...analysis.lengths);
  
  if (lengthVariance <= 5) confidence += 0.2;
  if (new Set(partCounts).size === 1) confidence += 0.2; // All same part count
  if (analysis.commonSubstrings.length > 0) confidence += 0.1;
  
  // Boost based on number of rules generated
  confidence += Math.min(rules.length * 0.05, 0.2);
  
  return Math.min(confidence, 1.0);
}

// Helper functions
function getMostCommon(arr) {
  const counts = {};
  arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

function findCommonStructure(structures) {
  if (structures.length === 0) return null;
  
  const first = structures[0];
  const isConsistent = structures.every(s => 
    s.partCount === first.partCount && 
    s.spaceCount === first.spaceCount
  );
  
  return isConsistent ? first : null;
}

function findCommonSubstrings(strings) {
  if (strings.length < 2) return [];
  
  const substrings = [];
  const first = strings[0];
  
  // Find substrings of length 4+ that appear in all strings
  for (let i = 0; i < first.length - 3; i++) {
    for (let len = 4; len <= first.length - i; len++) {
      const substring = first.substring(i, i + len);
      if (strings.every(s => s.includes(substring))) {
        substrings.push(substring);
      }
    }
  }
  
  // Return longest unique substrings
  return [...new Set(substrings)].sort((a, b) => b.length - a.length).slice(0, 3);
}

// Test extraction with learned patterns
function testExtraction(qr, extractionRules) {
  for (const rule of extractionRules) {
    try {
      if (rule.type === 'regex') {
        const match = qr.match(new RegExp(rule.pattern));
        if (match && match[rule.captureGroup || 1]) {
          let result = match[rule.captureGroup || 1];
          if (rule.formatting) {
            result = applyFormattingServer(result, rule.formatting);
          }
          return result;
        }
      } else if (rule.type === 'position') {
        const parts = qr.split(new RegExp(rule.delimiter || '\\s+'));
        if (parts.length > rule.partIndex && parts[rule.partIndex]) {
          let part = parts[rule.partIndex];
          
          if (rule.substring) {
            part = part.substring(rule.substring.start, rule.substring.end);
          }
          
          if (rule.formatting) {
            part = applyFormattingServer(part, rule.formatting);
          }
          
          return part;
        }
      }
    } catch (error) {
      console.error('Error applying extraction rule:', error);
    }
  }
  
  return null;
}

// Test detection with learned patterns
function testDetection(qr, detectionRules) {
  for (const rule of detectionRules) {
    try {
      if (rule.type === 'regex') {
        const regex = new RegExp(rule.pattern);
        if (regex.test(qr)) return true;
      } else if (rule.type === 'contains') {
        if (qr.includes(rule.text)) return true;
      } else if (rule.type === 'length') {
        if (qr.length >= rule.min && qr.length <= rule.max) return true;
      } else if (rule.type === 'structure') {
        const parts = qr.split(new RegExp(rule.delimiter || '\\s+'));
        if (parts.length === rule.partCount) return true;
      }
    } catch (error) {
      console.error('Error applying detection rule:', error);
    }
  }
  
  return false;
}

// Apply formatting on server side
function applyFormattingServer(text, formatting) {
  let result = text;
  
  if (formatting.insert) {
    for (const insert of formatting.insert) {
      result = result.substring(0, insert.position) + 
              insert.character + 
              result.substring(insert.position);
    }
  }
  
  if (formatting.prefix) {
    result = formatting.prefix + result;
  }
  
  if (formatting.suffix) {
    result = result + formatting.suffix;
  }
  
  return result;
}

// Generate hash for pattern data
function generatePatternHash(analysisResult) {
  const crypto = require('crypto');
  const dataToHash = JSON.stringify({
    extractionRules: analysisResult.extractionRules,
    detectionRules: analysisResult.detectionRules,
    confidence: analysisResult.confidence
  });
  
  return crypto.createHash('sha256').update(dataToHash).digest('hex').substring(0, 16);
}

// QR LEARNING SYSTEM BACKEND END


// ============================================
// GEN CSV Download Routes & Functions
// ============================================

// Token management functions
async function loadExistingTokens() {
    try {
        if (!fs.existsSync('gen_tokens.json')) {
            console.log('📄 No existing tokens file found');
            return null;
        }
        
        const tokenData = JSON.parse(fs.readFileSync('gen_tokens.json', 'utf8'));
        const tokenAge = Date.now() - new Date(tokenData.timestamp).getTime();
        const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
        
        if (tokenAge > maxAge) {
            console.log('⏰ Existing tokens are too old (> 1 hour), will refresh');
            return null;
        }
        
        console.log(`🔄 Found existing tokens (${Math.round(tokenAge / 1000 / 60)} minutes old)`);
        return tokenData;
    } catch (error) {
        console.log('❌ Error loading existing tokens:', error.message);
        return null;
    }
}

async function testTokenValidity(phpsessid, csrfToken) {
    console.log('🧪 Testing token validity...');
    
    const testUrl = 'https://sasaki-mfg.gen-cloud.jp/api/received/csv?' + new URLSearchParams({
        search_worker_id: 'gen_all',
        search_section_id: 'gen_all',
        search_received_detail_delivery_completed: 'false',
        search_custom_text_1: 'gen_all',
        search_custom_text_2: 'gen_all',
        search_gen_crossTableHorizontal: 'gen_nothing',
        search_gen_crossTableVertical: 'gen_nothing', 
        search_gen_crossTableValue: 'gen_nothing',
        search_gen_crossTableMethod: 'sum',
        qs: new Date().toISOString().split('T')[0],
        offset: '0',
        search_orderby: 'received_detail_line_no:::false,received_number:::true,id:::false,received_detail_id:::false',
        displayPatternId: ''
    });

    try {
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `PHPSESSID=${phpsessid}`,
                'X-Gen-CSRF-Token': csrfToken,
                'Referer': 'https://sasaki-mfg.gen-cloud.jp/list/received/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            agent: httpsAgent
        });

        if (response.ok) {
            const csvData = await response.buffer();
            const csvText = csvData.toString();
            if (csvText.includes('エラーが発生しました') || csvText.includes('session_error') || csvData.length < 50) {
                console.log('❌ Tokens are invalid (error in response)');
                return false;
            }
            console.log('✅ Tokens are valid');
            return true;
        } else {
            console.log(`❌ Tokens are invalid (HTTP ${response.status})`);
            return false;
        }
    } catch (error) {
        console.log('❌ Token validation failed:', error.message);
        return false;
    }
}

async function getValidTokens() {
    const existingTokens = await loadExistingTokens();
    
    if (existingTokens) {
        const isValid = await testTokenValidity(existingTokens.phpsessid, existingTokens.csrfToken);
        
        if (isValid) {
            console.log('✅ Reusing existing valid tokens');
            return existingTokens;
        } else {
            console.log('🔄 Existing tokens invalid, extracting fresh ones...');
        }
    }
    
    console.log('🔐 Extracting fresh authentication tokens...');
    const freshTokens = await extractGENTokens();
    
    if (!freshTokens) {
        throw new Error('Failed to extract fresh authentication tokens');
    }
    
    console.log('✅ Fresh tokens extracted successfully');
    return freshTokens;
}

async function downloadCSVWithRetry(apiUrl, tokens, fromDate, toDate) {
    const makeRequest = async (phpsessid, csrfToken) => {
        return await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `PHPSESSID=${phpsessid}`,
                'X-Gen-CSRF-Token': csrfToken,
                'Referer': 'https://sasaki-mfg.gen-cloud.jp/list/received/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            agent: httpsAgent
        });
    };

    let response = await makeRequest(tokens.phpsessid, tokens.csrfToken);
    
    if (response.ok) {
        const data = await response.buffer();
        const dataText = data.toString();
        
        if (dataText.includes('エラーが発生しました') || dataText.includes('session_error') || 
            dataText.includes('CSRF') || dataText.includes('expired')) {
            console.log('🔄 Response contains error, tokens may be invalid, retrying with fresh tokens...');
            
            if (fs.existsSync('gen_tokens.json')) {
                fs.renameSync('gen_tokens.json', 'gen_tokens_backup.json');
            }
            
            const freshTokens = await extractGENTokens();
            
            if (freshTokens && freshTokens.csrfToken !== 'MANUAL_REQUIRED') {
                console.log('✅ Fresh tokens extracted, retrying CSV download...');
                
                const retryResponse = await makeRequest(freshTokens.phpsessid, freshTokens.csrfToken);
                
                if (retryResponse.ok) {
                    const retryData = await retryResponse.buffer();
                    console.log(`✅ Retry successful! Downloaded ${retryData.length} bytes`);
                    
                    if (fs.existsSync('gen_tokens_backup.json')) {
                        fs.unlinkSync('gen_tokens_backup.json');
                    }
                    
                    return retryData;
                } else {
                    throw new Error(`Retry failed: ${retryResponse.status} ${retryResponse.statusText}`);
                }
            } else {
                throw new Error('Failed to extract fresh tokens for retry');
            }
        }
        
        console.log(`✅ CSV downloaded successfully (${data.length} bytes)`);
        return data;
    } else {
        console.log(`❌ HTTP ${response.status}, attempting with fresh tokens...`);
        
        if (fs.existsSync('gen_tokens.json')) {
            fs.renameSync('gen_tokens.json', 'gen_tokens_backup.json');
        }
        
        const freshTokens = await extractGENTokens();
        
        if (freshTokens && freshTokens.csrfToken !== 'MANUAL_REQUIRED') {
            console.log('✅ Fresh tokens extracted, retrying CSV download...');
            
            const retryResponse = await makeRequest(freshTokens.phpsessid, freshTokens.csrfToken);
            
            if (retryResponse.ok) {
                const retryData = await retryResponse.buffer();
                console.log(`✅ Retry successful! Downloaded ${retryData.length} bytes`);
                
                if (fs.existsSync('gen_tokens_backup.json')) {
                    fs.unlinkSync('gen_tokens_backup.json');
                }
                
                return retryData;
            } else {
                const retryError = await retryResponse.text();
                throw new Error(`Both attempts failed. Last error: ${retryResponse.status} ${retryResponse.statusText} - ${retryError.substring(0, 200)}`);
            }
        } else {
            throw new Error('Failed to extract fresh tokens for retry');
        }
    }
}

// GEN Routes

// Serve GEN HTML interface
app.get('/gen-automated', (req, res) => {
    res.sendFile(path.join(__dirname, 'gen-automated.html'));
});

// API endpoint to extract tokens and download CSV
app.post('/extract-tokens', async (req, res) => {
    const { fromDate, toDate, workerFilter } = req.body;
    
    console.log('🚀 Starting automated CSV download...');
    console.log(`📅 Date range: ${fromDate} to ${toDate}`);
    console.log(`👤 Worker filter: ${workerFilter}`);
    console.log('🔍 Request body received:', JSON.stringify(req.body, null, 2));

    try {
        const tokens = await getValidTokens();
        
        if (tokens.csrfToken === 'MANUAL_REQUIRED') {
            throw new Error('CSRF token requires manual extraction. Please use the manual mode in the web interface.');
        }
        console.log('📥 Downloading CSV with date filters...');

        const params = {
            search_worker_id: workerFilter || 'gen_all',
            search_section_id: 'gen_all',
            search_received_detail_delivery_completed: 'false',
            search_custom_text_1: 'gen_all',
            search_custom_text_2: 'gen_all',
            search_gen_crossTableHorizontal: 'gen_nothing',
            search_gen_crossTableVertical: 'gen_nothing',
            search_gen_crossTableValue: 'gen_nothing',
            search_gen_crossTableMethod: 'sum'
        };

        if (fromDate && toDate && fromDate === toDate) {
            console.log(`📅 Single date query: ${fromDate}`);
            params.qs = fromDate;
        } else if (fromDate && toDate) {
            console.log(`📅 Date range: ${fromDate} to ${toDate}`);
            params.search_received_detail_dead_line_from = fromDate;
            params.search_received_detail_dead_line_to = toDate;
        } else if (fromDate) {
            console.log(`📅 From date: ${fromDate}`);
            params.search_received_detail_dead_line_from = fromDate;
        } else if (toDate) {
            console.log(`📅 To date: ${toDate}`);
            params.search_received_detail_dead_line_to = toDate;
        }
        
        params.offset = '0';
        params.search_orderby = 'received_detail_line_no:::false,received_number:::true,id:::false,received_detail_id:::false';
        params.displayPatternId = '';
        
        const urlParams = new URLSearchParams(params);

        const apiUrl = `https://sasaki-mfg.gen-cloud.jp/api/received/csv?${urlParams}`;
        console.log('🌐 API URL:', apiUrl);
        console.log('🔑 Using tokens:', { 
            phpsessid: tokens.phpsessid?.substring(0, 20) + '...', 
            csrfToken: tokens.csrfToken?.substring(0, 20) + '...' 
        });

        const downloadedCSV = await downloadCSVWithRetry(apiUrl, tokens, fromDate, toDate);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="gen_received_orders_${fromDate || 'all'}_to_${toDate || 'all'}.csv"`);
        res.send(downloadedCSV);

    } catch (error) {
        console.error('❌ Error during automated download:', error.message);
        
        let userFriendlyMessage = error.message;
        let instructions = 'Please try again or use manual mode.';
        
        if (error.message.includes('socket hang up')) {
            userFriendlyMessage = 'Automated login failed - browser automation blocked';
            instructions = 'MANUAL MODE STEPS:\n\n1. Open https://sasaki-mfg.gen-cloud.jp/login in a new tab\n2. Login with your credentials\n3. Go to any page (like Received Orders)\n4. Press F12 → Network tab\n5. Navigate or refresh the page\n6. Find any request and check headers:\n   - Copy Cookie: PHPSESSID=...\n   - Copy x-gen-csrf-token: ...\n7. Paste both values in Manual Mode below and try again';
        } else if (error.message.includes('session_error')) {
            userFriendlyMessage = 'Authentication tokens have expired';
            instructions = 'Your session has expired. Please get fresh tokens using Manual Mode below.';
        }
        
        res.status(500).json({ 
            error: userFriendlyMessage,
            instructions: instructions,
            technicalDetails: error.message
        });
    }
});

// GEN Health check endpoint
app.get('/gen-health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'GEN CSV Download functionality is active'
    });
});


app.listen(port, () => {
  console.log(`✅ Combined server is running at http://localhost:${port}`);
  console.log(`🌐 GEN CSV Download available at: http://localhost:${port}/gen-automated`);
});
