require('dotenv').config();
const { ECSClient, ListClustersCommand } = require('@aws-sdk/client-ecs');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { createClient } = require('@clickhouse/client');
const { Client } = require('pg');
const { Kafka } = require('kafkajs');
const fs = require('fs');
const path = require('path');

async function verify() {
    console.log('🔍 Starting Service Verification...');
    console.log('Context: Running from ' + process.cwd());
    console.log('AWS Region: ' + process.env.AWS_REGION);

    // 1. AWS Verification
    try {
        const s3 = new S3Client({ 
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
            }
        });
        await s3.send(new ListObjectsV2Command({ Bucket: process.env.AWS_S3_BUCKET_NAME, MaxKeys: 1 }));
        console.log('✅ AWS S3: Connected');
    } catch (e) {
        console.log('❌ AWS S3 Error: ' + e.message);
    }

    try {
        const ecs = new ECSClient({ 
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
            }
        });
        await ecs.send(new ListClustersCommand({}));
        console.log('✅ AWS ECS: Connected');
    } catch (e) {
        console.log('❌ AWS ECS Error: ' + e.message);
    }

    // 2. ClickHouse Verification
    try {
        const ch = createClient({
            url: process.env.CLICKHOUSE_HOST,
            username: process.env.CLICKHOUSE_USER,
            password: process.env.CLICKHOUSE_PASSWORD,
            database: process.env.CLICKHOUSE_DB,
        });
        const result = await ch.query({ query: 'SELECT 1' });
        await result.json();
        console.log('✅ ClickHouse: Connected');
    } catch (e) {
        console.log('❌ ClickHouse Error: ' + e.message);
    }

    // 3. PostgreSQL Verification
    try {
        const pool = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { 
                rejectUnauthorized: false,
                ca: fs.readFileSync(path.join(__dirname, 'prisma/ca.pem'), 'utf8')
            }
        });
        await pool.connect();
        await pool.query('SELECT 1');
        await pool.end();
        console.log('✅ PostgreSQL: Connected');
    } catch (e) {
        console.log('❌ PostgreSQL Error: ' + e.message);
    }

    // 4. Kafka Verification
    try {
        const kafkaConfig = {
            clientId: 'verifier',
            brokers: [process.env.KAFKA_BROKER || 'kafka-8601bde-srmap-c83a.e.aivencloud.com:13895'],
            ssl: {
                rejectUnauthorized: false,
                ca: [fs.readFileSync(path.join(__dirname, 'api-server', 'kafka.pem'), 'utf-8')],
                key: fs.readFileSync(path.join(__dirname, 'api-server', 'service.key'), 'utf-8'),
                cert: fs.readFileSync(path.join(__dirname, 'api-server', 'service.cert'), 'utf-8'),
            }
        };
        const kafka = new Kafka(kafkaConfig);
        const admin = kafka.admin();
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        console.log('✅ Kafka: Connected');
    } catch (e) {
        console.log('❌ Kafka Error: ' + e.message);
    }

    console.log('\n🏁 Verification Finished.');
}

verify();
