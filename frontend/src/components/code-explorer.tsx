"use client";

import { useEffect, useState, useCallback } from "react";
import * as api from "@/lib/api";
import Editor from "@monaco-editor/react";
import {
  FileCode, Folder, FolderOpen, Search, Copy, Check,
  Code2, RefreshCw, FileText, FileJson, Terminal,
  ChevronRight, ChevronDown,
} from "lucide-react";

interface CodeExplorerProps {
  sessionId: string;
}

interface TreeNodeData {
  id: string;
  name: string;
  isDir: boolean;
  children?: TreeNodeData[];
}

// ─── File extension → Monaco language ───
function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript", mts: "typescript",
    json: "json", md: "markdown", yaml: "yaml", yml: "yaml",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", xml: "xml", toml: "toml", ini: "ini",
    dockerfile: "dockerfile", makefile: "makefile",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    java: "java", kt: "kotlin", swift: "swift",
    vue: "html", svelte: "html",
  };
  return map[ext || ""] || "plaintext";
}

// ─── File icon based on extension ───
function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": case "ts": case "tsx": case "mjs":
      return <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />;
    case "json":
      return <FileJson className="w-4 h-4 text-yellow-400 shrink-0" />;
    case "md":
      return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
    case "py":
      return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
    case "sh": case "bash":
      return <Terminal className="w-4 h-4 text-green-400 shrink-0" />;
    case "css": case "scss":
      return <FileCode className="w-4 h-4 text-pink-400 shrink-0" />;
    case "html":
      return <FileCode className="w-4 h-4 text-orange-400 shrink-0" />;
    default:
      return <FileCode className="w-4 h-4 text-gray-400 shrink-0" />;
  }
}

// ─── Build tree data from flat file list ───
function buildTreeData(files: string[]): TreeNodeData[] {
  const root: TreeNodeData[] = [];

  for (const filePath of files) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const id = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = { id, name, isDir: !isLast, children: isLast ? undefined : [] };
        current.push(existing);
      }
      if (!isLast && existing.children) {
        current = existing.children;
      }
    }
  }

  // Sort: folders first, then alphabetical
  const sortTree = (nodes: TreeNodeData[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => { if (n.children) sortTree(n.children); });
  };
  sortTree(root);
  return root;
}

