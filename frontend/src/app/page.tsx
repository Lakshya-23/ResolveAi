"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import WorkflowGraph from "@/components/workflow-graph";
import {
  GitBranch,
  Zap,
  ArrowRight,
  ChevronRight,
  Bot,
  FileCode,
  TestTube,
  Eye,
  LogOut,
  User,
  Box,
  Sliders,
  Cpu,
  Layers,
  FolderTree,
  FileSearch,
  Compass,
} from "lucide-react";

const SUPPORTED_PROVIDERS = [
  {
    name: "Anthropic",
    models: "e.g. Claude 3.5 Sonnet & Claude 3 Opus",
    badge: "Anthropic API",
    color: "border-amber-500/30 hover:border-amber-500/60 bg-amber-500/[0.04]",
    tagBg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    name: "OpenAI",
    models: "e.g. GPT-4o & GPT-4o-mini",
    badge: "OpenAI API",
    color: "border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/[0.04]",
    tagBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    name: "Groq",
    models: "e.g. Llama-3.3-70B & DeepSeek-R1",
    badge: "Groq LPU",
    color: "border-orange-500/30 hover:border-orange-500/60 bg-orange-500/[0.04]",
    tagBg: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  {
    name: "Google AI Studio",
    models: "e.g. Gemini 2.0 Flash & Gemini 1.5 Pro",
    badge: "Google AI",
    color: "border-sky-500/30 hover:border-sky-500/60 bg-sky-500/[0.04]",
    tagBg: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
];

const AGENT_TEAM = [
  {
    title: "Supervisor Agent",
    subtitle: "Tech Lead Orchestrator",
    icon: Bot,
    color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30 hover:border-indigo-500/60",
    badgeColor: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20",
    desc: "Central intelligence evaluating worker reports, executing dynamic routing decisions, and publishing review-ready Pull Requests.",
    tools: ["LangGraph State", "LLM Dispatch", "GitHub PR Engine"],
  },
  {
    title: "Planner Agent",
    subtitle: "Software Architect",
    icon: GitBranch,
    color: "text-purple-400 bg-purple-500/15 border-purple-500/30 hover:border-purple-500/60",
    badgeColor: "text-purple-300 bg-purple-500/10 border-purple-500/20",
    desc: "Explores repository structure, analyzes dependency graphs, and produces step-by-step strategies in .resolveai/planning_report.md.",
    tools: ["list_directory", "tree", "stat", "read_file", "search_text", "find_files"],
  },
  {
    title: "Coding Agent",
    subtitle: "Full-Stack Engineer",
    icon: FileCode,
    color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:border-emerald-500/60",
    badgeColor: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    desc: "Executes precise code modifications, updates tests, and manages workspace files inside the container.",
    tools: ["create_file", "replace_file_content", "write_file", "delete_file", "terminal"],
  },
  {
    title: "Tester Agent",
    subtitle: "QA Engineer",
    icon: TestTube,
    color: "text-amber-400 bg-amber-500/15 border-amber-500/30 hover:border-amber-500/60",
    badgeColor: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    desc: "Executes containerized build scripts, unit test suites, and linters, generating detailed .resolveai/validation_report.md summaries.",
    tools: ["build", "test", "linter", "terminal", "git_diff"],
  },
  {
    title: "Reviewer Agent",
    subtitle: "Code Quality Auditor",
    icon: Eye,
    color: "text-rose-400 bg-rose-500/15 border-rose-500/30 hover:border-rose-500/60",
    badgeColor: "text-rose-300 bg-rose-500/10 border-rose-500/20",
    desc: "Audits architectural compliance, maintainability, and edge cases, producing immutable .resolveai/review_report.md assessments.",
    tools: ["git_diff", "git_status", "git_log", "read_file"],
  },
];

const PLATFORM_CAPABILITIES = [
  {
    icon: Box,
    title: "Isolated Docker Sandbox",
    desc: "Deterministic container runtime with Docker/Podman socket auto-detection, dependency installation, and Git author identity setup.",
    badge: "Container Execution",
    color: "text-sky-400 bg-sky-500/15 border-sky-500/30",
  },
  {
    icon: Sliders,
    title: "Per-Agent Model Customization",
    desc: "Independently assign LLM models and primary/fallback providers per agent (e.g. GPT-4o for Supervisor, Claude Sonnet for Engineer).",
    badge: "LLM Control",
    color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
  },
  {
    icon: Cpu,
    title: "Custom Agent Skills & Prompts",
    desc: "Inject domain-specific rules, architectural guidelines, and special instruction prompts on a per-agent basis.",
    badge: "Prompt Engineering",
    color: "text-purple-400 bg-purple-500/15 border-purple-500/30",
  },
  {
    icon: FolderTree,
    title: "Monaco Code Sandbox & Diff Viewer",
    desc: "VS Code-style side panel featuring collapsible workspace folder trees, line counters, and side-by-side git diff view.",
    badge: "IDE Integration",
    color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    icon: FileSearch,
    title: "Directory & Metadata Inspection",
    desc: "Structured list_directory, tree, and stat tools for instant codebase hierarchy navigation without search overhead.",
    badge: "Fast Navigation",
    color: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  },
  {
    icon: Layers,
    title: "SQLite & Real-Time Socket.IO",
    desc: "Live streaming event feed paired with WAL-mode SQLite storage for complete activity logging and session management.",
    badge: "Audit Logging",
    color: "text-rose-400 bg-rose-500/15 border-rose-500/30",
  },
];

const WORKFLOW_PIPELINE = [
  { step: "01", id: "environment", name: "Environment", desc: "Docker setup & repo clone", icon: Box, badgeColor: "text-sky-300 bg-sky-500/15 border-sky-500/30" },
  { step: "02", id: "analysis", name: "Analysis", desc: "Ecosystem & dependency audit", icon: FileSearch, badgeColor: "text-purple-300 bg-purple-500/15 border-purple-500/30" },
  { step: "03", id: "supervisor", name: "Supervisor", desc: "Tech Lead Orchestrator", icon: Bot, badgeColor: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30" },
  { step: "04", id: "planner", name: "Planner", desc: "Architect strategy (.resolveai)", icon: GitBranch, badgeColor: "text-purple-300 bg-purple-500/15 border-purple-500/30" },
  { step: "05", id: "writer", name: "Writer", desc: "Code & test file edits", icon: FileCode, badgeColor: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" },
  { step: "06", id: "tester", name: "Tester", desc: "Build & unit test execution", icon: TestTube, badgeColor: "text-amber-300 bg-amber-500/15 border-amber-500/30" },
  { step: "07", id: "reviewer", name: "Reviewer", desc: "Quality & security audit", icon: Eye, badgeColor: "text-rose-300 bg-rose-500/15 border-rose-500/30" },
  { step: "08", id: "user", name: "User Approval", desc: "Diff review & PR creation", icon: User, badgeColor: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30" },
];

export default function HomePage() {
  const { isAuthenticated, username, logout } = useAuthStore();

  return (
    <div className="flex flex-col min-h-[100dvh] text-gray-100 selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden" style={{ background: "#0a0c10" }}>
      {/* Top Bar Navigation */}
      <header className="border-b border-[#1f242d] px-6 py-3.5 flex items-center justify-between sticky top-0 z-50 bg-[#0e1117]/95 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black shadow-md shadow-white/10">
            <Zap className="w-4.5 h-4.5 text-black fill-black" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-white font-mono">ResolvAI</span>
          </div>
        </div>

        <nav className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#21262d] text-xs text-gray-300">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono">{username || "Developer"}</span>
              </div>
              <Link
                href="/session/new"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all duration-150 active:scale-[0.98] flex items-center gap-2"
              >
                <span>New Session</span>
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </Link>
              <Link
                href="/history"
                className="px-3 py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-[#161b22] transition-colors"
              >
                History
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all duration-150 active:scale-[0.98] flex items-center gap-2"
            >
              <span>Connect GitHub</span>
              <GitBranch className="w-3.5 h-3.5 text-white" />
            </Link>
          )}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-24 max-w-5xl mx-auto w-full">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] text-white max-w-4xl mx-auto font-mono">
            Autonomous AI Engineering <br />
            <span className="text-sky-400">From Issue to Pull Request</span>
          </h1>

          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed max-w-2xl mx-auto font-normal pt-1">
            ResolvAI coordinates five specialized AI agents <span className="text-white font-bold">Supervisor</span>, <span className="text-white font-bold">Architect</span>, <span className="text-white font-bold">Engineer</span>, <span className="text-white font-bold">QA Tester</span>, and <span className="text-white font-bold">Reviewer</span> inside isolated Docker containers to resolve repository issues deterministically.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={isAuthenticated ? "/session/new" : "/auth"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition-all duration-150 active:scale-[0.98]"
            >
              <span>{isAuthenticated ? "Launch Engineering Session" : "Connect GitHub Account"}</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </Link>

            {isAuthenticated && (
              <Link
                href="/history"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#161b22] hover:bg-[#21262d] border border-[#21262d] text-gray-300 font-medium text-xs transition-colors"
              >
                <span>View Session History</span>
                <Compass className="w-3.5 h-3.5 text-gray-400" />
              </Link>
            )}
          </div>
        </div>

        {/* Supported Providers Bar */}
        <div className="mt-20 w-full">
          <div className="flex items-center justify-between mb-3 px-1 border-b border-[#1f242d] pb-2">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-400">
              Supported LLM Providers
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SUPPORTED_PROVIDERS.map((provider) => (
              <div
                key={provider.name}
                className={`p-4 rounded-xl bg-[#111318] border transition-all duration-200 ${provider.color} space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">{provider.name}</span>
                  <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${provider.tagBg}`}>
                    {provider.badge}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-mono">{provider.models}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bento Grid — Agent Engineering Team */}
        <div className="mt-20 w-full">
          <div className="flex items-center justify-between mb-4 border-b border-[#1f242d] pb-3">
            <div>
              <h2 className="text-lg font-bold text-white font-mono">Autonomous Agent Engineering Team</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Five specialized agents operating under strict role boundaries and container tool scoping.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_TEAM.map((agent) => (
              <div
                key={agent.title}
                className={`p-5 rounded-xl bg-[#111318] border transition-all duration-200 flex flex-col justify-between space-y-4 ${agent.color}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${agent.color}`}>
                      <agent.icon className="w-4.5 h-4.5" />
                    </div>
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${agent.badgeColor}`}>
                      Agent Role
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white font-mono">{agent.title}</h3>
                  <p className="text-[11px] font-mono mt-0.5 opacity-90">{agent.subtitle}</p>
                  <p className="text-xs text-gray-400 mt-2.5 leading-relaxed">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Capabilities Grid */}
        <div className="mt-20 w-full">
          <div className="mb-4 border-b border-[#1f242d] pb-3">
            <h2 className="text-lg font-bold text-white font-mono">Platform Capabilities</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Production-ready engineering environment designed for self-hosted developer speed and precision.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORM_CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="p-5 rounded-xl bg-[#111318] border border-[#1f242d] space-y-3 hover:border-[#30363d] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${cap.color}`}>
                    <cap.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${cap.color}`}>
                    {cap.badge}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-white font-mono">{cap.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Real Interactive ReactFlow Multi-Agent Workflow Graph */}
        <div className="mt-20 w-full">
          <div className="mb-6 border-b border-[#1f242d] pb-3">
            <h2 className="text-lg font-bold text-white font-mono">Multi-Agent Orchestration Architecture</h2>
            <p className="text-xs text-gray-400 mt-0.5">LangGraph orchestrator & worker dispatch topology graph</p>
          </div>

          <div className="w-full">
            <WorkflowGraph
              sessionStatus="IDLE"
              completedNodes={new Set()}
            />
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 w-full p-8 rounded-xl bg-[#111318] border border-[#1f242d] text-center space-y-4">
          <div className="max-w-md mx-auto space-y-3">
            <h2 className="text-xl font-bold text-white font-mono">Ready to Resolve GitHub Issues?</h2>
            <p className="text-xs text-gray-400">
              Connect your GitHub account, configure your multi-agent model presets, and start resolving bugs autonomously.
            </p>
            <div className="pt-2">
              <Link
                href={isAuthenticated ? "/session/new" : "/auth"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition-all duration-150 active:scale-[0.98]"
              >
                <span>{isAuthenticated ? "Launch Engineering Session" : "Connect GitHub"}</span>
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1f242d] px-6 py-6 text-center text-xs text-gray-500" style={{ background: "#0a0c10" }}>
        <p className="font-mono">ResolvAI — Autonomous Multi-Agent Software Engineering Platform</p>
      </footer>
    </div>
  );
}
