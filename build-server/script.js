const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const {Kafka}=require('kafkajs')

console.log('🚀 Starting build-server script');
console.log('📡 Initializing Kafka connection...');








const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const PROJECT_ID = process.env.PROJECT_ID;
const deploymentid=process.env.DEPLOYMENT_ID;

// Read Kafka SSL certificates from env vars (Docker/ECS) or files (local)
const getKafkaSSLConfig = () => {
    if (process.env.KAFKA_SSL_KEY && process.env.KAFKA_SSL_CERT && process.env.KAFKA_SSL_CA) {
        console.log('📜 Using Kafka certificates from environment variables');
        return {
            rejectUnauthorized: true,
            key: Buffer.from(process.env.KAFKA_SSL_KEY, 'base64'),
            cert: Buffer.from(process.env.KAFKA_SSL_CERT, 'base64'),
            ca: [Buffer.from(process.env.KAFKA_SSL_CA, 'base64')]
        };
    } else {
        console.log('📜 Using Kafka certificates from files');
        return {
            rejectUnauthorized: true,
            key: fs.readFileSync(path.join(__dirname, 'service.key')),
            cert: fs.readFileSync(path.join(__dirname, 'service.cert')),
            ca: [fs.readFileSync(path.join(__dirname, 'ca.pem'))]
        };
    }
};

const kafka = new Kafka({
    clientId: `docker-builder-server-${deploymentid}`,
    brokers: ['kafka-2563b77e-ankushadhikari321-360d.f.aivencloud.com:16982'],
    ssl: getKafkaSSLConfig()
})

const publisher = kafka.producer();

// Validate PROJECT_ID
if (!PROJECT_ID) {
    console.error('❌ PROJECT_ID environment variable is missing!');
    process.exit(1);
}

async function publishlog(log){
    try {
        await publisher.send({
            topic: 'container-logs',
            messages: [{
                value: JSON.stringify({message: log, timestamp: new Date().toISOString()})
            }]
        });
        console.log(`📤 Published log to Logs:${PROJECT_ID}`, log);
    } catch (err) {
        console.error('❌ Kafka publish error:', err.message);
    }
}

async function init() {
    console.log('Executing script.js');
    console.log('PROJECT_ID:', PROJECT_ID);
    console.log('Waiting for Kafka connection...');
    
    // Connect Kafka producer
    try {
        await publisher.connect();
        console.log('✅ Kafka producer connected successfully!');
    } catch (err) {
        console.error('❌ FATAL: Could not connect to Kafka. Exiting...');
        console.error('Kafka error:', err.message);
        process.exit(1);
    }
    
    await publishlog('Build Started')
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

    p.stdout.on('data', async function (data) {
        console.log(data.toString());
        await publishlog(data.toString());
    });

    p.stderr.on('data', async function (data) {
        console.log('Error', data.toString());
        await publishlog(`Error: ${data.toString()}`);
    });

    p.on('close', async function () {
        console.log('Build Complete');
        await publishlog('Build Completed');
        const distFolderPath = path.join(__dirname, 'output', 'dist');
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });
       
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath);
            await publishlog(`Uploading: ${filePath}`);

            const command = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath),
                ACL: 'public-read'
            });

            await s3Client.send(command);
            console.log('uploaded', filePath);
            await publishlog(`Uploaded: ${file}`);
        }
        console.log('Done... everthing uploaded successfully');
        await publishlog('Build Completed...');
        await publisher.disconnect();
        process.exit(0);
    });

}

init();