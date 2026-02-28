# Vercel Clone - Serverless Deployment Platform

A simplified clone of Vercel's deployment platform that automatically builds and deploys React/Vite applications to AWS S3 with custom subdomain routing.

![System Design Diagram]![alt text](image.png)

## 🏗️ Architecture Overview

This project consists of four main components that work together to provide a complete deployment solution:

### 1. API Server (`api-server/`)
- **Purpose**: REST API that orchestrates deployment process via AWS ECS
- **Technology**: Node.js, Express.js, Prisma, PostgreSQL, ClickHouse, Kafka
- **Port**: 9000 (API), 9001 (Socket.io)
- **Function**: Manages projects, deployments, real-time logs streaming

### 2. Build Server (`build-server/`)
- **Purpose**: Containerized build service that clones, builds, and deploys React/Vite applications
- **Technology**: Node.js, Docker, AWS SDK, Kafka
- **Infrastructure**: AWS ECS + AWS ECR
- **Storage**: AWS S3

### 3. S3 Reverse Proxy (`s3-reverse-proxy/`)
- **Purpose**: Routes subdomain requests to corresponding S3-hosted projects
- **Technology**: Express.js, HTTP Proxy, Prisma
- **Port**: 8000
- **Function**: Serves static files from S3 buckets via custom subdomains

### 4. Frontend (`frontend-nextjs/`)
- **Purpose**: User interface for managing deployments
- **Technology**: Next.js 14, React, TypeScript, Tailwind CSS, Shadcn UI
- **Port**: 3000 (default Next.js port)
- **Function**: Create projects, trigger deployments, view logs, manage projects

## 🔄 How It Works

1. **API Request**: Developer sends POST request to API server with GitHub repository URL
2. **ECS Task Trigger**: API server creates and runs ECS task for containerized build
3. **Containerized Build**: 
   - Docker container clones the repository
   - Installs dependencies (`npm install`)
   - Builds the project (`npm run build`)
   - Configures Vite with S3 base URL
4. **AWS Deployment**:
   - Built files are uploaded to S3 bucket
   - Files are stored under `__outputs/{PROJECT_ID}/`
   - Public read access is configured
5. **Response**: API server returns project ID for accessing deployed application
6. **Reverse Proxy Routing**:
   - S3 Reverse Proxy routes `{subdomain}.localhost:8000` to corresponding S3 folder
   - Serves `index.html` for root requests
   - Proxies all static assets (CSS, JS, images)

## 📁 Project Structure

```
vercel-clone/
├── api-server/
│   ├── index.js               # Express API server
│   ├── package.json           # Dependencies (Express, AWS ECS SDK)
│   └── .env                   # Environment configuration
├── build-server/
│   ├── Dockerfile              # Container configuration
│   ├── main.sh                # Entry point script
│   ├── script.js              # Build and upload logic
│   └── package.json           # Dependencies (AWS SDK, Redis)
├── s3-reverse-proxy/
│   ├── index.js               # Reverse proxy server
│   └── package.json           # Dependencies (Express, HTTP Proxy)
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher)
- Docker (for build server)
- AWS Account with S3 access
- AWS CLI configured

### Environment Variables

Create `.env` files in respective directories:

#### API Server Environment (`api-server/.env`)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=stacklift-vercel-clone
ECS_CLUSTER_NAME=your-ecs-cluster-name
ECS_TASK_DEFINITION=your-task-definition-name
```

#### Build Server Environment (`.env`)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=stacklift-vercel-clone
PROJECT_ID=unique_project_identifier
GIT_REPO_URL=https://github.com/username/repo.git
```

#### S3 Reverse Proxy Environment
```bash
# No additional environment variables required
# S3 base path is configured in index.js
```

### Installation & Setup

#### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd vercel-clone
```

#### 2. Set Up API Server
```bash
cd api-server
npm install
# Create .env file with required AWS credentials
npm run dev
```

#### 3. Set Up S3 Reverse Proxy
```bash
cd ../s3-reverse-proxy
npm install
npm run dev
```

#### 4. Configure Build Server
```bash
cd ../build-server
npm install
```

#### 5. Build Docker Image
```bash
docker build -t vercel-build-server .
```

#### 6. Configure Local DNS (for testing)
Add to your system's hosts file:
- **Windows**: `C:\Windows\System32\drivers\etc\hosts`
- **macOS/Linux**: `/etc/hosts`

