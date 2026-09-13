// HTTP client for the Editor (POST /api/detect, POST /api/generate).
// The error envelope matches the backend's:
//   { error: { code: string; message: string; detail?: unknown } }

import type { PipelineIR } from '@modules/ir';

export interface DetectResponse {
  ir: PipelineIR;
  warnings: { manifest: string; message: string }[];
}

export interface GenerateResponse {
  dockerfile: string;
  dockerignore: string;
}

export interface ErrorEnvelope {
  error: { code: string; message: string; detail?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<ErrorEnvelope> & Partial<T>;
  if (!res.ok) {
    const env = (json as ErrorEnvelope).error;
    throw new ApiError(
      res.status,
      env?.code ?? 'UNKNOWN',
      env?.message ?? `Request failed with status ${res.status}`,
      env?.detail,
    );
  }
  return json as T;
}

export function postDetect(projectPath: string): Promise<DetectResponse> {
  return post<DetectResponse>('/api/detect', { projectPath });
}

export function postGenerate(ir: PipelineIR): Promise<GenerateResponse> {
  return post<GenerateResponse>('/api/generate', { ir });
}

// ─── Multi-service workspace bundle ────────────────────────────────

export type ServiceStack = 'vite' | 'nestjs' | 'node-generic';
export type ServiceKind = 'frontend' | 'backend' | 'service';
export type ComposeMode = 'root' | 'per-service';
export type WorkspaceCiProvider = 'github-actions' | 'gitlab-ci';

export interface WorkspaceService {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  stack: ServiceStack;
  kind: ServiceKind;
  containerPort: number;
  hostPort: number;
  startCommand: string;
  ir: PipelineIR;
}

export interface WorkspacePlan {
  version: '0.1.0';
  name: string;
  workspacePath: string;
  services: WorkspaceService[];
  existingComposeFiles: string[];
  warnings: { path: string; message: string }[];
}

export interface WorkspaceArtifact {
  path: string;
  kind: 'dockerfile' | 'dockerignore' | 'nginx-config' | 'compose' | 'ci';
  serviceId?: string;
  content: string;
}

export interface WorkspaceCheck {
  id: string;
  status: 'passed' | 'failed';
  message: string;
}

export interface WorkspaceBundle {
  provider: WorkspaceCiProvider;
  composeMode: ComposeMode;
  artifacts: WorkspaceArtifact[];
  checks: WorkspaceCheck[];
}

export function postInspectWorkspace(projectPath: string): Promise<WorkspacePlan> {
  return post<WorkspacePlan>('/api/workspace/inspect', { projectPath });
}

export function postGenerateWorkspace(
  plan: WorkspacePlan,
  provider: WorkspaceCiProvider,
  composeMode: ComposeMode,
): Promise<WorkspaceBundle> {
  return post<WorkspaceBundle>('/api/workspace/generate', {
    plan,
    provider,
    composeMode,
  });
}

// ─── Project discovery ───────────────────────────────────────────────

export interface DiscoveredProject {
  path: string;
  name: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  scripts: string[];
  hasDockerfile: boolean;
  isMonorepoRoot: boolean;
  ciConfigs: string[];
}

export interface ProjectsResponse {
  workspaceRoot: string;
  projects: DiscoveredProject[];
}

export async function getProjects(): Promise<ProjectsResponse> {
  const res = await fetch('/api/projects');
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Partial<ErrorEnvelope>;
    throw new ApiError(
      res.status,
      json.error?.code ?? 'UNKNOWN',
      json.error?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return (await res.json()) as ProjectsResponse;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  isProject: boolean;
}

export interface WorkspaceDirectoryListing {
  workspaceRoot: string;
  currentPath: string;
  absolutePath: string;
  parentPath: string | null;
  isProject: boolean;
  directories: WorkspaceDirectoryEntry[];
}

export async function getDirectories(path = '.'): Promise<WorkspaceDirectoryListing> {
  const res = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
  const json = (await res.json().catch(() => ({}))) as
    | WorkspaceDirectoryListing
    | Partial<ErrorEnvelope>;
  if (!res.ok) {
    const envelope = json as Partial<ErrorEnvelope>;
    throw new ApiError(
      res.status,
      envelope.error?.code ?? 'UNKNOWN',
      envelope.error?.message ?? `Request failed with status ${res.status}`,
      envelope.error?.detail,
    );
  }
  return json as WorkspaceDirectoryListing;
}

export async function resolveDroppedDirectory(
  name: string,
): Promise<{ workspaceRoot: string; matches: string[] }> {
  const res = await fetch(`/api/directories/resolve?name=${encodeURIComponent(name)}`);
  const json = (await res.json().catch(() => ({}))) as
    | { workspaceRoot: string; matches: string[] }
    | Partial<ErrorEnvelope>;
  if (!res.ok) {
    const envelope = json as Partial<ErrorEnvelope>;
    throw new ApiError(
      res.status,
      envelope.error?.code ?? 'UNKNOWN',
      envelope.error?.message ?? `Request failed with status ${res.status}`,
      envelope.error?.detail,
    );
  }
  return json as { workspaceRoot: string; matches: string[] };
}

// ─── Local pipeline execution ────────────────────────────────────────

export type RunStageStatus =
  | 'passed'
  | 'failed'
  | 'skipped:disabled'
  | 'skipped:dependency-failed'
  | 'skipped:docker-build-delegated';

export interface StageRunResult {
  stageId: string;
  status: RunStageStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  skipReason?: string;
}

export interface RunResult {
  aggregateStatus: 'passed' | 'failed' | 'aborted' | 'unrunnable';
  reason: string | null;
  stages: StageRunResult[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type RunEvent =
  | { type: 'stage-started'; stageId: string; at: string; image: string; shellCommand: string }
  | { type: 'stage-output'; stageId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'stage-finished'; result: StageRunResult }
  | { type: 'run-finished'; result: RunResult }
  | { type: 'run-error'; message: string };

export interface RunSummary {
  id: string;
  status: 'running' | 'finished' | 'error';
  createdAt: string;
  projectPath: string;
  result?: RunResult;
  error?: string;
}

export async function listRuns(): Promise<{ runs: RunSummary[] }> {
  const res = await fetch('/api/execute');
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'run list failed');
  return (await res.json()) as { runs: RunSummary[] };
}

// ─── CI provider export ──────────────────────────────────────────────

export type CiProvider = 'github-actions' | 'gitlab-ci';

export interface CiExportArtifact {
  provider: CiProvider;
  filename: string;
  content: string;
}

export function postExport(provider: CiProvider, ir: PipelineIR): Promise<CiExportArtifact> {
  return post<CiExportArtifact>(`/api/export/${provider}`, { ir });
}

// ─── CI provider import (migration) ──────────────────────────────────

export interface ImportResponse {
  ir: PipelineIR;
  warnings: { message: string }[];
  provider: CiProvider;
}

export function postImport(content: string): Promise<ImportResponse> {
  return post<ImportResponse>('/api/import', { content, provider: 'auto' });
}

// ─── Workspace state (autosave / restore) ────────────────────────────

export interface SavedPipeline {
  projectPath: string;
  ir: PipelineIR;
  savedAt: string;
}

export async function getSavedPipeline(projectPath: string): Promise<SavedPipeline | null> {
  const res = await fetch(`/api/state/pipeline?projectPath=${encodeURIComponent(projectPath)}`);
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'saved pipeline fetch failed');
  return ((await res.json()) as { saved: SavedPipeline | null }).saved;
}

export async function putSavedPipeline(projectPath: string, ir: PipelineIR): Promise<void> {
  const res = await fetch('/api/state/pipeline', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, ir }),
  });
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'autosave failed');
}

