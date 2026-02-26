require('dotenv').config()
const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const fs=require('fs')
const path=require('path')

const { PrismaClient, deploymentstatus } = require('./generated/prisma/index.js')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
const {z}=require('zod')
const {createClient} = require('@clickhouse/client')
const Kafka=require('node-rdkafka')
const {v4:uuidv4}=require('uuid')

const app = express()
const PORT = 9000

const connectionString = process.env.DATABASE_URL
const pool = new pg.Pool({ 
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false, requestCert: true }
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const clkient=createClient({
    host: process.env.CLICKHOUSE_HOST,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    port: process.env.CLICKHOUSE_PORT 

})

if(clkient) {
    console.error('connected to create ClickHouse client');
    
}

console.log('📡 Initializing Kafka connection for api-server...');
console.log('🔍 Certificate paths:');
console.log('  - Key:', path.join(__dirname, 'service.key'));
console.log('  - Cert:', path.join(__dirname, 'service.cert'));
console.log('  - CA:', path.join(__dirname, 'kafka.pem'));

const kafkaConfig = {
    'metadata.broker.list': 'kafka-2563b77e-ankushadhikari321-360d.f.aivencloud.com:16982',
    'group.id': 'api-server-logs-consumer',
    'security.protocol': 'ssl',
    'ssl.key.location': path.join(__dirname, 'service.key'),
    'ssl.certificate.location': path.join(__dirname, 'service.cert'),
    'ssl.ca.location': path.join(__dirname, 'kafka.pem')
};

const stream = Kafka.createReadStream(
    kafkaConfig,
    { 'auto.offset.reset': 'earliest' },
    { topics: ['container-logs'] }
);

console.log('✅ Kafka consumer stream initialized');
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

app.post('/project',async(req,res)=>{
    const schema=z.object({
        name:z.string(),
        gitURL:z.string()
    })
    const result = schema.safeParse(req.body)
    if(!result.success){
        return res.status(400).json({error:result.error.flatten()})
    }
    const {name,gitURL}=result.data
    const deploymnent=await prisma.project.create({
        data:{
            name,
            giturl:gitURL,
            subdomain:generateSlug()
        }
    })
    res.json({status:'success',data:deploymnent})           

    


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
                status: deploymentstatus.queued
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
                            { name: 'GIT_REPO_URL', value: project.giturl },
                            { name: 'PROJECT_ID', value: projectId},
                            { name: 'AWS_REGION', value: process.env.AWS_REGION },
                            { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID },
                            { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY },
                            { name: 'AWS_S3_BUCKET_NAME', value: process.env.AWS_S3_BUCKET_NAME },
                            { name: 'DEPLOYMENT_ID', value: deployment.id }
                        ]
                    }
                ]
            }
        })

        await ecsClient.send(command)

        return res.json({ status: 'queued', data: { deploymentId: deployment.id } })

    } catch (error) {
        console.error('Error creating project:', error)
        res.status(500).json({ error: 'Failed to initiate build' })
    }
})

app.get('/logs/:id', async (req, res) => {
  const { id } = req.params

  try {
    const result = await clkient.query({
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
    console.error(err)
    res.status(500).json({ status: 'error', message: 'Failed to fetch logs' })
  }
})

// Set up Kafka consumer stream
stream.on('data', async (message) => {
    try {
        console.log('📨 Received message from Kafka');
        const stringMessage = message.value.toString();
        const { projectId, deploymentId, logs, timestamp } = JSON.parse(stringMessage);
        
        await clkient.insert({
            table: 'log_events',
            values: [{
                event_id: uuidv4(),
                deployment_id: deploymentId,
                log: logs
            }],
            format: 'JSONEachRow'
        });
        
        console.log(`✅ Logged to ClickHouse for deployment: ${deploymentId}`);
        
        // Emit to socket.io for real-time updates
        io.to(deploymentId).emit('message', `log:${logs}`);
    } catch (err) {
        console.error('❌ Error processing Kafka message:', err.message);
    }
});

stream.on('error', (err) => {
    console.warn('⚠️ Kafka consumer warning:', err.message);
    console.warn('The "container-logs" topic may not exist yet.');
});

stream.consumer.on('ready', () => {
    console.log('✅ Kafka consumer connected and ready!');
});

app.listen(PORT, () => console.log(`API Server Running..${PORT}`))