"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Node,
  Edge,
  Position,
  Handle,
  NodeProps,
  BackgroundVariant,
  MarkerType,
  useNodesState,
  useEdgesState,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  GitBranch, Zap, Bot, FileCode, TestTube, Eye,
  CheckCircle2, XCircle, Loader2, X, User,
  Terminal, Search, FileText, Code2, Globe,
} from "lucide-react";

// ─── Agent tool descriptions ───
const AGENT_INFO: Record<string, {
  role: string;
  description: string;
  tools: Array<{ name: string; icon: any; desc: string }>;
}> = {
  environment: {
    role: "Environment Agent",
    description: "Deterministic — Clones repo, creates Docker container, installs dependencies, verifies build/test commands.",
    tools: [
      { name: "Docker", icon: Terminal, desc: "Container creation & management" },
      { name: "Git Clone", icon: GitBranch, desc: "Repository cloning" },
      { name: "Dependency Install", icon: Code2, desc: "npm install / pip install" },
    ],
  },
  analysis: {
    role: "Repository Analyzer",
    description: "Deterministic — Detects ecosystem, package manager, build tools, linter, test framework, project structure.",
    tools: [
      { name: "File Scanner", icon: Search, desc: "Scans directory structure" },
      { name: "Config Parser", icon: FileText, desc: "Parses package.json, pyproject.toml, etc." },
    ],
  },
  supervisor: {
    role: "Supervisor Agent (Tech Lead)",
    description: "Central intelligence — makes ALL routing decisions, evaluates worker reports, communicates with user, owns PR creation.",
    tools: [
      { name: "Workflow State", icon: Bot, desc: "Maintains session state via LangGraph" },
      { name: "Dynamic Dispatch", icon: Zap, desc: "Invokes Planner, Writer, Tester, or Reviewer" },
      { name: "User Gateway", icon: User, desc: "Controls human interaction & PR creation" },
    ],
  },
  planner: {
    role: "Planner Agent (Architect)",
    description: "Read-only analysis — understands the issue, explores the codebase, creates a detailed implementation plan.",
    tools: [
      { name: "read_file", icon: FileText, desc: "Read repository files" },
      { name: "search_text", icon: Search, desc: "Search code with ripgrep" },
      { name: "find_files", icon: Search, desc: "Find files by pattern" },
      { name: "terminal", icon: Terminal, desc: "Run shell commands" },
      { name: "git_log", icon: GitBranch, desc: "View commit history" },
      { name: "web_search", icon: Globe, desc: "Search web for documentation" },
    ],
  },
  writer: {
    role: "Writer Agent (Engineer)",
    description: "Implements code changes — modifies files, runs build & lint to verify syntax, follows Supervisor Instructions.",
    tools: [
      { name: "read_file", icon: FileText, desc: "Read files" },
      { name: "write_file", icon: FileCode, desc: "Create/modify files" },
      { name: "delete_file", icon: XCircle, desc: "Delete files" },
      { name: "terminal", icon: Terminal, desc: "Run commands" },
      { name: "build", icon: Code2, desc: "Run build command" },
      { name: "linter", icon: Eye, desc: "Run linter" },
      { name: "git_diff", icon: GitBranch, desc: "View changes" },
    ],
  },
  tester: {
    role: "Tester Agent (QA Engineer)",
    description: "Validates implementation — runs build, test suite, and linter inside Docker container. Reports pass/fail facts.",
    tools: [
      { name: "build", icon: Code2, desc: "Run build" },
      { name: "test", icon: TestTube, desc: "Run test suite" },
      { name: "linter", icon: Eye, desc: "Run linter" },
      { name: "terminal", icon: Terminal, desc: "Run commands" },
      { name: "git_diff", icon: GitBranch, desc: "View diff" },
      { name: "web_search", icon: Globe, desc: "Search for testing docs or error fixes" },
    ],
  },
  reviewer: {
    role: "Reviewer Agent (Code Reviewer)",
    description: "Evaluates quality — examines diff, checks completeness and architecture compliance. Does NOT make routing decisions.",
    tools: [
      { name: "read_file", icon: FileText, desc: "Read files" },
      { name: "search_text", icon: Search, desc: "Search code" },
      { name: "git_diff", icon: GitBranch, desc: "Review diff" },
      { name: "git_log", icon: GitBranch, desc: "Check commits" },
    ],
  },
  user: {
    role: "User (Repository Owner)",
    description: "Human participant — inspects diffs/reports, approves PR creation, or provides revision feedback to Supervisor.",
    tools: [
      { name: "Diff Viewer", icon: FileCode, desc: "Review before/after code patch" },
      { name: "Code Explorer", icon: Code2, desc: "Browse workspace" },
      { name: "Revision Request", icon: Terminal, desc: "Send feedback to Supervisor" },
    ],
  },
};

