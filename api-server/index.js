require('dotenv').config()
const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const fs=require('fs')

const { PrismaClient, deploymentstatus } = require('./generated/prisma/index.js')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
const {z}=require('zod')
const {createClient} = require('@clickhouse/client')
const {Kafka}=require('kafkajs')
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


const kafka=new Kafka({
    clientId:'api-server',
    brokers:['kafka-2563b77e-ankushadhikari321-360d.f.aivencloud.com:16982'],   
    ssl:{
        rejectUnauthorized:true,
        key:fs.readFileSync('./service.key'),
        cert:fs.readFileSync('./service.cert'),
        ca:[fs.readFileSync('./kafka.pem')]
    }
})

if(kafka) {
    console.error('connected to Kafka');

}

const consumer=kafka.consumer({groupId:'api-server-logs-consumer'})
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
        
        // Read Kafka certificates and encode as base64 for ECS task
        const kafkaSSLKey = fs.readFileSync('./service.key', 'utf8').toString('base64')
        const kafkaSSLCert = fs.readFileSync('./service.cert', 'utf8').toString('base64')
        const kafkaSSLCA = fs.readFileSync('./kafka.pem', 'utf8').toString('base64')

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
                            { name: 'DEPLOYMENT_ID', value: deployment.id },
                            { name: 'KAFKA_SSL_KEY', value: kafkaSSLKey },
                            { name: 'KAFKA_SSL_CERT', value: kafkaSSLCert },
                            { name: 'KAFKA_SSL_CA', value: kafkaSSLCA }
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

async function initKafkaConsumer(){
    try {
        await consumer.connect()
        await consumer.subscribe({topic:'project-deployed'})
        await consumer.run({
            eachBatch:async function({batch,heartbeat,commitOffsetsIfNecessary,resolveOffset}){
                const messages=batch.messages
                console.log(`Received ${messages.length} messages from Kafka`)

                for(const message of messages){
                    const stringmessage=message.value.toString()
                    const {projectId, deploymentId, logs}=JSON.parse(stringmessage)
                    
                    await clkient.insert({
                        table:'log_events',
                        values: [{
                            event_id: uuidv4(),
                            deployment_id: deploymentId,
                            logs: logs
                        }]
                    })
                    
                    resolveOffset(message.offset)
                    commitOffsetsIfNecessary(message.offset)
                    await heartbeat()
                }
            }
        })
    } catch(err){
        console.warn('⚠️ Kafka consumer warning:', err.message)
        console.warn('The "project-deployed" topic may not exist yet. Topic will be created when the build-server publishes.')
    }
}

// Initialize Kafka consumer (non-critical)
initKafkaConsumer().catch(() => {})

app.listen(PORT, () => console.log(`API Server Running..${PORT}`))