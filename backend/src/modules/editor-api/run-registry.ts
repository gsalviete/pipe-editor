// In-memory registry of pipeline runs. POST /api/execute starts a
// run here; GET /api/execute/:id/events subscribes (buffered events
// are replayed so a subscriber that connects after the POST returns
// never misses anything); POST /api/execute/:id/abort cancels via
// the run's AbortController.
//
// Local single-user tool: no persistence, bounded retention.

import { randomUUID } from 'crypto';
import {
  execute,
  ExecuteEvent,
  ExecuteOptions,
  ExecuteResult,
} from '../executor';
import type { PipelineIR } from '../ir';

export type RunEvent =
  | ExecuteEvent
  | { type: 'run-finished'; result: ExecuteResult }
  | { type: 'run-error'; message: string };

export type RunStatus = 'running' | 'finished' | 'error';

export interface RunSummary {
  id: string;
  status: RunStatus;
  createdAt: string;
  projectPath: string;
  result?: ExecuteResult;
  error?: string;
}

interface InternalRun {
  summary: RunSummary;
  events: RunEvent[];
  listeners: Set<(event: RunEvent) => void>;
  abortController: AbortController;
  bufferedOutputChars: number;
}

export type ExecuteFn = (opts: ExecuteOptions) => Promise<ExecuteResult>;

/** Durable sink for finished runs (survives backend restarts). */
export interface RunPersistence {
  appendRun(run: {
    id: string;
    status: 'finished' | 'error';
    createdAt: string;
    projectPath: string;
    result?: unknown;
    error?: string;
  }): void;
  listRuns(): {
    id: string;
    status: 'finished' | 'error';
    createdAt: string;
    projectPath: string;
    result?: unknown;
    error?: string;
  }[];
}

const TERMINAL_TYPES = new Set(['run-finished', 'run-error']);
const MAX_REPLAYABLE_OUTPUT_CHARS = 512 * 1024;

export function isTerminalRunEvent(event: RunEvent): boolean {
  return TERMINAL_TYPES.has(event.type);
}

export class RunRegistry {
  private readonly runs = new Map<string, InternalRun>();

  constructor(
    private readonly executeFn: ExecuteFn = execute,
    private readonly maxRetainedRuns = 20,
    private readonly persistence: RunPersistence | null = null,
  ) {}

  start(ir: PipelineIR, absoluteProjectPath: string, displayPath: string): string {
    const id = randomUUID();
    const run: InternalRun = {
      summary: {
        id,
        status: 'running',
        createdAt: new Date().toISOString(),
        projectPath: displayPath,
      },
      events: [],
      listeners: new Set(),
      abortController: new AbortController(),
      bufferedOutputChars: 0,
    };
    this.runs.set(id, run);
    this.evictOldRuns();

    void this.executeFn({
      ir,
      projectPath: absoluteProjectPath,
      signal: run.abortController.signal,
      onEvent: (event) => this.push(run, event),
    })
      .then((result) => {
        run.summary.status = 'finished';
        run.summary.result = result;
        this.push(run, { type: 'run-finished', result });
        this.persist(run.summary);
      })
      .catch((err: Error) => {
        run.summary.status = 'error';
        run.summary.error = err.message;
        this.push(run, { type: 'run-error', message: err.message });
        this.persist(run.summary);
      });

    return id;
  }

  get(id: string): RunSummary | undefined {
    return this.runs.get(id)?.summary;
  }

  /**
   * All known runs, newest first: live in-memory runs plus persisted
   * history from previous backend sessions (deduplicated by id).
   */
  list(): RunSummary[] {
    const live = [...this.runs.values()].map((r) => r.summary).reverse();
    if (this.persistence === null) return live;
    const liveIds = new Set(live.map((r) => r.id));
    let persisted: RunSummary[] = [];
    try {
      persisted = this.persistence
        .listRuns()
        .filter((r) => !liveIds.has(r.id)) as unknown as RunSummary[];
    } catch {
      /* history is a convenience */
    }
    return [...live, ...persisted];
  }

  private persist(summary: RunSummary): void {
    if (this.persistence === null || summary.status === 'running') return;
    try {
      this.persistence.appendRun({
        id: summary.id,
        status: summary.status,
        createdAt: summary.createdAt,
        projectPath: summary.projectPath,
        result: summary.result,
        error: summary.error,
      });
    } catch {
      /* history is a convenience */
    }
  }

  /**
   * Subscribe to a run's events. Buffered events are replayed
   * synchronously before live delivery starts. Returns unsubscribe.
   */
  subscribe(id: string, listener: (event: RunEvent) => void): (() => void) | undefined {
    const run = this.runs.get(id);
    if (run === undefined) return undefined;
    for (const event of run.events) listener(event);
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  abort(id: string): boolean {
    const run = this.runs.get(id);
    if (run === undefined) return false;
    if (run.summary.status === 'running') run.abortController.abort();
    return true;
  }

  private push(run: InternalRun, event: RunEvent): void {
    // Live subscribers still receive every chunk. Only replay storage is
    // bounded; a client connecting late receives the beginning of the log and
    // the terminal result contains the bounded tail from the Executor.
    if (event.type !== 'stage-output') {
      run.events.push(event);
    } else if (run.bufferedOutputChars < MAX_REPLAYABLE_OUTPUT_CHARS) {
      const remaining = MAX_REPLAYABLE_OUTPUT_CHARS - run.bufferedOutputChars;
      const chunk = event.chunk.slice(0, remaining);
      if (chunk.length > 0) {
        run.events.push({ ...event, chunk });
        run.bufferedOutputChars += chunk.length;
      }
    }
    for (const listener of run.listeners) {
      try {
        listener(event);
      } catch {
        /* a broken subscriber must not affect the run or other subscribers */
      }
    }
  }

  private evictOldRuns(): void {
    if (this.runs.size <= this.maxRetainedRuns) return;
    for (const [id, run] of this.runs) {
      if (this.runs.size <= this.maxRetainedRuns) break;
      if (run.summary.status !== 'running') this.runs.delete(id);
    }
  }
}
