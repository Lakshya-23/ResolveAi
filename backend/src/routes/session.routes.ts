import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as sessionController from '../controllers/session.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// POST /api/sessions/validate-llm — test LLM key & model connection
router.post('/validate-llm', sessionController.validateLLM);

// POST /api/sessions — create a new engineering session
router.post('/', sessionController.createSession);

// GET /api/sessions — list sessions
router.get('/', sessionController.listSessions);

// GET /api/sessions/:id — get a session
router.get('/:id', sessionController.getSession);

// GET /api/sessions/:id/files — list workspace files in container
router.get('/:id/files', sessionController.getWorkspaceFiles);

// GET /api/sessions/:id/file-content — get file content from container
router.get('/:id/file-content', sessionController.getFileContent);

// POST /api/sessions/:id/approve — approve/reject/cancel
router.post('/:id/approve', sessionController.handleApproval);

// GET /api/sessions/:id/diff — get git diff from container
router.get('/:id/diff', sessionController.getSessionDiff);

// POST /api/sessions/:id/revise — request changes with a prompt
router.post('/:id/revise', sessionController.reviseSession);

// DELETE /api/sessions — clear all session history
router.delete('/', sessionController.clearAllSessions);

// DELETE /api/sessions/:id — delete a session
router.delete('/:id', sessionController.deleteSession);

export default router;
