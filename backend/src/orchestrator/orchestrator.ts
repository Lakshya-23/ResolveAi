import { WorkflowStateType } from './state';
import { runAgent } from '../agents/runtime';
import { createLogger } from '../services/logging.service';
import { WORKFLOW_STATUS, WORKFLOW_PHASE, AGENT_NAMES } from '../shared/constants';
import {
  PlanningReport,
  ImplementationReport,
  ValidationReport,
  ReviewReport,
  SupervisorDecision,
  SupervisorDecisionLog,
} from '../shared/types';
import { createSessionLLMClient, resolveLLMConfig } from '../services/llm.service';
import { loadPrompt } from '../services/prompt.service';
import { emitToSession } from '../services/socket.service';
import { AGENT_EVENTS } from '../shared/events';
import * as toolFunctions from '../tools/tool-functions';

const log = createLogger('Orchestrator');

/**
 * Parse a JSON report from agent response text.
 */
function parseReport<T>(response: string, reportName: string): T {
  if (!response || typeof response !== 'string') {
    return { rawResponse: String(response) } as any as T;
  }

  // 1. Try standard markdown code block: ```json ... ``` or ``` ... ```
  const blockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null) return parsed as T;
    } catch {}
  }

  // 2. Try extracting the first valid {...} JSON object from response text
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonCandidate = response.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonCandidate);
      if (typeof parsed === 'object' && parsed !== null) return parsed as T;
    } catch {}
  }

  // 3. Try direct JSON.parse
  try {
    const parsed = JSON.parse(response);
    if (typeof parsed === 'object' && parsed !== null) return parsed as T;
  } catch {}

  log.warn(`Could not parse ${reportName} as JSON, using raw text`);
  return { rawResponse: response } as any as T;
}

/**
 * Retrieve report directly from container filesystem (.resolveai/report.md) or fallback to response parsing.
 */
async function fetchOrSaveReport<T>(
  containerId: string,
  filePath: string,
  rawResponse: string,
  reportName: string
): Promise<T> {
  try {
    const fileContent = await toolFunctions.readFile(containerId, filePath);
    if (fileContent && fileContent.trim()) {
      log.info(`Retrieved ${reportName} directly from container file ${filePath}`);
      return parseReport<T>(fileContent, reportName);
    }
  } catch {
    log.info(`Container report file ${filePath} not found, using agent text output`);
  }

  const report = parseReport<T>(rawResponse, reportName);

  try {
    const contentToSave = typeof report === 'object' ? JSON.stringify(report, null, 2) : String(rawResponse);
    await toolFunctions.writeFile(containerId, filePath, contentToSave);
  } catch (err: any) {
    log.warn(`Could not persist ${reportName} to ${filePath}`, { error: err.message });
  }

  return report;
}

// ─── SUPERVISOR NODE (Central Intelligence) ───

/**
 * Supervisor node — Engineering Manager that analyzes current reports, execution history,
 * and user feedback, and determines the next workflow step.
 */