```
127.0.0.1 p1.localhost
127.0.0.1 p2.localhost
127.0.0.1 a1.localhost
127.0.0.1 your-project-id.localhost
```

## 🎯 Usage

### Deploying a Project

#### Option 1: Using API Server (Recommended)

1. **Ensure all services are running**:
   - API Server (port 9000)
   - S3 Reverse Proxy (port 8000)

2. **Send deployment request**:
```bash
curl -X POST http://localhost:9000/project \
  -H "Content-Type: application/json" \
  -d '{
    "giturl": "https://github.com/vercel/next.js.git",
    "slug": "my-awesome-project"
  }'
```

Or use **Postman**:
- **Method**: POST
- **URL**: `http://localhost:9000/project`
- **Headers**: `Content-Type: application/json`
- **Body (raw JSON)**:
```json
{
  "giturl": "https://github.com/vercel/next.js.git",
  "slug": "my-awesome-project"
}
```

3. **API Response**:
```json
{
  "message": "Project creation initiated",
  "projectId": "my-awesome-project"
}
```

4. **Access your deployed app**:
```
http://my-awesome-project.localhost:8000
```

#### Option 2: Direct Docker Run (Manual)

1. **Run the build server** directly with Docker:
```bash
docker run -e PROJECT_ID=your-unique-id \
           -e GIT_REPO_URL=https://github.com/user/repo.git \
           -e AWS_ACCESS_KEY_ID=your_key \
           -e AWS_SECRET_ACCESS_KEY=your_secret \
           -e AWS_S3_BUCKET_NAME=your-bucket \
           vercel-build-server
```

2. **Access your deployed app**:
```bash
http://your-unique-id.localhost:8000
```

### Testing the Deployment

1. Start the reverse proxy:
```bash
cd s3-reverse-proxy
npm run dev
```

2. Open your browser and navigate to:
```
http://p1.localhost:8000
# or any subdomain you've configured
```

## 🔧 Configuration

### S3 Bucket Setup
1. Create S3 bucket in AWS Console
2. Configure public read access
3. Enable static website hosting
4. Update bucket name in environment variables

### Subdomain Routing
The reverse proxy automatically routes subdomains to S3 folders:
- `p1.localhost:8000` → `s3://bucket/__outputs/p1/`
- `a1.localhost:8000` → `s3://bucket/__outputs/a1/`

### Vite Configuration
The build server automatically generates `vite.config.js` with the correct S3 base path:
```javascript
export default defineConfig({
  plugins: [react()],
  base: 'https://your-bucket.s3.region.amazonaws.com/__outputs/project-id/'
})
```

## 📊 Monitoring & Logs

### Build Server Logs
- Container logs show build progress
- Upload status for each file
- Error messages for failed builds

### Reverse Proxy Logs
- Request routing information
- Subdomain resolution
- Proxy errors and status

Example log output:
```
🔗 Hostname: p1.localhost, Subdomain: p1
📂 Request URL: /assets/index.css
🎯 Proxying to: https://bucket.s3.region.amazonaws.com/__outputs/p1/assets/index.css
```

## 🛠️ Development

### Adding New Features
1. **Build Server**: Modify [script.js](build-server/script.js) for build logic
2. **Reverse Proxy**: Update [index.js](s3-reverse-proxy/index.js) for routing rules

### Local Development
```bash
# Terminal 1: Start reverse proxy
cd s3-reverse-proxy && npm run dev

# Terminal 2: Build and test projects
cd build-server && node script.js
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Fails**:
   - Check AWS credentials
   - Verify repository accessibility
   - Ensure package.json has build script

2. **Subdomain Not Working**:
   - Check hosts file configuration
   - Verify S3 bucket permissions
   - Confirm PROJECT_ID matches subdomain

3. **Assets Not Loading**:
   - Check Vite base path configuration
   - Verify S3 bucket CORS settings
   - Ensure public read access on bucket

### Error Codes
- `502 Proxy Error`: S3 bucket/file not found
- `Build Failed`: Check build server logs
- `DNS Resolution`: Update hosts file

## 📝 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in the repository
- Check troubleshooting section above
- Review AWS S3 and ECS documentation

---

*Built with ❤️ as a learning project to understand serverless deployment platforms*