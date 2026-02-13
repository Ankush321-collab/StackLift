import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3Client = new S3Client({
    region: "ap-south-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const projectId = process.env.PROJECT_ID;

async function init() {
    console.log("executing script");
    const outdirpath = path.join(__dirname, "output");

    const buildCommand = [
        `cd "${outdirpath}"`,
        "rm -rf node_modules package-lock.json",
        "npm install",
        "npm run build"
    ].join(" && ");

    const p = exec(buildCommand);

    p.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    p.stderr.on('data', (data) => {
        console.error("Error", data.toString());
    });

    p.on('close', async function(code) {
        if (code !== 0) {
            console.error(`Build failed with exit code ${code}`);
            process.exit(code || 1);
        }

        console.log("Build complete");
        const distpath = path.join(__dirname, 'output', 'dist');
        if (!fs.existsSync(distpath)) {
            console.error(`dist folder not found at ${distpath}`);
            process.exit(1);
        }

        const distfoldercontent = fs.readdirSync(distpath, { recursive: true });

        for (const file of distfoldercontent) {
            const filepath = path.join(distpath, file);

            if (fs.lstatSync(filepath).isDirectory()) {
                continue;
            }

            const relativePath = path.relative(distpath, filepath);
            const s3Key = `__outputs/${projectId}/${relativePath}`.replace(/\\/g, '/');
            const command = new PutObjectCommand({
                Bucket:process.env.AWS_S3_BUCKET_NAME,
                Key: s3Key,
                Body: fs.createReadStream(filepath)
            });
            await s3Client.send(command);
            console.log(`Uploaded ${file} to S3`);
        }
    });

}

init();