export async function supervisorNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const iteration = (state.supervisorIterations || 0) + 1;
  log.info(`Running Supervisor Agent (Iteration #${iteration})`, { sessionId: state.sessionId });

  // 1. Build prompt context for the Supervisor
  const supervisorPromptTemplate = loadPrompt('supervisor');

  const contextSummary = [
    `# Issue #${state.issueNumber}: ${state.issueTitle}`,
    state.issueBody || '',
    '',
    `## Current Workflow Phase: ${state.workflowPhase || WORKFLOW_PHASE.INITIALIZING}`,
    `## Supervisor Iteration: #${iteration}`,
    '',
    state.specialInstructions ? `\n## Special Instructions\n${state.specialInstructions}\n` : '',
    state.agentSkills?.supervisor ? `\n## Supervisor Custom Skill & Guidelines\n${state.agentSkills.supervisor}\n` : '',
    state.userFeedback ? `\n## Latest User Feedback\n${state.userFeedback}\n` : '',
    '## Available Reports So Far:',
    state.planningReport ? `### Planning Report\n${JSON.stringify(state.planningReport, null, 2)}` : '- Planning Report: None',
    state.implementationReport ? `### Implementation Report\n${JSON.stringify(state.implementationReport, null, 2)}` : '- Implementation Report: None',
    state.validationReport ? `### Validation Report\n${JSON.stringify(state.validationReport, null, 2)}` : '- Validation Report: None',
    state.reviewReport ? `### Review Report\n${JSON.stringify(state.reviewReport, null, 2)}` : '- Review Report: None',
    '',
    '## Previous Decision History:',
    ...(state.supervisorDecisionLog || []).map(
      (log) => `- Iteration #${log.iteration}: Selected [${log.next_agent}] — ${log.decisionSummary}`
    ),
  ].join('\n');

  const fullPrompt = `${supervisorPromptTemplate}\n\n---\n\n## Current Workflow State\n${contextSummary}`;

  // Helper function for intelligent default next_agent step if LLM response is omitted
  const getIntelligentNextAgent = (): string => {
    if (!state.planningReport) return 'planner';
    if (!state.implementationReport) return 'writer';
    if (!state.validationReport) return 'tester';
    if (!state.reviewReport) return 'reviewer';
    return 'user';
  };

  // 2. Call the Supervisor LLM directly
  let decision: SupervisorDecision;
  try {
    const llm = await createSessionLLMClient(state.llmConfig, AGENT_NAMES.SUPERVISOR);
    const response = await llm.invoke(fullPrompt);
    const responseText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    decision = parseReport<SupervisorDecision>(responseText, 'SupervisorDecision');

    // Default fallbacks if LLM omitted fields or returned invalid agent name
    const validAgents = ['planner', 'writer', 'tester', 'reviewer', 'user', 'complete'];
    if (!decision.next_agent || !validAgents.includes(decision.next_agent)) {
      decision.next_agent = getIntelligentNextAgent() as any;
    }
    if (!decision.decisionSummary) decision.decisionSummary = `Invoking ${decision.next_agent}`;
    if (!decision.workflow_status) decision.workflow_status = WORKFLOW_PHASE.PLANNING;
  } catch (err: any) {
    log.error('Supervisor LLM call failed, falling back to intelligent heuristic', { error: err.message });
    const nextStep = getIntelligentNextAgent();
    decision = {
      next_agent: nextStep as any,
      decisionSummary: `Proceeding to ${nextStep}`,
      instructions: `Execute ${nextStep} step`,
      workflow_status: nextStep === 'writer' ? WORKFLOW_PHASE.IMPLEMENTING : nextStep === 'tester' ? WORKFLOW_PHASE.VALIDATING : nextStep === 'reviewer' ? WORKFLOW_PHASE.REVIEWING : WORKFLOW_PHASE.PLANNING,
      checkpoint: true,
      requires_user: nextStep === 'user',
    };
  }

  // 3. Log decision
  const logEntry: SupervisorDecisionLog = {
    iteration,
    timestamp: new Date().toISOString(),
    decisionSummary: decision.decisionSummary,
    next_agent: decision.next_agent,
    workflow_status: decision.workflow_status as any,
  };

  const decisionLog = [...(state.supervisorDecisionLog || []), logEntry];

  // 4. Emit socket event for frontend activity feed
  if (state.sessionId) {
    emitToSession(state.sessionId, AGENT_EVENTS.ACTIVITY, {
      sessionId: state.sessionId,
      agent: AGENT_NAMES.SUPERVISOR,
      type: 'agent_completed',
      message: `Supervisor Decision #${iteration}: ${decision.decisionSummary}`,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    supervisorDecision: decision,
    supervisorDecisionLog: decisionLog,
    supervisorIterations: iteration,
    supervisorInstructions: decision.instructions || '',
    workflowPhase: decision.workflow_status as any,
    currentStage: `Supervisor: ${decision.decisionSummary}`,
    status: decision.next_agent === 'planner'
      ? WORKFLOW_STATUS.PLANNING
      : decision.next_agent === 'writer'
      ? WORKFLOW_STATUS.IMPLEMENTING
      : decision.next_agent === 'tester'
      ? WORKFLOW_STATUS.VALIDATING
      : decision.next_agent === 'reviewer'
      ? WORKFLOW_STATUS.REVIEWING
      : decision.next_agent === 'user'
      ? WORKFLOW_STATUS.WAITING_FOR_APPROVAL
      : decision.next_agent === 'complete'
      ? WORKFLOW_STATUS.COMPLETED
      : WORKFLOW_STATUS.IMPLEMENTING,
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'Supervisor',
        action: `Decision #${iteration}: ${decision.next_agent}`,
        result: 'info',
        details: decision.decisionSummary,
      },
    ],
  };
}

