"use client";

import { useEffect, useRef } from "react";
import {
  FileCode, Terminal, Search, GitBranch, TestTube, Eye,
  FileText, Loader2, CheckCircle2, XCircle, Bot, Zap,
  Code2, Globe, Trash2,
} from "lucide-react";

// ─── Types ───
export interface ActivityEvent {
  id: string;
  timestamp: string;
  agent: string;
  type: "agent_started" | "agent_completed" | "agent_failed" | "tool_invoked" | "tool_completed" | "tool_failed" | "info";
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  message?: string;
}

// ─── Tool Icon Mapping ───
function getToolIcon(toolName: string) {
  const map: Record<string, any> = {
    read_file: FileText,
    write_file: FileCode,
    delete_file: Trash2,
    search_text: Search,
    find_files: Search,
    terminal: Terminal,
    build: Code2,
    test: TestTube,
    linter: Eye,
    git_status: GitBranch,
    git_diff: GitBranch,
    git_log: GitBranch,
    web_search: Globe,
    get_repository_profile: Bot,
    get_repository_context: Bot,
  };
  const Icon = map[toolName] || Terminal;
  return <Icon className="w-3.5 h-3.5" />;
}

// ─── Agent color mapping ───
function getAgentColor(agent: string): { text: string; bg: string; border: string } {
  const map: Record<string, { text: string; bg: string; border: string }> = {
    supervisor: { text: "text-purple-300 font-bold", bg: "bg-purple-500/20", border: "border-purple-500/40" },
    planner: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
    writer: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
    tester: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
    reviewer: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30" },
    environment: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
    analysis: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
    orchestrator: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30" },
  };
  return map[agent] || { text: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/30" };
}

// ─── Friendly tool descriptions ───
function describeToolCall(tool: string, args?: Record<string, any>): string {
  if (!args) return tool;
  switch (tool) {
    case "read_file": return `Reading ${args.path || "file"}`;
    case "write_file": return `Editing ${args.path || "file"}`;
    case "delete_file": return `Deleting ${args.path || "file"}`;
    case "search_text": return `Searching for "${args.pattern || "..."}"`;
    case "find_files": return `Finding files matching "${args.pattern || "..."}"`;
    case "terminal": return `Running: ${(args.command || "").slice(0, 60)}${(args.command || "").length > 60 ? "..." : ""}`;
    case "build": return "Running build";
    case "test": return "Running tests";
    case "linter": return "Running linter";
    case "git_status": return "Checking git status";
    case "git_diff": return "Viewing git diff";
    case "git_log": return "Viewing git log";
    case "web_search": return `Searching: "${(args.query || "").slice(0, 50)}"`;
    case "get_repository_profile": return "Loading repository profile";
    case "get_repository_context": return "Loading repository context";
    default: return tool;
  }
}

// ─── Single Activity Event Renderer ───
function ActivityItem({ event }: { event: ActivityEvent }) {
  const agentColors = getAgentColor(event.agent);
  const time = new Date(event.timestamp).toLocaleTimeString();

  // Agent started
  if (event.type === "agent_started") {
    return (
      <div className="flex items-start gap-3 py-2 animate-fade-in">
        <div className="mt-0.5 w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold capitalize ${agentColors.text}`}>{event.agent}</span>
            <span className="text-[10px] text-gray-500">{time}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{event.message || "Started"}</p>
        </div>
        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0 mt-1" />
      </div>
    );
  }

  // Agent completed
  if (event.type === "agent_completed") {
    return (
      <div className="flex items-start gap-3 py-2 animate-fade-in">
        <div className="mt-0.5 w-6 h-6 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold capitalize ${agentColors.text}`}>{event.agent}</span>
            <span className="text-[10px] text-gray-500">{time}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{event.message || "Completed"}</p>
        </div>
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-1" />
      </div>
    );
  }

  // Agent failed
  if (event.type === "agent_failed") {
    return (
      <div className="flex items-start gap-3 py-2 animate-fade-in">
        <div className="mt-0.5 w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <XCircle className="w-3.5 h-3.5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold capitalize ${agentColors.text}`}>{event.agent}</span>
            <span className="text-[10px] text-gray-500">{time}</span>
          </div>
          <p className="text-[11px] text-red-400 mt-0.5">{event.message || "Failed"}</p>
        </div>
      </div>
    );
  }

  // Tool invoked
  if (event.type === "tool_invoked") {
    const description = describeToolCall(event.tool || "", event.args);
    return (
      <div className="flex items-start gap-3 py-1.5 pl-4 animate-fade-in">
        <div className="mt-0.5 w-5 h-5 rounded bg-[#2d2d2d] flex items-center justify-center flex-shrink-0 text-gray-400">
          {getToolIcon(event.tool || "")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-300 font-mono truncate">{description}</p>
        </div>
        <CheckCircle2 className="w-3 h-3 text-green-500/70 flex-shrink-0 mt-0.5" />
      </div>
    );
  }

  // Tool completed
  if (event.type === "tool_completed") {
    const description = describeToolCall(event.tool || "", event.args);
    const isSuccess = !event.result?.toLowerCase().includes("fail") && !event.result?.toLowerCase().includes("error");
    return (
      <div className="flex items-start gap-3 py-1.5 pl-4 animate-fade-in">
        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSuccess ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {getToolIcon(event.tool || "")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-300 font-mono truncate">{description}</p>
          {event.result && (
            <p className={`text-[10px] mt-0.5 truncate ${isSuccess ? "text-gray-500" : "text-red-400"}`}>
              {event.result.slice(0, 120)}{event.result.length > 120 ? "..." : ""}
            </p>
          )}
        </div>
        {isSuccess ? (
          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
        )}
      </div>
    );
  }

  // Generic info
  return (
    <div className="flex items-start gap-3 py-1.5 animate-fade-in">
      <div className="mt-0.5 w-5 h-5 rounded bg-[#2d2d2d] flex items-center justify-center flex-shrink-0 text-gray-400">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400">{event.message || "Event"}</p>
      </div>
    </div>
  );
}

// ─── Main Activity Feed ───
interface ActivityFeedProps {
  events: ActivityEvent[];
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-[#1f2937] p-6 text-center" style={{ background: "#0d1117" }}>
        <Bot className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-[12px] text-gray-500">Waiting for agent activity...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1f2937] overflow-hidden" style={{ background: "#0d1117" }}>
      <div className="px-3 py-2 border-b border-[#1f2937] flex items-center gap-2" style={{ background: "#161b22" }}>
        <Zap className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] font-semibold text-gray-300">Live Execution</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono ml-auto">
          {events.length} events
        </span>
      </div>

      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-700">
        {events.map((event) => (
          <ActivityItem key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
