import { Octokit } from '@octokit/rest';
import { createLogger } from './logging.service';
import { GitHubRepository, GitHubIssue, GitHubComment } from '../shared/types';
import { GitHubApiError, InvalidTokenError, RepositoryNotFoundError } from '../shared/errors';

const log = createLogger('GitHubService');

/**
 * Creates an Octokit instance using a GitHub Personal Access Token.
 */
function createClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Validate a GitHub PAT by fetching the authenticated user.
 * Returns the username if valid.
 */
export async function validateToken(token: string): Promise<{ username: string; scopes: string[] }> {
  try {
    const client = createClient(token);
    const response = await client.rest.users.getAuthenticated();
    const scopes = (response.headers['x-oauth-scopes'] || '').split(',').map((s: string) => s.trim()).filter(Boolean);

    log.info('GitHub token validated', { username: response.data.login, scopes });
    return { username: response.data.login, scopes };
  } catch (error: any) {
    log.warn('GitHub token validation failed', { status: error.status });
    throw new InvalidTokenError();
  }
}

/**
 * List repositories accessible to the authenticated user.
 */
export async function listRepositories(
  token: string,
  options: { page?: number; perPage?: number; sort?: string } = {}
): Promise<GitHubRepository[]> {
  const client = createClient(token);
  const { page = 1, perPage = 30, sort = 'updated' } = options;

  try {
    const response = await client.rest.repos.listForAuthenticatedUser({
      page,
      per_page: perPage,
      sort: sort as any,
      direction: 'desc',
    });

    return response.data.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      visibility: repo.private ? 'private' : 'public',
      description: repo.description,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
    }));
  } catch (error: any) {
    log.error('Failed to list repositories', { status: error.status, message: error.message });
    throw new GitHubApiError(`Failed to list repositories: ${error.message}`, error.status);
  }
}

/**
 * Get a specific repository.
 */
export async function getRepository(
  token: string,
  owner: string,
  name: string
): Promise<GitHubRepository> {
  const client = createClient(token);

  try {
    const response = await client.rest.repos.get({ owner, repo: name });
    const repo = response.data;

    return {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      visibility: repo.private ? 'private' : 'public',
      description: repo.description,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
    };
  } catch (error: any) {
    if (error.status === 404) {
      throw new RepositoryNotFoundError(`${owner}/${name}`);
    }
    throw new GitHubApiError(`Failed to get repository: ${error.message}`, error.status);
  }
}

/**
 * List open issues for a repository.
 */
export async function listIssues(
  token: string,
  owner: string,
  name: string,
  options: { page?: number; perPage?: number } = {}
): Promise<GitHubIssue[]> {
  const client = createClient(token);
  const { page = 1, perPage = 30 } = options;

  try {
    const response = await client.rest.issues.listForRepo({
      owner,
      repo: name,
      state: 'open',
      page,
      per_page: perPage,
    });

    // Filter out pull requests (GitHub API returns PRs as issues)
    const issues = response.data.filter((issue) => !issue.pull_request);

    return issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      milestone: issue.milestone?.title ?? null,
      assignees: issue.assignees?.map((a) => a.login) ?? [],
      comments: [], // loaded separately when needed
      state: issue.state ?? 'open',
      url: issue.html_url,
    }));
  } catch (error: any) {
    throw new GitHubApiError(`Failed to list issues: ${error.message}`, error.status);
  }
}

/**
 * Get a specific issue with its comments.
 */
export async function getIssue(
  token: string,
  owner: string,
  name: string,
  issueNumber: number
): Promise<GitHubIssue> {
  const client = createClient(token);

  try {
    const [issueResponse, commentsResponse] = await Promise.all([
      client.rest.issues.get({ owner, repo: name, issue_number: issueNumber }),
      client.rest.issues.listComments({ owner, repo: name, issue_number: issueNumber, per_page: 100 }),
    ]);

    const issue = issueResponse.data;
    const comments: GitHubComment[] = commentsResponse.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? 'unknown',
      body: c.body ?? '',
      createdAt: c.created_at,
    }));

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      milestone: issue.milestone?.title ?? null,
      assignees: issue.assignees?.map((a) => a.login) ?? [],
      comments,
      state: issue.state ?? 'open',
      url: issue.html_url,
    };
  } catch (error: any) {
    if (error.status === 404) {
      throw new GitHubApiError(`Issue #${issueNumber} not found`, 404);
    }
    throw new GitHubApiError(`Failed to get issue: ${error.message}`, error.status);
  }
}

/**
 * Create a Pull Request.
 */
export async function createPullRequest(
  token: string,
  owner: string,
  name: string,
  params: {
    title: string;
    body: string;
    head: string;
    base: string;
  }
): Promise<{ url: string; number: number }> {
  const client = createClient(token);

  try {
    const response = await client.rest.pulls.create({
      owner,
      repo: name,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
    });

    log.info('Pull Request created', {
      repo: `${owner}/${name}`,
      number: response.data.number,
      url: response.data.html_url,
    });

    return {
      url: response.data.html_url,
      number: response.data.number,
    };
  } catch (error: any) {
    throw new GitHubApiError(`Failed to create Pull Request: ${error.message}`, error.status);
  }
}