// ─── WORKER AGENT NODES ───

/**
 * Planner node — read-only analysis, produces PlanningReport.
 */
export async function plannerNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Running Planner Agent', { sessionId: state.sessionId });

  const issueContent = [
    `# Issue #${state.issueNumber}: ${state.issueTitle}`,
    '',
    state.issueBody || '(no description)',
    '',
    state.issueComments?.length
      ? `## Comments\n${state.issueComments.join('\n---\n')}`
      : '',
  ].join('\n');

  const response = await runAgent({
    agentName: AGENT_NAMES.PLANNER,
    llmConfig: state.llmConfig,
    containerId: state.containerId!,
    repositoryProfile: state.repositoryProfile,
    repositoryContext: state.repositoryContext || '',
    buildCommand: state.repositoryProfile?.commands?.build || null,
    testCommand: state.repositoryProfile?.commands?.test || null,
    lintCommand: state.repositoryProfile?.commands?.lint || null,
    tavilyApiKey: state.tavilyApiKey || '',
    sessionId: state.sessionId,
    context: {
      agentSkill: state.agentSkills?.planner || '',
      repositoryContext: state.repositoryContext || '',
      issueContent,
      specialInstructions: `${state.specialInstructions || ''}\n\n## Supervisor Instructions\n${state.supervisorInstructions || 'Analyze issue and produce plan.'}`,
      environmentReport: JSON.stringify(state.environmentReport, null, 2),
    },
    userMessage: `Analyze this issue and create an implementation plan based on Supervisor Instructions:\n\n${issueContent}`,
  });

  const report = await fetchOrSaveReport<PlanningReport>(
    state.containerId!,
    '.resolveai/planning_report.md',
    response,
    'PlanningReport'
  );

  return {
    planningReport: report,
    currentStage: 'Planner Completed',
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'Planner',
        action: 'Planning completed',
        result: 'success',
        details: report.problemSummary || 'Plan generated',
      },
    ],
  };
}

/**
 * Writer node — implements code changes, produces ImplementationReport.
 */
export async function writerNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Running Writer Agent', { sessionId: state.sessionId });

  const response = await runAgent({
    agentName: AGENT_NAMES.WRITER,
    llmConfig: state.llmConfig,
    containerId: state.containerId!,
    repositoryProfile: state.repositoryProfile,
    repositoryContext: state.repositoryContext || '',
    buildCommand: state.repositoryProfile?.commands?.build || null,
    testCommand: state.repositoryProfile?.commands?.test || null,
    lintCommand: state.repositoryProfile?.commands?.lint || null,
    tavilyApiKey: '',
    sessionId: state.sessionId,
    context: {
      agentSkill: state.agentSkills?.writer || '',
      repositoryContext: state.repositoryContext || '',
      issueContent: `Issue #${state.issueNumber}: ${state.issueTitle}\n\n${state.issueBody || ''}`,
      specialInstructions: `${state.specialInstructions || ''}\n\n## Supervisor Instructions\n${state.supervisorInstructions || 'Implement the code changes.'}`,
      environmentReport: JSON.stringify(state.environmentReport, null, 2),
      planningReport: JSON.stringify(state.planningReport, null, 2),
    },
    userMessage: `Implement changes following Supervisor Instructions and Planning Report:\n\n${JSON.stringify(state.planningReport, null, 2)}`,
  });

  const report = await fetchOrSaveReport<ImplementationReport>(
    state.containerId!,
    '.resolveai/implementation_report.md',
    response,
    'ImplementationReport'
  );

  return {
    implementationReport: report,
    currentStage: 'Writer Completed',
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'Writer',
        action: 'Implementation completed',
        result: 'success',
        details: report.summaryOfChanges || 'Code changes applied',
      },
    ],
  };
}

