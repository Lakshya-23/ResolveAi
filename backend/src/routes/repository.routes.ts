import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as repoController from '../controllers/repository.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/repositories — list user's repositories
router.get('/', repoController.listRepositories);

// GET /api/repositories/:owner/:name — get specific repo
router.get('/:owner/:name', repoController.getRepository);

// GET /api/repositories/:owner/:name/issues — list open issues
router.get('/:owner/:name/issues', repoController.listIssues);

// GET /api/repositories/:owner/:name/issues/:issueNumber — get issue with comments
router.get('/:owner/:name/issues/:issueNumber', repoController.getIssue);

export default router;
