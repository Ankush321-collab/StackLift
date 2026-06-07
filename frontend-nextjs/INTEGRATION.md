# Vercel Clone - Frontend Integration

This document describes how the Next.js frontend is integrated with the backend API server.

## Architecture Overview

The project consists of:
- **API Server** (port 9000) - Express.js backend with Prisma ORM
- **Socket.io Server** (port 9001) - Real-time log streaming
- **S3 Reverse Proxy** (port 8000) - Serves deployed applications
- **Frontend** (Next.js) - React-based user interface

## Backend API Endpoints

### Projects
- `POST /project` - Create a new project
  - Body: `{ name: string, gitURL: string }`
  - Returns: Project with generated subdomain

- `GET /projects` - List all projects
  - Returns: Array of projects with latest deployment

- `GET /project/:id` - Get project details
  - Returns: Project with all deployments

### Deployments
- `POST /deploy` - Deploy a project
  - Body: `{ projectId: string }`
  - Returns: Deployment ID

- `GET /deployment/:id` - Get deployment details
  - Returns: Deployment with project info

- `GET /logs/:id` - Get deployment logs
  - Returns: Array of log events from ClickHouse

### Real-time Updates
- Socket.io connection on port 9001
- Subscribe to deployment channel: `socket.emit('subscribe', deploymentId)`
- Receive logs: `socket.on('message', (message) => ...)`
- Message format: `"log:actual log content"`

## Frontend Structure

```
frontend-nextjs/
├── app/
│   ├── page.tsx              # Main deployment page
│   ├── projects/
│   │   └── page.tsx          # Projects listing
│   └── project/
│       └── [id]/
│           └── page.tsx      # Project detail & deployment history
├── components/
│   └── ui/                   # Shadcn UI components
├── lib/
│   ├── api.ts                # API service functions
│   ├── types.ts              # TypeScript type definitions
│   └── utils.ts              # Utility functions
└── .env.local                # Environment variables
```

## Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:9000
NEXT_PUBLIC_SOCKET_URL=http://localhost:9001
NEXT_PUBLIC_PREVIEW_URL=http://localhost:8000
```

## Features

### 1. Deploy New Project
- Enter project name and GitHub repository URL
- Creates project and triggers deployment
- Real-time log streaming during build
- Preview URL generation with subdomain

### 2. Projects Dashboard
- View all projects
- See latest deployment status
- Quick access to project details
- One-click redeployment

### 3. Project Details
- View complete deployment history
- Redeploy from any project
- Access deployment logs
- Visit live deployment

### 4. Real-time Logs
- Socket.io integration for live updates
- Auto-scroll to latest log
- Status detection (building, deployed, failed)
- Deployment progress tracking

## Running the Application

### Prerequisites
1. Backend services must be running:
   - API Server (port 9000)
   - Socket.io Server (port 9001)
   - S3 Reverse Proxy (port 8000)
2. Database (PostgreSQL) accessible
3. ClickHouse for logs
4. Kafka for log streaming

### Start Frontend

```bash
cd frontend-nextjs
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Key Integration Points

### 1. Project Creation Flow
```typescript
// Create project
const project = await createProject({ name, gitURL });

// Deploy project
const deployment = await deployProject({ projectId: project.id });

// Subscribe to logs
socket.emit('subscribe', deployment.id);
```

### 2. Socket.io Connection
```typescript
const socket = io(SOCKET_URL);
socket.on('connect', () => console.log('Connected'));
socket.on('message', (message) => {
  // Handle log messages
  if (message.startsWith('log:')) {
    const log = message.substring(4);
    // Process log
  }
});
```

### 3. Preview URL Generation
```typescript
// Subdomain-based URL
const previewURL = getPreviewURL(project.subdomain);
// Result: http://{subdomain}.localhost:8000
```

## API Service Functions

### `createProject(data)`
Creates a new project with name and Git URL.

### `deployProject(data)`
Triggers deployment for a project.

### `getProjects()`
Fetches all projects with their latest deployment.

### `getProject(projectId)`
Fetches project details with all deployments.

### `getDeployment(deploymentId)`
Fetches specific deployment details.

### `getLogs(deploymentId)`
Fetches logs from ClickHouse for a deployment.

### `getPreviewURL(subdomain)`
Generates preview URL for deployed application.

## Type Definitions

All API types are defined in `lib/types.ts`:
- `Project` - Project model
- `Deployment` - Deployment model
- `DeploymentStatus` - Enum for deployment states
- `LogEvent` - Log entry from ClickHouse
- Request/Response types for all API calls

## Deployment Status Flow

```
QUEUED → PENDING → BUILDING → DEPLOYED
                              ↓
                            FAILED
```

## Notes

### Subdomain Resolution
The S3 reverse proxy resolves subdomains to S3 paths:
- URL: `http://{subdomain}.localhost:8000`
- Resolves to: `s3://{bucket}/__outputs/{projectId}/`

### Hosts File Configuration
For local testing, add to hosts file:
```
127.0.0.1 {subdomain}.localhost
```

### Error Handling
- All API calls wrapped in try-catch
- Socket.io reconnection handled automatically
- Loading states for async operations
- Error messages displayed to users

## Future Enhancements

1. **Authentication** - Add user authentication and project ownership
2. **Custom Domains** - Support for custom domain configuration
3. **Environment Variables** - Manage environment variables per project
4. **Build Configuration** - Custom build commands and framework detection
5. **Team Collaboration** - Multi-user access and permissions
6. **Analytics** - Deployment metrics and usage statistics
7. **Webhooks** - GitHub integration for automatic deployments
8. **Rollback** - Revert to previous deployments

## Troubleshooting

### Logs Not Streaming
- Check Socket.io server is running on port 9001
- Verify Kafka consumer is connected
- Check browser console for connection errors

### Deployment Not Starting
- Verify ECS cluster and task definition
- Check AWS credentials in backend
- Review API server logs

### Preview URL Not Working
- Ensure S3 reverse proxy is running (port 8000)
- Check subdomain in hosts file
- Verify project ID exists in database

## Support

For issues and questions:
1. Check backend logs: `api-server`
2. Check frontend console: Browser DevTools
3. Verify all services are running
4. Review environment variables
