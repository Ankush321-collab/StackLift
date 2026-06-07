require('dotenv').config()
const express = require('express')
const http = require('http')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const fs=require('fs')
const path=require('path')

const { PrismaClient } = require('./generated/prisma/index.js')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
const {z}=require('zod')
const {createClient} = require('@clickhouse/client')
const { Kafka, PartitionAssigners } = require('kafkajs')
const {v4:uuidv4}=require('uuid')

const app = express()
const PORT = Number(process.env.PORT) || 9000
const server = http.createServer(app)

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200)
    }
    next()
})

const connectionString = process.env.DATABASE_URL
const pool = new pg.Pool({ 
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false, requestCert: true }
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const clickhouse = createClient({
    url: process.env.CLICKHOUSE_HOST,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
})

if(clickhouse) {
    console.log('✅ ClickHouse client initialized');
}

console.log('📡 Initializing Kafka connection for api-server...');

const kafka = new Kafka({
    clientId: 'api-server-logs-consumer',
    brokers: [process.env.KAFKA_BROKER || 'kafka-8601bde-srmap-c83a.e.aivencloud.com:13906'],
    sasl: {
        mechanism: 'scram-sha-256',
        username: process.env.KAFKA_USER || 'avnadmin',
        password: process.env.KAFKA_PASSWORD
    },
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeout: Number(process.env.KAFKA_CONNECTION_TIMEOUT || 10000),
    requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT || 10000),
    retry: {
        initialRetryTime: 1000,
        retries: 5,
        maxRetryTime: 30000
    }
})

const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'api-server-logs-consumer-kafkajs-v1',
    partitionAssigners: [PartitionAssigners.roundRobin],
    sessionTimeout: Number(process.env.KAFKA_SESSION_TIMEOUT || 60000),
    rebalanceTimeout: Number(process.env.KAFKA_REBALANCE_TIMEOUT || 120000),
    heartbeatInterval: Number(process.env.KAFKA_HEARTBEAT_INTERVAL || 5000)
})

console.log('✅ Kafka consumer initialized with kafkajs');
const io = new Server(server, {
    cors: {
        origin: '*'
    },
    path: '/socket.io'
})

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

app.use(express.json())

app.get('/', (req, res) => {
    res.json({ message: "API server running" })
})

// Get all projects
app.get('/projects', async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                deployments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        })
        res.json({ status: 'success', data: projects })
    } catch (error) {
        console.error('Error fetching projects:', error)
        res.status(500).json({ error: 'Failed to fetch projects' })
    }
})

// Get project details with deployments
app.get('/project/:id', async (req, res) => {
    try {
        const { id } = req.params
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                deployments: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        })
        if (!project) {
            return res.status(404).json({ error: 'Project not found' })
        }
        res.json({ status: 'success', data: project })
    } catch (error) {
        console.error('Error fetching project:', error)
        res.status(500).json({ error: 'Failed to fetch project' })
    }
})

// Get deployment details
app.get('/deployment/:id', async (req, res) => {
    try {
        const { id } = req.params
        const deployment = await prisma.deployment.findUnique({
            where: { id },
            include: {
                project: true
            }
        })
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' })
        }
        res.json({ status: 'success', data: deployment })
    } catch (error) {
        console.error('Error fetching deployment:', error)
        res.status(500).json({ error: 'Failed to fetch deployment' })
    }
})


