import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Axios instance pre-configured for the ResolvAI backend.
 * Token is injected from the auth store before each request.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

/**
 * Set the GitHub PAT for all subsequent API requests.
 */
export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

/**
 * Clear the auth token.
 */
export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
}

// ─── Auth ───

export async function validateToken() {
  const { data } = await api.post('/auth/validate');
  return data;
}

// ─── Repositories ───

export async function listRepositories(page = 1, perPage = 30) {
  const { data } = await api.get('/repositories', { params: { page, per_page: perPage } });
  return data;
}

export async function getRepository(owner: string, name: string) {
  const { data } = await api.get(`/repositories/${owner}/${name}`);
  return data;
}

export async function listIssues(owner: string, name: string, page = 1) {
  const { data } = await api.get(`/repositories/${owner}/${name}/issues`, { params: { page } });
  return data;
}

export async function getIssue(owner: string, name: string, issueNumber: number) {
  const { data } = await api.get(`/repositories/${owner}/${name}/issues/${issueNumber}`);
  return data;
}

// ─── Sessions ───

export async function validateLLM(config: { provider: string; model: string; apiKey?: string }) {
  const { data } = await api.post('/sessions/validate-llm', config);
  return data;
}

export async function createSession(body: any) {
  const { data } = await api.post('/sessions', body);
  return data;
}

export async function listSessions(params?: { status?: string; limit?: number; offset?: number }) {
  const { data } = await api.get('/sessions', { params });
  return data;
}

export async function getSession(sessionId: string) {
  const { data } = await api.get(`/sessions/${sessionId}`);
  return data;
}

export async function getWorkspaceFiles(sessionId: string) {
  const { data } = await api.get(`/sessions/${sessionId}/files`);
  return data;
}

export async function getFileContent(sessionId: string, filePath: string) {
  const { data } = await api.get(`/sessions/${sessionId}/file-content`, { params: { path: filePath } });
  return data;
}

export async function approveSession(sessionId: string, action: 'approve' | 'reject' | 'cancel') {
  const { data } = await api.post(`/sessions/${sessionId}/approve`, { action });
  return data;
}

export async function getSessionDiff(sessionId: string) {
  const { data } = await api.get(`/sessions/${sessionId}/diff`);
  return data;
}

export async function reviseSession(sessionId: string, prompt: string) {
  const { data } = await api.post(`/sessions/${sessionId}/revise`, { prompt });
  return data;
}

export async function deleteSession(sessionId: string) {
  const { data } = await api.delete(`/sessions/${sessionId}`);
  return data;
}

export async function clearAllSessions() {
  const { data } = await api.delete('/sessions');
  return data;
}

export default api;
