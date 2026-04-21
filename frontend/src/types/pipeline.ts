// Mirror of backend types — keep in sync with backend/src/common/types/pipeline.types.ts

export type JobStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'waiting';

export type JobConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | null;

export type NodeStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'failure'
  | 'skipped'
  | 'cancelled'
  | 'timed_out';

export interface StepDefinition {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  if?: string;
  continueOnError?: boolean;
}

export interface MatrixStrategy {
  matrix: Record<string, string[]>;
  failFast?: boolean;
  maxParallel?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  jobId: string;
  workflowId: string;
  runsOn: string | string[];
  steps: StepDefinition[];
  if?: string;
  strategy?: MatrixStrategy;
  status: NodeStatus;
  conclusion: JobConclusion;
  level: number;
  position: { x: number; y: number };
  runJobId?: number;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface PipelineGraph {
  workflowId: string;
  workflowName: string;
  runId?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  isValid: boolean;
  validationErrors: string[];
}

export interface RepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

export interface WorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'disabled_manually' | 'disabled_inactivity';
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: JobStatus;
  conclusion: JobConclusion;
  headBranch: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  triggerEvent: string;
  actor: string;
}

export interface StepRun {
  name: string;
  number: number;
  status: JobStatus;
  conclusion: JobConclusion;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobRun {
  id: number;
  name: string;
  status: JobStatus;
  conclusion: JobConclusion;
  startedAt: string | null;
  completedAt: string | null;
  steps: StepRun[];
  runnerName?: string;
}

export type LogLevel = 'info' | 'warning' | 'error' | 'debug' | 'command';

export interface LogLine {
  lineNumber: number;
  timestamp: string | null;
  level: LogLevel;
  content: string;
  isError: boolean;
}

export interface StepLog {
  stepName: string;
  stepNumber: number;
  lines: LogLine[];
  hasErrors: boolean;
  errorCount: number;
}

export interface JobLog {
  jobId: number;
  jobName: string;
  steps: StepLog[];
  totalLines: number;
  hasErrors: boolean;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

// ─── Demo mode ────────────────────────────────────────────────────────────────

export interface DemoWorkflow {
  name: string;
  label: string;
  description: string;
}
