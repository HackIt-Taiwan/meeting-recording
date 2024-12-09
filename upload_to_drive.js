const { google } = require('googleapis');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

async function uploadFile(filePath, fileName) {
    try {
        const response = await drive.files.create({
            resource: {
                name: fileName,
                parents: [process.env.UPLOAD_FOLDER_ID],
            },
            media: {
                mimeType: 'audio/mp3',
                body: fs.createReadStream(filePath),
            },
        });

        console.log(`文件已上傳至 Google Drive: ${response.data.id}`);
    } catch (error) {
        console.error(`上傳文件失敗: ${error.message}`);
    }
}

module.exports = { uploadFile };