const ecsClient = new ECSClient({
    region: process.env.AWS_REGION || 'ap-south-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const config = {
    CLUSTER: process.env.ECS_CLUSTER_NAME || 'builder-server-vercel1',
    TASK: process.env.ECS_TASK_DEFINITION || 'builder-task:1'
}

app.post('/project', async (req, res) => {
    try {
        const schema = z.object({
            name: z.string(),
            gitURL: z.string()
        })
        const result = schema.safeParse(req.body)
        if (!result.success) {
            console.warn('❌ Project creation validation failed:', result.error.flatten())
            return res.status(400).json({ error: result.error.flatten() })
        }
        const { name, gitURL } = result.data
        console.log(`🚀 Creating project: ${name} (${gitURL})`)
        const deploymnent = await prisma.project.create({
            data: {
                name,
                giturl: gitURL,
                subdomain: generateSlug()
            }
        })
        console.log('✅ Project created:', deploymnent.id)
        res.json({ status: 'success', data: deploymnent })
    } catch (error) {
        console.error('❌ Error creating project:', error)
        const details = process.env.NODE_ENV === 'development'
            ? {
                message: error?.message || String(error),
                stack: error?.stack,
                name: error?.name,
                code: error?.code,
                metadata: error?.$metadata
            }
            : undefined

        res.status(500).json({
            error: 'Failed to create project',
            details
        })
    }
})

app.post('/deploy', async (req, res) => {
    try {
        const { projectId} = req.body
        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' })
        }
        const project = await prisma.project.findUnique({
            where: { id: projectId }
        })
        if (!project) {
            return res.status(404).json({ error: 'Project not found' })
        }
        const deployment=await prisma.deployment.create({
            data:{
                projectId:project.id,   
                status: 'queued'
            }
        })
        const projectSlug = project.subdomain
        
        const command = new RunTaskCommand({
            cluster: config.CLUSTER,
            taskDefinition: config.TASK,
            launchType: 'FARGATE',
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: ['subnet-06a1ba486fd934709', 'subnet-00221c31ceba104b0', 'subnet-091d73242d1061f40'],
                    assignPublicIp: 'ENABLED',
                    securityGroups: ['sg-0ca7ae7eb1704d69c']
                }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'container-1',
                        environment: [
                            { name: 'GIT_REPO_URL', value: project.giturl },
                            { name: 'PROJECT_ID', value: projectId},
                            { name: 'DEPLOYMENT_ID', value: deployment.id },
                            { name: 'AWS_REGION', value: process.env.AWS_REGION },
                            { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID },
                            { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY },
                            { name: 'AWS_S3_BUCKET_NAME', value: process.env.AWS_S3_BUCKET_NAME },
                            { name: 'KAFKA_BROKER', value: process.env.KAFKA_BROKER },
                            { name: 'KAFKA_USER', value: process.env.KAFKA_USER },
                            { name: 'KAFKA_PASSWORD', value: process.env.KAFKA_PASSWORD }
                        ]
                    }
                ]
            }
        })

        await ecsClient.send(command)

        return res.json({ status: 'queued', data: { deploymentId: deployment.id } })

    } catch (error) {
        console.error('Error initiating deployment:', error)
        const details = process.env.NODE_ENV === 'development'
            ? {
                message: error?.message || String(error),
                name: error?.name,
                code: error?.code,
                metadata: error?.$metadata
            }
            : undefined

        res.status(500).json({
            error: 'Failed to initiate build',
            details
        })
    }
})

app.get('/logs/:id', async (req, res) => {
  const { id } = req.params

  try {
    const result = await clickhouse.query({
      query: `
        SELECT event_id, deployment_id, log, timestamp
        FROM log_events
        WHERE deployment_id = {deployment_id:String}
        ORDER BY timestamp ASC
      `,
      query_params: {
        deployment_id: id
      },
      format: 'JSONEachRow'
    })

    const data = await result.json()

    res.json({ status: 'success', data })
  } catch (err) {
    console.error('ClickHouse Query Error:', err)
    // Return empty logs instead of 500 if the query fails (e.g. table not exists yet)
    res.json({ status: 'success', data: [], message: 'No logs found or table not ready' })
  }
})

async function startKafkaConsumer() {
    try {
        await consumer.connect()
        await consumer.subscribe({ topic: 'container-logs', fromBeginning: true })

        await consumer.run({
            eachMessage: async ({ message }) => {
                try {
                    if (!message.value) {
                        return
                    }

                    console.log('📨 Received message from Kafka')
                    const stringMessage = message.value.toString()
                    const { deploymentId, logs, timestamp } = JSON.parse(stringMessage)

                    await clickhouse.insert({
                        table: 'log_events',
                        values: [{
                            event_id: uuidv4(),
                            deployment_id: deploymentId,
                            log: logs,
                            timestamp: timestamp || new Date().toISOString()
                        }],
                        format: 'JSONEachRow'
                    })

                    console.log(`✅ Logged to ClickHouse for deployment: ${deploymentId}`)

                    // Emit to socket.io for real-time updates.
                    io.to(deploymentId).emit('message', `log:${logs}`)
                } catch (err) {
                    console.error('❌ Error processing Kafka message:', err.message)
                }
            }
        })

        console.log('✅ Kafka consumer connected and ready!')
    } catch (err) {
        console.warn('⚠️ Kafka consumer warning:', err.message)
        console.warn('The "container-logs" topic may not exist yet.')
    }
}

startKafkaConsumer()

app.use((err, req, res, next) => {
    console.error('Unhandled API error:', err)
    const details = process.env.NODE_ENV === 'development'
        ? {
            message: err?.message || String(err),
            name: err?.name,
            code: err?.code,
            metadata: err?.$metadata
        }
        : undefined

    res.status(err.status || 500).json({
        error: 'Internal server error',
        details
    })
})

server.listen(PORT, () => {
    console.log(`API Server Running..${PORT}`)
    console.log('Socket Server attached to API port')
})