/**
 * Custom error classes for ResolvAI.
 * Each error type maps to a specific failure category from the spec.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Repository Errors ───

export class UnsupportedEcosystemError extends AppError {
  constructor(ecosystem: string) {
    super(`Unsupported ecosystem: ${ecosystem}. Only Node.js, Python, and C/C++ are supported.`, 400);
  }
}

export class RepositoryNotFoundError extends AppError {
  constructor(repo: string) {
    super(`Repository not found: ${repo}`, 404);
  }
}

export class RepositoryAnalysisError extends AppError {
  constructor(message: string) {
    super(`Repository analysis failed: ${message}`, 500);
  }
}

// ─── Authentication Errors ───

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super('Invalid or expired GitHub Personal Access Token', 401);
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(scope: string) {
    super(`Insufficient permissions. Required scope: ${scope}`, 403);
  }
}

// ─── Environment Errors ───

export class EnvironmentError extends AppError {
  constructor(message: string) {
    super(`Environment preparation failed: ${message}`, 500);
  }
}

export class DockerError extends AppError {
  constructor(message: string) {
    super(`Docker error: ${message}`, 500);
  }
}

export class DependencyInstallError extends AppError {
  constructor(message: string) {
    super(`Dependency installation failed: ${message}`, 500);
  }
}

// ─── Workflow Errors ───

export class SessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 404);
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(`Workflow error: ${message}`, 500);
  }
}

export class MaxRetriesExceededError extends AppError {
  constructor(stage: string, maxRetries: number) {
    super(`Maximum retries (${maxRetries}) exceeded at stage: ${stage}`, 500);
  }
}

// ─── Tool Errors ───

export class ToolExecutionError extends AppError {
  constructor(toolName: string, message: string) {
    super(`Tool '${toolName}' failed: ${message}`, 500);
  }
}

export class ToolPermissionError extends AppError {
  constructor(agentName: string, toolName: string) {
    super(`Agent '${agentName}' does not have permission to use tool '${toolName}'`, 403);
  }
}

// ─── LLM Errors ───

export class LLMError extends AppError {
  constructor(message: string) {
    super(`LLM error: ${message}`, 502);
  }
}

export class LLMRateLimitError extends AppError {
  constructor(provider: string) {
    super(`Rate limit exceeded for provider: ${provider}`, 429);
  }
}

// ─── GitHub Errors ───

export class GitHubApiError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(`GitHub API error: ${message}`, statusCode);
  }
}

export class PullRequestCreationError extends AppError {
  constructor(message: string) {
    super(`Pull Request creation failed: ${message}`, 500);
  }
}

// ─── Validation Errors ───

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}
