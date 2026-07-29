"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSessionStore } from "@/store/sessionStore";
import * as api from "@/lib/api";
import { getSocket, connectSocket, joinSession, leaveSession } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import AuthGuard from "@/components/auth-guard";
import ActivityFeed, { ActivityEvent } from "@/components/activity-feed";
import {
  ArrowLeft, CheckCircle2, Loader2, Clock,
  GitBranch, Shield, Send,
  AlertCircle, ChevronDown, ChevronUp, ExternalLink, LogOut,
  Code2, PanelRightClose, PanelRightOpen, GripVertical, FileCode,
} from "lucide-react";

// Dynamic imports for heavy components (Monaco, ReactFlow)
const WorkflowGraph = dynamic(() => import("@/components/workflow-graph"), { ssr: false });
const CodeExplorer = dynamic(() => import("@/components/code-explorer"), { ssr: false });
const DiffViewer = dynamic(() => import("@/components/diff-viewer"), { ssr: false });

// ─── Status → Active Node mapping ───
const STATUS_TO_NODE: Record<string, string> = {
  INITIALIZING: "environment",
  PREPARING_ENVIRONMENT: "environment",
  ANALYZING: "analysis",
  ORCHESTRATING: "supervisor",
  PLANNING: "planner",
  IMPLEMENTING: "writer",
  VALIDATING: "tester",
  REVIEWING: "reviewer",
  WAITING_FOR_APPROVAL: "user",
  CREATING_PULL_REQUEST: "user",
  COMPLETED: "",
  FAILED: "",
  CANCELLED: "",
};

function getCompletedNodes(status: string): Set<string> {
  const order = ["environment", "analysis", "supervisor", "planner", "writer", "tester", "reviewer", "user"];
  const activeNode = STATUS_TO_NODE[status] || "";
  const activeIdx = order.indexOf(activeNode);
  const completed = new Set<string>();
  for (let i = 0; i < activeIdx; i++) completed.add(order[i]);
  if (status === "COMPLETED") order.forEach((n) => completed.add(n));
  return completed;
}

