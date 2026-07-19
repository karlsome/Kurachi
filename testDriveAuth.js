require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { google } = require('googleapis');

async function diagnose() {
  try {
    const clientEmail = process.env.HABA_EXTRACTOR_CLIENT_EMAIL;
    let privateKey = process.env.HABA_EXTRACTOR_PRIVATE_KEY;
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

    const drive = google.drive({ version: 'v3', auth });

    const FILE_ID = '1JNK7_Zp5XHWgmVIeMQcJMa6r4lzwAyuL';
    const FOLDER_ID = '13CYahWvHBUQmShSs3-TsgLvgyCM7mG51';

    // Step 1: Check file metadata
    console.log('=== STEP 1: Checking file metadata ===');
    try {
      const meta = await drive.files.get({
        fileId: FILE_ID,
        fields: 'id, name, mimeType, size, capabilities, shared, exportLinks',
        supportsAllDrives: true
      });
      console.log('File name:', meta.data.name);
      console.log('MIME type:', meta.data.mimeType);
      console.log('Size:', meta.data.size);
      console.log('Shared:', meta.data.shared);
      console.log('Capabilities:', JSON.stringify(meta.data.capabilities, null, 2));
      console.log('Export Links:', JSON.stringify(meta.data.exportLinks, null, 2));
    } catch (err) {
      console.log('Could not get file metadata:', err.message);
    }

    // Step 2: List files in the folder to find the actual Excel file
    console.log('\n=== STEP 2: Listing files in folder ===');
    try {
      const list = await drive.files.list({
        q: `'${FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      if (list.data.files.length === 0) {
        console.log('No files found in folder.');
      } else {
        list.data.files.forEach(f => {
          console.log(`  - ${f.name} | MIME: ${f.mimeType} | ID: ${f.id} | Size: ${f.size || 'N/A'}`);
        });
      }
    } catch (err) {
      console.log('Could not list folder contents:', err.message);
    }

  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

diagnose();
