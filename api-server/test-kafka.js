require('dotenv').config();
const { Kafka } = require('kafkajs');
const fs = require('fs');
const path = require('path');

async function testKafka() {
    console.log('📡 Testing Kafka Connection only...');
    
    // Use the values from your api-server directory
    const broker = process.env.KAFKA_BROKER || 'kafka-8601bde-srmap-c83a.e.aivencloud.com:13906';
    
    const kafka = new Kafka({
        clientId: 'kafka-only-verifier',
        brokers: [broker],
        sasl: {
            mechanism: 'scram-sha-256',
            username: process.env.KAFKA_USER || 'avnadmin',
            password: process.env.KAFKA_PASSWORD
        },
        ssl: {
            rejectUnauthorized: true,
            ca: [fs.readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')],
        },
        connectionTimeout: 10000,
    });

    const admin = kafka.admin();
    
    try {
        console.log(`🔗 Connecting to broker: ${broker}`);
        await admin.connect();
        console.log('✅ Kafka Connection: SUCCESS');
        
        console.log('fetching topics...');
        const topics = await admin.listTopics();
        console.log('✅ Topics found:', topics);
        
        await admin.disconnect();
    } catch (error) {
        console.error('❌ Kafka Connection: FAILED');
        console.error('Error Details:', error.message);
        if (error.message.includes('ECONNRESET')) {
            console.log('\n💡 Hint: Check your Aiven Firewall settings. Ensure your IP is whitelisted.');
        }
    }
}

testKafka();
