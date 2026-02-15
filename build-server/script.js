const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
    console.log('Executing script.js');
    const outDirPath = path.join(__dirname, 'output');

    // Create vite.config.js with correct base path
    const baseUrl = `https://stacklift-vercel-clone.s3.ap-south-2.amazonaws.com/__outputs/${PROJECT_ID}/`;
    const viteConfig = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '${baseUrl}'
})
`;
    
    fs.writeFileSync(path.join(outDirPath, 'vite.config.js'), viteConfig);

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', function (data) {
        console.log(data.toString());
    });

    p.stderr.on('data', function (data) {
        console.log('Error', data.toString());
    });

    p.on('close', async function () {
        console.log('Build Complete');
        const distFolderPath = path.join(__dirname, 'output', 'dist');
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath);

            const command = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath),
                ACL: 'public-read'
            });

            await s3Client.send(command);
            console.log('uploaded', filePath);
        }
        console.log('Done...');
    });

}

init();