require('dotenv').config()
const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')

const app = express()
const PORT = 9000

const subscriber = new Redis('rediss://default:AVNS_njDD1DSuPVYs6NH6DFa@valkey-2ba613df-ankushadhikari321-360d.d.aivencloud.com:16981', {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
    },
    reconnectOnError(err) {
        return true
    }
})

// Handle Redis connection errors
subscriber.on('error', (err) => {
    console.error('Redis subscriber error:', err.message)
})

subscriber.on('connect', () => {
    console.log('Redis subscriber connecting...')
})

subscriber.on('ready', () => {
    console.log('Redis subscriber ready')
})

const io = new Server({ cors: '*' })

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9001, () => console.log('Socket Server 9001'))

app.use(express.json())

app.get('/', (req, res) => {
    res.json({ message: "API server running" })
})


const ecsClient = new ECSClient({
    region: process.env.AWS_REGION || 'ap-south-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const config = {
    CLUSTER: process.env.ECS_CLUSTER_NAME || 'builder-server-vercel',
    TASK: process.env.ECS_TASK_DEFINITION || 'builder-task:5'
}

app.post('/project', async (req, res) => {
    try {
        const { gitURL, slug } = req.body
        if (!gitURL) {
            return res.status(400).json({ error: 'gitURL is required' })
        }
        const projectSlug = slug ? slug : generateSlug()

        const command = new RunTaskCommand({
            cluster: config.CLUSTER,
            taskDefinition: config.TASK,
            launchType: 'FARGATE',
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: ['subnet-0fb5de31b08ab715f', 'subnet-0469d4da7b2b5e820', 'subnet-04b5fb2b54b98458e'],
                    assignPublicIp: 'ENABLED',
                    securityGroups: ['sg-0fd51093f526a4fcc']
                }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'builder-image',
                        environment: [
                            { name: 'GIT_REPO_URL', value: gitURL },
                            { name: 'PROJECT_ID', value: projectSlug },
                            { name: 'AWS_REGION', value: process.env.AWS_REGION },
                            { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID },
                            { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY },
                            { name: 'AWS_S3_BUCKET_NAME', value: process.env.AWS_S3_BUCKET_NAME }
                        ]
                    }
                ]
            }
        })

        await ecsClient.send(command)

        return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000` } })

    } catch (error) {
        console.error('Error creating project:', error)
        res.status(500).json({ error: 'Failed to initiate build' })
    }
})

async function initRedisSubscribe() {
    // Wait for Redis to be ready
    await new Promise((resolve) => {
        if (subscriber.status === 'ready') {
            console.log('✅ Redis already ready, subscribing...');
            resolve();
        } else {
            console.log('⏳ Waiting for Redis connection...');
            subscriber.once('ready', () => {
                console.log('✅ Redis connected!');
                resolve();
            });
        }
    });
    
    console.log('📡 Subscribing to Logs:*....')
    await subscriber.psubscribe('Logs:*')
    console.log('✅ Successfully subscribed to Logs:* pattern')
    
    subscriber.on('pmessage', (pattern, channel, message) => {
        console.log(`\n${'='.repeat(60)}`)
        console.log(`📨 Redis message received on ${channel}`)
        console.log(`Message:`, message)
        const projectId = channel.split(':')[1]
        console.log(`🚀 Forwarding to Socket.io room: ${projectId}`)
        console.log(`${'='.repeat(60)}\n`)
        io.to(projectId).emit('message', message)
    })
}

initRedisSubscribe()

app.listen(PORT, () => console.log(`API Server Running..${PORT}`))