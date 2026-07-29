/**
 * WebSocket and internal event name constants.
 * Centralized to prevent string typos across the codebase.
 */

// ─── Session Events (Backend → Frontend via WebSocket) ───
export const SESSION_EVENTS = {
  CREATED: 'session:created',
  UPDATED: 'session:updated',
  COMPLETED: 'session:completed',
  FAILED: 'session:failed',
  CANCELLED: 'session:cancelled',
} as const;

// ─── Workflow Events ───
export const WORKFLOW_EVENTS = {
  STAGE_CHANGED: 'workflow:stage_changed',
  STATUS_CHANGED: 'workflow:status_changed',
  CHECKPOINT_CREATED: 'workflow:checkpoint_created',
  PROGRESS_UPDATE: 'workflow:progress_update',
} as const;

// ─── Agent Events ───
export const AGENT_EVENTS = {
  STARTED: 'agent:started',
  COMPLETED: 'agent:completed',
  FAILED: 'agent:failed',
  TOOL_INVOKED: 'agent:tool_invoked',
  TOOL_COMPLETED: 'agent:tool_completed',
  ACTIVITY: 'agent:activity',
} as const;

// ─── Repository Analysis Events ───
export const ANALYSIS_EVENTS = {
  STARTED: 'analysis:started',
  ECOSYSTEM_DETECTED: 'analysis:ecosystem_detected',
  COMPLETED: 'analysis:completed',
  UNSUPPORTED: 'analysis:unsupported',
} as const;

// ─── Environment Events ───
export const ENVIRONMENT_EVENTS = {
  CONTAINER_CREATING: 'environment:container_creating',
  CONTAINER_READY: 'environment:container_ready',
  DEPENDENCIES_INSTALLING: 'environment:dependencies_installing',
  DEPENDENCIES_INSTALLED: 'environment:dependencies_installed',
  VERIFICATION_STARTED: 'environment:verification_started',
  READY: 'environment:ready',
  FAILED: 'environment:failed',
} as const;

// ─── Validation Events ───
export const VALIDATION_EVENTS = {
  BUILD_STARTED: 'validation:build_started',
  BUILD_COMPLETED: 'validation:build_completed',
  TESTS_STARTED: 'validation:tests_started',
  TESTS_COMPLETED: 'validation:tests_completed',
  LINT_STARTED: 'validation:lint_started',
  LINT_COMPLETED: 'validation:lint_completed',
} as const;

// ─── Approval Events ───
export const APPROVAL_EVENTS = {
  WAITING: 'approval:waiting',
  APPROVED: 'approval:approved',
  REJECTED: 'approval:rejected',
} as const;

// ─── Log Events ───
export const LOG_EVENTS = {
  ENTRY: 'log:entry',
} as const;