export async function deleteSavedPipeline(projectPath: string): Promise<void> {
  const res = await fetch('/api/state/pipeline', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  });
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'discard failed');
}

export async function getSavedPipelinesIndex(): Promise<Record<string, { savedAt: string }>> {
  const res = await fetch('/api/state/pipelines');
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'saved index fetch failed');
  return ((await res.json()) as { pipelines: Record<string, { savedAt: string }> }).pipelines;
}

// ─── Pipeline doctor ─────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface DoctorFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  fix: string;
}

export interface Diagnosis {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  findings: DoctorFinding[];
}

export function postAdvise(ir: PipelineIR): Promise<Diagnosis> {
  return post<Diagnosis>('/api/advise', { ir });
}

export function postImportFromProject(
  projectPath: string,
  file: string,
): Promise<ImportResponse> {
  return post<ImportResponse>('/api/import/from-project', { projectPath, file });
}

export async function getExecuteAvailability(): Promise<{ available: boolean }> {
  const res = await fetch('/api/execute/availability');
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'availability probe failed');
  return (await res.json()) as { available: boolean };
}

export function startRun(projectPath: string, ir: PipelineIR): Promise<{ runId: string }> {
  return post<{ runId: string }>('/api/execute', { projectPath, ir });
}

export function abortRun(runId: string): Promise<{ aborting: true }> {
  return post<{ aborting: true }>(`/api/execute/${runId}/abort`, {});
}

/**
 * Subscribe to a run's SSE stream. Returns a close function. The
 * stream self-closes after a terminal event (run-finished/run-error);
 * onConnectionLost fires only for a drop BEFORE a terminal event.
 */
export function openRunStream(
  runId: string,
  onEvent: (event: RunEvent) => void,
  onConnectionLost: () => void,
): () => void {
  const es = new EventSource(`/api/execute/${runId}/events`);
  let terminal = false;
  es.onmessage = (msg: MessageEvent<string>) => {
    let event: RunEvent;
    try {
      event = JSON.parse(msg.data) as RunEvent;
    } catch {
      return;
    }
    if (event.type === 'run-finished' || event.type === 'run-error') {
      terminal = true;
      es.close();
    }
    onEvent(event);
  };
  es.onerror = () => {
    if (terminal) return;
    // EventSource retries by itself; only report when it gave up.
    if (es.readyState === EventSource.CLOSED) onConnectionLost();
  };
  return () => es.close();
}
