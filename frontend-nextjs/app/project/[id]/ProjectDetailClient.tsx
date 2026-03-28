"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getProject, deployProject, getPreviewURL } from "@/lib/api";
import { ProjectWithDeployments, DeploymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Clock, ArrowLeft, Loader2 } from "lucide-react";

export default function ProjectDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectWithDeployments | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = params.id as string;

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const response = await getProject(projectId);
        setProject(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch project");
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const handleRedeploy = async () => {
    if (!project) return;

    try {
      setDeploying(true);
      const response = await deployProject({ projectId: project.id });

      if (response.data.deploymentId) {
        // Redirect to home page with deployment tracking
        router.push(`/?deploymentId=${response.data.deploymentId}&projectId=${project.id}`);
      }
    } catch (err) {
      console.error("Failed to redeploy:", err);
      setError(err instanceof Error ? err.message : "Failed to redeploy");
      setDeploying(false);
    }
  };

  const getStatusColor = (status: DeploymentStatus) => {
    switch (status) {
      case DeploymentStatus.DEPLOYED:
        return "text-green-500 bg-green-500/10";
      case DeploymentStatus.BUILDING:
        return "text-blue-500 bg-blue-500/10";
      case DeploymentStatus.FAILED:
        return "text-red-500 bg-red-500/10";
      case DeploymentStatus.QUEUED:
        return "text-yellow-500 bg-yellow-500/10";
      case DeploymentStatus.PENDING:
        return "text-orange-500 bg-orange-500/10";
      default:
        return "text-gray-500 bg-gray-500/10";
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center text-red-500">
          <p className="text-xl mb-4">Error: {error || "Project not found"}</p>
          <Link href="/projects">
            <Button>Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  const previewURL = getPreviewURL(project.subdomain);

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <Link href="/projects" className="inline-flex items-center text-gray-400 hover:text-white mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
            <div className="flex items-center gap-2 text-gray-400">
              <GitBranch className="h-4 w-4" />
              <a
                href={project.giturl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors"
              >
                {project.giturl}
              </a>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href={previewURL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Visit Site
              </Button>
            </a>
            <Button onClick={handleRedeploy} disabled={deploying}>
              {deploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                "Redeploy"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900 rounded-lg p-6">
          <p className="text-sm text-gray-400 mb-2">Subdomain</p>
          <p className="font-mono">{project.subdomain}</p>
        </div>
        <div className="bg-slate-900 rounded-lg p-6">
          <p className="text-sm text-gray-400 mb-2">Created</p>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {formatDate(project.createdAt)}
          </div>
        </div>
        <div className="bg-slate-900 rounded-lg p-6">
          <p className="text-sm text-gray-400 mb-2">Total Deployments</p>
          <p className="text-2xl font-bold">{project.deployments.length}</p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Deployment History</h2>
        {project.deployments.length === 0 ? (
          <div className="bg-slate-900 rounded-lg p-8 text-center">
            <p className="text-gray-400">No deployments yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {project.deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="bg-slate-900 rounded-lg p-6 hover:bg-slate-800 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          deployment.status
                        )}`}
                      >
                        {deployment.status}
                      </span>
                      <span className="text-sm text-gray-400 font-mono">
                        {deployment.id.substring(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="h-3 w-3" />
                      {formatDate(deployment.createdAt)}
                    </div>
                  </div>
                  <Link href={`/?deploymentId=${deployment.id}&projectId=${project.id}`}>
                    <Button variant="outline" size="sm">
                      View Logs
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
