"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getProjects, getPreviewURL } from "@/lib/api";
import { ProjectWithDeployments, DeploymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Clock } from "lucide-react";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithDeployments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const response = await getProjects();
        setProjects(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch projects");
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

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
          <p className="text-slate-200">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center glass-card rounded-2xl px-8 py-6">
          <p className="text-xl mb-4 text-red-400">Error: {error}</p>
          <Button onClick={() => window.location.reload()} className="bg-sky-500 text-slate-950 hover:bg-sky-400">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[10%] top-12 h-52 w-52 rounded-full bg-sky-500/20 blur-[120px] animate-float" />
        <div className="absolute right-[10%] top-40 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-[140px] animate-float" />
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Project Library</p>
            <h1 className="mt-3 text-4xl font-semibold text-gradient">Your Projects</h1>
            <p className="mt-2 text-slate-300">
              Manage deployments, monitor status, and jump straight to previews.
            </p>
          </div>
          <Link href="/">
            <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400">Deploy New Project</Button>
          </Link>
        </div>

      {projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="glass-card rounded-2xl px-10 py-12 inline-block">
            <p className="text-xl text-slate-300 mb-4">No projects yet</p>
            <Link href="/">
              <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400">Create Your First Project</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => {
            const latestDeployment = project.deployments[0];
            const previewURL = getPreviewURL(project.subdomain, project.id);

            return (
              <div
                key={project.id}
                className="glass-card rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(15,23,42,0.6)]"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">{project.name}</h2>
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
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
                  <a
                    href={previewURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sky-300 hover:text-sky-200 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Visit
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Subdomain</p>
                    <p className="font-mono text-sm">{project.subdomain}</p>
                  </div>

                  {latestDeployment && (
                    <>
                      <div>
                        <p className="text-sm text-gray-400 mb-1">Latest Status</p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            latestDeployment.status
                          )}`}
                        >
                          {latestDeployment.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400 mb-1">
                          Last Deployed
                        </p>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {formatDate(latestDeployment.createdAt)}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 flex gap-3">
                  <Link href={`/project/${project.id}`}>
                    <Button variant="outline" size="sm" className="border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/70">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/?projectId=${project.id}`}>
                    <Button size="sm" className="bg-sky-500 text-slate-950 hover:bg-sky-400">Redeploy</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </main>
  );
}
