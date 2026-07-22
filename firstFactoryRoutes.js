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
      const month = req.query.month || '2026-07';
      const db = client.db('Sasaki_Coating_MasterDB');
      const collection = db.collection('firstFactoryProduction');
      
      const submittedDb = client.db('submittedDB');
      const scheduleCollection = submittedDb.collection('firstFactorySchedule');

      // Fetch live parsed data for the month
      const liveData = await collection.find({ month }).toArray();
      // Fetch user's saved daily schedules for the month
      const savedSchedules = await scheduleCollection.find({ type: 'dailySchedule', month }).toArray();
      
      res.json({ success: true, data: liveData, schedules: savedSchedules });
    } catch (error) {
      console.error('Error fetching schedule:', error);
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  app.post('/api/production/schedule', async (req, res) => {
    try {
      const { scheduleOrder, month, date } = req.body;
      if (!month || date === undefined) {
        return res.status(400).json({ success: false, message: 'month and date are required' });
      }

      const submittedDb = client.db('submittedDB');
      const scheduleCollection = submittedDb.collection('firstFactorySchedule');

      await scheduleCollection.updateOne(
        { type: 'dailySchedule', month, date: Number(date) },
        { $set: { type: 'dailySchedule', month, date: Number(date), scheduleOrder, updatedAt: new Date() } },
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

      // Based on the user's requirement, we include any 品番 that is exactly 20 characters long
      // so we don't need to fetch from the DB anymore.

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
      const requestMonth = req.body.month || '2026-07';

      // 4. Algorithm to detect Hinban blocks and 4 rows
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        
        let hinbanCandidate = '';
        
        // Since all hinbans are strictly in Column B (index 1), we only check row[1]
        const valB = String(row[1] || '').trim();
        
        // Detect a hinban row using a regex (uppercase letters, numbers, slash, dash, asterisk, dot)
        const isHinbanRow = valB.length > 5 && /^[A-Z0-9\/\*\-\.]+$/.test(valB);

        if (isHinbanRow) {
          if (currentBlock) {
            parsedData.push(currentBlock);
            currentBlock = null; // Reset block to prevent data bleeding from ignored hinbans
          }
          
          // Check if valB is exactly 20 characters long
          if (valB.length === 20) {
            currentBlock = {
              id: new ObjectId().toString(),
              month: requestMonth,
              hinban: valB,
              orders: Array(31).fill(0),
              production: Array(31).fill(0)
            };
          }
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
              const val = Number(row[5 + i]) || 0;
              currentBlock.orders[i] = Number(val.toFixed(1));
            }
          } else if (rowLabel.includes('生産')) {
            for (let i = 0; i < 31; i++) {
              const val = Number(row[5 + i]) || 0;
              currentBlock.production[i] = Number(val.toFixed(1));
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
        
        // Clear old data for this month and insert new
        await collection.deleteMany({ month: requestMonth });
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
