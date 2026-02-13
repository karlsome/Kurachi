/**
 * Script to update pricePerPc and pricePerBox in MongoDB from CSV file
 * 
 * CSV columns expected: Item code, Item name, Standard sales unit price 1, 背番号 *
 * 
 * Usage: node updatePricesFromCSV.js <path-to-csv-file>
 * Example: node updatePricesFromCSV.js ./prices.csv
 */


// Shift JIS csv is saved to Downloads price.csv.
// run this if you want to update prices in MongoDB.

require('dotenv').config();
const fs = require('fs');
const iconv = require('iconv-lite');
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  readPreference: 'nearest',
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
});

const DB_NAME = "Sasaki_Coating_MasterDB";
const COLLECTION_NAME = "masterDB";

/**
 * Parse CSV content into array of objects
 */
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 4) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      data.push(row);
    }
  }
  return data;
}

/**
 * Handle CSV line with possible quoted values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function updatePrices(csvFilePath) {
  // Read CSV file
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    process.exit(1);
  }

  // Read as binary buffer and decode from Shift-JIS
  const fileBuffer = fs.readFileSync(csvFilePath);
  const csvContent = iconv.decode(fileBuffer, 'Shift_JIS');
  const csvData = parseCSV(csvContent);
  
  console.log(`📄 Loaded ${csvData.length} rows from CSV`);
  
  // Connect to MongoDB
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const database = client.db(DB_NAME);
    const collection = database.collection(COLLECTION_NAME);
    
    let updated = 0;
    let notFound = 0;
    let errors = 0;
    
    for (const row of csvData) {
      // Get 背番号 from CSV (column name is "背番号 *")
      const sebanggo = row['背番号 *'] || row['背番号*'] || row['背番号'];
      const pricePerPcRaw = row['Standard sales unit price 1'];
      
      if (!sebanggo) {
        console.log(`⚠️ Skipping row - no 背番号 found:`, row);
        continue;
      }
      
      // Parse price (remove commas, convert to number)
      const pricePerPc = parseFloat(pricePerPcRaw?.replace(/,/g, '')) || 0;
      
      if (pricePerPc === 0) {
        console.log(`⚠️ Skipping ${sebanggo} - no valid price found`);
        continue;
      }
      
      try {
        // Find document by 背番号
        const doc = await collection.findOne({ 背番号: sebanggo });
        
        if (!doc) {
          console.log(`⚠️ 背番号 "${sebanggo}" not found in MongoDB`);
          notFound++;
          continue;
        }
        
        // Calculate pricePerBox = pricePerPc × 収容数
        const syuyousuu = parseInt(doc['収容数']) || 1;
        const pricePerBox = pricePerPc * syuyousuu;
        
        // Update document
        const result = await collection.updateOne(
          { 背番号: sebanggo },
          { 
            $set: { 
              pricePerPc: pricePerPc,
              pricePerBox: pricePerBox
            } 
          }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`✅ Updated ${sebanggo}: pricePerPc=${pricePerPc}, pricePerBox=${pricePerBox} (収容数=${syuyousuu})`);
          updated++;
        } else {
          console.log(`ℹ️ ${sebanggo}: No changes (values may be the same)`);
        }
        
      } catch (err) {
        console.error(`❌ Error updating ${sebanggo}:`, err.message);
        errors++;
      }
    }
    
    console.log('\n========== Summary ==========');
    console.log(`✅ Updated: ${updated}`);
    console.log(`⚠️ Not found: ${notFound}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📄 Total processed: ${csvData.length}`);
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run script
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.log('Usage: node updatePricesFromCSV.js <path-to-csv-file>');
  console.log('Example: node updatePricesFromCSV.js ./prices.csv');
  process.exit(1);
}

updatePrices(csvFilePath);
