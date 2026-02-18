const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const redis=require('ioredis');

console.log('🚀 Starting build-server script');
console.log('📡 Initializing Redis connection...');

const publisher=new redis('rediss://default:AVNS_njDD1DSuPVYs6NH6DFa@valkey-2ba613df-ankushadhikari321-360d.d.aivencloud.com:16981', {
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms`);
        return delay;
    }
})

console.log('Redis client created, status:', publisher.status);

// Handle Redis connection events
publisher.on('connect', () => {
    console.log('✅ Redis publisher connecting...');
});

publisher.on('ready', () => {
    console.log('✅ Redis publisher ready');
});

publisher.on('error', (err) => {
    console.error('❌ Redis publisher error:', err.message);
});

publisher.on('close', () => {
    console.log('⚠️  Redis publisher connection closed');
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const PROJECT_ID = process.env.PROJECT_ID;

// Validate PROJECT_ID
if (!PROJECT_ID) {
    console.error('❌ PROJECT_ID environment variable is missing!');
    process.exit(1);
}

async function publishlog(log){
    try {
        const result = await publisher.publish(`Logs:${PROJECT_ID}`, JSON.stringify({message: log, timestamp: new Date().toISOString()}));
        console.log(`📤 Published log to Logs:${PROJECT_ID} - Subscribers: ${result}`, log);
    } catch (err) {
        console.error('❌ Redis publish error:', err.message);
    }
}

async function init() {
    console.log('Executing script.js');
    console.log('PROJECT_ID:', PROJECT_ID);
    console.log('Waiting for Redis connection...');
    
    // Wait for Redis to be ready with timeout
    const redisReady = await new Promise((resolve) => {
        if (publisher.status === 'ready') {
            console.log('Redis already connected!');
            resolve(true);
        } else {
            const timeout = setTimeout(() => {
                console.error('❌ Redis connection timeout after 10 seconds');
                resolve(false);
            }, 10000); // 10 second timeout
            
            publisher.once('ready', () => {
                clearTimeout(timeout);
                console.log('✅ Redis connected successfully!');
                resolve(true);
            });
        }
    });
    
    if (!redisReady) {
        console.error('❌ FATAL: Could not connect to Redis. Exiting...');
        console.error('Redis status:', publisher.status);
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
        await publishlog('Build Completed by redis-data abse');
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
        console.log('Done...');
        await publishlog('Build Completed...');
        publisher.disconnect();
    });

}

init();