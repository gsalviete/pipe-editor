import axios, { type AxiosInstance } from 'axios';
import type {
  GitHubUser,
  RepoSummary,
  WorkflowSummary,
  WorkflowRun,
  JobRun,
  PipelineGraph,
  JobLog,
  DemoWorkflow,
} from '../types/pipeline';

// ─── Axios instance ───────────────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
});

// Attach token from store on every request
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('gh_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const getOAuthUrl = async (state = 'pipe-editor'): Promise<string> => {
  const { data } = await http.get<{ url: string }>('/github/auth/url', {
    params: { state },
  });
  return data.url;
};

export const exchangeCode = async (code: string): Promise<string> => {
  const { data } = await http.post<{ accessToken: string }>(
    '/github/auth/callback',
    { code },
  );
  return data.accessToken;
};

// ─── User ─────────────────────────────────────────────────────────────────────

export const getUser = async (): Promise<GitHubUser> => {
  const { data } = await http.get<GitHubUser>('/github/user');
  return data;
};

// ─── Repos ────────────────────────────────────────────────────────────────────

export const listRepos = async (): Promise<RepoSummary[]> => {
  const { data } = await http.get<RepoSummary[]>('/github/repos');
  return data;
};

// ─── Workflows ────────────────────────────────────────────────────────────────

export const listWorkflows = async (
  owner: string,
  repo: string,
): Promise<WorkflowSummary[]> => {
  const { data } = await http.get<WorkflowSummary[]>(
    `/github/repos/${owner}/${repo}/workflows`,
  );
  return data;
};

export const listWorkflowRuns = async (
  owner: string,
  repo: string,
  workflowId: number,
  perPage = 10,
): Promise<WorkflowRun[]> => {
  const { data } = await http.get<WorkflowRun[]>(
    `/github/repos/${owner}/${repo}/workflows/${workflowId}/runs`,
    { params: { perPage } },
  );
  return data;
};

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const listRunJobs = async (
  owner: string,
  repo: string,
  runId: number,
): Promise<JobRun[]> => {
  const { data } = await http.get<JobRun[]>(
    `/github/repos/${owner}/${repo}/runs/${runId}/jobs`,
  );
  return data;
};

// ─── Graph ────────────────────────────────────────────────────────────────────

export const getWorkflowGraph = async (
  owner: string,
  repo: string,
  workflowId: number,
  runId?: number,
): Promise<{ graph: PipelineGraph; parseErrors: string[] }> => {
  const { data } = await http.get<{ graph: PipelineGraph; parseErrors: string[] }>(
    `/graph/repos/${owner}/${repo}/workflows/${workflowId}`,
    { params: runId ? { runId } : undefined },
  );
  return data;
};

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const getJobLogs = async (
  owner: string,
  repo: string,
  runId: number,
  jobId: number,
): Promise<JobLog> => {
  const { data } = await http.get<JobLog>(
    `/logs/repos/${owner}/${repo}/runs/${runId}/jobs/${jobId}`,
  );
  return data;
};

// ─── Demo ─────────────────────────────────────────────────────────────────────

export const listDemoWorkflows = async (): Promise<DemoWorkflow[]> => {
  const { data } = await http.get<DemoWorkflow[]>('/demo/workflows');
  return data;
};

export const getDemoGraph = async (
  name: string,
): Promise<{ graph: PipelineGraph; parseErrors: string[] }> => {
  const { data } = await http.get<{ graph: PipelineGraph; parseErrors: string[] }>(
    `/demo/workflows/${name}/graph`,
  );
  return data;
};

export const getDemoJobLogs = async (
  workflowName: string,
  jobId: string,
): Promise<JobLog> => {
  const { data } = await http.get<JobLog>(
    `/demo/workflows/${workflowName}/logs/${jobId}`,
  );
  return data;
};
