import { WORKFLOW_STATUS, WORKFLOW_PHASE, AGENT_NAMES, LLM_PROVIDERS, SUPPORTED_ECOSYSTEMS } from './constants';

// ─── Utility Types ───
export type ValueOf<T> = T[keyof T];

// ─── Enums from Constants ───
export type WorkflowStatus = ValueOf<typeof WORKFLOW_STATUS>;
export type WorkflowPhase = ValueOf<typeof WORKFLOW_PHASE>;
export type AgentName = ValueOf<typeof AGENT_NAMES>;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];
export type SupportedEcosystem = (typeof SUPPORTED_ECOSYSTEMS)[number];

// Reusable NextAgent type alias for supervisor routing
export type NextAgent =
  | 'planner'
  | 'writer'
  | 'tester'
  | 'reviewer'
  | 'user'
  | 'complete';

// ─── LLM Configuration ───
export interface FallbackModelItem {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  fallbackModel?: FallbackModelItem;
  fallbackModels?: FallbackModelItem[];
}

export interface AgentLLMConfig {
  shared?: LLMConfig;
  supervisor?: LLMConfig;
  planner?: LLMConfig;
  writer?: LLMConfig;
  tester?: LLMConfig;
  reviewer?: LLMConfig;
}

// ─── Supervisor Types ───
export interface SupervisorDecision {
  next_agent: NextAgent;
  decisionSummary: string;
  instructions: string;
  workflow_status: WorkflowPhase;
  checkpoint: boolean;
  requires_user: boolean;
}

export interface SupervisorDecisionLog {
  iteration: number;
  timestamp: string;
  decisionSummary: string;
  next_agent: NextAgent;
  workflow_status: WorkflowPhase;
}

// ─── GitHub Issue ───
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  milestone: string | null;
  assignees: string[];
  comments: GitHubComment[];
  state: string;
  url: string;
}

export interface GitHubComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

// ─── GitHub Repository ───
export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  visibility: 'public' | 'private';
  description: string | null;
  url: string;
  cloneUrl: string;
}

// ─── Repository Profile (Deterministic, machine-readable) ───
export interface RepositoryProfile {
  ecosystem: SupportedEcosystem;
  packageManager: string;
  projectType: string | null;
  buildTool: string | null;
  testFramework: string | null;
  formatter: string | null;
  linter: string | null;
  commands: RepositoryCommands;
  structure: string[];
  importantFiles: string[];
  ciSummary: string | null;
  dockerMetadata: string | null;
  readmeSummary: string | null;
}

export interface RepositoryCommands {
  install: string | null;
  build: string | null;
  test: string | null;
  lint: string | null;
  dev: string | null;
}

// ─── Environment Report (Execution facts) ───
export interface EnvironmentReport {
  image: string;
  containerId: string;
  workspacePath: string;
  dependencyStatus: 'success' | 'failed' | 'skipped';
  availableCommands: Record<string, boolean>;
  buildVerification: 'success' | 'failed' | 'skipped';
  testVerification: 'available' | 'unavailable';
  environmentVariablesLoaded: number;
  warnings: string[];
  errors: string[];
  timestamp: string;
}

// ─── Agent Reports ───
export interface PlanningReport {
  problemSummary: string;
  implementationStrategy: string;
  filesToChange: string[];
  potentialRisks: string[];
  testingRecommendations: string[];
  dependencies: string[];
  additionalNotes: string;
}

export interface ImplementationReport {
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  summaryOfChanges: string;
  knownLimitations: string[];
  potentialRisks: string[];
  recommendedValidation: string[];
}

export interface ValidationReport {
  buildStatus: 'success' | 'failed' | 'skipped';
  testStatus: 'success' | 'failed' | 'skipped';
  lintStatus: 'success' | 'failed' | 'skipped';
  executionTime: number;
  failingCommands: string[];
  capturedOutput: string;
  warnings: string[];
  recommendations: string[];
}

export interface ReviewReport {
  engineeringQuality: 'excellent' | 'good' | 'acceptable' | 'poor';
  implementationCompleteness: 'complete' | 'mostly_complete' | 'incomplete';
  architectureCompliance: 'compliant' | 'minor_deviations' | 'non_compliant';
  conventionCompliance: 'follows_conventions' | 'minor_issues' | 'major_issues';
  outstandingIssues: string[];
  suggestedImprovements: string[];
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

// ─── Execution History ───
export interface ExecutionEvent {
  timestamp: string;
  component: string;
  action: string;
  result: 'success' | 'failed' | 'info';
  duration?: number;
  details?: string;
}

export interface AgentSkills {
  supervisor?: string;
  planner?: string;
  writer?: string;
  tester?: string;
  reviewer?: string;
}

// ─── Session ───
export interface Session {
  id: string;
  status: WorkflowStatus;
  currentStage: string;
  repository: GitHubRepository;
  issue: GitHubIssue;
  llmConfig: AgentLLMConfig;
  agentSkills?: AgentSkills;
  specialInstructions: string;
  environmentVariables: Record<string, string>;
  tavilyApiKey: string;
  repositoryProfile: RepositoryProfile | null;
  repositoryContext: string | null;
  environmentReport: EnvironmentReport | null;
  planningReport: PlanningReport | null;
  implementationReport: ImplementationReport | null;
  validationReport: ValidationReport | null;
  reviewReport: ReviewReport | null;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'cancelled';
  pullRequestUrl: string | null;
  executionHistory: ExecutionEvent[];
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── API Request / Response ───
export interface CreateSessionRequest {
  repository: {
    owner: string;
    name: string;
  };
  issueNumber: number;
  llmConfig: AgentLLMConfig;
  agentSkills?: AgentSkills;
  specialInstructions?: string;
  environmentVariables?: Record<string, string>;
  tavilyApiKey?: string;
  githubToken: string;
}

export interface ApprovalRequest {
  action: 'approve' | 'reject' | 'cancel';
  comment?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
