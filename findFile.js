require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { google } = require('googleapis');

async function findFile() {
  try {
    const clientEmail = process.env.HABA_EXTRACTOR_CLIENT_EMAIL;
    let privateKey = process.env.HABA_EXTRACTOR_PRIVATE_KEY;
    
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/drive.readonly']
    );

    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = '13CYahWvHBUQmShSs3-TsgLvgyCM7mG51';
    const fileName = '■引当表　2021年1月～.xls';

    console.log(`Searching for '${fileName}' in folder ${folderId}...`);
    
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files.length > 0) {
      console.log('FOUND_FILE_ID=' + res.data.files[0].id);
    } else {
      console.log('File not found in folder. Ensure the service account has Viewer access to this folder or file.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findFile();