// ─── Node icon map ───
const NODE_ICONS: Record<string, any> = {
  environment: GitBranch,
  analysis: Zap,
  supervisor: Bot,
  planner: Bot,
  writer: FileCode,
  tester: TestTube,
  reviewer: Eye,
  user: User,
};

// ─── Node color map ───
const NODE_COLORS: Record<string, { bg: string; border: string; glow: string; iconColor: string }> = {
  environment: { bg: "#1e3a5f", border: "#3b82f6", glow: "rgba(59,130,246,0.5)", iconColor: "#60a5fa" },
  analysis: { bg: "#1a3a4a", border: "#06b6d4", glow: "rgba(6,182,212,0.5)", iconColor: "#22d3ee" },
  supervisor: { bg: "#2d1b69", border: "#8b5cf6", glow: "rgba(139,92,246,0.6)", iconColor: "#c084fc" },
  planner: { bg: "#301b4f", border: "#a855f7", glow: "rgba(168,85,247,0.5)", iconColor: "#c084fc" },
  writer: { bg: "#14412a", border: "#22c55e", glow: "rgba(34,197,94,0.5)", iconColor: "#4ade80" },
  tester: { bg: "#3d2f0a", border: "#eab308", glow: "rgba(234,179,8,0.5)", iconColor: "#facc15" },
  reviewer: { bg: "#3d1335", border: "#ec4899", glow: "rgba(236,72,153,0.5)", iconColor: "#f472b6" },
  user: { bg: "#1e2254", border: "#6366f1", glow: "rgba(99,102,241,0.5)", iconColor: "#818cf8" },
};

// Edge active text labels
const EDGE_ACTIVE_LABELS: Record<string, string> = {
  analysis: "building docker...",
  supervisor: "analyzing repo...",
  planner: "dispatching plan...",
  writer: "writing code...",
  tester: "testing build...",
  reviewer: "reviewing diff...",
  user: "awaiting approval / PR",
};

// ─── Custom Node Component ───
interface WorkflowNodeData {
  label: string;
  nodeId: string;
  description: string;
  status: "idle" | "active" | "completed" | "failed";
  onNodeClick: (nodeId: string) => void;
  [key: string]: unknown;
}

function WorkflowNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const { label, nodeId, description, status, onNodeClick } = data;
  const Icon = NODE_ICONS[nodeId] || Bot;
  const colors = NODE_COLORS[nodeId] || NODE_COLORS.supervisor;
  const isSupervisor = nodeId === "supervisor";

  const statusIndicator = () => {
    if (status === "completed") return (
      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center shadow-lg shadow-green-500/40 z-10">
        <CheckCircle2 className="w-3 h-3 text-white" />
      </div>
    );
    if (status === "active") return (
      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg shadow-indigo-500/50 z-10 animate-bounce">
        <Loader2 className="w-3 h-3 text-white animate-spin" />
      </div>
    );
    if (status === "failed") return (
      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#ef4444] flex items-center justify-center shadow-lg shadow-red-500/40 z-10">
        <XCircle className="w-3 h-3 text-white" />
      </div>
    );
    return null;
  };

  return (
    <div className="relative cursor-grab active:cursor-grabbing group" onClick={() => onNodeClick(nodeId)}>
      <Handle type="target" position={Position.Left} id="target-left" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="target" position={Position.Top} id="target-top" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="target" position={Position.Right} id="target-right" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="!bg-transparent !border-0 !w-3 !h-3" />

      <div
        className={`
          relative flex flex-col items-center justify-center rounded-xl border-2 transition-all duration-300
          ${isSupervisor ? "px-5 py-3.5 min-w-[140px] min-h-[90px]" : "px-4 py-3 min-w-[125px] min-h-[75px]"}
          ${status === "active" ? "scale-105 shadow-2xl" : ""}
          ${status === "idle" ? "opacity-75 hover:opacity-100" : "opacity-100"}
        `}
        style={{
          backgroundColor: colors.bg,
          borderColor: status === "active" ? colors.border : status === "completed" ? "#22c55e" : status === "failed" ? "#ef4444" : `${colors.border}60`,
          boxShadow: status === "active" ? `0 0 24px ${colors.glow}, 0 0 48px ${colors.glow}` : status === "completed" ? "0 0 12px rgba(34,197,94,0.25)" : "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {statusIndicator()}

        <div className={`rounded-lg p-1.5 mb-1 ${isSupervisor ? "p-2 bg-purple-500/20" : ""}`} style={{ backgroundColor: `${colors.border}20` }}>
          <Icon className={`${isSupervisor ? "w-4.5 h-4.5" : "w-4 h-4"}`} style={{ color: status === "completed" ? "#22c55e" : status === "failed" ? "#ef4444" : colors.iconColor }} />
        </div>

        <span className={`font-semibold text-center leading-tight text-white ${isSupervisor ? "text-xs font-bold" : "text-[11px]"}`}>
          {label}
        </span>
        <span className="text-[9px] text-gray-400 text-center mt-0.5 leading-tight max-w-[110px]">
          {description}
        </span>
      </div>

      <Handle type="source" position={Position.Right} id="source-right" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="source" position={Position.Left} id="source-left" className="!bg-transparent !border-0 !w-3 !h-3" />
      <Handle type="source" position={Position.Top} id="source-top" className="!bg-transparent !border-0 !w-3 !h-3" />
    </div>
  );
}

// ─── Node Info Panel ───
function NodeInfoPanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const info = AGENT_INFO[nodeId];
  if (!info) return null;
  const colors = NODE_COLORS[nodeId] || NODE_COLORS.supervisor;

  return (
    <div className="absolute top-4 right-4 w-80 z-50 animate-fade-in">
      <div className="rounded-xl border-2 p-4 shadow-2xl backdrop-blur-sm" style={{ backgroundColor: `${colors.bg}ee`, borderColor: `${colors.border}80` }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">{info.role}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-gray-300 mb-3 leading-relaxed">{info.description}</p>

        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Capabilities</span>
          {info.tools.map((t) => {
            const ToolIcon = t.icon;
            return (
              <div key={t.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: `${colors.border}15` }}>
                <ToolIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.iconColor }} />
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-white block">{t.name}</span>
                  <span className="text-[9px] text-gray-400">{t.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Initial Graph Builder with Dynamic Edge & Text Feedback ───
function buildInitialGraphElements(
  activeNode: string,
  completedNodes: Set<string>,
  sessionStatus: string,
  onNodeClick: (nodeId: string) => void,
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const getStatus = (id: string): "idle" | "active" | "completed" | "failed" => {
    if (sessionStatus === "FAILED" && id === activeNode) return "failed";
    if (completedNodes.has(id)) return "completed";
    if (id === activeNode) return "active";
    return "idle";
  };

  // Tiered layout coordinates matching Image 2
  const positions: Record<string, { x: number; y: number }> = {
    environment: { x: 0, y: 140 },
    analysis: { x: 170, y: 140 },
    supervisor: { x: 350, y: 140 },
    user: { x: 350, y: 310 },
    planner: { x: 550, y: 20 },
    writer: { x: 750, y: 90 },
    tester: { x: 750, y: 220 },
    reviewer: { x: 550, y: 290 },
  };

  const nodeList: Array<{ id: string; label: string; desc: string }> = [
    { id: "environment", label: "Environment", desc: "Docker setup" },
    { id: "analysis", label: "Analysis", desc: "Repo ecosystem" },
    { id: "supervisor", label: "Supervisor", desc: "Tech Lead" },
    { id: "planner", label: "Planner", desc: "Architect" },
    { id: "writer", label: "Writer", desc: "Engineer" },
    { id: "tester", label: "Tester", desc: "QA Engineer" },
    { id: "reviewer", label: "Reviewer", desc: "Code Reviewer" },
    { id: "user", label: "User", desc: "Repository Owner" },
  ];

  const nodes: Node<WorkflowNodeData>[] = nodeList.map((n) => ({
    id: n.id,
    type: "workflowNode",
    position: positions[n.id],
    data: {
      label: n.label,
      nodeId: n.id,
      description: n.desc,
      status: getStatus(n.id),
      onNodeClick,
    },
    draggable: true,
    selectable: true,
  }));

  const getEdgeFeedback = (targetNodeId: string, defaultLabel?: string) => {
    const isTargetActive = activeNode === targetNodeId;
    const isTargetCompleted = completedNodes.has(targetNodeId);
    const targetColors = NODE_COLORS[targetNodeId] || NODE_COLORS.supervisor;

    if (isTargetActive) {
      return {
        animated: true,
        label: EDGE_ACTIVE_LABELS[targetNodeId] || defaultLabel || "executing...",
        labelStyle: { fill: targetColors.iconColor, fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: "#161b22", fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        style: {
          stroke: targetColors.border,
          strokeWidth: 3,
          filter: `drop-shadow(0 0 8px ${targetColors.glow})`,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: targetColors.border, width: 12, height: 12 },
      };
    }

    if (isTargetCompleted) {
      return {
        animated: false,
        label: "completed ✓",
        labelStyle: { fill: "#4ade80", fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "#062312", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: "#22c55e",
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#22c55e", width: 10, height: 10 },
      };
    }

    return {
      animated: false,
      label: defaultLabel,
      labelStyle: { fill: "#6b7280", fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: "#111827", fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: "#374151",
        strokeWidth: 1.5,
        strokeDasharray: "4 3",
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#374151", width: 8, height: 8 },
    };
  };

  const edges: Edge[] = [
    {
      id: "e-env-analysis",
      source: "environment",
      target: "analysis",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("analysis"),
    },
    {
      id: "e-analysis-sup",
      source: "analysis",
      target: "supervisor",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("supervisor"),
    },
    {
      id: "e-sup-planner",
      source: "supervisor",
      target: "planner",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("planner"),
    },
    {
      id: "e-sup-writer",
      source: "supervisor",
      target: "writer",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("writer"),
    },
    {
      id: "e-sup-tester",
      source: "supervisor",
      target: "tester",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("tester"),
    },
    {
      id: "e-sup-reviewer",
      source: "supervisor",
      target: "reviewer",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "smoothstep",
      ...getEdgeFeedback("reviewer"),
    },
    {
      id: "e-sup-user",
      source: "supervisor",
      target: "user",
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
      type: "smoothstep",
      ...getEdgeFeedback("user", "review / PR"),
    },
  ];

  return { nodes, edges };
}

// ─── Inner Workflow Graph (with auto fitView on container resize) ───
interface WorkflowGraphProps {
  activeNode: string;
  completedNodes: Set<string>;
  sessionStatus: string;
}

const nodeTypes = { workflowNode: WorkflowNode };

function WorkflowGraphContent({ activeNode, completedNodes, sessionStatus }: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const initialElements = useMemo(
    () => buildInitialGraphElements(activeNode, completedNodes, sessionStatus, handleNodeClick),
    [activeNode, completedNodes, sessionStatus, handleNodeClick]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialElements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  // Auto-fit view whenever container size changes or side panel opens/resizes
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.1, duration: 200 });
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fitView]);

  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        const getStatus = (id: string): "idle" | "active" | "completed" | "failed" => {
          if (sessionStatus === "FAILED" && id === activeNode) return "failed";
          if (completedNodes.has(id)) return "completed";
          if (id === activeNode) return "active";
          return "idle";
        };
        return {
          ...n,
          data: {
            ...n.data,
            status: getStatus(n.id),
            onNodeClick: handleNodeClick,
          },
        };
      })
    );
    setEdges(initialElements.edges);
    fitView({ padding: 0.1, duration: 200 });
  }, [activeNode, completedNodes, sessionStatus, handleNodeClick, setNodes, setEdges, initialElements.edges, fitView]);

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden border border-[#1f2937] w-full" style={{ height: 430, background: "#0d1117" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.2}
        maxZoom={1.8}
        panOnDrag={true}
        zoomOnScroll={true}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1f2937" gap={20} size={1} />
        <Controls
          className="!bg-[#161b22] !border !border-[#30363d] !rounded-xl !shadow-2xl overflow-hidden [&>button]:!bg-[#161b22] [&>button]:!border-b [&>button]:!border-[#30363d] [&>button]:!fill-[#c9d1d9] [&>button:hover]:!bg-[#21262d]"
          showInteractive={false}
        />
      </ReactFlow>

      {selectedNode && (
        <NodeInfoPanel nodeId={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}

// ─── Exported Workflow Graph Component with ReactFlowProvider ───
export default function WorkflowGraph(props: WorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowGraphContent {...props} />
    </ReactFlowProvider>
  );
}
