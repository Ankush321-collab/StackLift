"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getProjects, getPreviewURL } from "@/lib/api";
import { ProjectWithDeployments, DeploymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Clock, Rocket, Inbox } from "lucide-react";

const cardVariants = {
  hidden: { opacity: 0, y: 16, rotateX: 5 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

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

  const getStatusBadge = (status: DeploymentStatus) => {
    const base = "mono rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium";
    switch (status) {
      case DeploymentStatus.DEPLOYED:
        return `${base} text-state-succeed bg-state-succeed/10 border border-state-succeed/20`;
      case DeploymentStatus.BUILDING:
        return `${base} text-state-running bg-state-running/10 border border-state-running/20`;
      case DeploymentStatus.FAILED:
        return `${base} text-state-failed bg-state-failed/10 border border-state-failed/20`;
      case DeploymentStatus.QUEUED:
        return `${base} text-state-submitted bg-state-submitted/10 border border-state-submitted/20`;
      case DeploymentStatus.PENDING:
        return `${base} text-state-submitted bg-state-submitted/10 border border-state-submitted/20`;
      default:
        return `${base} text-muted-foreground bg-muted/30 border border-border`;
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
        <div className="text-center glass-card rounded-xl px-8 py-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground mono text-sm">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center glass-card rounded-xl px-8 py-6">
          <p className="text-xl mb-4 text-state-failed">Error: {error}</p>
          <Button onClick={() => window.location.reload()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[10%] top-12 h-52 w-52 rounded-full bg-primary/10 blur-[120px] animate-float" />
        <div className="absolute right-[10%] top-40 h-64 w-64 rounded-full bg-primary/8 blur-[140px] animate-float" />
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Project Library</p>
            <h1 className="mt-3 text-4xl font-semibold text-gradient">Your Projects</h1>
            <p className="mt-2 text-muted-foreground">
              Manage deployments, monitor status, and jump straight to previews.
            </p>
          </div>
          <Link href="/">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Rocket className="mr-2 h-4 w-4" />
              Deploy New
            </Button>
          </Link>
        </motion.div>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="glass-card rounded-xl px-10 py-12 inline-block">
              <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-xl text-foreground mb-4">No projects yet</p>
              <Link href="/">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Create Your First Project</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            {projects.map((project, i) => {
              const latestDeployment = project.deployments[0];
              const previewURL = getPreviewURL(project.subdomain, project.id);

              return (
                <motion.div
                  key={project.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ rotateY: -1, rotateX: 1, y: -3 }}
                  style={{ transformStyle: "preserve-3d", perspective: 1000 }}
                  className="glass-card custom-shadow rounded-xl p-6"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold">{project.name}</h2>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                        <GitBranch className="h-3.5 w-3.5" />
                        <a
                          href={project.giturl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary transition-colors font-mono text-xs"
                        >
                          {project.giturl}
                        </a>
                      </div>
                    </div>
                    <a
                      href={previewURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors text-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="mono text-[10px] uppercase tracking-wider">Visit</span>
                    </a>
                  </div>

                  <div className="glow-line mb-4" />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="mono mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Subdomain</label>
                      <p className="font-mono text-sm text-foreground">{project.subdomain}</p>
                    </div>

                    {latestDeployment && (
                      <>
                        <div>
                          <label className="mono mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
                          <span className={getStatusBadge(latestDeployment.status)}>
                            {latestDeployment.status}
                          </span>
                        </div>
                        <div>
                          <label className="mono mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Last Deployed</label>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span className="font-mono text-xs">{formatDate(latestDeployment.createdAt)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Link href={`/project/${project.id}`}>
                      <Button variant="outline" size="sm" className="border-border bg-surface/60 hover:bg-surface-2/80">
                        View Details
                      </Button>
                    </Link>
                    <Link href={`/?projectId=${project.id}`}>
                      <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">Redeploy</Button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
