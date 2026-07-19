const express = require('express');
const { google } = require('googleapis');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ObjectId } = require('mongodb');

// This requires the Google Service Account keys from .env
function getDriveAuth() {
  const clientEmail = process.env.HABA_EXTRACTOR_CLIENT_EMAIL;
  let privateKey = process.env.HABA_EXTRACTOR_PRIVATE_KEY;
  
  if (!clientEmail || !privateKey) {
    throw new Error('Missing HABA_EXTRACTOR_CLIENT_EMAIL or HABA_EXTRACTOR_PRIVATE_KEY in .env');
  }

  // Fix escaped newlines if they are passed as literal '\n' string
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return google.drive({ version: 'v3', auth });
}

module.exports = function(app, client) {

  app.get('/api/production/schedule', async (req, res) => {
    try {
      const db = client.db('Sasaki_Coating_MasterDB');
      const collection = db.collection('firstFactoryProduction');
      
      const submittedDb = client.db('submittedDB');
      const scheduleCollection = submittedDb.collection('firstFactorySchedule');

      // Fetch live parsed data
      const liveData = await collection.find({}).toArray();
      // Fetch user's saved schedule order
      const savedSchedule = await scheduleCollection.findOne({ type: 'currentSchedule' });

      // Merge sort order if it exists
      if (savedSchedule && savedSchedule.scheduleOrder && savedSchedule.scheduleOrder.length > 0) {
        const orderMap = new Map();
        savedSchedule.scheduleOrder.forEach((hinban, index) => {
          orderMap.set(hinban, index);
        });

        liveData.sort((a, b) => {
          const indexA = orderMap.has(a.hinban) ? orderMap.get(a.hinban) : 999999;
          const indexB = orderMap.has(b.hinban) ? orderMap.get(b.hinban) : 999999;
          return indexA - indexB;
        });
      }
      
      res.json({ success: true, data: liveData });
    } catch (error) {
      console.error('Error fetching schedule:', error);
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  app.post('/api/production/schedule', async (req, res) => {
    try {
      const { scheduleOrder } = req.body;
      const submittedDb = client.db('submittedDB');
      const scheduleCollection = submittedDb.collection('firstFactorySchedule');

      await scheduleCollection.updateOne(
        { type: 'currentSchedule' },
        { $set: { type: 'currentSchedule', scheduleOrder, updatedAt: new Date() } },
        { upsert: true }
      );

      res.json({ success: true, message: 'Schedule saved successfully' });
    } catch (error) {
      console.error('Error saving schedule:', error);
      res.status(500).json({ error: 'Failed to save schedule' });
    }
  });

  app.post('/api/production/sync-excel', async (req, res) => {
    try {
      // 1. Get the month string, e.g., '2026-07' -> '2026年7月'
      let targetTabName = '2026年7月'; // Default fallback
      if (req.body.month) {
        const [year, month] = req.body.month.split('-');
        targetTabName = `${year}年${parseInt(month, 10)}月`;
      }

      // 2. Identify the file ID (Waiting for user to provide, using a placeholder for now)
      const FILE_ID = req.body.fileId || process.env.GOOGLE_DRIVE_EXCEL_FILE_ID;
      
      if (!FILE_ID) {
        return res.status(400).json({ success: false, message: 'Please provide the fileId of the Excel file.' });
      }

      const drive = getDriveAuth();
      const tempFilePath = path.join(os.tmpdir(), `temp_excel_${Date.now()}.xls`);

      console.log(`Downloading file ${FILE_ID} from Google Drive...`);
      let response;
      try {
        // Try export first (if the file was converted to Google Sheets)
        response = await drive.files.export(
          { 
            fileId: FILE_ID, 
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
          },
          { responseType: 'stream' }
        );
      } catch (err) {
        if (err.message && err.message.includes('fileNotExportable')) {
          // Fallback to get if it's a standard binary file
          response = await drive.files.get(
            { fileId: FILE_ID, alt: 'media' },
            { responseType: 'stream' }
          );
        } else {
          throw err;
        }
      }

      const dest = fs.createWriteStream(tempFilePath);
      
      await new Promise((resolve, reject) => {
        response.data
          .on('end', () => resolve())
          .on('error', err => reject(err))
          .pipe(dest);
      });

      console.log(`Download complete. Parsing ${targetTabName}...`);

      // 3. Read the Excel file in memory
      const workbook = xlsx.readFile(tempFilePath);
      if (!workbook.Sheets[targetTabName]) {
        fs.unlinkSync(tempFilePath);
        return res.status(404).json({ success: false, message: `Tab '${targetTabName}' not found in the Excel file.` });
      }

      const sheet = workbook.Sheets[targetTabName];
      // header: 1 gives us a 2D array [row][col] (0-indexed)
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      let parsedData = [];
      let currentBlock = null;

      // 4. Algorithm to detect Hinban blocks and 4 rows
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        
        // Let's assume Hinban is in one of the first few columns (A, B, C, D)
        // Usually, complex headers might merge cells. We'll search columns 0 to 3.
        let hinbanCandidate = '';
        for (let c = 0; c < 4; c++) {
          if (row[c] && String(row[c]).trim().length > 5 && String(row[c]).includes('/')) {
            hinbanCandidate = String(row[c]).trim();
            break;
          }
        }

        if (hinbanCandidate) {
          if (currentBlock) {
            parsedData.push(currentBlock);
          }
          currentBlock = {
            id: new ObjectId().toString(),
            hinban: hinbanCandidate,
            orders: Array(31).fill(0),
            production: Array(31).fill(0)
          };
        }

        if (currentBlock) {
          // Look for '受注' or '生産' in labels (columns 0 to 5)
          let rowLabel = '';
          for (let c = 0; c < 6; c++) {
            if (row[c]) rowLabel += String(row[c]);
          }

          if (rowLabel.includes('受注')) {
            // Days 1-31 are in F to AJ (index 5 to 35)
            for (let i = 0; i < 31; i++) {
              currentBlock.orders[i] = Number(row[5 + i]) || 0;
            }
          } else if (rowLabel.includes('生産')) {
            for (let i = 0; i < 31; i++) {
              currentBlock.production[i] = Number(row[5 + i]) || 0;
            }
          }
        }
      }

      if (currentBlock) {
        parsedData.push(currentBlock);
      }

      // Cleanup temp file
      fs.unlinkSync(tempFilePath);

      // 5. Save to MongoDB
      if (parsedData.length > 0) {
        const db = client.db('Sasaki_Coating_MasterDB');
        const collection = db.collection('firstFactoryProduction');
        
        // Clear old data and insert new (or you can do upserts by hinban)
        await collection.deleteMany({});
        await collection.insertMany(parsedData);
        
        res.json({ success: true, message: `Successfully synced ${parsedData.length} hinbans`, data: parsedData });
      } else {
        res.json({ success: false, message: 'No data found for this tab.' });
      }

    } catch (error) {
      console.error('Error syncing Excel:', error);
      res.status(500).json({ error: 'Failed to sync Excel', details: error.message });
    }
  });
};
