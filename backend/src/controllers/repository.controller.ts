import { Request, Response, NextFunction } from 'express';
import * as githubService from '../services/github.service';
import { ApiResponse } from '../shared/types';

/**
 * GET /api/repositories
 * Lists repositories accessible to the authenticated user.
 */
export async function listRepositories(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).githubToken as string;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 30;

    const repos = await githubService.listRepositories(token, { page, perPage });

    const response: ApiResponse = { success: true, data: repos };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/repositories/:owner/:name
 * Get a specific repository.
 */
export async function getRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).githubToken as string;
    const owner = req.params.owner as string;
    const name = req.params.name as string;

    const repo = await githubService.getRepository(token, owner, name);

    const response: ApiResponse = { success: true, data: repo };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/repositories/:owner/:name/issues
 * Lists open issues for a repository.
 */
export async function listIssues(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).githubToken as string;
    const owner = req.params.owner as string;
    const name = req.params.name as string;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 30;

    const issues = await githubService.listIssues(token, owner, name, { page, perPage });

    const response: ApiResponse = { success: true, data: issues };
    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/repositories/:owner/:name/issues/:issueNumber
 * Get a specific issue with comments.
 */
export async function getIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).githubToken as string;
    const owner = req.params.owner as string;
    const name = req.params.name as string;
    const issueNumber = parseInt(req.params.issueNumber as string, 10);

    const issue = await githubService.getIssue(token, owner, name, issueNumber);

    const response: ApiResponse = { success: true, data: issue };
    res.json(response);
  } catch (error) {
    next(error);
  }
}
