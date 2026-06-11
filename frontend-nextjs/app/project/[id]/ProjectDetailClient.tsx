"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { getProject, deployProject, getPreviewURL } from "@/lib/api";
import { ProjectWithDeployments, DeploymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Clock, ArrowLeft, Loader2, Rocket, Hash } from "lucide-react";

const cardVariants = {
  hidden: { opacity: 0, y: 16, rotateX: 5 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

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
        router.push(`/?deploymentId=${response.data.deploymentId}&projectId=${project.id}`);
      }
    } catch (err) {
      console.error("Failed to redeploy:", err);
      setError(err instanceof Error ? err.message : "Failed to redeploy");
      setDeploying(false);
    }
  };

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
          <p className="text-muted-foreground mono text-sm">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center glass-card rounded-xl px-8 py-6">
          <p className="text-xl mb-4 text-state-failed">Error: {error || "Project not found"}</p>
          <Link href="/projects">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  const previewURL = getPreviewURL(project.subdomain, project.id);

  return (
    <main className="relative min-h-screen px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[15%] top-10 h-56 w-56 rounded-full bg-primary/10 blur-[120px] animate-float" />
        <div className="absolute right-[12%] top-32 h-64 w-64 rounded-full bg-primary/8 blur-[140px] animate-float" />
      </div>

      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <Link href="/projects" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="mono text-[10px] uppercase tracking-wider">Back to Projects</span>
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Project Overview</p>
              <h1 className="mt-3 text-4xl font-semibold text-gradient">{project.name}</h1>
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <GitBranch className="h-4 w-4" />
                <a
                  href={project.giturl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors font-mono text-sm"
                >
                  {project.giturl}
                </a>
              </div>
            </div>
            <div className="flex gap-3">
              <a href={previewURL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="border-border bg-surface/60 hover:bg-surface-2/80">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visit Site
                </Button>
              </a>
              <Button
                onClick={handleRedeploy}
                disabled={deploying}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {deploying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Redeploy
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            { label: "Subdomain", value: project.subdomain, icon: ExternalLink },
            { label: "Created", value: formatDate(project.createdAt), icon: Clock },
            { label: "Total Deployments", value: project.deployments.length.toString(), icon: Hash },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              whileHover={{ rotateY: -2, rotateX: 2, y: -2 }}
              style={{ transformStyle: "preserve-3d", perspective: 600 }}
              className="glass-card custom-shadow rounded-xl p-5"
            >
              <label className="mono mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</label>
              <div className="flex items-center gap-2">
                <stat.icon className="h-4 w-4 text-primary/60" />
                <p className="font-mono text-sm text-foreground">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Deployment History */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Deployment History</h2>
          {project.deployments.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <p className="text-muted-foreground">No deployments yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.deployments.map((deployment, i) => (
                <motion.div
                  key={deployment.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ rotateY: -1, rotateX: 1, y: -2 }}
                  style={{ transformStyle: "preserve-3d", perspective: 1000 }}
                  className="glass-card custom-shadow rounded-xl p-5"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={getStatusBadge(deployment.status)}>
                          {deployment.status}
                        </span>
                        <span className="mono text-xs text-muted-foreground">
                          {deployment.id.substring(0, 8)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="font-mono text-xs">{formatDate(deployment.createdAt)}</span>
                      </div>
                    </div>
                    <Link href={`/?deploymentId=${deployment.id}&projectId=${project.id}`}>
                      <Button variant="outline" size="sm" className="border-border bg-surface/60 hover:bg-surface-2/80">
                        View Logs
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
