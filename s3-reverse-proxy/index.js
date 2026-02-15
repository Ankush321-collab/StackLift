const express = require('express')
const httpProxy = require('http-proxy')

const app = express()
const PORT = 8000

const BASE_PATH = 'https://stacklift-vercel-clone.s3.ap-south-2.amazonaws.com/__outputs'

const proxy = httpProxy.createProxy()

app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];

    console.log(`🔗 Hostname: ${hostname}, Subdomain: ${subdomain}`);
    console.log(`📂 Request URL: ${req.url}`);

    const resolvesTo = `${BASE_PATH}/${subdomain}`
    console.log(`🎯 Proxying to: ${resolvesTo}${req.url}`);

    return proxy.web(req, res, { 
        target: resolvesTo, 
        changeOrigin: true,
        secure: true
    })
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

app.listen(PORT, () => {
    console.log(`🚀 Reverse Proxy Running on Port ${PORT}`)
    console.log(`📍 S3 Base: ${BASE_PATH}`)
    console.log(`\n🌐 Test your app at: http://p6.localhost:${PORT}`)
    console.log(`💡 Make sure to add '127.0.0.1 p6.localhost' to your hosts file`)
    console.log(`📋 Windows hosts file: C:\\Windows\\System32\\drivers\\etc\\hosts\n`)
})