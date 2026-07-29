import { StateGraph, END } from '@langchain/langgraph';
import { WorkflowState, WorkflowStateType } from './state';
import {
  supervisorNode,
  plannerNode,
  writerNode,
  testerNode,
  reviewerNode,
} from './orchestrator';
import { analyzeRepository } from '../analysis/repository-analysis';
import { prepareEnvironment } from '../services/environment.service';
import * as dockerService from '../services/docker.service';
import * as toolFunctions from '../tools/tool-functions';
import { createLogger } from '../services/logging.service';
import { WORKFLOW_STATUS, WORKFLOW_PHASE } from '../shared/constants';
import { config } from '../config';

const log = createLogger('Workflow');

/**
 * Repository Analysis node — deterministic pre-step, no LLM.
 */
async function analysisNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Running repository analysis', { sessionId: state.sessionId });

  const containerId = state.containerId!;

  // Get file list from container
  const fileListResult = await dockerService.execInContainer(containerId, [
    'find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./__pycache__/*" -not -path "./venv/*" -not -path "./.venv/*" | head -2000 | sed "s|^\\./||"',
  ]);
  const fileList = fileListResult.stdout.split('\n').filter(Boolean);

  // Try to read package.json
  let packageJson: any = null;
  try {
    const content = await toolFunctions.readFile(containerId, 'package.json');
    packageJson = JSON.parse(content);
  } catch {}

  // Try to read README
  let readmeContent: string | null = null;
  try {
    readmeContent = await toolFunctions.readFile(containerId, 'README.md');
  } catch {
    try { readmeContent = await toolFunctions.readFile(containerId, 'readme.md'); } catch {}
  }

  const result = analyzeRepository({
    fileList,
    packageJson,
    readmeContent,
    repoFullName: state.repoFullName,
  });

  return {
    repositoryProfile: result.profile,
    repositoryContext: result.context,
    currentStage: 'Analysis Complete',
    workflowPhase: WORKFLOW_PHASE.PLANNING,
    status: WORKFLOW_STATUS.PLANNING,
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'RepositoryAnalysis',
        action: 'Analysis completed',
        result: 'success',
        details: `Ecosystem: ${result.profile.ecosystem}, Type: ${result.profile.projectType}`,
      },
    ],
  };
}

/**
 * Environment Setup node — deterministic pre-step, no LLM.
 */
async function environmentNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Preparing environment', { sessionId: state.sessionId });

  const report = await prepareEnvironment({
    sessionId: state.sessionId,
    profile: state.repositoryProfile || null,
    cloneUrl: state.cloneUrl,
    branch: state.defaultBranch,
    githubToken: state.githubToken,
    environmentVariables: state.environmentVariables || {},
  });

  return {
    containerId: report.containerId,
    environmentReport: report,
    currentStage: 'Environment Ready',
    workflowPhase: WORKFLOW_PHASE.INITIALIZING,
    status: WORKFLOW_STATUS.ANALYZING,
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'EnvironmentService',
        action: 'Environment prepared',
        result: report.errors.length > 0 ? 'failed' : 'success',
        details: `Image: ${report.image}, Deps: ${report.dependencyStatus}`,
      },
    ],
  };
}

/**
 * Dynamic routing function based on Supervisor Agent's JSON decision.
 */
export function routeFromSupervisor(state: WorkflowStateType): string {
  const decision = state.supervisorDecision;
  const iterations = state.supervisorIterations || 0;
  const maxIterations = config.supervisor.maxIterations;

  log.info('Routing from Supervisor', {
    sessionId: state.sessionId,
    iterations,
    maxIterations,
    decision: decision?.next_agent,
  });

  // Iteration limit check: pause execution and prompt user to Continue or Cancel
  if (iterations >= maxIterations) {
    log.warn(`Supervisor reached max iterations (${maxIterations}). Pausing for user prompt.`, { sessionId: state.sessionId });
    return '__end__';
  }

  if (!decision) return 'planner';

  switch (decision.next_agent) {
    case 'planner':
      return 'planner';
    case 'writer':
      return 'writer';
    case 'tester':
      return 'tester';
    case 'reviewer':
      return 'reviewer';
    case 'user':
    case 'complete':
    default:
      return '__end__'; // Pauses workflow, awaiting human approval / PR creation
  }
}

/**
 * Build the Supervisor-Centric Multi-Agent LangGraph Workflow.
 *
 * Flow:
 *   __start__ → environment → analysis → supervisor
 *                                           ↕
 *                                 ┌─────────┼─────────┐
 *                                 ↓         ↓         ↓
 *                              planner   writer    tester
 *                                 │         │         │
 *                                 └─────────┴─────────┘
 *                                           ↓
 *                                       supervisor
 *                                           ↕
 *                                        reviewer
 *                                           ↓
 *                                       supervisor → __end__ (user/complete)
 */
export function buildWorkflow() {
  const workflow = new StateGraph(WorkflowState)
    .addNode('environment', environmentNode)
    .addNode('analysis', analysisNode)
    .addNode('supervisor', supervisorNode)
    .addNode('planner', plannerNode)
    .addNode('writer', writerNode)
    .addNode('tester', testerNode)
    .addNode('reviewer', reviewerNode)

    // Deterministic pre-steps
    .addEdge('__start__', 'environment')
    .addEdge('environment', 'analysis')
    .addEdge('analysis', 'supervisor')

    // Every worker agent returns directly to the Supervisor
    .addEdge('planner', 'supervisor')
    .addEdge('writer', 'supervisor')
    .addEdge('tester', 'supervisor')
    .addEdge('reviewer', 'supervisor')

    // Supervisor routes dynamically based on its LLM decision output
    .addConditionalEdges('supervisor', routeFromSupervisor, {
      planner: 'planner',
      writer: 'writer',
      tester: 'tester',
      reviewer: 'reviewer',
      __end__: '__end__',
    });

  return workflow.compile();
}
