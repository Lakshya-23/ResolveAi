"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import {
  GitBranch,
  Zap,
  Shield,
  ArrowRight,
  Bot,
  FileCode,
  TestTube,
  Eye,
  LogOut,
  User,
} from "lucide-react";

const WORKFLOW_STEPS = [
  { icon: GitBranch, label: "Analyze Repository", color: "text-blue-400" },
  { icon: Bot, label: "Plan Implementation", color: "text-purple-400" },
  { icon: FileCode, label: "Write Code", color: "text-green-400" },
  { icon: TestTube, label: "Validate Changes", color: "text-yellow-400" },
  { icon: Eye, label: "Review Quality", color: "text-pink-400" },
  { icon: Shield, label: "Human Approval", color: "text-indigo-400" },
];

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ResolvAI</span>
        </div>
        <nav className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs text-muted-foreground">
                <User className="w-3.5 h-3.5 text-primary" />
                <span>{useAuthStore.getState().username}</span>
              </div>
              <Link
                href="/session/new"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                New Session
              </Link>
              <Link
                href="/history"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                History
              </Link>
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors ml-2"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Connect GitHub
            </Link>
          )}
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center max-w-2xl animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm mb-6 border border-primary/20">
            <Zap className="w-3.5 h-3.5" />
            Autonomous Issue Resolution
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Resolve GitHub Issues
            <span className="text-primary"> Autonomously</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            ResolvAI analyzes your repository, plans the solution, writes the
            code, validates the changes, and creates a review-ready Pull
            Request — all with your approval.
          </p>
          <Link
            href={isAuthenticated ? "/session/new" : "/auth"}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all hover:gap-3"
          >
            {isAuthenticated ? "Start a Session" : "Connect GitHub"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Workflow Steps */}
        <div className="mt-20 w-full max-w-4xl">
          <h2 className="text-center text-sm font-medium text-muted-foreground mb-8 uppercase tracking-wider">
            How it works
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <div
                key={step.label}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                </div>
                <span className="text-xs text-center text-muted-foreground leading-tight">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        ResolvAI — Self-hosted, open source, bring your own API keys
      </footer>
    </div>
  );
}
