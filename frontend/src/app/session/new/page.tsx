"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import * as api from "@/lib/api";
import Link from "next/link";
import AuthGuard from "@/components/auth-guard";
import {
  ArrowLeft, Search, ChevronRight, ChevronDown, ChevronUp, Loader2, Play,
  GitBranch, AlertCircle, Settings,
  Terminal, CheckCircle2, Sparkles, BookOpen, HelpCircle, Shield, Layers, Plus, Trash2, Globe, Bookmark, Save, FolderOpen, X,
} from "lucide-react";

interface Repo { owner: string; name: string; fullName: string; description: string | null; visibility: string }
interface Issue { number: number; title: string; labels: string[]; state: string }

interface AgentLLMState {
  provider: string;
  model: string;
  validating?: boolean;
  validationResult?: { valid: boolean; message: string } | null;
}

interface FallbackItem {
  id: string;
  provider: string;
  model: string;
  validating?: boolean;
  validationResult?: { valid: boolean; message: string } | null;
}

interface PrimaryModelPreset {
  id: string;
  name: string;
  useSingleKey: boolean;
  sharedLLM: { provider: string; model: string };
  agentLLMs: Record<string, { provider: string; model: string }>;
  createdAt: string;
}

interface FallbackModelPreset {
  id: string;
  name: string;
  fallbackModels: Array<{ provider: string; model: string }>;
  createdAt: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: "openai/gpt-4o",
  anthropic: "anthropic/claude-3-5-sonnet-20241022",
  google: "google_genai/gemini-2.5-flash",
  groq: "groq/llama-3.3-70b-versatile",
};

const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: "e.g. openai/gpt-4o",
  anthropic: "e.g. anthropic/claude-3-5-sonnet-20241022",
  google: "e.g. google_genai/gemini-2.5-flash",
  groq: "e.g. groq/llama-3.3-70b-versatile or groq/openai/gpt-oss-120b",
};

const MODEL_HINTS: Record<string, string> = {
  openai: "Format: openai/<model_name> (e.g. openai/gpt-4o or gpt-4o)",
  anthropic: "Format: anthropic/<model_name> (e.g. anthropic/claude-3-5-sonnet-20241022)",
  google: "Format: google_genai/<model_name> or gemini/<model_name>",
  groq: "Format: groq/<model_name> (e.g. groq/llama-3.3-70b-versatile or groq/openai/gpt-oss-120b)",
};

