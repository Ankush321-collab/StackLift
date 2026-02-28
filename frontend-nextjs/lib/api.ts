import axios from "axios";
import {
  CreateProjectRequest,
  CreateProjectResponse,
  DeployProjectRequest,
  DeployProjectResponse,
  GetLogsResponse,
  GetProjectsResponse,
  GetProjectResponse,
  GetDeploymentResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Create a new project
export const createProject = async (data: CreateProjectRequest): Promise<CreateProjectResponse> => {
  const response = await apiClient.post<CreateProjectResponse>("/project", data);
  return response.data;
};

// Deploy a project
export const deployProject = async (data: DeployProjectRequest): Promise<DeployProjectResponse> => {
  const response = await apiClient.post<DeployProjectResponse>("/deploy", data);
  return response.data;
};

// Get logs for a deployment
export const getLogs = async (deploymentId: string): Promise<GetLogsResponse> => {
  const response = await apiClient.get<GetLogsResponse>(`/logs/${deploymentId}`);
  return response.data;
};

// Get all projects
export const getProjects = async (): Promise<GetProjectsResponse> => {
  const response = await apiClient.get<GetProjectsResponse>("/projects");
  return response.data;
};

// Get project by ID
export const getProject = async (projectId: string): Promise<GetProjectResponse> => {
  const response = await apiClient.get<GetProjectResponse>(`/project/${projectId}`);
  return response.data;
};

// Get deployment by ID
export const getDeployment = async (deploymentId: string): Promise<GetDeploymentResponse> => {
  const response = await apiClient.get<GetDeploymentResponse>(`/deployment/${deploymentId}`);
  return response.data;
};

// Get preview URL for a project
export const getPreviewURL = (subdomain: string): string => {
  const previewBaseUrl = process.env.NEXT_PUBLIC_PREVIEW_URL || "http://localhost:8000";
  return `${previewBaseUrl.replace("localhost", `${subdomain}.localhost`)}`;
};

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9001";
