import { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../shared/errors';

/**
 * Extracts and validates the GitHub PAT from the Authorization header.
 * Sets req.githubToken for downstream use.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AuthenticationError('Missing Authorization header'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AuthenticationError('Invalid Authorization format. Use: Bearer <token>'));
  }

  const token = parts[1];
  if (!token || token.length < 10) {
    return next(new AuthenticationError('Invalid token'));
  }

  // Attach token to request for controllers/services
  (req as any).githubToken = token;
  next();
}
