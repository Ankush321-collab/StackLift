require('dotenv').config()
const express = require('express')
const httpProxy = require('http-proxy')
const { PrismaClient } = require('./generated/prisma')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = Number(process.env.PORT) || 8000

const BASE_PATH = 'https://stacklift-vercel-clone.s3.ap-south-2.amazonaws.com/__outputs'

// Initialize Prisma with PostgreSQL adapter
const connectionString = process.env.DATABASE_URL
const caFilePath = process.env.PG_CA_PATH || path.join(__dirname, 'ca.pem')
const caCert = fs.existsSync(caFilePath) ? fs.readFileSync(caFilePath, 'utf8') : undefined
const pool = new pg.Pool({ 
    connectionString,
    ssl: process.env.NODE_ENV === 'production'
        ? (caCert ? { rejectUnauthorized: true, ca: caCert } : { rejectUnauthorized: true })
        : { rejectUnauthorized: false, requestCert: true }
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const proxy = httpProxy.createProxy()

app.use(async (req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];

    console.log(`🔗 Hostname: ${hostname}, Subdomain: ${subdomain}`);
    console.log(`📂 Request URL: ${req.url}`);

    try {
        // Query database for project by subdomain or custom domain
        const project = await prisma.project.findFirst({
            where: {
                OR: [
                    { subdomain: subdomain },
                    { customdomain: hostname }
                ]
            }
        });

        if (!project) {
            console.error(`❌ Project not found for hostname: ${hostname}`);
            return res.status(404).json({ 
                error: 'Project Not Found',
                message: `No project found for ${hostname}` 
            });
        }

        console.log(`✅ Found project: ${project.id} (${project.name})`);
        
        // Use project ID to resolve S3 path
        const resolvesTo = `${BASE_PATH}/${project.id}`;
        console.log(`🎯 Proxying to: ${resolvesTo}${req.url}`);

        return proxy.web(req, res, { 
            target: resolvesTo, 
            changeOrigin: true,
            secure: true
        });
    } catch (err) {
        console.error('❌ Database error:', err.message);
        return res.status(500).json({ 
            error: 'Internal Server Error',
            message: err.message 
        });
    }
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/') {
        proxyReq.path += 'index.html'
        console.log(`🏠 Redirecting root to index.html`);
    }
})

proxy.on('error', (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    if (!res.headersSent) {
        res.status(502).json({ 
            error: 'Proxy Error', 
            message: err.message 
        });
    }
})
app.get('/  ', (req, res) => {
    res.send('Hello World from proxy server')
})

// Kafka setup for logging
const { Kafka } = require('kafkajs');
const deploymentid = process.env.DEPLOYMENT_ID || 'local-deployment';
const PROJECT_ID = process.env.PROJECT_ID;

app.listen(PORT, () => {
    console.log(`🚀 Reverse Proxy Running on Port ${PORT}`)
    console.log(`📍 S3 Base: ${BASE_PATH}`)
    console.log(`\n🌐 Test your app at: http://p6.localhost:${PORT}`)
    console.log(`💡 Make sure to add '127.0.0.1 p6.localhost' to your hosts file`)
    console.log(`📋 Windows hosts file: C:\\Windows\\System32\\drivers\\etc\\hosts\n`)
})