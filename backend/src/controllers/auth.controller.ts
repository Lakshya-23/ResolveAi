import { Request, Response, NextFunction } from 'express';
import * as githubService from '../services/github.service';
import { ApiResponse } from '../shared/types';

/**
 * POST /api/auth/validate
 * Validates a GitHub PAT and returns user info + scopes.
 */
export async function validateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).githubToken as string;
    const result = await githubService.validateToken(token);

    const response: ApiResponse = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
}
