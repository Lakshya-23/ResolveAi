"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import * as api from "@/lib/api";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import {
  ArrowLeft, Clock, GitBranch, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ChevronRight, ExternalLink, LogOut,
  Trash2, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SessionSummary {
  id: string;
  status: string;
  currentStage: string;
  repository: { fullName: string };
  issue: { number: number; title: string };
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_ICON: Record<string, any> = {
  COMPLETED: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  FAILED: <XCircle className="w-4 h-4 text-red-400" />,
  CANCELLED: <AlertTriangle className="w-4 h-4 text-gray-400" />,
};

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-500/10 text-green-400 border-green-500/20",
  FAILED: "bg-red-500/10 text-red-400 border-red-500/20",
  CANCELLED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  WAITING_FOR_APPROVAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function HistoryPage() {
  const router = useRouter();
  const { isAuthenticated, token, logout } = useAuthStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.replace("/auth");
      return;
    }
    loadSessions();
  }, [isAuthenticated, token, router]);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await api.listSessions({ limit: 50 });
      if (res.success) {
        setSessions(res.data.sessions || []);
        setTotal(res.data.total || 0);
      }
    } catch {}
    setLoading(false);
  }

  async function handleClearHistory() {
    setClearing(true);
    try {
      await api.clearAllSessions();
      setSessions([]);
      setTotal(0);
      setShowClearConfirm(false);
    } catch (err) {
      console.error("Failed clearing history", err);
    }
    setClearing(false);
  }

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await api.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed deleting session", err);
    }
    setDeletingId(null);
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col" style={{ background: "#0d1117" }}>
        {/* Header */}
        <header className="border-b border-[#21262d] px-6 py-3.5 flex items-center justify-between shrink-0" style={{ background: "#161b22" }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-white">Session History</h1>
              <p className="text-[11px] text-gray-500">{total} session{total !== 1 ? "s" : ""} recorded</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Clear History Button */}
            {sessions.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            )}

            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl w-full mx-auto px-6 py-8 flex-1">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-[#21262d] p-8" style={{ background: "#161b22" }}>
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h2 className="text-base font-semibold text-gray-200 mb-2">No sessions found</h2>
              <p className="text-xs text-gray-500 mb-6">Start a new session to resolve a GitHub issue autonomously.</p>
              <Link
                href="/session/new"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors inline-block"
              >
                Start New Session
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/session/${session.id}`}
                  className="flex items-center justify-between p-4 rounded-xl border border-[#21262d] hover:border-indigo-500/40 transition-all group"
                  style={{ background: "#161b22" }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {STATUS_ICON[session.status] || <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-200 group-hover:text-indigo-300 transition-colors truncate">
                          {session.repository.fullName}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLE[session.status] || "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"}`}>
                          {session.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        #{session.issue.number}: {session.issue.title}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                        {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {session.pullRequestUrl && (
                      <a
                        href={session.pullRequestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-green-400 hover:underline bg-green-500/10 px-2 py-1 rounded border border-green-500/20"
                      >
                        PR <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {/* Delete Individual Session */}
                    <button
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      disabled={deletingId === session.id}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete session"
                    >
                      {deletingId === session.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>

                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-200 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* Clear History Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="w-full max-w-md rounded-2xl border border-[#30363d] p-6 shadow-2xl space-y-4" style={{ background: "#161b22" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Clear All Session History?</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    This will permanently delete all {sessions.length} recorded session history records from the SQLite database.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={clearing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#21262d] text-gray-300 hover:bg-[#30363d] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  disabled={clearing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors shadow-lg shadow-red-500/20"
                >
                  {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Clear All History</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
