require("dotenv").config(); // Add this line at the top if you're using environment variables

const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI; // Use the same URI as in server.js
const client = new MongoClient(uri);

async function seed() {
  await client.connect();
  const db = client.db("Sasaki_Coating_MasterDB"); // Keep DB name same as used in your login route
  const users = db.collection("users");

  const hashedPassword = await bcrypt.hash("admin123", 10);
  await users.insertOne({
    username: "admin",
    password: hashedPassword,
    role: "admin",
  });

  console.log("✅ Admin user inserted");
  await client.close();
}

seed();