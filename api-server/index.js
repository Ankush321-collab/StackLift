require('dotenv').config();
const express=require('express');
const app=express();
const {ECSClient, RunTaskCommand }=require('@aws-sdk/client-ecs')
const {generateSlug}=require('random-word-slugs');
const {Server}=require('socket.io');
const dotenv=require('dotenv');
const redis=require('ioredis');
dotenv.config();

const subscriber=new redis('rediss://default:AVNS_njDD1DSuPVYs6NH6DFa@valkey-2ba613df-ankushadhikari321-360d.d.aivencloud.com:16981')


app.use(express.json());
const io = new Server({
  cors: {
    origin: "*"
  }
});
io.listen(9001,()=>{
    console.log('Socket server is running on port 9001');
})

io.on('connection',(socket)=>{
   socket.on('subscriber',projectId=>{
    // Join room with just the project ID to match Redis forwarding
    socket.join(projectId)
    socket.emit('message',`Subscribed to logs:${projectId}`)
    console.log(`Socket joined room: ${projectId}`);
   })

})

app.get('/',(req,res)=>{
    res.json({message:"Api server running"});
})


const ecsclient=new ECSClient({
    region:process.env.AWS_REGION || "ap-south-2",
    credentials:{
        accessKeyId:process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY
    }
})

const CONFIG={
    CLUSTER: process.env.ECS_CLUSTER_NAME || 'builder-server-vercel',
    TASK: process.env.ECS_TASK_DEFINITION || 'builder-task:4'
}

app.post('/build',async(req,res)=>{
    try {
        const {gitUrl, projectId} = req.body;
        if (!gitUrl || !projectId) {
            return res.status(400).json({error: 'gitUrl and projectId are required'});
        }
        const projectslug = projectId;

    const command=new RunTaskCommand({
        cluster:CONFIG.CLUSTER,
        taskDefinition:CONFIG.TASK,
        launchType:'FARGATE',
        networkConfiguration:{
            awsvpcConfiguration:{
                subnets:['subnet-0fb5de31b08ab715f','subnet-0469d4da7b2b5e820','subnet-04b5fb2b54b98458e'],
                assignPublicIp:'ENABLED',
                securityGroups:['sg-0fd51093f526a4fcc']
                
            }
        },
        overrides:{
            containerOverrides:[
                {
                    name:'builder-image',
                    environment:[
                        {   
                            name:'GIT_REPO_URL',
                            value:gitUrl
                        },
                        {
                            name:'PROJECT_ID',
                            value:projectslug
                        },
                        {
                            name:'AWS_REGION',
                            value:process.env.AWS_REGION
                        },
                        {
                            name:'AWS_ACCESS_KEY_ID',
                            value:process.env.AWS_ACCESS_KEY_ID
                        },
                        {
                            name:'AWS_SECRET_ACCESS_KEY',
                            value:process.env.AWS_SECRET_ACCESS_KEY
                        },
                        {
                            name:'AWS_S3_BUCKET_NAME',
                            value:process.env.AWS_S3_BUCKET_NAME
                        }
                    ]
                }
            ]
        }
    })

    await ecsclient.send(command);

    res.json({message:'Build initiated',projectId:projectslug});
    
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({error: 'Failed to initiate build'});
    }
})

async function initredissubscriber(){
    subscriber.psubscribe('Logs:*');
    subscriber.on('pmessage',(pattern,channel,message)=>{
        console.log(`Received message on ${channel}: ${message}`);
        const roomName = channel.split(':')[1];
        console.log(`Forwarding to room: ${roomName}`);
        console.log(`Connected sockets in room ${roomName}:`, io.sockets.adapter.rooms.get(roomName)?.size || 0);
        io.to(roomName).emit('message',message);
        console.log(`Message emitted to room ${roomName}`);
    })

}

initredissubscriber();


app.listen(9000,()=>{
    console.log('API Server is running on port 9000');
}   )