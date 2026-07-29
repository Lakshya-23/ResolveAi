import { buildWorkflow } from '../orchestrator/workflow';
import { WorkflowStateType } from '../orchestrator/state';
import * as persistenceService from './persistence.service';
import * as githubService from './github.service';
import * as environmentService from './environment.service';
import * as toolFunctions from '../tools/tool-functions';
import { emitToSession } from './socket.service';
import { createLogger } from './logging.service';
import { Session } from '../shared/types';
import { WORKFLOW_STATUS, MAX_IMPLEMENTATION_RETRIES } from '../shared/constants';
import { WORKFLOW_EVENTS, AGENT_EVENTS, SESSION_EVENTS } from '../shared/events';

const log = createLogger('SessionService');

/**
 * Start the full workflow for a session.
 * Runs asynchronously — the API returns immediately.
 */
export async function startWorkflow(sessionId: string): Promise<void> {
  const session = persistenceService.getSession(sessionId);

  log.info('Starting workflow', { sessionId, repo: session.repository.fullName });

  // Emit status
  emitToSession(sessionId, WORKFLOW_EVENTS.STATUS_CHANGED, {
    sessionId,
    status: WORKFLOW_STATUS.PREPARING_ENVIRONMENT,
    stage: 'Preparing Environment',
  });

  try {
    const workflow = buildWorkflow();

    // Build initial state from session
    const initialState: Partial<WorkflowStateType> = {
      sessionId: session.id,
      githubToken: (session as any)._githubToken || '',
      repoOwner: session.repository.owner,
      repoName: session.repository.name,
      repoFullName: session.repository.fullName,
      cloneUrl: session.repository.cloneUrl,
      defaultBranch: session.repository.defaultBranch,
      issueNumber: session.issue.number,
      issueTitle: session.issue.title,
      issueBody: session.issue.body || '',
      issueLabels: session.issue.labels,
      issueComments: session.issue.comments?.map((c) => `${c.author}: ${c.body}`) || [],
      llmConfig: session.llmConfig,
      agentSkills: session.agentSkills,
      specialInstructions: session.specialInstructions,
      tavilyApiKey: session.tavilyApiKey,
      environmentVariables: session.environmentVariables,
      repositoryProfile: null,
      repositoryContext: null,
      containerId: null,
      environmentReport: null,
      planningReport: null,
      implementationReport: null,
      validationReport: null,
      reviewReport: null,
      currentStage: 'Starting',
      status: WORKFLOW_STATUS.PREPARING_ENVIRONMENT,
      approvalStatus: 'pending',
      pullRequestUrl: null,
      retryCount: 0,
      maxRetries: MAX_IMPLEMENTATION_RETRIES,
      executionHistory: session.executionHistory || [],
      error: null,
    };

    // Stream events from the workflow
    const stream = await workflow.stream(initialState as any, {
      streamMode: 'updates',
    });

    for await (const update of stream) {
      // Each update is { nodeName: { ...stateUpdates } }
      for (const [nodeName, stateUpdate] of Object.entries(update)) {
        const updates = stateUpdate as Partial<WorkflowStateType>;

        log.info('Workflow node completed', { sessionId, node: nodeName });

        // Update session in DB
        const currentSession = persistenceService.getSession(sessionId);
        if (updates.repositoryProfile) currentSession.repositoryProfile = updates.repositoryProfile;
        if (updates.repositoryContext) currentSession.repositoryContext = updates.repositoryContext;
        if (updates.environmentReport) currentSession.environmentReport = updates.environmentReport;
        if (updates.planningReport) currentSession.planningReport = updates.planningReport;
        if (updates.implementationReport) currentSession.implementationReport = updates.implementationReport;
        if (updates.validationReport) currentSession.validationReport = updates.validationReport;
        if (updates.reviewReport) currentSession.reviewReport = updates.reviewReport;
        if (updates.currentStage) currentSession.currentStage = updates.currentStage;
        if (updates.status) currentSession.status = updates.status as any;
        if (updates.executionHistory) currentSession.executionHistory = updates.executionHistory;
        if (updates.retryCount !== undefined) currentSession.retryCount = updates.retryCount;
        currentSession.updatedAt = new Date().toISOString();

        persistenceService.saveSession(currentSession);

        // Emit to frontend
        emitToSession(sessionId, WORKFLOW_EVENTS.STAGE_CHANGED, {
          sessionId,
          node: nodeName,
          stage: updates.currentStage,
          status: updates.status,
        });

        emitToSession(sessionId, AGENT_EVENTS.COMPLETED, {
          sessionId,
          agent: nodeName,
          stage: updates.currentStage,
        });
      }
    }

    // Workflow complete — waiting for approval
    const finalSession = persistenceService.getSession(sessionId);
    emitToSession(sessionId, SESSION_EVENTS.UPDATED, {
      sessionId,
      status: finalSession.status,
      stage: finalSession.currentStage,
    });

    log.info('Workflow completed, waiting for approval', { sessionId });
  } catch (error: any) {
    log.error('Workflow failed', { sessionId, error: error.message });

    // Update session with failure
    const session = persistenceService.getSession(sessionId);
    session.status = WORKFLOW_STATUS.FAILED;
    session.currentStage = 'Failed';
    session.executionHistory.push({
      timestamp: new Date().toISOString(),
      component: 'Workflow',
      action: 'Workflow failed',
      result: 'failed',
      details: error.message,
    });
    session.updatedAt = new Date().toISOString();
    persistenceService.saveSession(session);

    emitToSession(sessionId, SESSION_EVENTS.FAILED, {
      sessionId,
      error: error.message,
    });
  }
}

