import { Annotation } from '@langchain/langgraph';
import {
  RepositoryProfile,
  EnvironmentReport,
  PlanningReport,
  ImplementationReport,
  ValidationReport,
  ReviewReport,
  AgentLLMConfig,
  AgentSkills,
  ExecutionEvent,
  SupervisorDecision,
  SupervisorDecisionLog,
  WorkflowPhase,
} from '../shared/types';

/**
 * Shared Workflow State — the single source of truth for the entire pipeline.
 * Managed by LangGraph, passed between Supervisor and all specialized worker nodes.
 */
export const WorkflowState = Annotation.Root({
  // ─── Session Identity ───
  sessionId: Annotation<string>,
  githubToken: Annotation<string>,

  // ─── Repository ───
  repoOwner: Annotation<string>,
  repoName: Annotation<string>,
  repoFullName: Annotation<string>,
  cloneUrl: Annotation<string>,
  defaultBranch: Annotation<string>,

  // ─── Issue ───
  issueNumber: Annotation<number>,
  issueTitle: Annotation<string>,
  issueBody: Annotation<string>,
  issueLabels: Annotation<string[]>,
  issueComments: Annotation<string[]>,

  // ─── Configuration ───
  llmConfig: Annotation<AgentLLMConfig>,
  agentSkills: Annotation<AgentSkills | undefined>,
  specialInstructions: Annotation<string>,
  tavilyApiKey: Annotation<string>,
  environmentVariables: Annotation<Record<string, string>>,

  // ─── Analysis Results ───
  repositoryProfile: Annotation<RepositoryProfile | null>,
  repositoryContext: Annotation<string | null>,

  // ─── Environment ───
  containerId: Annotation<string | null>,
  environmentReport: Annotation<EnvironmentReport | null>,

  // ─── Agent Reports ───
  planningReport: Annotation<PlanningReport | null>,
  implementationReport: Annotation<ImplementationReport | null>,
  validationReport: Annotation<ValidationReport | null>,
  reviewReport: Annotation<ReviewReport | null>,

  // ─── Supervisor Control & Decisions ───
  supervisorDecision: Annotation<SupervisorDecision | null>,
  supervisorDecisionLog: Annotation<SupervisorDecisionLog[]>,
  supervisorIterations: Annotation<number>,
  supervisorInstructions: Annotation<string>,
  userFeedback: Annotation<string | null>,
  workflowPhase: Annotation<WorkflowPhase>,

  // ─── Workflow Control ───
  currentStage: Annotation<string>,
  status: Annotation<string>,
  approvalStatus: Annotation<string>,
  pullRequestUrl: Annotation<string | null>,

  // ─── Retry Tracking ───
  retryCount: Annotation<number>,
  maxRetries: Annotation<number>,

  // ─── Execution History ───
  executionHistory: Annotation<ExecutionEvent[]>,

  // ─── Error ───
  error: Annotation<string | null>,
});

export type WorkflowStateType = typeof WorkflowState.State;
