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
          setDeployPreviewURL(getPreviewURL(project.subdomain));

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
        
        const previewURL = getPreviewURL(project.subdomain);
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
    <main className="flex justify-center items-center min-h-screen py-10">
      <div className="w-[600px]">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Deploy Your Project</h1>
            <p className="text-gray-400">
              Deploy your GitHub repository to the cloud in seconds
            </p>
          </div>
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <List className="mr-2 h-4 w-4" />
              Projects
            </Button>
          </Link>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Project Name
            </label>
            <Input
              disabled={loading}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              type="text"
              placeholder="my-awesome-project"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              GitHub Repository URL
            </label>
            <span className="flex justify-start items-center gap-2">
              <Github className="text-2xl flex-shrink-0" />
              <Input
                disabled={loading}
                value={repoURL}
                onChange={(e) => setURL(e.target.value)}
                type="url"
                placeholder="https://github.com/username/repo"
              />
            </span>
            {repoURL && !isValidURL[0] && (
              <p className="text-red-500 text-sm mt-1">{isValidURL[1]}</p>
            )}
          </div>

          <Button
            onClick={handleClickDeploy}
            disabled={!isValidInput || loading}
            className="w-full"
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

        {deployPreviewURL && (
          <div className="mt-6 bg-slate-900 py-4 px-4 rounded-lg">
            <p className="text-sm text-gray-400 mb-2">Preview URL</p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 bg-sky-950 px-3 py-2 rounded-lg inline-block hover:bg-sky-900 transition-colors"
              href={deployPreviewURL}
            >
              {deployPreviewURL}
            </a>
            {deploymentStatus === DeploymentStatus.DEPLOYED && (
              <p className="text-green-500 text-sm mt-2">✅ Deployment successful!</p>
            )}
            {deploymentStatus === DeploymentStatus.FAILED && (
              <p className="text-red-500 text-sm mt-2">❌ Deployment failed</p>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium mb-2">Deployment Logs</p>
            <div
              className={`${firaCode.className} text-sm text-green-500 logs-container border-green-500 border-2 rounded-lg p-4 h-[300px] overflow-y-auto bg-black`}
            >
              <pre className="flex flex-col gap-1">
                {logs.map((log, i) => (
                  <code
                    ref={logs.length - 1 === i ? logContainerRef : undefined}
                    key={i}
                  >{`> ${log}`}</code>
                ))}
              </pre>
            </div>
          </div>
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