// ─── Main Session Dashboard Page ───
export default function SessionDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { currentSession, setCurrentSession } = useSessionStore();
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Side Panel state (Claude Artifact style) — starts closed by default
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(50); // percentage 30-70%
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // View mode inside side panel
  const [viewMode, setViewMode] = useState<"diff" | "explorer">("diff");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  const { isAuthenticated, token } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.replace("/auth");
      return;
    }

    loadSession();
    connectSocket();
    joinSession(sessionId);

    const socket = getSocket();

    socket.on("workflow:stage_changed", (data: any) => {
      if (data.sessionId === sessionId) loadSession();
    });
    socket.on("agent:completed", (data: any) => {
      if (data.sessionId === sessionId) loadSession();
    });
    socket.on("session:completed", (data: any) => {
      if (data.sessionId === sessionId) loadSession();
    });
    socket.on("session:failed", (data: any) => {
      if (data.sessionId === sessionId) loadSession();
    });
    socket.on("session:updated", (data: any) => {
      if (data.sessionId === sessionId) loadSession();
    });

    socket.on("agent:activity", (data: any) => {
      if (data.sessionId === sessionId) {
        setActivityEvents((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: data.timestamp || new Date().toISOString(),
            agent: data.agent || "unknown",
            type: data.type || "info",
            tool: data.tool,
            args: data.args,
            result: data.result,
            message: data.message,
          },
        ]);
      }
    });

    const interval = setInterval(loadSession, 5000);

    return () => {
      leaveSession(sessionId);
      clearInterval(interval);
      socket.off("workflow:stage_changed");
      socket.off("agent:completed");
      socket.off("session:completed");
      socket.off("session:failed");
      socket.off("session:updated");
      socket.off("agent:activity");
    };
  }, [sessionId]);

  // Resizing logic for side panel
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newWidth = ((rect.right - e.clientX) / rect.width) * 100;
    if (newWidth >= 25 && newWidth <= 75) {
      setPanelWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  async function loadSession() {
    try {
      const res = await api.getSession(sessionId);
      if (res.success) setCurrentSession(res.data);
    } catch { }
  }

  async function handleApproval(action: "approve" | "cancel") {
    setApproving(true);
    try {
      await api.approveSession(sessionId, action);
      await loadSession();
    } catch { }
    setApproving(false);
  }

  async function handleRevision() {
    if (!revisionPrompt.trim()) return;
    setSubmittingRevision(true);
    try {
      await api.reviseSession(sessionId, revisionPrompt.trim());
      setRevisionPrompt("");
      await loadSession();
    } catch (err) {
      console.error("Revision failed", err);
    }
    setSubmittingRevision(false);
  }

  if (!currentSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  const activeNode = STATUS_TO_NODE[currentSession.status] || "";
  const completedNodes = getCompletedNodes(currentSession.status);
  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(currentSession.status);
  const isExecuting = !isTerminal && currentSession.status !== "WAITING_FOR_APPROVAL";
  const isApproval = currentSession.status === "WAITING_FOR_APPROVAL";
  const hasContainer = !!currentSession.environmentReport?.containerId;

  // Convert backend executionHistory items to ActivityEvents
  const historyEvents: ActivityEvent[] = (currentSession.executionHistory || []).map((h: any, idx: number) => ({
    id: `hist-${idx}-${h.timestamp}`,
    timestamp: h.timestamp || new Date().toISOString(),
    agent: (h.component || "system").toLowerCase(),
    type: h.result === "failed" ? "agent_failed" : h.result === "success" ? "agent_completed" : "info",
    message: `${h.action}${h.details ? `: ${h.details}` : ""}`,
  }));

  // Combine and deduplicate
  const allLogs: ActivityEvent[] = [...historyEvents, ...activityEvents];

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col" style={{ background: "#0d1117" }}>
        {/* Header */}
        <header className="border-b border-[#21262d] px-6 py-3 flex items-center justify-between shrink-0" style={{ background: "#161b22" }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-white">{currentSession.repository.fullName}</h1>
              <p className="text-[11px] text-gray-500">
                Issue #{currentSession.issue.number}: {currentSession.issue.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={currentSession.status} />
            {currentSession.pullRequestUrl && (
              <a
                href={currentSession.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors border border-green-500/20"
              >
                View PR <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Toggle Code Panel Button */}
            {hasContainer && (
              <button
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isPanelOpen
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    : "bg-[#21262d] text-gray-300 border-[#30363d] hover:bg-[#30363d]"
                }`}
              >
                {isPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                <span>Code Panel</span>
              </button>
            )}

            <button
              onClick={() => {
                useAuthStore.getState().logout();
                router.push("/auth");
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Main Content — Resizable Split Container */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative select-none">
          {/* ─── LEFT PANEL: Workflow Graph, Activity Feed, Reports, Timeline ─── */}
          <div
            className="flex-1 overflow-y-auto p-6 space-y-6 transition-all"
            style={{ width: isPanelOpen && hasContainer ? `${100 - panelWidth}%` : "100%" }}
          >
            {/* ─── Workflow Graph ─── */}
            <WorkflowGraph
              activeNode={activeNode}
              completedNodes={completedNodes}
              sessionStatus={currentSession.status}
            />

            {/* ─── Supervisor Max Iteration Limit Prompt ─── */}
            {(currentSession.supervisorIterations || 0) >= 25 && currentSession.status !== "COMPLETED" && (
              <div className="rounded-xl border border-amber-500/40 p-4 bg-amber-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-amber-300">Supervisor Max Iteration Limit Reached (25)</h4>
                    <p className="text-[11px] text-amber-400/80">
                      The Supervisor has executed 25 decision cycles. Would you like to reset the limit and continue?
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setSubmittingRevision(true);
                      await api.reviseSession(sessionId, "__continue__");
                      await loadSession();
                      setSubmittingRevision(false);
                    }}
                    disabled={submittingRevision}
                    className="px-3 py-1.5 rounded bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors"
                  >
                    Continue Workflow
                  </button>
                  <button
                    onClick={() => handleApproval("cancel")}
                    disabled={approving}
                    className="px-3 py-1.5 rounded bg-[#21262d] text-gray-300 text-xs hover:bg-[#30363d] transition-colors"
                  >
                    Cancel Session
                  </button>
                </div>
              </div>
            )}

            {/* ─── Persistent Activity & Debug Execution Logs Feed ─── */}
            <ActivityFeed events={allLogs} />

            {/* ─── Reports & Supervisor Decision Timeline Grid ─── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Reports */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Agent Reports</h3>
                <ReportCard
                  title="Planning Report"
                  data={currentSession.planningReport}
                  expanded={expandedReport === "planning"}
                  onToggle={() => setExpandedReport(expandedReport === "planning" ? null : "planning")}
                />
                <ReportCard
                  title="Implementation Report"
                  data={currentSession.implementationReport}
                  expanded={expandedReport === "implementation"}
                  onToggle={() => setExpandedReport(expandedReport === "implementation" ? null : "implementation")}
                />
                <ReportCard
                  title="Validation Report"
                  data={currentSession.validationReport}
                  expanded={expandedReport === "validation"}
                  onToggle={() => setExpandedReport(expandedReport === "validation" ? null : "validation")}
                />
                <ReportCard
                  title="Review Report"
                  data={currentSession.reviewReport}
                  expanded={expandedReport === "review"}
                  onToggle={() => setExpandedReport(expandedReport === "review" ? null : "review")}
                />
              </div>

              {/* Supervisor Decision Log & Execution Timeline */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supervisor Decision Log & Timeline</h3>
                <div className="p-4 rounded-xl border border-[#21262d] max-h-[500px] overflow-y-auto space-y-2" style={{ background: "#161b22" }}>
                  {/* Supervisor Decision Log Entries */}
                  {currentSession.supervisorDecisionLog?.length ? (
                    [...currentSession.supervisorDecisionLog].reverse().map((log, i) => (
                      <div key={`sup-${i}`} className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-purple-300">Supervisor Decision #{log.iteration}</span>
                          <span className="text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-gray-200">{log.decisionSummary}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                            Target: {log.next_agent}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            Phase: {log.workflow_status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : null}

                  {/* Raw Execution Events */}
                  {currentSession.executionHistory?.length ? (
                    [...currentSession.executionHistory].reverse().map((event, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#21262d] transition-colors">
                        <div
                          className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                            event.result === "success"
                              ? "bg-green-500"
                              : event.result === "failed"
                              ? "bg-red-500"
                              : "bg-gray-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-300">{event.component}</span>
                            <span className="text-[10px] text-gray-600">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">{event.action}</p>
                          {event.details && (
                            <p className="text-[10px] text-gray-600 mt-0.5 truncate">{event.details}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : !currentSession.supervisorDecisionLog?.length ? (
                    <p className="text-[12px] text-gray-600 text-center py-8">No events yet</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* ─── RESIZABLE DIVIDER ─── */}
          {isPanelOpen && hasContainer && (
            <div
              onMouseDown={startResizing}
              className="w-1.5 hover:w-2 bg-[#21262d] hover:bg-indigo-500/60 cursor-col-resize flex items-center justify-center transition-all z-20 group"
              title="Drag to resize code panel"
            >
              <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-indigo-300" />
            </div>
          )}

          {/* ─── RIGHT SIDE PANEL: Resizable Monaco Code Explorer / Diff Viewer (Claude Artifact style) ─── */}
          {isPanelOpen && hasContainer && (
            <div
              className="border-l border-[#21262d] flex flex-col h-full bg-[#161b22] z-10 transition-all overflow-hidden"
              style={{ width: `${panelWidth}%` }}
            >
              {/* Side Panel Header */}
              <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between bg-[#0d1117] shrink-0">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-white">Workspace & Code View</span>
                </div>

                {/* View Mode Toggle: Diff View vs Code Explorer */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#21262d]">
                  <button
                    onClick={() => setViewMode("diff")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      viewMode === "diff"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <GitBranch className="w-3 h-3" />
                    Diff View
                  </button>
                  <button
                    onClick={() => setViewMode("explorer")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      viewMode === "explorer"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <FileCode className="w-3 h-3" />
                    Code Explorer
                  </button>
                </div>
              </div>

              {/* Side Panel Body: Monaco Code Explorer / Diff Editor */}
              <div className="flex-1 overflow-hidden p-3 relative">
                {viewMode === "diff" ? (
                  <DiffViewer sessionId={sessionId} />
                ) : (
                  <CodeExplorer sessionId={sessionId} />
                )}
              </div>

              {/* Approval / Human Feedback Section at bottom of side panel */}
              {isApproval && (
                <div className="p-4 border-t border-[#21262d] bg-[#0d1117] space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-white">Human Approval</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproval("approve")}
                        disabled={approving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 transition-colors shadow-lg shadow-green-600/20"
                      >
                        {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Approve & Create PR
                      </button>
                      <button
                        onClick={() => handleApproval("cancel")}
                        disabled={approving}
                        className="px-3 py-1.5 rounded-lg bg-[#21262d] text-gray-300 text-xs font-medium hover:bg-[#30363d] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Revision Text Area */}
                  <div className="space-y-1.5">
                    <textarea
                      value={revisionPrompt}
                      onChange={(e) => setRevisionPrompt(e.target.value)}
                      placeholder="Request changes from Supervisor... (e.g. 'Add unit test for math.js add function')"
                      rows={2}
                      className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleRevision}
                        disabled={!revisionPrompt.trim() || submittingRevision}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-40 transition-colors border border-amber-500/30"
                      >
                        {submittingRevision ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Request Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

// ─── Sub-components ───

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-green-500/10 text-green-400 border-green-500/20",
    FAILED: "bg-red-500/10 text-red-400 border-red-500/20",
    CANCELLED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    WAITING_FOR_APPROVAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
        styles[status] || "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function getFormattedReportText(data: any): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.rawResponse && typeof data.rawResponse === "string") {
    return data.rawResponse;
  }

  // Convert object key-values to Markdown
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "rawResponse") continue;
    const formattedKey = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    if (Array.isArray(value)) {
      lines.push(`### ${formattedKey}`);
      value.forEach((v) => lines.push(`- ${typeof v === "object" ? JSON.stringify(v) : v}`));
      lines.push("");
    } else if (typeof value === "object" && value !== null) {
      lines.push(`### ${formattedKey}`);
      lines.push(`\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``);
      lines.push("");
    } else {
      lines.push(`**${formattedKey}**: ${value}`);
    }
  }

  return lines.join("\n");
}

function ReportCard({
  title,
  data,
  expanded,
  onToggle,
}: {
  title: string;
  data: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!data) {
    return (
      <div className="p-3 rounded-xl border border-[#21262d] opacity-40" style={{ background: "#161b22" }}>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-[11px] font-medium text-gray-500">{title}</span>
          <span className="text-[10px] text-gray-600 ml-auto">Pending</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#21262d] overflow-hidden" style={{ background: "#161b22" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-[#21262d] transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[11px] font-medium text-gray-300">{title}</span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="text-[12px] text-gray-200 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed border border-[#30363d] font-sans" style={{ background: "#0d1117" }}>
            {getFormattedReportText(data)}
          </div>
        </div>
      )}
    </div>
  );
}
