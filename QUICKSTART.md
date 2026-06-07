# Quick Start Guide - Frontend Integration

This guide will help you set up and run the complete Vercel Clone application with the integrated frontend.

## Prerequisites

Before you begin, ensure you have:

- Node.js (v18 or higher)
- PostgreSQL database
- ClickHouse database
- Kafka instance (Aiven or local)
- AWS Account with:
  - ECS Cluster configured
  - S3 Bucket created
  - IAM credentials with appropriate permissions

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd vercel
```

### 2. Setup API Server

```bash
cd api-server

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL="postgresql://user:password@host:port/database"
NODE_ENV=development

# AWS Configuration
AWS_REGION=ap-south-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=your-bucket-name
ECS_CLUSTER_NAME=builder-server-vercel
ECS_TASK_DEFINITION=builder-task:5

# ClickHouse Configuration
CLICKHOUSE_HOST=your-clickhouse-host
CLICKHOUSE_PORT=8123
CLICKHOUSE_DB=default
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password

# Kafka Configuration (SSL files required)
KAFKA_BROKER=your-kafka-broker:port
EOF

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start the API server
npm run dev
```

The API server should now be running on:
- **API**: `http://localhost:9000`
- **Socket.io**: `http://localhost:9001`

### 3. Setup S3 Reverse Proxy

```bash
cd ../s3-reverse-proxy

# Install dependencies
npm install

# The .env file should have the same DATABASE_URL as api-server
cat > .env << EOF
DATABASE_URL="postgresql://user:password@host:port/database"
NODE_ENV=development
EOF

# Start the reverse proxy
node index.js
```

The reverse proxy should now be running on:
- **URL**: `http://localhost:8000`

### 4. Setup Frontend

```bash
cd ../frontend-nextjs

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:9000
NEXT_PUBLIC_SOCKET_URL=http://localhost:9001
NEXT_PUBLIC_PREVIEW_URL=http://localhost:8000
EOF

# Start the development server
npm run dev
```

The frontend should now be running on:
- **URL**: `http://localhost:3000`

## Verify Setup

### 1. Check API Server

```bash
curl http://localhost:9000
# Should return: {"message":"API server running"}
```

### 2. Check PostgreSQL Connection

```bash
cd api-server
npx prisma studio
# Opens Prisma Studio to view/edit database
```

### 3. Test Frontend

1. Open browser to `http://localhost:3000`
2. You should see the "Deploy Your Project" page
3. Click "Projects" button to see the projects dashboard

## Deploy Your First Project

### Using the UI

1. Go to `http://localhost:3000`
2. Enter a project name (e.g., "my-first-app")
3. Enter a GitHub repository URL (must be a public React/Vite project)
4. Click "Deploy"
5. Watch real-time logs as your project builds
6. Once deployed, click the preview URL to view your app

### Using API (Alternative)

```bash
# Create a project
curl -X POST http://localhost:9000/project \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-app",
    "gitURL": "https://github.com/username/repo"
  }'

# Copy the project ID from response, then deploy
curl -X POST http://localhost:9000/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id"
  }'
```

## Accessing Deployed Applications

Applications are accessible via subdomain-based URLs:

1. **Development (localhost)**:
   - URL format: `http://{subdomain}.localhost:8000`
   - Example: `http://abc-def-ghi.localhost:8000`

2. **Configure Hosts File** (Optional for better testing):
   - Windows: `C:\Windows\System32\drivers\etc\hosts`
   - Mac/Linux: `/etc/hosts`
   
   Add entries like:
   ```
   127.0.0.1 abc-def-ghi.localhost
   ```

## Troubleshooting

### Port Already in Use

If a port is already in use, you can:

1. **Find and kill the process** (Windows):
   ```powershell
   netstat -ano | findstr :9000
   taskkill /PID <PID> /F
   ```

2. **Change the port** in the respective `.env` files

### Database Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL format: `postgresql://user:password@host:port/database`
- Ensure database exists and migrations are applied

### Build Server (ECS) Not Starting

- Verify AWS credentials
- Check ECS cluster exists
- Ensure task definition is correct
- Review VPC configuration (subnets, security groups)

### Logs Not Streaming

- Check Kafka connection
- Verify Kafka topic `container-logs` exists
- Review certificate files (service.key, service.cert, kafka.pem)
- Check Socket.io connection in browser console

### Preview URL Not Working

- Ensure S3 reverse proxy is running
- Check if project exists in database
- Verify S3 bucket permissions
- Check S3 folder structure: `__outputs/{projectId}/`

## Project Structure

```
vercel/
├── api-server/          # Backend API (port 9000, 9001)
│   ├── index.js
│   ├── prisma/
│   │   └── schema.prisma
│   └── generated/
├── build-server/        # Docker build container
│   ├── Dockerfile
│   └── script.js
├── s3-reverse-proxy/    # Static file server (port 8000)
│   └── index.js
└── frontend-nextjs/     # Next.js UI (port 3000)
    ├── app/
    │   ├── page.tsx
    │   ├── projects/
    │   └── project/[id]/
    ├── lib/
    │   ├── api.ts
    │   └── types.ts
    └── components/
```

## Development Workflow

1. **Make changes** to frontend code
2. **Hot reload** automatically updates the browser
3. **API changes** require restarting the API server
4. **Database schema changes** require updating Prisma schema and running migrations:
   ```bash
   cd api-server
   npx prisma migrate dev --name your_migration_name
   npx prisma generate
   ```

## Next Steps

- Read [INTEGRATION.md](./frontend-nextjs/INTEGRATION.md) for detailed API documentation
- Explore the frontend components in `frontend-nextjs/app/`
- Customize the UI in `frontend-nextjs/components/`
- Add authentication and user management
- Configure custom domains
- Set up environment variables for production

## Support

For detailed integration information, see:
- [Frontend Integration Guide](./frontend-nextjs/INTEGRATION.md)
- [Main README](./README.md)

For issues:
1. Check all services are running
2. Review logs in each terminal
3. Verify environment variables
4. Check network connectivity
