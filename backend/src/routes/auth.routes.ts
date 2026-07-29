import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as authController from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/validate — validate a GitHub PAT
router.post('/validate', authMiddleware, authController.validateToken);

export default router;
