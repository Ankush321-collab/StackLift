// API Types based on backend Prisma schema and responses

export enum DeploymentStatus {
  QUEUED = "queued",
  PENDING = "pending",
  BUILDING = "building",
  DEPLOYED = "deployed",
  FAILED = "failed",
}

export interface Project {
  id: string;
  name: string;
  giturl: string;
  subdomain: string;
  customdomain?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  gitURL: string;
}

export interface CreateProjectResponse {
  status: string;
  data: Project;
}

export interface DeployProjectRequest {
  projectId: string;
}

export interface DeployProjectResponse {
  status: string;
  data: {
    deploymentId: string;
  };
}

export interface LogEvent {
  event_id: string;
  deployment_id: string;
  log: string;
  timestamp: string;
}

export interface GetLogsResponse {
  status: string;
  data: LogEvent[];
}

export interface SocketMessage {
  log: string;
}

export interface ProjectWithDeployments extends Project {
  deployments: Deployment[];
}

export interface GetProjectsResponse {
  status: string;
  data: ProjectWithDeployments[];
}

export interface GetProjectResponse {
  status: string;
  data: ProjectWithDeployments;
}

export interface DeploymentWithProject extends Deployment {
  project: Project;
}

export interface GetDeploymentResponse {
  status: string;
  data: DeploymentWithProject;
}
