// Description: This script uploads images from a local directory to Firebase Storage and updates the corresponding records in MongoDB with the image URLs.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const admin = require("firebase-admin");

// --- Firebase Admin Initialization (from server.js) ---
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const storage = admin.storage();
const bucket = storage.bucket();

// --- MongoDB Initialization (from server.js) ---
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const IMAGES_DIR = "/Users/karlsome/Documents/ImagesToUpload";
const DOWNLOAD_TOKEN = "masterDBToken69";

async function uploadImagesAndUpdateMongo() {
  try {
    await client.connect();
    const db = client.db("Sasaki_Coating_MasterDB");
    const masterDB = db.collection("masterDB");

    const files = fs.readdirSync(IMAGES_DIR).filter(file =>
      /\.(jpg|jpeg|png)$/i.test(file)
    );

    if (files.length === 0) {
      console.log("❌ No image files found in the directory.");
      return;
    }

    for (const fileName of files) {
      const filePath = path.join(IMAGES_DIR, fileName);
      const nameWithoutExt = path.parse(fileName).name;

      const record = await masterDB.findOne({
        $or: [
          { 背番号: nameWithoutExt },
          { 品番: nameWithoutExt }
        ]
      });

      if (!record) {
        console.log(`⚠️ No record found for: ${fileName}`);
        continue;
      }

      const file = bucket.file(`masterImage/${fileName}`);
      const buffer = fs.readFileSync(filePath);

      await file.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            firebaseStorageDownloadTokens: DOWNLOAD_TOKEN
          }
        }
      });

      const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${DOWNLOAD_TOKEN}`;

      await masterDB.updateOne(
        { _id: record._id },
        { $set: { imageURL: firebaseUrl } }
      );

      console.log(`✅ Uploaded & updated: ${fileName}`);
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
    console.log("🔚 MongoDB connection closed.");
  }
}

uploadImagesAndUpdateMongo();