import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';
import { createLogger } from '../services/logging.service';
import { ApiResponse } from '../shared/types';

const log = createLogger('ErrorMiddleware');

/**
 * Global error handler — catches all errors and returns structured JSON responses.
 * Raw stack traces are logged but never sent to the client.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Operational errors — expected, log at warn level
    log.warn('Operational error', {
      message: err.message,
      statusCode: err.statusCode,
    });

    const response: ApiResponse = {
      success: false,
      error: err.message,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Unexpected errors — log full stack at error level
  log.error('Unexpected error', {
    message: err.message,
    stack: err.stack,
  });

  const response: ApiResponse = {
    success: false,
    error: 'An unexpected error occurred',
  };
  res.status(500).json(response);
}