export default function NewSessionPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();

  // Repository
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Issue
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // LLM Customization Mode
  const [useSingleKey, setUseSingleKey] = useState(true);

  // Shared Primary LLM Config
  const [sharedLLM, setSharedLLM] = useState<AgentLLMState>({
    provider: "openai",
    model: "openai/gpt-4o",
  });

  // Per-Agent Primary LLM Configs
  const [agentLLMs, setAgentLLMs] = useState<Record<string, AgentLLMState>>({
    supervisor: { provider: "openai", model: "openai/gpt-4o" },
    planner: { provider: "openai", model: "openai/gpt-4o" },
    writer: { provider: "openai", model: "openai/gpt-4o" },
    tester: { provider: "openai", model: "openai/gpt-4o" },
    reviewer: { provider: "openai", model: "openai/gpt-4o" },
  });

  // Multiple Session-Wide Fallback Models
  const [fallbackModels, setFallbackModels] = useState<FallbackItem[]>([]);

  // Preset Storage State
  const [primaryPresets, setPrimaryPresets] = useState<PrimaryModelPreset[]>([]);
  const [fallbackPresets, setFallbackPresets] = useState<FallbackModelPreset[]>([]);
  const [expandedPrimary, setExpandedPrimary] = useState<Record<string, boolean>>({});
  const [expandedFallback, setExpandedFallback] = useState<Record<string, boolean>>({});

  // Preset Modals Control
  const [showSavePrimaryModal, setShowSavePrimaryModal] = useState(false);
  const [showLoadPrimaryModal, setShowLoadPrimaryModal] = useState(false);
  const [primaryPresetName, setPrimaryPresetName] = useState("");

  const [showSaveFallbackModal, setShowSaveFallbackModal] = useState(false);
  const [showLoadFallbackModal, setShowLoadFallbackModal] = useState(false);
  const [fallbackPresetName, setFallbackPresetName] = useState("");

  // Agent Skills (Markdown format)
  const [skillsTab, setSkillsTab] = useState<"supervisor" | "planner" | "writer" | "tester" | "reviewer">("supervisor");
  const [agentSkills, setAgentSkills] = useState<{
    supervisor: string;
    planner: string;
    writer: string;
    tester: string;
    reviewer: string;
  }>({
    supervisor: "",
    planner: "",
    writer: "",
    tester: "",
    reviewer: "",
  });

  // Optional Configs
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [envVars, setEnvVars] = useState("");
  const [instructions, setInstructions] = useState("");

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.replace("/auth");
      return;
    }
    loadRepos();
    loadPresetsFromStorage();
  }, [isAuthenticated, token, router]);

  useEffect(() => {
    if (selectedRepo) loadIssues();
  }, [selectedRepo]);

  function loadPresetsFromStorage() {
    try {
      const savedPrimary = localStorage.getItem("resolveai_primary_presets");
      if (savedPrimary) setPrimaryPresets(JSON.parse(savedPrimary));

      const savedFallback = localStorage.getItem("resolveai_fallback_presets");
      if (savedFallback) setFallbackPresets(JSON.parse(savedFallback));
    } catch (e) {
      console.error("Failed to load presets from localStorage", e);
    }
  }

  // ─── Primary Model Presets Actions ───
  function handleSavePrimaryPreset() {
    if (!primaryPresetName.trim()) return;
    const newPreset: PrimaryModelPreset = {
      id: `p-${Date.now()}`,
      name: primaryPresetName.trim(),
      useSingleKey,
      sharedLLM: { provider: sharedLLM.provider, model: sharedLLM.model },
      agentLLMs: {
        supervisor: { provider: agentLLMs.supervisor.provider, model: agentLLMs.supervisor.model },
        planner: { provider: agentLLMs.planner.provider, model: agentLLMs.planner.model },
        writer: { provider: agentLLMs.writer.provider, model: agentLLMs.writer.model },
        tester: { provider: agentLLMs.tester.provider, model: agentLLMs.tester.model },
        reviewer: { provider: agentLLMs.reviewer.provider, model: agentLLMs.reviewer.model },
      },
      createdAt: new Date().toISOString(),
    };

    const updated = [...primaryPresets, newPreset];
    setPrimaryPresets(updated);
    localStorage.setItem("resolveai_primary_presets", JSON.stringify(updated));
    setPrimaryPresetName("");
    setShowSavePrimaryModal(false);
  }

  function handleAutofillPrimaryPreset(preset: PrimaryModelPreset) {
    setUseSingleKey(preset.useSingleKey);
    setSharedLLM({
      provider: preset.sharedLLM.provider,
      model: preset.sharedLLM.model,
      validationResult: null,
    });
    if (preset.agentLLMs) {
      setAgentLLMs({
        supervisor: { provider: preset.agentLLMs.supervisor?.provider || "openai", model: preset.agentLLMs.supervisor?.model || "openai/gpt-4o", validationResult: null },
        planner: { provider: preset.agentLLMs.planner?.provider || "openai", model: preset.agentLLMs.planner?.model || "openai/gpt-4o", validationResult: null },
        writer: { provider: preset.agentLLMs.writer?.provider || "openai", model: preset.agentLLMs.writer?.model || "openai/gpt-4o", validationResult: null },
        tester: { provider: preset.agentLLMs.tester?.provider || "openai", model: preset.agentLLMs.tester?.model || "openai/gpt-4o", validationResult: null },
        reviewer: { provider: preset.agentLLMs.reviewer?.provider || "openai", model: preset.agentLLMs.reviewer?.model || "openai/gpt-4o", validationResult: null },
      });
    }
    setShowLoadPrimaryModal(false);
  }

  function handleDeletePrimaryPreset(id: string) {
    const updated = primaryPresets.filter((p) => p.id !== id);
    setPrimaryPresets(updated);
    localStorage.setItem("resolveai_primary_presets", JSON.stringify(updated));
  }

  // ─── Fallback Model Presets Actions ───
  function handleSaveFallbackPreset() {
    if (!fallbackPresetName.trim() || fallbackModels.length === 0) return;
    const newPreset: FallbackModelPreset = {
      id: `fb-${Date.now()}`,
      name: fallbackPresetName.trim(),
      fallbackModels: fallbackModels.map((f) => ({ provider: f.provider, model: f.model })),
      createdAt: new Date().toISOString(),
    };

    const updated = [...fallbackPresets, newPreset];
    setFallbackPresets(updated);
    localStorage.setItem("resolveai_fallback_presets", JSON.stringify(updated));
    setFallbackPresetName("");
    setShowSaveFallbackModal(false);
  }

  function handleAutofillFallbackPreset(preset: FallbackModelPreset) {
    const items: FallbackItem[] = preset.fallbackModels.map((f, i) => ({
      id: `fb-item-${Date.now()}-${i}`,
      provider: f.provider,
      model: f.model,
      validationResult: null,
    }));
    setFallbackModels(items);
    setShowLoadFallbackModal(false);
  }

  function handleDeleteFallbackPreset(id: string) {
    const updated = fallbackPresets.filter((p) => p.id !== id);
    setFallbackPresets(updated);
    localStorage.setItem("resolveai_fallback_presets", JSON.stringify(updated));
  }

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const res = await api.listRepositories(1, 100);
      setRepos(res.data || []);
    } catch (e: any) { setError(e.message); }
    setLoadingRepos(false);
  }

  async function loadIssues() {
    if (!selectedRepo) return;
    setLoadingIssues(true);
    try {
      const res = await api.listIssues(selectedRepo.owner, selectedRepo.name);
      setIssues(res.data || []);
    } catch (e: any) { setError(e.message); }
    setLoadingIssues(false);
  }

  async function handleValidateLLM(target: "shared" | string, fallbackId?: string) {
    let provider: string;
    let model: string;

    if (fallbackId) {
      const item = fallbackModels.find((f) => f.id === fallbackId);
      if (!item) return;
      provider = item.provider;
      model = item.model;
      setFallbackModels((prev) =>
        prev.map((f) => (f.id === fallbackId ? { ...f, validating: true, validationResult: null } : f))
      );
    } else if (target === "shared") {
      provider = sharedLLM.provider;
      model = sharedLLM.model;
      setSharedLLM((prev) => ({ ...prev, validating: true, validationResult: null }));
    } else {
      const state = agentLLMs[target];
      provider = state.provider;
      model = state.model;
      setAgentLLMs((prev) => ({
        ...prev,
        [target]: { ...prev[target], validating: true, validationResult: null },
      }));
    }

    try {
      const res = await api.validateLLM({ provider, model });
      const result = {
        valid: res.success,
        message: res.data?.message || res.error || (res.success ? "Model verified successfully via backend .env key!" : "Validation failed"),
      };

      if (fallbackId) {
        setFallbackModels((prev) =>
          prev.map((f) => (f.id === fallbackId ? { ...f, validating: false, validationResult: result } : f))
        );
      } else if (target === "shared") {
        setSharedLLM((prev) => ({ ...prev, validating: false, validationResult: result }));
      } else {
        setAgentLLMs((prev) => ({
          ...prev,
          [target]: { ...prev[target], validating: false, validationResult: result },
        }));
      }
    } catch (e: any) {
      const result = { valid: false, message: e.response?.data?.error || e.message || "Failed to validate model" };
      if (fallbackId) {
        setFallbackModels((prev) =>
          prev.map((f) => (f.id === fallbackId ? { ...f, validating: false, validationResult: result } : f))
        );
      } else if (target === "shared") {
        setSharedLLM((prev) => ({ ...prev, validating: false, validationResult: result }));
      } else {
        setAgentLLMs((prev) => ({
          ...prev,
          [target]: { ...prev[target], validating: false, validationResult: result },
        }));
      }
    }
  }

  function addFallbackModel() {
    const newId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFallbackModels((prev) => [
      ...prev,
      {
        id: newId,
        provider: "google",
        model: "google_genai/gemini-2.5-flash",
      },
    ]);
  }

  function removeFallbackModel(id: string) {
    setFallbackModels((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleStart() {
    if (!selectedRepo || !selectedIssue) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const envMap: Record<string, string> = {};
      if (envVars.trim()) {
        envVars.split("\n").forEach((line) => {
          const [k, ...v] = line.split("=");
          if (k?.trim()) envMap[k.trim()] = v.join("=").trim();
        });
      }

      const fallbacksPayload = fallbackModels
        .filter((f) => f.model && f.model.trim())
        .map((f) => ({ provider: f.provider, model: f.model.trim() }));

      let llmConfigPayload: any = {};
      if (useSingleKey) {
        llmConfigPayload = {
          shared: {
            provider: sharedLLM.provider,
            model: sharedLLM.model,
            fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined,
          },
        };
      } else {
        llmConfigPayload = {
          supervisor: { provider: agentLLMs.supervisor.provider, model: agentLLMs.supervisor.model, fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined },
          planner: { provider: agentLLMs.planner.provider, model: agentLLMs.planner.model, fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined },
          writer: { provider: agentLLMs.writer.provider, model: agentLLMs.writer.model, fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined },
          tester: { provider: agentLLMs.tester.provider, model: agentLLMs.tester.model, fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined },
          reviewer: { provider: agentLLMs.reviewer.provider, model: agentLLMs.reviewer.model, fallbackModels: fallbacksPayload.length > 0 ? fallbacksPayload : undefined },
        };
      }

      const res = await api.createSession({
        repository: { owner: selectedRepo.owner, name: selectedRepo.name },
        issueNumber: selectedIssue.number,
        llmConfig: llmConfigPayload,
        agentSkills: {
          supervisor: agentSkills.supervisor || undefined,
          planner: agentSkills.planner || undefined,
          writer: agentSkills.writer || undefined,
          tester: agentSkills.tester || undefined,
          reviewer: agentSkills.reviewer || undefined,
        },
        tavilyApiKey: enableWebSearch ? "ENV" : "disabled",
        specialInstructions: instructions || undefined,
        environmentVariables: Object.keys(envMap).length > 0 ? envMap : undefined,
        githubToken: token,
      });

      if (res.success) {
        router.push(`/session/${res.data.id}`);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
    setIsSubmitting(false);
  }

  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  );

  const allFallbacksValid = fallbackModels.every((f) => f.validationResult?.valid === true);
  const isSharedValid = useSingleKey && sharedLLM.validationResult?.valid === true && allFallbacksValid;

  const isPerAgentValid = !useSingleKey &&
    agentLLMs.supervisor.validationResult?.valid === true &&
    agentLLMs.planner.validationResult?.valid === true &&
    agentLLMs.writer.validationResult?.valid === true &&
    agentLLMs.tester.validationResult?.valid === true &&
    agentLLMs.reviewer.validationResult?.valid === true &&
    allFallbacksValid;

  const canStart = selectedRepo && selectedIssue && (isSharedValid || isPerAgentValid);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold">New Session</h1>
          </div>
          <div className="flex items-center gap-3">
            {!canStart && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {!selectedRepo || !selectedIssue ? "Select Repo & Issue" : "Test Model(s) to enable start"}
              </span>
            )}
            <button
              onClick={handleStart}
              disabled={!canStart || isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Session
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ─── Repository ─── */}
            <section className="p-5 rounded-xl bg-card border border-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitBranch className="w-4 h-4 text-blue-400" />Repository
              </div>
              {selectedRepo ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                  <div>
                    <div className="font-medium text-sm">{selectedRepo.fullName}</div>
                    <div className="text-xs text-muted-foreground">{selectedRepo.description || "No description"}</div>
                  </div>
                  <button onClick={() => { setSelectedRepo(null); setSelectedIssue(null); setIssues([]); }}
                    className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)}
                      placeholder="Search repositories..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {loadingRepos ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : filteredRepos.map((r) => (
                      <button key={r.fullName} onClick={() => setSelectedRepo(r)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg text-sm hover:bg-secondary transition-colors text-left">
                        <div>
                          <span className="font-medium">{r.fullName}</span>
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.visibility}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* ─── Issue ─── */}
            <section className="p-5 rounded-xl bg-card border border-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="w-4 h-4 text-yellow-400" />Issue
              </div>
              {!selectedRepo ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Select a repository first</p>
              ) : selectedIssue ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                  <div>
                    <div className="font-medium text-sm">#{selectedIssue.number}: {selectedIssue.title}</div>
                    <div className="flex gap-1 mt-1">{selectedIssue.labels.map((l) => (
                      <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{l}</span>
                    ))}</div>
                  </div>
                  <button onClick={() => setSelectedIssue(null)}
                    className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {loadingIssues ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No open issues found</p>
                  ) : issues.map((issue) => (
                    <button key={issue.number} onClick={() => setSelectedIssue(issue)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg text-sm hover:bg-secondary transition-colors text-left">
                      <div>
                        <span className="text-muted-foreground mr-1.5">#{issue.number}</span>
                        <span className="font-medium">{issue.title}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ─── LLM Configuration ─── */}
          <section className="p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="w-4 h-4 text-purple-400" />LLM Configuration
                </div>

                {!useSingleKey && (
                  <div className="flex items-center gap-2 border-l border-border pl-3">
                    <button
                      type="button"
                      onClick={() => setShowLoadPrimaryModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors border border-border"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                      Presets ({primaryPresets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSavePrimaryModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-600/20 text-purple-300 text-xs font-medium hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Config
                    </button>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={useSingleKey}
                  onChange={(e) => setUseSingleKey(e.target.checked)}
                  className="w-4 h-4 rounded border-input bg-secondary accent-primary cursor-pointer"
                />
                Use single model configuration for all agents
              </label>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400 shrink-0" />
              <span>API keys are loaded securely from backend <code className="font-mono bg-blue-500/20 px-1 py-0.5 rounded">.env</code> based on the selected provider. Click <strong>Test Model</strong> to verify connectivity.</span>
            </div>

            {useSingleKey ? (
              /* Single Model Form */
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Provider</label>
                    <select
                      value={sharedLLM.provider}
                      onChange={(e) => {
                        const p = e.target.value;
                        setSharedLLM((prev) => ({ ...prev, provider: p, model: DEFAULT_MODELS[p] || "openai/gpt-4o", validationResult: null }));
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google Gemini</option>
                      <option value="groq">Groq</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-muted-foreground">Model Name</label>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={sharedLLM.model}
                        onChange={(e) => setSharedLLM((prev) => ({ ...prev, model: e.target.value, validationResult: null }))}
                        placeholder={MODEL_PLACEHOLDERS[sharedLLM.provider] || "openai/gpt-4o"}
                        className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleValidateLLM("shared")}
                        disabled={!sharedLLM.model || sharedLLM.validating}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {sharedLLM.validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Test Model
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <HelpCircle className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                      <span>{MODEL_HINTS[sharedLLM.provider] || "Format: provider/model_name"}</span>
                    </p>
                  </div>
                </div>

                {sharedLLM.validationResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${sharedLLM.validationResult.valid ? "bg-success/10 text-success border border-success/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    {sharedLLM.validationResult.valid ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="leading-relaxed break-words">{sharedLLM.validationResult.message}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Per-Agent Customized Models */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {(["supervisor", "planner", "writer", "tester", "reviewer"] as const).map((agentKey) => {
                  const agentState = agentLLMs[agentKey];
                  const labels: Record<string, { name: string; desc: string }> = {
                    supervisor: { name: "Supervisor Agent (Tech Lead)", desc: "Coordinates team, evaluates reports & decides workflow steps" },
                    planner: { name: "Planner Agent", desc: "Analyzes issue & creates execution plan" },
                    writer: { name: "Writer (Code) Agent", desc: "Implements code & file modifications" },
                    tester: { name: "Tester Agent", desc: "Executes build, test suites & linters" },
                    reviewer: { name: "Reviewer Agent", desc: "Reviews code quality & diffs" },
                  };

                  return (
                    <div key={agentKey} className="p-4 rounded-lg bg-secondary/40 border border-border space-y-3">
                      <div>
                        <div className="font-medium text-xs text-foreground flex items-center justify-between">
                          <span>{labels[agentKey].name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{agentKey}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{labels[agentKey].desc}</p>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Provider</label>
                          <select
                            value={agentState.provider}
                            onChange={(e) => {
                              const p = e.target.value;
                              setAgentLLMs((prev) => ({
                                ...prev,
                                [agentKey]: { ...prev[agentKey], provider: p, model: DEFAULT_MODELS[p] || "openai/gpt-4o", validationResult: null },
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded bg-secondary border border-input text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="google">Google Gemini</option>
                            <option value="groq">Groq</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Model Name</label>
                          <div className="flex gap-2">
                            <input
                              value={agentState.model}
                              onChange={(e) => setAgentLLMs((prev) => ({
                                ...prev,
                                [agentKey]: { ...prev[agentKey], model: e.target.value, validationResult: null },
                              }))}
                              placeholder={MODEL_PLACEHOLDERS[agentState.provider] || "openai/gpt-4o"}
                              className="flex-1 px-2.5 py-1.5 rounded bg-secondary border border-input text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <button
                              type="button"
                              onClick={() => handleValidateLLM(agentKey)}
                              disabled={!agentState.model || agentState.validating}
                              className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                            >
                              {agentState.validating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <HelpCircle className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                            <span>{MODEL_HINTS[agentState.provider] || "Format: provider/model_name"}</span>
                          </p>
                        </div>
                      </div>

                      {agentState.validationResult && (
                        <div className={`p-2.5 rounded text-[11px] flex items-start gap-1.5 ${agentState.validationResult.valid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {agentState.validationResult.valid ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                          <span className="leading-relaxed break-words">{agentState.validationResult.message}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Multiple Session-Wide Fallback Models Section */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Fallback Models (Optional)</span>
                  <span className="text-[10px] text-muted-foreground font-normal ml-1 hidden sm:inline">LiteLLM auto-fails over in order if primary fails</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLoadFallbackModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors border border-border"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                    Saved Fallbacks ({fallbackPresets.length})
                  </button>
                  {fallbackModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSaveFallbackModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-600/20 text-purple-300 text-xs font-medium hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Fallbacks
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addFallbackModel}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 transition-colors shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Fallback Model
                  </button>
                </div>
              </div>

              {fallbackModels.length > 0 && (
                <div className="space-y-3">
                  {fallbackModels.map((item, index) => (
                    <div key={item.id} className="p-3.5 rounded-lg bg-secondary/50 border border-purple-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-purple-200">
                        <span>Fallback #{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeFallbackModel(item.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors p-1"
                          title="Remove fallback model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Provider</label>
                          <select
                            value={item.provider}
                            onChange={(e) => {
                              const p = e.target.value;
                              setFallbackModels((prev) =>
                                prev.map((f) =>
                                  f.id === item.id
                                    ? { ...f, provider: p, model: DEFAULT_MODELS[p] || "google_genai/gemini-2.5-flash", validationResult: null }
                                    : f
                                )
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded bg-secondary border border-input text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="google">Google Gemini</option>
                            <option value="groq">Groq</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Model Name</label>
                          <div className="flex gap-2">
                            <input
                              value={item.model}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFallbackModels((prev) =>
                                  prev.map((f) => (f.id === item.id ? { ...f, model: val, validationResult: null } : f))
                                );
                              }}
                              placeholder={MODEL_PLACEHOLDERS[item.provider] || "google_genai/gemini-2.5-flash"}
                              className="flex-1 px-2.5 py-1.5 rounded bg-secondary border border-input text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <button
                              type="button"
                              onClick={() => handleValidateLLM("fallback", item.id)}
                              disabled={!item.model || item.validating}
                              className="px-3 py-1.5 rounded bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                            >
                              {item.validating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test Fallback"}
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <HelpCircle className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                            <span>{MODEL_HINTS[item.provider] || "Format: provider/model_name"}</span>
                          </p>
                        </div>
                      </div>

                      {item.validationResult && (
                        <div className={`p-2.5 rounded text-[11px] flex items-start gap-1.5 ${item.validationResult.valid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {item.validationResult.valid ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                          <span className="leading-relaxed break-words">{item.validationResult.message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─── Agent Custom Skills (Markdown) ─── */}
          <section className="p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="w-4 h-4 text-emerald-400" />Agent Custom Skills <span className="text-xs text-muted-foreground font-normal">(Markdown format only)</span>
            </div>

            <div className="flex gap-2 border-b border-border pb-2">
              {(["supervisor", "planner", "writer", "tester", "reviewer"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSkillsTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${skillsTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {tab} Skill
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                Provide custom markdown instructions or behavioral guidelines for the <span className="font-semibold text-foreground capitalize">{skillsTab} agent</span>:
              </label>
              <textarea
                value={agentSkills[skillsTab]}
                onChange={(e) => setAgentSkills((prev) => ({ ...prev, [skillsTab]: e.target.value }))}
                placeholder={`# Custom ${skillsTab} Instructions\n\n- Always follow strict TDD guidelines.\n- Prefer TypeScript over JavaScript.\n- Keep changes minimal and isolated.`}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
          </section>

          {/* ─── Web Search Configuration ─── */}
          <section className="p-5 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="w-4 h-4 text-emerald-400" />Web Search
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                  className="w-4 h-4 rounded border-input bg-secondary accent-emerald-500 cursor-pointer"
                />
                Enable Web Search
              </label>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1 pl-1">
              <li>• <strong>Agent Access:</strong> Restricted exclusively to <strong>Planner</strong> and <strong>Tester</strong> agents.</li>
              <li>• <strong>API Key:</strong> Loaded automatically from backend <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">TAVILY_API_KEY</code> in <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">.env</code>.</li>
            </ul>
          </section>

          {/* ─── Environment Variables (Repo Env) ─── */}
          <section className="p-5 rounded-xl bg-card border border-border space-y-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="w-4 h-4 text-cyan-400" />Repository Environment Variables <span className="text-xs text-muted-foreground font-normal">(optional — for repository runtime / test container)</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Injected into the repository container for build commands, test suites, and linter runs (KEY=value format).
              </p>
            </div>
            <textarea value={envVars} onChange={(e) => setEnvVars(e.target.value)}
              placeholder="PORT=3000&#10;DATABASE_URL=postgres://localhost:5432/test_db&#10;NODE_ENV=test"
              rows={3} className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </section>

          {/* ─── Special Instructions ─── */}
          <section className="p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="w-4 h-4 text-amber-400" />Special Instructions <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </div>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Do not modify public API signatures; add unit tests for all new helper functions."
              rows={3} className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </section>
        </main>

        {/* ─── MODAL 1: Save Primary Config Preset ─── */}
        {showSavePrimaryModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <Save className="w-4 h-4 text-purple-400" /> Save Model Config Preset
                </h3>
                <button onClick={() => setShowSavePrimaryModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Save your current model setup to autofill next time with a single click.
              </p>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Preset Name</label>
                <input
                  value={primaryPresetName}
                  onChange={(e) => setPrimaryPresetName(e.target.value)}
                  placeholder="e.g. OpenAI GPT-4o Suite or Fast Groq Team"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowSavePrimaryModal(false)} className="px-3 py-1.5 rounded-lg text-xs bg-secondary text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={handleSavePrimaryPreset} disabled={!primaryPresetName.trim()} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40">
                  Save Preset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 2: Saved Primary Configs List (Autofill Modal) ─── */}
        {showLoadPrimaryModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
                  <FolderOpen className="w-5 h-5 text-purple-400" /> Saved Model Config Presets
                </h3>
                <button onClick={() => setShowLoadPrimaryModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {primaryPresets.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No saved model presets found. Click <strong>"Save Config"</strong> to save your current setup!
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                  {primaryPresets.map((preset) => {
                    const isExpanded = !!expandedPrimary[preset.id];
                    return (
                      <div
                        key={preset.id}
                        className="rounded-lg bg-secondary/60 border border-border hover:border-purple-500/50 transition-colors overflow-hidden"
                      >
                        <div className="flex items-center justify-between p-3">
                          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleAutofillPrimaryPreset(preset)}>
                            <h4 className="text-xs font-semibold text-foreground truncate">{preset.name}</h4>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {preset.useSingleKey
                                ? `Single Model: ${preset.sharedLLM.model}`
                                : `Custom Per-Agent Suite (${Object.keys(preset.agentLLMs || {}).length} agents)`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {/* View Models Dropdown Toggle on the left side of Autofill */}
                            <button
                              type="button"
                              onClick={() => setExpandedPrimary((prev) => ({ ...prev, [preset.id]: !prev[preset.id] }))}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium text-purple-300 transition-colors border border-purple-500/30"
                              title="View all models in this preset"
                            >
                              <span>View Models</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAutofillPrimaryPreset(preset)}
                              className="px-3 py-1 rounded bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 transition-colors"
                            >
                              Autofill
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePrimaryPreset(preset.id)}
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                              title="Delete preset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Model Details Dropdown Panel */}
                        {isExpanded && (
                          <div className="px-3.5 py-2.5 bg-black/40 border-t border-border/60 text-xs space-y-1.5 animate-fade-in">
                            <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider block mb-1">Model Details</span>
                            {preset.useSingleKey ? (
                              <div className="flex justify-between items-center text-xs py-1 px-2 rounded bg-secondary/40 font-mono">
                                <span className="text-gray-400">All Agents:</span>
                                <span className="text-purple-300 font-semibold">{preset.sharedLLM.model} ({preset.sharedLLM.provider})</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-1 text-[11px]">
                                {Object.entries(preset.agentLLMs || {}).map(([agent, cfg]) => (
                                  <div key={agent} className="flex justify-between items-center py-1 px-2 rounded bg-secondary/40 font-mono">
                                    <span className="text-gray-400 capitalize">{agent}:</span>
                                    <span className="text-purple-300 font-medium">{cfg.model}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL 3: Save Fallback Preset ─── */}
        {showSaveFallbackModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <Save className="w-4 h-4 text-purple-400" /> Save Fallback Model Preset
                </h3>
                <button onClick={() => setShowSaveFallbackModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Save your current fallback model chain ({fallbackModels.length} models) for quick autofill next time.
              </p>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Preset Name</label>
                <input
                  value={fallbackPresetName}
                  onChange={(e) => setFallbackPresetName(e.target.value)}
                  placeholder="e.g. Gemini 2.5 Flash + Groq Llama Chain"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowSaveFallbackModal(false)} className="px-3 py-1.5 rounded-lg text-xs bg-secondary text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={handleSaveFallbackPreset} disabled={!fallbackPresetName.trim()} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40">
                  Save Fallback Preset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 4: Saved Fallback Presets List (Autofill Modal) ─── */}
        {showLoadFallbackModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
                  <FolderOpen className="w-5 h-5 text-purple-400" /> Saved Fallback Presets
                </h3>
                <button onClick={() => setShowLoadFallbackModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {fallbackPresets.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No saved fallback presets found. Add fallback models and click <strong>"Save Fallbacks"</strong> to save a preset!
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                  {fallbackPresets.map((preset) => {
                    const isExpanded = !!expandedFallback[preset.id];
                    return (
                      <div
                        key={preset.id}
                        className="rounded-lg bg-secondary/60 border border-border hover:border-purple-500/50 transition-colors overflow-hidden"
                      >
                        <div className="flex items-center justify-between p-3">
                          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleAutofillFallbackPreset(preset)}>
                            <h4 className="text-xs font-semibold text-foreground truncate">{preset.name}</h4>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              Chain: {preset.fallbackModels.map((m) => m.model).join(" → ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <button
                              type="button"
                              onClick={() => setExpandedFallback((prev) => ({ ...prev, [preset.id]: !prev[preset.id] }))}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium text-purple-300 transition-colors border border-purple-500/30"
                              title="View all fallback models in this preset"
                            >
                              <span>View Models</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAutofillFallbackPreset(preset)}
                              className="px-3 py-1 rounded bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 transition-colors"
                            >
                              Autofill
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFallbackPreset(preset.id)}
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                              title="Delete preset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Fallback Model Details Dropdown Panel */}
                        {isExpanded && (
                          <div className="px-3.5 py-2.5 bg-black/40 border-t border-border/60 text-xs space-y-1 animate-fade-in">
                            <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider block mb-1">Fallback Chain Details</span>
                            <div className="grid grid-cols-1 gap-1 text-[11px]">
                              {preset.fallbackModels.map((m, idx) => (
                                <div key={idx} className="flex justify-between items-center py-1 px-2 rounded bg-secondary/40 font-mono">
                                  <span className="text-gray-400">Fallback #{idx + 1}:</span>
                                  <span className="text-purple-300 font-medium">{m.model} ({m.provider})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
