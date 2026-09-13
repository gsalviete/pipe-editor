// Executor type contract — mirrors the Input/output contract section
// of docs/specs/pipeline-executor.spec.md (Accepted 2026-06-22).

import type { PipelineIR } from '../ir';

export type StageStatus =
  | 'passed'
  | 'failed'
  | 'skipped:disabled'
  | 'skipped:dependency-failed'
  | 'skipped:docker-build-delegated';

export interface StageResult {
  stageId: string;
  status: StageStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  skipReason?: string;
}

export type AggregateStatus = 'passed' | 'failed' | 'aborted' | 'unrunnable';

export interface ExecuteResult {
  aggregateStatus: AggregateStatus;
  reason: string | null;
  stages: StageResult[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

// Progress events emitted while execute() runs, when the caller passes
// `onEvent`. `stage-output` chunks arrive as the container produces
// them; `stage-finished` fires for every Stage in the IR, including
// skipped ones (with the skip result).
export type ExecuteEvent =
  | {
      type: 'stage-started';
      stageId: string;
      at: string;
      /** Container image the stage runs in — lets a UI offer a reproduce command. */
      image: string;
      /** The exact `sh -c` command line, corepack prefix included. */
      shellCommand: string;
    }
  | { type: 'stage-output'; stageId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'stage-finished'; result: StageResult };

export interface ExecuteOptions {
  ir: PipelineIR;
  projectPath: string;
  signal?: AbortSignal;
  workspaceStrategy?: 'temp-copy';
  /** Optional progress listener. Errors thrown by the listener are swallowed. */
  onEvent?: (event: ExecuteEvent) => void;
}

// Normative exclusion list, copy-time only (EXEC-FR-007). Once a Stage
// runs, /workspace is mutable; these directories are NOT re-excluded
// across Stages within the same execute() call.
export const WORKSPACE_COPY_EXCLUSIONS = [
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.cache',
  '.pnpm-store',
] as const;
