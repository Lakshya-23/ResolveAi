import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as persistenceService from '../services/persistence.service';
import * as githubService from '../services/github.service';
import * as sessionService from '../services/session.service';
import * as dockerService from '../services/docker.service';
import * as toolFunctions from '../tools/tool-functions';
import { validateLLMConfig } from '../services/llm.service';
import { Session, ApiResponse, CreateSessionRequest } from '../shared/types';
import { WORKFLOW_STATUS } from '../shared/constants';
import { ValidationError } from '../shared/errors';
import { createLogger } from '../services/logging.service';

const log = createLogger('SessionController');

/**
 * POST /api/sessions
 * Create a new engineering session and trigger workflow.
 */
export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateSessionRequest;
    const token = (req as any).githubToken as string;

    // Validation: If web search is enabled, check process.env.TAVILY_API_KEY
    if (body.tavilyApiKey === 'ENV' || body.tavilyApiKey === 'true') {
      if (!process.env.TAVILY_API_KEY || !process.env.TAVILY_API_KEY.trim()) {
        throw new ValidationError(
          'Web search is enabled, but no TAVILY_API_KEY is configured in backend .env. Please add TAVILY_API_KEY to backend .env or disable web search to start the session.'
        );
      }
    }

    // Fetch repository and issue details from GitHub
    const [repository, issue] = await Promise.all([
      githubService.getRepository(token, body.repository.owner, body.repository.name),
      githubService.getIssue(token, body.repository.owner, body.repository.name, body.issueNumber),
    ]);

    const now = new Date().toISOString();
    const session: Session = {
      id: uuidv4(),
      status: WORKFLOW_STATUS.INITIALIZING,
      currentStage: 'Session Created',
      repository,
      issue,
      llmConfig: body.llmConfig,
      agentSkills: body.agentSkills,
      specialInstructions: body.specialInstructions || '',
      environmentVariables: body.environmentVariables || {},
      tavilyApiKey: body.tavilyApiKey || '',
      repositoryProfile: null,
      repositoryContext: null,
      environmentReport: null,
      planningReport: null,
      implementationReport: null,
      validationReport: null,
      reviewReport: null,
      approvalStatus: 'pending',
      pullRequestUrl: null,
      executionHistory: [
        {
          timestamp: now,
          component: 'SessionService',
          action: 'Session created',
          result: 'success',
          details: `Repository: ${repository.fullName}, Issue: #${issue.number}`,
        },
      ],
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store token on session in memory DB
    (session as any)._githubToken = token;

    persistenceService.saveSession(session);

    // Trigger LangGraph workflow asynchronously
    sessionService.startWorkflow(session.id).catch((err) => {
      log.error('Workflow start error', { sessionId: session.id, error: err.message });
    });

    const response: ApiResponse = { success: true, data: session };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sessions/validate-llm
 * Validate LLM credentials & model availability.
 */
export async function validateLLM(req: Request, res: Response, next: NextFunction) {
  try {
    const { provider, model, apiKey } = req.body;
    const result = await validateLLMConfig({ provider, model, apiKey });
    res.json({ success: result.valid, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/sessions
 * List sessions with optional status filter.
 */
export async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = persistenceService.listSessions({ status, limit, offset });

    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sessions/:id
 * Get a specific session.
 */
export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const session = persistenceService.getSession(sessionId);

    const response: ApiResponse = { success: true, data: session };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sessions/:id/approve
 * Handle human approval (approve / reject / cancel).
 */
export async function handleApproval(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const { action } = req.body as { action: 'approve' | 'reject' | 'cancel' };
    const session = persistenceService.getSession(sessionId);

    if (session.status !== WORKFLOW_STATUS.WAITING_FOR_APPROVAL) {
      throw new ValidationError('Session is not waiting for approval');
    }

    session.approvalStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';
    session.updatedAt = new Date().toISOString();
    session.executionHistory.push({
      timestamp: session.updatedAt,
      component: 'HumanApproval',
      action: `User ${action}`,
      result: action === 'approve' ? 'success' : 'info',
    });

    if (action === 'cancel') {
      session.status = WORKFLOW_STATUS.CANCELLED;
    }

    const token = (req as any).githubToken as string;
    if (token) {
      (session as any)._githubToken = token;
    }
    persistenceService.saveSession(session);

    // Asynchronously trigger PR creation / repo commit / container cleanup
    sessionService.handleApproval(sessionId, action).catch((err) => {
      log.error('Failed processing approval action in background', { sessionId, action, error: err.message });
    });

    const response: ApiResponse = { success: true, data: session };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sessions/:id/files
 * List all workspace files in the session container.
 */
export async function getWorkspaceFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const session = persistenceService.getSession(sessionId);
    const containerId = session.environmentReport?.containerId;
    if (!containerId) {
      throw new ValidationError('No active container environment found for this session');
    }

    const fileListResult = await dockerService.execInContainer(containerId, [
      'find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./__pycache__/*" -not -path "./venv/*" -not -path "./.venv/*" -not -path "./dist/*" -not -path "./build/*" | head -1000 | sed "s|^\\./||"',
    ]);
    const files = fileListResult.stdout.split('\n').filter(Boolean).sort();

    res.json({ success: true, data: { files } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sessions/:id/file-content
 * Read content of a specific file from the session container.
 */
export async function getFileContent(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const filePath = req.query.path as string;
    if (!filePath) {
      throw new ValidationError('File path parameter "path" is required');
    }

    const session = persistenceService.getSession(sessionId);
    const containerId = session.environmentReport?.containerId;
    if (!containerId) {
      throw new ValidationError('No active container environment found for this session');
    }

    const content = await toolFunctions.readFile(containerId, filePath);
    res.json({ success: true, data: { path: filePath, content } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sessions/:id/diff
 * Get git diff from the session container.
 */
export async function getSessionDiff(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const session = persistenceService.getSession(sessionId);
    const containerId = session.environmentReport?.containerId;
    if (!containerId) {
      throw new ValidationError('No active container environment found for this session');
    }

    const diff = await toolFunctions.gitDiff(containerId);
    res.json({ success: true, data: { diff } });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sessions/:id/revise
 * Send a revision prompt — re-runs Writer → Tester → Reviewer pipeline.
 */
export async function reviseSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const { prompt } = req.body as { prompt: string };
    if (!prompt || !prompt.trim()) {
      throw new ValidationError('Revision prompt is required');
    }

    const session = persistenceService.getSession(sessionId);
    if (session.status !== WORKFLOW_STATUS.WAITING_FOR_APPROVAL) {
      throw new ValidationError('Session is not in approval state — cannot request revisions');
    }

    // Update session status
    session.status = WORKFLOW_STATUS.IMPLEMENTING;
    session.currentStage = 'Revision Requested';
    session.approvalStatus = 'pending';
    session.executionHistory.push({
      timestamp: new Date().toISOString(),
      component: 'HumanApproval',
      action: 'Revision requested',
      result: 'info',
      details: prompt.slice(0, 200),
    });
    session.updatedAt = new Date().toISOString();

    const token = (req as any).githubToken as string;
    if (token) {
      (session as any)._githubToken = token;
    }
    persistenceService.saveSession(session);

    // Trigger user feedback workflow asynchronously
    sessionService.handleUserFeedback(sessionId, prompt).catch((err) => {
      log.error('User feedback workflow failed', { sessionId, error: err.message });
    });

    const response: ApiResponse = { success: true, data: session };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/sessions/:id
 * Cancel and delete a session.
 */
export async function deleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const session = persistenceService.getSession(sessionId);
    const containerId = session.environmentReport?.containerId;
    if (containerId) {
      await sessionService.handleApproval(sessionId, 'cancel');
    }
    persistenceService.deleteSession(sessionId);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/sessions
 * Clear all session history.
 */
export async function clearAllSessions(req: Request, res: Response, next: NextFunction) {
  try {
    persistenceService.deleteAllSessions();
    res.json({ success: true, message: 'All session history cleared' });
  } catch (error) {
    next(error);
  }
}