/**
 * Handle approval — create branch, commit, push, and create PR.
 */
export async function handleApproval(sessionId: string, action: 'approve' | 'reject' | 'cancel'): Promise<void> {
  const session = persistenceService.getSession(sessionId);

  if (action === 'approve') {
    log.info('Approval received, creating PR', { sessionId });

    session.status = WORKFLOW_STATUS.CREATING_PULL_REQUEST;
    session.currentStage = 'Creating Pull Request';
    session.approvalStatus = 'approved';
    session.updatedAt = new Date().toISOString();
    persistenceService.saveSession(session);

    emitToSession(sessionId, WORKFLOW_EVENTS.STATUS_CHANGED, {
      sessionId,
      status: WORKFLOW_STATUS.CREATING_PULL_REQUEST,
    });

    try {
      const containerId = session.environmentReport?.containerId;
      if (!containerId) throw new Error('No container found');

      const branchName = `resolveai/issue-${session.issue.number}`;

      // Create branch, commit, push
      await toolFunctions.createBranch(containerId, branchName);
      await toolFunctions.commitChanges(
        containerId,
        `fix: resolve issue #${session.issue.number} — ${session.issue.title}`
      );
      await toolFunctions.pushBranch(containerId, branchName);

      // Create PR via GitHub API
      const prBody = buildPRBody(session);
      const pr = await githubService.createPullRequest(
        (session as any)._githubToken || '',
        session.repository.owner,
        session.repository.name,
        {
          title: `fix: ${session.issue.title}`,
          body: prBody,
          head: branchName,
          base: session.repository.defaultBranch,
        }
      );

      session.pullRequestUrl = pr.url;
      session.status = WORKFLOW_STATUS.COMPLETED;
      session.currentStage = 'Pull Request Created';
      session.updatedAt = new Date().toISOString();
      session.executionHistory.push({
        timestamp: new Date().toISOString(),
        component: 'PRCreation',
        action: 'Pull Request created',
        result: 'success',
        details: pr.url,
      });
      persistenceService.saveSession(session);

      emitToSession(sessionId, SESSION_EVENTS.COMPLETED, {
        sessionId,
        pullRequestUrl: pr.url,
      });

      // Cleanup
      await environmentService.cleanupEnvironment(sessionId, containerId);
    } catch (error: any) {
      log.error('PR creation failed', { sessionId, error: error.message });
      session.status = WORKFLOW_STATUS.FAILED;
      session.currentStage = 'PR Creation Failed';
      session.executionHistory.push({
        timestamp: new Date().toISOString(),
        component: 'PRCreation',
        action: 'PR creation failed',
        result: 'failed',
        details: error.message,
      });
      session.updatedAt = new Date().toISOString();
      persistenceService.saveSession(session);

      emitToSession(sessionId, SESSION_EVENTS.FAILED, {
        sessionId,
        error: error.message,
      });
    }
  } else {
    // Reject or cancel
    session.status = action === 'cancel' ? WORKFLOW_STATUS.CANCELLED : WORKFLOW_STATUS.FAILED;
    session.approvalStatus = action === 'cancel' ? 'cancelled' : 'rejected';
    session.currentStage = action === 'cancel' ? 'Cancelled' : 'Rejected';
    session.updatedAt = new Date().toISOString();
    persistenceService.saveSession(session);

    // Cleanup container
    const containerId = session.environmentReport?.containerId;
    if (containerId) {
      await environmentService.cleanupEnvironment(sessionId, containerId);
    }
  }
}

