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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center text-red-500">
          <p className="text-xl mb-4">Error: {error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Projects</h1>
            <p className="text-gray-400">
              Manage and deploy your GitHub repositories
            </p>
          </div>
          <Link href="/">
            <Button>Deploy New Project</Button>
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl text-gray-400 mb-4">No projects yet</p>
          <Link href="/">
            <Button>Create Your First Project</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => {
            const latestDeployment = project.deployments[0];
            const previewURL = getPreviewURL(project.subdomain);

            return (
              <div
                key={project.id}
                className="bg-slate-900 rounded-lg p-6 hover:bg-slate-800 transition-colors"
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
                    className="flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-colors"
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
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/?projectId=${project.id}`}>
                    <Button size="sm">Redeploy</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
