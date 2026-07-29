"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { DiffEditor } from "@monaco-editor/react";
import {
  GitBranch, RefreshCw, FileCode, ChevronDown, ChevronRight,
  Plus, Minus, FileText,
} from "lucide-react";

interface DiffViewerProps {
  sessionId: string;
}

interface FileDiff {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  oldContent: string;
  newContent: string;
}

/**
 * Parse unified git diff into per-file diff objects with accurate file paths.
 */
function parseGitDiff(diffStr: string): FileDiff[] {
  if (!diffStr || !diffStr.trim()) return [];

  const files: FileDiff[] = [];
  const rawSections = diffStr.split(/^diff --git /m).filter(Boolean);

  for (const section of rawSections) {
    const lines = section.split("\n");
    const firstLine = lines[0] || "";

    // 1. Try matching header line: a/path b/path
    let filePath = "";
    const gitHeaderMatch = firstLine.match(/a\/(.+?)\s+b\/(.+)$/);
    if (gitHeaderMatch) {
      filePath = gitHeaderMatch[2].replace(/^["']|["']$/g, "").trim();
    }

    // 2. Fallback: match +++ b/path
    if (!filePath || filePath === "/dev/null") {
      const plusMatch = section.match(/^\+\+\+\s+b\/(.+)$/m);
      if (plusMatch) {
        filePath = plusMatch[1].replace(/^["']|["']$/g, "").trim();
      }
    }

    // 3. Fallback: match --- a/path
    if (!filePath || filePath === "/dev/null") {
      const minusMatch = section.match(/^---\s+a\/(.+)$/m);
      if (minusMatch) {
        filePath = minusMatch[1].replace(/^["']|["']$/g, "").trim();
      }
    }

    if (!filePath || filePath === "unknown") {
      const simpleMatch = firstLine.match(/\b([^\s"']+\.[a-zA-Z0-9]+)\b/);
      filePath = simpleMatch ? simpleMatch[1] : "modified_file";
    }

    // Determine status
    let status: "modified" | "added" | "deleted" | "renamed" = "modified";
    if (section.includes("new file mode") || section.includes("--- /dev/null")) {
      status = "added";
    } else if (section.includes("deleted file mode") || section.includes("+++ /dev/null")) {
      status = "deleted";
    } else if (section.includes("rename from")) {
      status = "renamed";
    }

    // Extract diff body after first hunk header @@
    const hunkSplit = section.split(/^@@.*@@/m);
    const diffBody = hunkSplit.length > 1 ? hunkSplit.slice(1).join("\n") : section;

    const diffLines = diffBody.split("\n");
    const oldLines: string[] = [];
    const newLines: string[] = [];

    for (const line of diffLines) {
      if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (!line.startsWith("\\") && !line.startsWith("diff --git") && !line.startsWith("index ")) {
        oldLines.push(line);
        newLines.push(line);
      }
    }

    files.push({
      path: filePath,
      status,
      oldContent: status === "added" ? "" : oldLines.join("\n"),
      newContent: status === "deleted" ? "" : newLines.join("\n"),
    });
  }

  return files;
}

/**
 * Get Monaco language from file extension.
 */
function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    json: "json", md: "markdown", py: "python", css: "css", html: "html",
    sh: "shell", yaml: "yaml", yml: "yaml", xml: "xml", sql: "sql",
    c: "c", cpp: "cpp", h: "c", java: "java", go: "go", rs: "rust",
    rb: "ruby", toml: "toml",
  };
  return map[ext || ""] || "plaintext";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "added":
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">ADDED</span>;
    case "deleted":
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold">DELETED</span>;
    case "renamed":
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">RENAMED</span>;
    default:
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-semibold">MODIFIED</span>;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "added": return <Plus className="w-3.5 h-3.5 text-green-400" />;
    case "deleted": return <Minus className="w-3.5 h-3.5 text-red-400" />;
    default: return <FileCode className="w-3.5 h-3.5 text-yellow-400" />;
  }
}

export default function DiffViewer({ sessionId }: DiffViewerProps) {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiff();
  }, [sessionId]);

  async function loadDiff() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSessionDiff(sessionId);
      if (res.success && res.data?.diff) {
        const parsed = parseGitDiff(res.data.diff);
        setFileDiffs(parsed);
        if (parsed.length > 0) setExpandedFile(parsed[0].path);
      } else {
        setFileDiffs([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load diff");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#1f2937] p-8 flex flex-col items-center justify-center gap-2" style={{ background: "#0d1117" }}>
        <RefreshCw className="w-5 h-5 animate-spin text-[#569cd6]" />
        <span className="text-[12px] text-gray-400">Loading diff from container...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 p-6 text-center" style={{ background: "#0d1117" }}>
        <p className="text-[12px] text-red-400">{error}</p>
        <button onClick={loadDiff} className="mt-2 text-[11px] text-gray-400 hover:text-white underline">
          Retry
        </button>
      </div>
    );
  }

  if (fileDiffs.length === 0) {
    return (
      <div className="rounded-xl border border-[#1f2937] p-8 text-center" style={{ background: "#0d1117" }}>
        <GitBranch className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-[12px] text-gray-500">No changes detected</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1f2937] overflow-hidden" style={{ background: "#0d1117" }}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[#1f2937] flex items-center justify-between" style={{ background: "#161b22" }}>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[#569cd6]" />
          <span className="text-[12px] font-semibold text-gray-300">Changes</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-mono">
            {fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={loadDiff}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-[#21262d] hover:bg-[#30363d] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* File List with Expandable Diffs */}
      <div className="divide-y divide-[#1f2937]">
        {fileDiffs.map((file) => {
          const isExpanded = expandedFile === file.path;

          return (
            <div key={file.path}>
              {/* File Header */}
              <button
                onClick={() => setExpandedFile(isExpanded ? null : file.path)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[#161b22] transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  {getStatusIcon(file.status)}
                  <span className="text-[12px] font-mono font-medium text-gray-200 truncate">
                    {file.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(file.status)}
                </div>
              </button>

              {/* Monaco Diff Editor Container */}
              {isExpanded && (
                <div className="border-t border-[#1f2937]" style={{ height: 350 }}>
                  <DiffEditor
                    height="100%"
                    original={file.oldContent}
                    modified={file.newContent}
                    language={getLanguage(file.path)}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false }, // Minimap disabled
                      fontSize: 12,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      renderOverviewRuler: false,
                      padding: { top: 4 },
                      scrollbar: {
                        verticalScrollbarSize: 8,
                        horizontalScrollbarSize: 8,
                      },
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
