"use client";
import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Loader2, List, Terminal, Rocket, CheckCircle2, XCircle } from "lucide-react";
import {
  createProject,
  deployProject,
  getProject,
  getDeployment,
  getLogs,
  getPreviewURL,
  SOCKET_URL
} from "@/lib/api";
import { DeploymentStatus } from "@/lib/types";

const cardVariants = {
  hidden: { opacity: 0, y: 16, rotateX: 5 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

function HomeContent() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("projectId");
  const urlDeploymentId = searchParams.get("deploymentId");

  const [repoURL, setURL] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [deploymentId, setDeploymentId] = useState<string | undefined>();
  const [deployPreviewURL, setDeployPreviewURL] = useState<string | undefined>();
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | undefined>();

  const logContainerRef = useRef<HTMLElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const loadExistingDeployment = async () => {
      if (urlDeploymentId && urlProjectId) {
        try {
          setLoading(true);
          const [deploymentRes, projectRes] = await Promise.all([
            getDeployment(urlDeploymentId),
            getProject(urlProjectId)
          ]);

          const deployment = deploymentRes.data;
          const project = projectRes.data;

          setProjectId(project.id);
          setProjectName(project.name);
          setURL(project.giturl);
          setDeploymentId(deployment.id);
          setDeploymentStatus(deployment.status);
          setDeployPreviewURL(getPreviewURL(project.subdomain, project.id));

          try {
            const logsRes = await getLogs(deployment.id);
            if (logsRes.data && logsRes.data.length > 0) {
              const logMessages = logsRes.data.map(log => log.log);
              setLogs(logMessages);
            }
          } catch (err) {
            console.log("No logs available yet");
          }

          if (socketRef.current && deployment.status !== DeploymentStatus.DEPLOYED && deployment.status !== DeploymentStatus.FAILED) {
            socketRef.current.emit("subscribe", deployment.id);
          } else {
            setLoading(false);
          }
        } catch (error) {
          console.error("Failed to load deployment:", error);
          setLoading(false);
        }
      }
    };

    if (socketRef.current) {
      loadExistingDeployment();
    }
  }, [urlDeploymentId, urlProjectId]);

  const isValidURL: [boolean, string | null] = useMemo(() => {
    if (!repoURL || repoURL.trim() === "") return [false, null];
    const regex = new RegExp(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)(?:\/)?$/
    );
    return [regex.test(repoURL), "Enter valid Github Repository URL"];
  }, [repoURL]);

  const isValidInput = useMemo(() => {
    return isValidURL[0] && projectName.trim() !== "";
  }, [isValidURL, projectName]);

  const handleClickDeploy = useCallback(async () => {
    setLoading(true);
    setLogs([]);
    setDeploymentStatus(DeploymentStatus.QUEUED);

    try {
      const projectResponse = await createProject({
        name: projectName,
        gitURL: repoURL,
      });

      if (projectResponse && projectResponse.data) {
        const project = projectResponse.data;
        setProjectId(project.id);

        const previewURL = getPreviewURL(project.subdomain, project.id);
        setDeployPreviewURL(previewURL);

        const deployResponse = await deployProject({
          projectId: project.id,
        });

        if (deployResponse && deployResponse.data) {
          const { deploymentId } = deployResponse.data;
          setDeploymentId(deploymentId);

          if (socketRef.current) {
            socketRef.current.emit("subscribe", deploymentId);
          }
        }
      }
    } catch (error) {
      console.error("Deployment error:", error);
      setLogs((prev) => [...prev, `Error: ${error instanceof Error ? error.message : "Failed to deploy"}`]);
      setDeploymentStatus(DeploymentStatus.FAILED);
      setLoading(false);
    }
  }, [projectName, repoURL]);

  const handleSocketIncommingMessage = useCallback((message: string) => {
    if (message.startsWith("status:")) {
      const status = message.substring(7);
      setDeploymentStatus(status as DeploymentStatus);
      if (status === 'deployed' || status === 'failed') {
        setLoading(false);
      }
      return;
    }

    if (message.startsWith("log:")) {
      const log = message.substring(4);
      setLogs((prev) => [...prev, log]);

      const normalizedLog = log.toLowerCase();
      const isSuccessLog =
        normalizedLog.includes("done... everthing uploaded successfully") ||
        normalizedLog.includes("deployment complete") ||
        normalizedLog.includes("build completed...");

      const isFailureLog =
        normalizedLog.includes("fatal:") ||
        normalizedLog.includes("build failed") ||
        normalizedLog.includes("deployment failed") ||
        normalizedLog.includes("could not connect to kafka") ||
        normalizedLog.includes("project_id environment variable is missing");

      if (isSuccessLog) {
        setDeploymentStatus(DeploymentStatus.DEPLOYED);
        setLoading(false);
      } else if (isFailureLog) {
        setDeploymentStatus(DeploymentStatus.FAILED);
        setLoading(false);
      } else if (normalizedLog.includes("build started") || normalizedLog.includes("building")) {
        setDeploymentStatus(DeploymentStatus.BUILDING);
      }

      logContainerRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (message.includes("Joined")) {
      setLogs((prev) => [...prev, message]);
    }
  }, []);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      console.log("Socket connected");
    });

    socketRef.current.on("message", handleSocketIncommingMessage);

    return () => {
      if (socketRef.current) {
        socketRef.current.off("message", handleSocketIncommingMessage);
        socketRef.current.disconnect();
      }
    };
  }, [handleSocketIncommingMessage]);

  const StatusIndicator = () => {
    if (!deploymentStatus) return null;
    const config: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
      [DeploymentStatus.DEPLOYED]: { icon: CheckCircle2, color: "text-state-succeed", label: "DEPLOYED" },
      [DeploymentStatus.FAILED]: { icon: XCircle, color: "text-state-failed", label: "FAILED" },
      [DeploymentStatus.BUILDING]: { icon: Terminal, color: "text-state-running", label: "BUILDING" },
      [DeploymentStatus.QUEUED]: { icon: Loader2, color: "text-state-submitted", label: "QUEUED" },
      [DeploymentStatus.PENDING]: { icon: Loader2, color: "text-state-submitted", label: "PENDING" },
    };
    const c = config[deploymentStatus] || config[DeploymentStatus.QUEUED];
    const Icon = c.icon;
    return (
      <div className={`flex items-center gap-2 text-xs font-medium ${c.color}`}>
        <Icon className={`h-3.5 w-3.5 ${deploymentStatus === DeploymentStatus.QUEUED || deploymentStatus === DeploymentStatus.BUILDING ? "animate-spin" : ""}`} />
        <span className="mono uppercase tracking-wider">{c.label}</span>
      </div>
    );
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-180px] h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px] animate-float" />
        <div className="absolute right-[-120px] top-24 h-[320px] w-[320px] rounded-full bg-primary/8 blur-[150px] animate-float" />
        <div className="absolute left-[-120px] bottom-16 h-[280px] w-[280px] rounded-full bg-primary/6 blur-[140px] animate-float" />
        <div className="absolute inset-0 bg-grid opacity-30" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" as const }}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Stacklift Deploy</p>
            <h1 className="mt-3 text-4xl font-semibold text-gradient sm:text-5xl">
              Deploy your frontend in minutes
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Push a GitHub repo and get a production-ready build with instant preview links and logs.
            </p>
          </div>
          <Link href="/projects">
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-surface/60 hover:bg-surface-2/80"
            >
              <List className="mr-2 h-4 w-4" />
              Projects
            </Button>
          </Link>
        </motion.div>

        {/* Deploy Form Card */}
        <motion.section
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ rotateY: -1, rotateX: 1, y: -2 }}
          style={{ transformStyle: "preserve-3d", perspective: 1000 }}
          className="glass-card custom-shadow rounded-xl p-6"
        >
          <div className="grid gap-4">
            <div>
              <label className="mono mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Project Name
              </label>
              <Input
                disabled={loading}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                type="text"
                placeholder="my-awesome-project"
                className="bg-background/60 border-border focus-visible:ring-primary/40"
              />
            </div>

            <div>
              <label className="mono mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                GitHub Repository URL
              </label>
              <span className="flex items-center gap-3">
                <Github className="text-xl text-muted-foreground" />
                <Input
                  disabled={loading}
                  value={repoURL}
                  onChange={(e) => setURL(e.target.value)}
                  type="url"
                  placeholder="https://github.com/username/repo"
                  className="bg-background/60 border-border focus-visible:ring-primary/40"
                />
              </span>
              {repoURL && !isValidURL[0] && (
                <p className="text-state-failed text-sm mt-2">{isValidURL[1]}</p>
              )}
            </div>

            <Button
              onClick={handleClickDeploy}
              disabled={!isValidInput || loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {deploymentStatus === DeploymentStatus.QUEUED && "Queued..."}
                  {deploymentStatus === DeploymentStatus.BUILDING && "Building..."}
                  {deploymentStatus === DeploymentStatus.PENDING && "Pending..."}
                  {!deploymentStatus && "Deploying..."}
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Deploy
                </>
              )}
            </Button>

            <StatusIndicator />
          </div>
        </motion.section>

        {/* Preview URL */}
        {deployPreviewURL && (
          <motion.section
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            whileHover={{ rotateY: -1, rotateX: 1, y: -2 }}
            style={{ transformStyle: "preserve-3d", perspective: 1000 }}
            className="glass-card custom-shadow rounded-xl p-5"
          >
            <p className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview URL</p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface/80 px-4 py-3 text-primary transition-colors hover:bg-surface-2 font-mono text-sm"
              href={deployPreviewURL}
            >
              {deployPreviewURL}
            </a>
            {deploymentStatus === DeploymentStatus.DEPLOYED && (
              <p className="text-state-succeed text-sm mt-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Deployment successful!
              </p>
            )}
            {deploymentStatus === DeploymentStatus.FAILED && (
              <p className="text-state-failed text-sm mt-3 flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> Deployment failed. Check logs below.
              </p>
            )}
          </motion.section>
        )}

        {/* Mac-Style Terminal Log Viewer */}
        {logs.length > 0 && (
          <motion.section
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="animate-fade-up"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Deployment Logs</p>
              <span className="mono text-[10px] text-state-succeed/80 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-state-succeed animate-pulse" />
                Live stream
              </span>
            </div>

            {/* Terminal Window */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-border terminal-glow">
              {/* Traffic Lights Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-state-failed/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-state-submitted/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-state-succeed/80" />
                </div>
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  build-output
                </span>
                <span className="mono text-[10px] text-muted-foreground">
                  {deploymentStatus === DeploymentStatus.DEPLOYED ? "done" :
                   deploymentStatus === DeploymentStatus.BUILDING ? "running" :
                   deploymentStatus === DeploymentStatus.FAILED ? "error" : "waiting"}
                </span>
              </div>

              {/* Terminal Body */}
              <div
                className="mono flex-1 overflow-auto bg-background p-4 text-[12px] leading-relaxed h-[340px]"
              >
                {logs.map((log, i) => {
                  const isError = log.toLowerCase().startsWith("error") || log.toLowerCase().includes("fatal");
                  const isSuccess = log.toLowerCase().includes("uploaded") || log.toLowerCase().includes("completed") || log.toLowerCase().includes("success");
                  return (
                    <div key={i} className="flex gap-2 animate-fade-in">
                      <span className="select-none text-muted-foreground/50">{">"}</span>
                      <span
                        ref={logs.length - 1 === i ? logContainerRef : undefined}
                        className={
                          isError ? "text-state-failed" :
                          isSuccess ? "text-state-succeed" :
                          "text-foreground/70"
                        }
                      >
                        {log}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.section>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="flex justify-center items-center min-h-screen py-10 text-muted-foreground mono text-sm">Loading...</main>}>
      <HomeContent />
    </Suspense>
  );
}
