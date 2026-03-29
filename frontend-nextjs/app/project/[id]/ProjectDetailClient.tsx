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
        <div className="text-center glass-card rounded-2xl px-8 py-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-slate-200">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center glass-card rounded-2xl px-8 py-6">
          <p className="text-xl mb-4 text-red-400">Error: {error || "Project not found"}</p>
          <Link href="/projects">
            <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400">Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  const previewURL = getPreviewURL(project.subdomain, project.id);

  return (
    <main className="relative min-h-screen px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[15%] top-10 h-56 w-56 rounded-full bg-sky-500/20 blur-[120px] animate-float" />
        <div className="absolute right-[12%] top-32 h-64 w-64 rounded-full bg-violet-500/20 blur-[140px] animate-float" />
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 animate-fade-up">
          <Link href="/projects" className="inline-flex items-center text-slate-400 hover:text-slate-100 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Project Overview</p>
              <h1 className="mt-3 text-4xl font-semibold text-gradient">{project.name}</h1>
              <div className="mt-2 flex items-center gap-2 text-slate-400">
                <GitBranch className="h-4 w-4" />
                <a
                  href={project.giturl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sky-300 transition-colors"
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
                <Button variant="outline" className="border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/70">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visit Site
                </Button>
              </a>
              <Button
                onClick={handleRedeploy}
                disabled={deploying}
                className="bg-sky-500 text-slate-950 hover:bg-sky-400"
              >
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="glass-card rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Subdomain</p>
            <p className="font-mono text-slate-200">{project.subdomain}</p>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Created</p>
            <div className="flex items-center gap-2 text-slate-200">
              <Clock className="h-4 w-4" />
              {formatDate(project.createdAt)}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Total Deployments</p>
            <p className="text-2xl font-bold text-slate-100">{project.deployments.length}</p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-4">Deployment History</h2>
          {project.deployments.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-slate-300">No deployments yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.deployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="glass-card rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1"
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
                        <span className="text-sm text-slate-400 font-mono">
                          {deployment.id.substring(0, 8)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatDate(deployment.createdAt)}
                      </div>
                    </div>
                    <Link href={`/?deploymentId=${deployment.id}&projectId=${project.id}`}>
                      <Button variant="outline" size="sm" className="border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/70">
                        View Logs
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
