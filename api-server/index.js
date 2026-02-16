require('dotenv').config();
const express=require('express');
const app=express();
const {ECSClient, RunTaskCommand }=require('@aws-sdk/client-ecs')
const {generateSlug}=require('random-word-slugs');
const dotenv=require('dotenv');
dotenv.config();

app.use(express.json());

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
    CLUSTER:process.env.ECS_CLUSTER_NAME,
    TASK:process.env.ECS_TASK_DEFINITION
}

app.post('/project',async(req,res)=>{
    try {
        const {giturl,slug}=req.body;
        
        if (!giturl) {
            return res.status(400).json({error: 'giturl is required'});
        }
        
        const projectslug= slug?slug:generateSlug(2);

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
                            value:giturl
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

    res.json({message:'Project creation initiated',projectId:projectslug});
    
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({error: 'Failed to initiate project creation'});
    }
})





app.listen(9000,()=>{
    console.log('API Server is running on port 9000');
}   )