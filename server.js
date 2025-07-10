// This is the COMBINED version of `server.js` with all `masterUserServer.js` routes ported into it.
// Nothing from `masterUserServer.js` is lost — everything is now under the same server, same Express instance.
// The port used will still be 3000 (same as original `server.js`) unless you change it below.

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const bodyParser = require('body-parser');
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  readPreference:'nearest', // Use 'nearest' read preference for better performance
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
    const database = client.db("Sasaki_Coating_MasterDB");
    const collection = database.collection("setsubiList");

    const factory = req.query.factory;
    const query = { 工場: factory };
    const projection = { 設備: 1, _id: 0 };

    const result = await collection.find(query).project(projection).toArray();
    res.json(result);
  } catch (error) {
    console.error("Error retrieving data:", error);
    res.status(500).send("Error retrieving data");
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

    // Extract and remove base64 image data
    const images = formData.images || [];
    delete formData.images;

    const labelToField = {
      "初物チェック": "初物チェック画像",
      "終物チェック": "終物チェック画像",
      "材料ラベル": "材料ラベル画像",
    };

    // Upload each image and store its URL directly into the formData object
    for (const img of images) {
      if (!img.base64 || !img.label) continue;

      const buffer = Buffer.from(img.base64, 'base64');
      const fileName = `${img.sebanggo}_${img.date}_${img.worker}_${img.factory}_${img.machine}_${img.label}.jpg`;
      const filePath = `CycleCheck/${img.factory}/${fileName}`;
      const file = admin.storage().bucket().file(filePath);

      // await file.save(buffer, {
      //   metadata: { contentType: 'image/jpeg' },
      //   public: true,
      // });

      // const publicUrl = `https://storage.googleapis.com/${file.bucket.name}/${file.name}`;
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
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;

      // Use predefined field name or fallback
      const fieldName = labelToField[img.label] || `${img.label}画像`;
      formData[fieldName] = publicUrl;
    }

    const result = await pressDB.insertOne(formData);

    res.status(201).json({
      message: "Data and images successfully saved to pressDB",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error saving data to pressDB:", error);
    res.status(500).json({ error: "Error saving data to pressDB" });
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
                
                // Map to specific fields
                if (img.label === "初物チェック") uploadedImageURLs["初物チェック画像"] = publicUrl;
                else if (img.label === "終物チェック") uploadedImageURLs["終物チェック画像"] = publicUrl;
                else if (img.label === "材料ラベル") uploadedImageURLs["材料ラベル画像"] = publicUrl;
                
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

        // 3. Prepare pressDB data (exclude Counters - that's only for kensaDB)
        const pressDBData = {
            ...formData,
            ...uploadedImageURLs, // Add cycle check image URLs
            Maintenance_Data: processedMaintenanceData // Add maintenance data with photo URLs
        };

        // Remove the raw image arrays and kensaDB-specific data from pressDB
        delete pressDBData.images;
        delete pressDBData.maintenanceImages;
        delete pressDBData.Counters; // Counters are only for kensaDB, not pressDB
        delete pressDBData.isToggleChecked; // This is just a UI state flag, not data to store

        // 4. Save to pressDB
        const database = client.db("submittedDB");
        const pressDB = database.collection("pressDB");
        
        const pressResult = await pressDB.insertOne(pressDBData);
        console.log(`✅ Data saved to pressDB with ID: ${pressResult.insertedId}`);

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
                Worker_Name: formData.Worker_Name,
                Process_Quantity: formData.Process_Quantity,
                Remaining_Quantity: formData.Total,
                Date: formData.Date,
                Time_start: formData.Time_start,
                Time_end: formData.Time_end,
                設備: formData.設備,
                Cycle_Time: formData.Cycle_Time,
                製造ロット: formattedDate, // Use formatted Date in yyyymmdd format instead of 材料ロット
                Comment: formData.Comment,
                Spare: formData.Spare,
                Counters: counters,
                Total_NG: Total_NG_Kensa,
                Break_Time_Data: formData.Break_Time_Data,
                Total_Break_Minutes: formData.Total_Break_Minutes,
                Total_Break_Hours: formData.Total_Break_Hours,
                Maintenance_Data: processedMaintenanceData, // Same maintenance data with photos
                Total_Trouble_Minutes: formData.Total_Trouble_Minutes,
                Total_Trouble_Hours: formData.Total_Trouble_Hours,
                Total_Work_Hours: formData.Total_Work_Hours
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



//FREYA ACESS BACKEND
app.post("/loginCustomer", async (req, res) => {
  const { username, password } = req.body;

  try {
    await client.connect();

    const globalDB = client.db("Sasaki_Coating_MasterDB");
    const masterUser = await globalDB.collection("masterUsers").findOne({ username });

    // 1️⃣ MasterUser login
    if (masterUser) {
      const passwordMatch = await bcrypt.compare(password, masterUser.password);
      if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

      const today = new Date();
      const validUntil = new Date(masterUser.validUntil);
      if (today > validUntil) return res.status(403).json({ error: "Account expired. Contact support." });

      return res.status(200).json({
        username: masterUser.username,
        role: masterUser.role,
        dbName: masterUser.dbName
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

        return res.status(200).json({
          username: subUser.username,
          role: subUser.role,
          dbName: mu.dbName,
          masterUsername: mu.username
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

// app.post("/createUser", async (req, res) => {
//   const { firstName, lastName, email, username, password, role } = req.body;

//   // Validate required fields
//   if (!firstName || !lastName || !email || !username || !password || !role) {
//     console.log("missing required fields!!!:", { firstName, lastName, email, username, password, role });
//     return res.status(400).json({ error: "Missing required fields" });

//   }

//   try {
//     await client.connect();
//     const db = client.db("Sasaki_Coating_MasterDB");
//     const masterUsers = db.collection("users");

//     // Check if username already exists
//     const existing = await masterUsers.findOne({ username });
//     if (existing) return res.status(400).json({ error: "Username already exists" });

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Insert master user
//     await masterUsers.insertOne({
//       firstName,
//       lastName,
//       email,
//       username,
//       password: hashedPassword,
//       role,
//       createdAt: new Date()
//     });

//     console.log("✅ New master user created:", username);
//     res.json({ message: "Master user created successfully" });
//   } catch (err) {
//     console.error("❌ Error creating master user:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

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


//FREYA ADMIN BACKEND END



//FREYA CUSTOMER ACCESS BACKEND
// ✅ Add this route to your customer backend



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



//FREYA CUSTOMER ACCESS BACKEND END

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


//updates masterDB
app.post("/updateMasterRecord", async (req, res) => {
  const { recordId, updates, username } = req.body;

  if (!recordId || !updates || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterColl = db.collection("masterDB");
    const logColl = db.collection("masterDB_Log");

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


//this uploads or updates the image in the masterDB mongoDB
app.post("/uploadMasterImage", async (req, res) => {
  const { base64, label, recordId, username } = req.body;

  if (!base64 || !recordId || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterDB = db.collection("masterDB");
    const logColl = db.collection("masterDB_Log");

    const objectId = new ObjectId(recordId);
    const oldRecord = await masterDB.findOne({ _id: objectId });

    if (!oldRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    const 品番 = oldRecord["品番"] || "unknownPart";
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

    // Update masterDB document
    await masterDB.updateOne({ _id: objectId }, { $set: { imageURL: firebaseUrl } });

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

//inserts data to masterDB
app.post("/submitToMasterDB", async (req, res) => {
  const { data, username } = req.body;

  if (!data || !username) {
    return res.status(400).json({ error: "Missing data or username" });
  }

  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterDB = db.collection("masterDB");
    const logColl = db.collection("masterDB_Log");

    // Insert the data
    const result = await masterDB.insertOne(data);

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


app.listen(port, () => {
  console.log(`✅ Combined server is running at http://localhost:${port}`);
});
