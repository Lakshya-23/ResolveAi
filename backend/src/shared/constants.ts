// ─── Supported Ecosystems ───
export const SUPPORTED_ECOSYSTEMS = ['nodejs', 'python', 'cpp'] as const;

// ─── Docker Images ───
export const DOCKER_IMAGES = {
  nodejs: 'issue-resolver-node',
  python: 'issue-resolver-python',
  cpp: 'issue-resolver-cpp',
} as const;

// ─── Workflow Statuses & Phases ───
export const WORKFLOW_STATUS = {
  INITIALIZING: 'INITIALIZING',
  ANALYZING: 'ANALYZING',
  PREPARING_ENVIRONMENT: 'PREPARING_ENVIRONMENT',
  PLANNING: 'PLANNING',
  IMPLEMENTING: 'IMPLEMENTING',
  VALIDATING: 'VALIDATING',
  REVIEWING: 'REVIEWING',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  CREATING_PULL_REQUEST: 'CREATING_PULL_REQUEST',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  UNSUPPORTED: 'UNSUPPORTED',
} as const;

export const WORKFLOW_PHASE = {
  INITIALIZING: 'INITIALIZING',
  PLANNING: 'PLANNING',
  IMPLEMENTING: 'IMPLEMENTING',
  VALIDATING: 'VALIDATING',
  REVIEWING: 'REVIEWING',
  WAITING_FOR_USER: 'WAITING_FOR_USER',
  CREATING_PR: 'CREATING_PR',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

// ─── Terminal States ───
export const TERMINAL_STATES = new Set([
  WORKFLOW_STATUS.COMPLETED,
  WORKFLOW_STATUS.FAILED,
  WORKFLOW_STATUS.CANCELLED,
  WORKFLOW_STATUS.UNSUPPORTED,
]);

// ─── Agent Names ───
export const AGENT_NAMES = {
  SUPERVISOR: 'supervisor',
  PLANNER: 'planner',
  WRITER: 'writer',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
} as const;

// ─── LLM Providers ───
export const LLM_PROVIDERS = ['openai', 'anthropic', 'google', 'groq'] as const;

// ─── Retry Limits ───
export const MAX_PLANNING_RETRIES = 2;
export const MAX_IMPLEMENTATION_RETRIES = 3;
export const MAX_VALIDATION_RETRIES = 3;

// ─── Timeouts (ms) ───
export const COMMAND_TIMEOUT_MS = 120_000;       // 2 minutes
export const BUILD_TIMEOUT_MS = 300_000;         // 5 minutes
export const TEST_TIMEOUT_MS = 300_000;          // 5 minutes
export const CLONE_TIMEOUT_MS = 120_000;         // 2 minutes
export const DEPENDENCY_INSTALL_TIMEOUT_MS = 600_000; // 10 minutes