/**
 * Tester node — validates changes, produces ValidationReport.
 */
export async function testerNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Running Tester Agent', { sessionId: state.sessionId });

  const response = await runAgent({
    agentName: AGENT_NAMES.TESTER,
    llmConfig: state.llmConfig,
    containerId: state.containerId!,
    repositoryProfile: state.repositoryProfile,
    repositoryContext: state.repositoryContext || '',
    buildCommand: state.repositoryProfile?.commands?.build || null,
    testCommand: state.repositoryProfile?.commands?.test || null,
    lintCommand: state.repositoryProfile?.commands?.lint || null,
    tavilyApiKey: state.tavilyApiKey || '',
    sessionId: state.sessionId,
    context: {
      agentSkill: state.agentSkills?.tester || '',
      repositoryContext: state.repositoryContext || '',
      environmentReport: JSON.stringify(state.environmentReport, null, 2),
      implementationReport: JSON.stringify(state.implementationReport, null, 2),
      specialInstructions: `## Supervisor Instructions\n${state.supervisorInstructions || 'Run build, tests, and linter.'}`,
    },
    userMessage: 'Validate the implementation by running build, tests, and linter. Report all results.',
  });

  const report = await fetchOrSaveReport<ValidationReport>(
    state.containerId!,
    '.resolveai/validation_report.md',
    response,
    'ValidationReport'
  );

  return {
    validationReport: report,
    currentStage: 'Tester Completed',
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'Tester',
        action: 'Validation completed',
        result: report.buildStatus === 'failed' || report.testStatus === 'failed' ? 'failed' : 'success',
        details: `Build: ${report.buildStatus}, Tests: ${report.testStatus}, Lint: ${report.lintStatus}`,
      },
    ],
  };
}

/**
 * Reviewer node — quality evaluation, produces ReviewReport.
 */
export async function reviewerNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  log.info('Running Reviewer Agent', { sessionId: state.sessionId });

  const response = await runAgent({
    agentName: AGENT_NAMES.REVIEWER,
    llmConfig: state.llmConfig,
    containerId: state.containerId!,
    repositoryProfile: state.repositoryProfile,
    repositoryContext: state.repositoryContext || '',
    buildCommand: null,
    testCommand: null,
    lintCommand: null,
    tavilyApiKey: '',
    sessionId: state.sessionId,
    context: {
      agentSkill: state.agentSkills?.reviewer || '',
      repositoryContext: state.repositoryContext || '',
      issueContent: `Issue #${state.issueNumber}: ${state.issueTitle}\n\n${state.issueBody || ''}`,
      specialInstructions: `${state.specialInstructions || ''}\n\n## Supervisor Instructions\n${state.supervisorInstructions || 'Review code quality and completeness.'}`,
      planningReport: JSON.stringify(state.planningReport, null, 2),
      implementationReport: JSON.stringify(state.implementationReport, null, 2),
      validationReport: JSON.stringify(state.validationReport, null, 2),
    },
    userMessage: 'Evaluate engineering quality, completeness, and repository convention compliance. Do NOT decide next workflow step.',
  });

  const report = await fetchOrSaveReport<ReviewReport>(
    state.containerId!,
    '.resolveai/review_report.md',
    response,
    'ReviewReport'
  );

  return {
    reviewReport: report,
    currentStage: 'Reviewer Completed',
    executionHistory: [
      ...state.executionHistory,
      {
        timestamp: new Date().toISOString(),
        component: 'Reviewer',
        action: 'Quality review completed',
        result: 'success',
        details: `Quality: ${report.engineeringQuality || 'reviewed'}, Completeness: ${report.implementationCompleteness || 'reviewed'}`,
      },
    ],
  };
}
