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

      // Enrich with material master data
      const hinbans = liveData.map(item => item.hinban);
      const masterCollection = db.collection('materialMasterDB3');
      const masterData = await masterCollection.find({ "品番": { $in: hinbans } }).toArray();
      
      const masterMap = {};
      masterData.forEach(master => {
         const packCount = master['品目マスタ']?.['梱包数'] || 0;
         let workTime = 0;
         
         const bomItems = master['BOM'] || [];
         const process2010 = bomItems.find(b => b['工程コード'] === 2010);
         if (process2010) {
            workTime = process2010['作業時間'] || 0;
         }
         
         masterMap[master['品番']] = { packCount, workTime, rawMaster: master };
      });
      
      const enrichedData = liveData.map(item => {
         const masterInfo = masterMap[item.hinban] || { packCount: 0, workTime: 0 };
         return { ...item, materialInfo: masterInfo };
      });

      // Fetch user's saved daily schedules for the month
      const savedSchedules = await scheduleCollection.find({ type: 'dailySchedule', month }).toArray();
      
      res.json({ success: true, data: enrichedData, schedules: savedSchedules });
    } catch (error) {
      console.error('Error fetching schedule:', error);
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  app.post('/api/production/schedule', async (req, res) => {
    try {
      const { scheduleOrder, startTime, month, date } = req.body;
      if (!month || date === undefined) {
        return res.status(400).json({ success: false, message: 'month and date are required' });
      }

      const submittedDb = client.db('submittedDB');
      const scheduleCollection = submittedDb.collection('firstFactorySchedule');

      await scheduleCollection.updateOne(
        { type: 'dailySchedule', month, date: Number(date) },
        { $set: { type: 'dailySchedule', month, date: Number(date), scheduleOrder, startTime, updatedAt: new Date() } },
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
      const FILE_ID = req.body.fileId || process.env.GOOGLE_DRIVE_EXCEL_FILE_ID;
      
      if (!FILE_ID) {
        return res.status(400).json({ success: false, message: 'Please provide the fileId of the Excel file.' });
      }

      const drive = getDriveAuth();
      console.log(`Downloading file ${FILE_ID} from Google Drive to stream to client...`);
      let response;
      try {
        response = await drive.files.export(
          { fileId: FILE_ID, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          { responseType: 'stream' }
        );
      } catch (err) {
        if (err.message && err.message.includes('fileNotExportable')) {
          response = await drive.files.get(
            { fileId: FILE_ID, alt: 'media' },
            { responseType: 'stream' }
          );
        } else {
          throw err;
        }
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sync.xlsx"');
      
      response.data
        .on('error', err => {
          console.error('Error streaming to client:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream Excel' });
          }
        })
        .pipe(res);

    } catch (error) {
      console.error('Error initiating Excel stream:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to initiate stream', details: error.message });
    }
  });

  app.post('/api/production/sync-excel-save', async (req, res) => {
    try {
      const { month, data } = req.body;
      if (!month || !data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, message: 'Invalid payload.' });
      }

      const db = client.db('Sasaki_Coating_MasterDB');
      const collection = db.collection('firstFactoryProduction');
      
      await collection.deleteMany({ month });
      if (data.length > 0) {
        // Ensure consistent id and syncedAt properties
        const formattedData = data.map(item => ({
          ...item,
          id: item.id || new ObjectId().toString(),
          syncedAt: new Date()
        }));
        await collection.insertMany(formattedData);
      }
      
      res.json({ success: true, message: `Successfully synced ${data.length} hinbans`, data });
    } catch (error) {
      console.error('Error saving Excel data:', error);
      res.status(500).json({ error: 'Failed to save Excel data', details: error.message });
    }
  });
};
