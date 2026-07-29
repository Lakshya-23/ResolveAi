import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

function getDefaultSocketPath(): string {
  if (process.env.DOCKER_SOCKET_PATH && fs.existsSync(process.env.DOCKER_SOCKET_PATH)) {
    return process.env.DOCKER_SOCKET_PATH;
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const userDockerSocket = `/run/user/${uid}/docker.sock`;
  if (fs.existsSync(userDockerSocket)) {
    return userDockerSocket;
  }
  const podmanSocket = `/run/user/${uid}/podman/podman.sock`;
  if (fs.existsSync(podmanSocket)) {
    return podmanSocket;
  }
  if (process.env.DOCKER_SOCKET_PATH) {
    return process.env.DOCKER_SOCKET_PATH;
  }
  return '/var/run/docker.sock';
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // LiteLLM Proxy
  litellm: {
    baseUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000',
  },

  // GitHub
  github: {
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  },

  // Database
  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'resolveai.db'),
  },

  // Docker
  docker: {
    socketPath: getDefaultSocketPath(),
    images: {
      node: process.env.DOCKER_IMAGE_NODE || 'issue-resolver-node',
      python: process.env.DOCKER_IMAGE_PYTHON || 'issue-resolver-python',
      cpp: process.env.DOCKER_IMAGE_CPP || 'issue-resolver-cpp',
    },
    workspaceBase: process.env.DOCKER_WORKSPACE_BASE || '/tmp/resolveai-workspaces',
  },

  // Tavily
  tavily: {
    apiKey: process.env.TAVILY_API_KEY || '',
  },

  // Session
  session: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || '120000', 10),
  },

  // Supervisor
  supervisor: {
    maxIterations: parseInt(process.env.SUPERVISOR_MAX_ITERATIONS || '25', 10),
  },

  // Git Author Identity
  git: {
    authorName: process.env.GIT_AUTHOR_NAME || 'ResolvAI',
    authorEmail: process.env.GIT_AUTHOR_EMAIL || 'bot@resolvai.dev',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs'),
  },
} as const;

export type Config = typeof config;
