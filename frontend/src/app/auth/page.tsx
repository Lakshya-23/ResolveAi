"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { KeyRound, ArrowLeft, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function AuthPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const { setToken, isLoading, error, isAuthenticated, username, scopes, clearError, checkExpiry } = useAuthStore();
  const router = useRouter();

  // Check expiry on mount
  useEffect(() => { checkExpiry(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    await setToken(tokenInput.trim(), rememberMe);
  };

  // Redirect after successful auth
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="p-8 rounded-2xl bg-card border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-success" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Connected as {username}</h2>
            <p className="text-sm text-muted-foreground mb-1">
              Scopes: {scopes.length > 0 ? scopes.join(", ") : "none detected"}
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Required: <code className="text-primary">repo</code>
            </p>
            <button
              onClick={() => router.push("/session/new")}
              className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Start a Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md animate-fade-in">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="p-8 rounded-2xl bg-card border border-border">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Connect GitHub</h1>
              <p className="text-sm text-muted-foreground">
                Paste your Personal Access Token
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="github-token"
                className="block text-sm font-medium mb-1.5"
              >
                GitHub PAT
              </label>
              <input
                id="github-token"
                type="password"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  if (error) clearError();
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-input text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                autoComplete="off"
              />
            </div>

            {/* Remember Me */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-secondary accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Remember me for 15 days
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !tokenInput.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validating...
                </>
              ) : (
                "Connect"
              )}
            </button>
          </form>

          {/* Help */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              Required scopes: <code className="text-primary">repo</code>
            </p>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=ResolvAI"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Create a new token on GitHub
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
