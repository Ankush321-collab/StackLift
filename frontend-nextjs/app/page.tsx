"use client";
import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Loader2, List } from "lucide-react";
import { Fira_Code } from "next/font/google";
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

const firaCode = Fira_Code({ subsets: ["latin"] });

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

  // Load existing deployment if query params present
  useEffect(() => {
    const loadExistingDeployment = async () => {
      if (urlDeploymentId && urlProjectId) {
        try {
          setLoading(true);
          
          // Get deployment and project details
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

          // Load existing logs
          try {
            const logsRes = await getLogs(deployment.id);
            if (logsRes.data && logsRes.data.length > 0) {
              const logMessages = logsRes.data.map(log => log.log);
              setLogs(logMessages);
            }
          } catch (err) {
            console.log("No logs available yet");
          }

          // Subscribe to deployment for real-time updates
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
      // Step 1: Create project
      const projectResponse = await createProject({
        name: projectName,
        gitURL: repoURL,
      });

      if (projectResponse && projectResponse.data) {
        const project = projectResponse.data;
        setProjectId(project.id);
        
        const previewURL = getPreviewURL(project.subdomain, project.id);
        setDeployPreviewURL(previewURL);

        // Step 2: Deploy the project
        const deployResponse = await deployProject({
          projectId: project.id,
        });

        if (deployResponse && deployResponse.data) {
          const { deploymentId } = deployResponse.data;
          setDeploymentId(deploymentId);

          // Step 3: Subscribe to deployment logs
          if (socketRef.current) {
            console.log(`Subscribing to deployment: ${deploymentId}`);
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
    console.log(`[Incoming Socket Message]:`, message);
    
    // Parse the message - format is "log:actual log content"
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

      // Use explicit markers to avoid false failures from non-fatal stderr output.
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

  // Initialize socket connection
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

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-180px] h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-500/20 blur-[140px] animate-float" />
        <div className="absolute right-[-120px] top-24 h-[320px] w-[320px] rounded-full bg-pink-500/20 blur-[150px] animate-float" />
        <div className="absolute left-[-120px] bottom-16 h-[280px] w-[280px] rounded-full bg-violet-500/20 blur-[140px] animate-float" />
        <div className="absolute inset-0 bg-grid opacity-40" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Stacklift Deploy</p>
            <h1 className="mt-3 text-4xl font-semibold text-gradient sm:text-5xl">
              Deploy your frontend in minutes
            </h1>
            <p className="mt-3 text-base text-slate-300">
              Push a GitHub repo and get a production-ready build with instant preview links and logs.
            </p>
          </div>
          <Link href="/projects">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/60"
            >
              <List className="mr-2 h-4 w-4" />
              Projects
            </Button>
          </Link>
        </div>

        <section className="glass-card rounded-2xl p-6 shadow-2xl animate-fade-up">
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2">
                Project Name
              </label>
              <Input
                disabled={loading}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                type="text"
                placeholder="my-awesome-project"
                className="bg-slate-950/60 border-slate-700/60 focus-visible:ring-sky-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2">
                GitHub Repository URL
              </label>
              <span className="flex items-center gap-3">
                <Github className="text-xl text-slate-400" />
                <Input
                  disabled={loading}
                  value={repoURL}
                  onChange={(e) => setURL(e.target.value)}
                  type="url"
                  placeholder="https://github.com/username/repo"
                  className="bg-slate-950/60 border-slate-700/60 focus-visible:ring-sky-500/40"
                />
              </span>
              {repoURL && !isValidURL[0] && (
                <p className="text-red-400 text-sm mt-2">{isValidURL[1]}</p>
              )}
            </div>

            <Button
              onClick={handleClickDeploy}
              disabled={!isValidInput || loading}
              className="w-full bg-sky-500/90 text-slate-950 hover:bg-sky-400"
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
                "Deploy"
              )}
            </Button>
          </div>
        </section>

        {deployPreviewURL && (
          <section className="glass-card rounded-2xl p-5 animate-fade-up">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Preview URL</p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-3 text-sky-300 transition-colors hover:bg-slate-800/70"
              href={deployPreviewURL}
            >
              {deployPreviewURL}
            </a>
            {deploymentStatus === DeploymentStatus.DEPLOYED && (
              <p className="text-emerald-400 text-sm mt-3">Deployment successful!</p>
            )}
            {deploymentStatus === DeploymentStatus.FAILED && (
              <p className="text-red-400 text-sm mt-3">Deployment failed. Check logs below.</p>
            )}
          </section>
        )}

        {logs.length > 0 && (
          <section className="animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Deployment Logs</p>
              <span className="text-xs text-emerald-300/80">Live stream</span>
            </div>
            <div className="relative">
              <div className="absolute inset-x-0 top-0 h-10 rounded-2xl bg-gradient-to-b from-emerald-500/20 to-transparent pointer-events-none" />
              <div
                className={`${firaCode.className} text-sm text-emerald-200 logs-container border border-emerald-500/40 rounded-2xl p-4 h-[340px] overflow-y-auto bg-slate-950/80 shadow-[0_20px_60px_rgba(15,23,42,0.6)]`}
              >
                <pre className="flex flex-col gap-1">
                  {logs.map((log, i) => (
                    <code
                      ref={logs.length - 1 === i ? logContainerRef : undefined}
                      key={i}
                      className="animate-fade-in"
                    >{`> ${log}`}</code>
                  ))}
                </pre>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="flex justify-center items-center min-h-screen py-10">Loading...</main>}>
      <HomeContent />
    </Suspense>
  );
}