// ─── Recursive Collapsible Tree Item Component ───
function RecursiveTreeItem({
  node,
  depth = 0,
  openFolders,
  selectedFile,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNodeData;
  depth?: number;
  openFolders: Record<string, boolean>;
  selectedFile: string | null;
  onToggleFolder: (id: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isOpen = !!openFolders[node.id];
  const isSelected = selectedFile === node.id;

  if (node.isDir) {
    return (
      <div className="select-none">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolder(node.id);
          }}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className="flex items-center gap-1.5 py-1 px-2 text-[12px] cursor-pointer rounded text-gray-300 hover:bg-[#2a2d2e] hover:text-white transition-colors"
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-[#dcb67a] shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-[#dcb67a] shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </div>

        {isOpen && node.children && (
          <div className="space-y-0.5">
            {node.children.map((child) => (
              <RecursiveTreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                openFolders={openFolders}
                selectedFile={selectedFile}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectFile(node.id);
      }}
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
      className={`flex items-center gap-1.5 py-1 px-2 text-[12px] cursor-pointer rounded transition-colors ${
        isSelected
          ? "bg-[#264f78] text-white font-medium shadow-sm"
          : "text-gray-300 hover:bg-[#2a2d2e] hover:text-white"
      }`}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </div>
  );
}

// ─── Main Component ───
export default function CodeExplorer({ sessionId }: CodeExplorerProps) {
  const [fileList, setFileList] = useState<string[]>([]);
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadWorkspaceFiles();
  }, [sessionId]);

  async function loadWorkspaceFiles() {
    setLoading(true);
    try {
      const res = await api.getWorkspaceFiles(sessionId);
      if (res.success && Array.isArray(res.data?.files)) {
        const files: string[] = res.data.files;
        setFileList(files);
        const built = buildTreeData(files);
        setTreeData(built);

        // Auto-expand top level folders
        const initialOpen: Record<string, boolean> = {};
        built.forEach((n) => {
          if (n.isDir) initialOpen[n.id] = true;
        });
        setOpenFolders(initialOpen);

        // Auto-select first file
        const firstFile = files.find((f) => !f.endsWith("/"));
        if (firstFile) selectFile(firstFile);
      }
    } catch (err) {
      console.error("Failed loading workspace files", err);
    }
    setLoading(false);
  }

  async function selectFile(path: string) {
    setSelectedFile(path);
    setLoadingContent(true);
    try {
      const res = await api.getFileContent(sessionId, path);
      if (res.success && typeof res.data?.content === "string") {
        setFileContent(res.data.content);
      } else {
        setFileContent("// File content empty or unreadable");
      }
    } catch (err: any) {
      setFileContent(`// Error loading file: ${err.message || "Failed to load"}`);
    }
    setLoadingContent(false);
  }

  const toggleFolder = useCallback((id: string) => {
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCopy = useCallback(() => {
    if (!fileContent) return;
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fileContent]);

  // Filter tree data based on search
  const filteredTree = searchQuery
    ? buildTreeData(fileList.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase())))
    : treeData;

  return (
    <div className="rounded-xl border border-[#1f2937] overflow-hidden shadow-2xl flex flex-col" style={{ height: 600, background: "#1e1e1e" }}>
      {/* VS Code Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d2d2d]" style={{ background: "#252526" }}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <Code2 className="w-4 h-4 text-[#569cd6]" />
          <span className="text-[12px] font-semibold text-gray-300">Code Explorer</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#569cd6]/10 text-[#569cd6] border border-[#569cd6]/20 font-mono">
            Container Workspace
          </span>
        </div>
        <button
          onClick={loadWorkspaceFiles}
          disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Body: Sidebar + Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="flex flex-col border-r border-[#2d2d2d]" style={{ width: 260, background: "#252526" }}>
          {/* Search */}
          <div className="p-2 border-b border-[#2d2d2d]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-[7px] text-gray-500" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] rounded pl-7 pr-2 py-1 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-[#569cd6]"
              />
            </div>
          </div>

          {/* Tree View */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 py-10">
                <RefreshCw className="w-4 h-4 animate-spin text-[#569cd6]" />
                <span className="text-[11px]">Indexing workspace...</span>
              </div>
            ) : filteredTree.length > 0 ? (
              filteredTree.map((node) => (
                <RecursiveTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  openFolders={openFolders}
                  selectedFile={selectedFile}
                  onToggleFolder={toggleFolder}
                  onSelectFile={selectFile}
                />
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-[11px] text-gray-500 py-10">
                No files found
              </div>
            )}
          </div>
        </div>

        {/* Monaco Editor (Minimap Disabled) */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#1e1e1e" }}>
          {/* Tab Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2d2d2d]" style={{ background: "#252526" }}>
            <div className="flex items-center gap-2 min-w-0">
              {selectedFile && getFileIcon(selectedFile)}
              <span className="text-[11px] font-mono text-gray-300 truncate">
                {selectedFile || "Select a file"}
              </span>
            </div>
            {fileContent !== null && (
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[10px] font-mono text-gray-500">
                  {fileContent.split("\n").length} lines
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {copied ? (
                    <><Check className="w-3 h-3 text-[#28c840]" /><span className="text-[#28c840]">Copied</span></>
                  ) : (
                    <><Copy className="w-3 h-3" /><span>Copy</span></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Editor Container */}
          <div className="flex-1 overflow-hidden">
            {loadingContent ? (
              <div className="h-full flex items-center justify-center text-gray-500 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#569cd6]" />
                <span className="text-[12px]">Loading file...</span>
              </div>
            ) : fileContent !== null ? (
              <Editor
                height="100%"
                language={getLanguage(selectedFile || "")}
                value={fileContent}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false }, // Minimap disabled as requested
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "off",
                  folding: true,
                  renderLineHighlight: "line",
                  cursorStyle: "line",
                  automaticLayout: true,
                  padding: { top: 8 },
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
                <Code2 className="w-10 h-10 text-gray-600" />
                <span className="text-[12px]">Select a file to view</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