/**
 * Handle user feedback — routes prompt/instructions back to the Supervisor Agent
 * which decides the appropriate worker agent to execute.
 */
export async function handleUserFeedback(sessionId: string, userFeedback: string): Promise<void> {
  const session = persistenceService.getSession(sessionId);

  log.info('Routing user feedback to Supervisor Agent', { sessionId, prompt: userFeedback.slice(0, 100) });

  const containerId = session.environmentReport?.containerId;
  if (!containerId) {
    throw new Error('No container found for session');
  }

  try {
    const workflow = buildWorkflow();

    // Check if feedback is '__continue__' (user resetting max iteration limit counter)
    const isContinueReset = userFeedback === '__continue__';
    const cleanFeedback = isContinueReset
      ? 'User requested to continue workflow execution.'
      : userFeedback;

    // Restore state from current session
    const restoredState: Partial<WorkflowStateType> = {
      sessionId: session.id,
      githubToken: (session as any)._githubToken || '',
      repoOwner: session.repository.owner,
      repoName: session.repository.name,
      repoFullName: session.repository.fullName,
      cloneUrl: session.repository.cloneUrl,
      defaultBranch: session.repository.defaultBranch,
      issueNumber: session.issue.number,
      issueTitle: session.issue.title,
      issueBody: session.issue.body || '',
      issueLabels: session.issue.labels,
      issueComments: session.issue.comments?.map((c) => `${c.author}: ${c.body}`) || [],
      llmConfig: session.llmConfig,
      agentSkills: session.agentSkills,
      specialInstructions: session.specialInstructions,
      tavilyApiKey: session.tavilyApiKey,
      environmentVariables: session.environmentVariables,
      repositoryProfile: session.repositoryProfile,
      repositoryContext: session.repositoryContext,
      containerId,
      environmentReport: session.environmentReport,
      planningReport: session.planningReport,
      implementationReport: session.implementationReport,
      validationReport: session.validationReport,
      reviewReport: session.reviewReport,
      supervisorDecision: (session as any).supervisorDecision || null,
      supervisorDecisionLog: (session as any).supervisorDecisionLog || [],
      supervisorIterations: isContinueReset ? 0 : (session as any).supervisorIterations || 0,
      supervisorInstructions: '',
      userFeedback: cleanFeedback,
      workflowPhase: (session as any).workflowPhase || 'IMPLEMENTING',
      currentStage: 'User Feedback Received — Routing to Supervisor',
      status: WORKFLOW_STATUS.IMPLEMENTING,
      approvalStatus: 'pending',
      pullRequestUrl: null,
      retryCount: session.retryCount || 0,
      maxRetries: MAX_IMPLEMENTATION_RETRIES,
      executionHistory: session.executionHistory || [],
      error: null,
    };

    emitToSession(sessionId, WORKFLOW_EVENTS.STAGE_CHANGED, {
      sessionId,
      node: 'supervisor',
      stage: 'Supervisor Evaluating User Feedback',
      status: WORKFLOW_STATUS.IMPLEMENTING,
    });

    // Stream workflow execution starting from supervisor
    const stream = await workflow.stream(restoredState as any, {
      streamMode: 'updates',
    });

    for await (const update of stream) {
      for (const [nodeName, stateUpdate] of Object.entries(update)) {
        const updates = stateUpdate as Partial<WorkflowStateType>;
        log.info('Workflow node completed', { sessionId, node: nodeName });

        const currentSession = persistenceService.getSession(sessionId);
        if (updates.planningReport) currentSession.planningReport = updates.planningReport;
        if (updates.implementationReport) currentSession.implementationReport = updates.implementationReport;
        if (updates.validationReport) currentSession.validationReport = updates.validationReport;
        if (updates.reviewReport) currentSession.reviewReport = updates.reviewReport;
        if (updates.supervisorDecision) (currentSession as any).supervisorDecision = updates.supervisorDecision;
        if (updates.supervisorDecisionLog) (currentSession as any).supervisorDecisionLog = updates.supervisorDecisionLog;
        if (updates.supervisorIterations !== undefined) (currentSession as any).supervisorIterations = updates.supervisorIterations;
        if (updates.workflowPhase) (currentSession as any).workflowPhase = updates.workflowPhase;
        if (updates.currentStage) currentSession.currentStage = updates.currentStage;
        if (updates.status) currentSession.status = updates.status as any;
        if (updates.executionHistory) currentSession.executionHistory = updates.executionHistory;
        currentSession.updatedAt = new Date().toISOString();

        persistenceService.saveSession(currentSession);

        emitToSession(sessionId, WORKFLOW_EVENTS.STAGE_CHANGED, {
          sessionId,
          node: nodeName,
          stage: updates.currentStage,
          status: updates.status,
        });

        emitToSession(sessionId, AGENT_EVENTS.COMPLETED, {
          sessionId,
          agent: nodeName,
          stage: updates.currentStage,
        });
      }
    }

    const finalSession = persistenceService.getSession(sessionId);
    emitToSession(sessionId, SESSION_EVENTS.UPDATED, {
      sessionId,
      status: finalSession.status,
      stage: finalSession.currentStage,
    });

    log.info('User feedback workflow iteration completed', { sessionId });
  } catch (error: any) {
    log.error('User feedback workflow iteration failed', { sessionId, error: error.message });
    session.status = WORKFLOW_STATUS.FAILED;
    session.currentStage = 'Revision Failed';
    session.executionHistory.push({
      timestamp: new Date().toISOString(),
      component: 'Supervisor',
      action: 'User feedback processing failed',
      result: 'failed',
      details: error.message,
    });
    session.updatedAt = new Date().toISOString();
    persistenceService.saveSession(session);

    emitToSession(sessionId, SESSION_EVENTS.FAILED, { sessionId, error: error.message });
  }
}

function buildPRBody(session: Session): string {
  const lines: string[] = [];
  lines.push(`Resolves #${session.issue.number}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(session.implementationReport?.summaryOfChanges || 'Changes made by ResolvAI');
  lines.push('');

  if (session.planningReport?.implementationStrategy) {
    lines.push('## Implementation Strategy');
    lines.push(session.planningReport.implementationStrategy);
    lines.push('');
  }

  if (session.validationReport) {
    lines.push('## Validation Results');
    lines.push(`- **Build:** ${session.validationReport.buildStatus}`);
    lines.push(`- **Tests:** ${session.validationReport.testStatus}`);
    lines.push(`- **Lint:** ${session.validationReport.lintStatus}`);
    lines.push('');
  }

  if (session.reviewReport) {
    lines.push('## Code Quality Review');
    lines.push(`- **Engineering Quality:** ${session.reviewReport.engineeringQuality || 'N/A'}`);
    lines.push(`- **Completeness:** ${session.reviewReport.implementationCompleteness || 'N/A'}`);
    lines.push(session.reviewReport.summary || '');
    lines.push('');
  }

  lines.push('---');
  lines.push('*This PR was generated by [ResolvAI](https://github.com/resolveai) — an autonomous multi-agent software engineering system.*');
  return lines.join('\n');
}
