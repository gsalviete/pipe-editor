// Durable workspace state: autosaved working pipelines (per project)
// and run history. JSON files under PIPE_EDITOR_DATA_DIR (default
// ~/.pipe-editor), namespaced by a hash of the workspace root so
// multiple workspaces never collide. Writes are atomic (tmp+rename);
// corrupt or missing files degrade to empty state, never to a crash.

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { PipelineIR } from '../ir';

export interface SavedPipeline {
  projectPath: string;
  ir: PipelineIR;
  savedAt: string;
}

export interface PersistedRun {
  id: string;
  status: 'finished' | 'error';
  createdAt: string;
  projectPath: string;
  result?: unknown;
  error?: string;
}

// Result logs are already bounded by the Executor. Keeping the same history
// depth as the in-memory registry prevents local state from growing for ever.
const MAX_PERSISTED_RUNS = 20;

export function defaultDataDir(): string {
  return process.env.PIPE_EDITOR_DATA_DIR ?? join(homedir(), '.pipe-editor');
}

export class StateStore {
  private readonly dir: string;
  private pipelines: Record<string, SavedPipeline> | null = null;
  private runs: PersistedRun[] | null = null;

  constructor(dataDir: string, workspaceRealpath: string) {
    const key = createHash('sha1').update(workspaceRealpath).digest('hex').slice(0, 12);
    this.dir = join(dataDir, 'workspaces', key);
  }

  // ── Pipelines ──────────────────────────────────────────────────────

  getPipeline(projectPath: string): SavedPipeline | null {
    return this.loadPipelines()[projectPath] ?? null;
  }

  savePipeline(projectPath: string, ir: PipelineIR): SavedPipeline {
    const saved: SavedPipeline = {
      projectPath,
      ir,
      savedAt: new Date().toISOString(),
    };
    const all = this.loadPipelines();
    all[projectPath] = saved;
    this.write('pipelines.json', all);
    return saved;
  }

  deletePipeline(projectPath: string): boolean {
    const all = this.loadPipelines();
    if (all[projectPath] === undefined) return false;
    delete all[projectPath];
    this.write('pipelines.json', all);
    return true;
  }

  /** projectPath → savedAt, for lightweight "edited" badges. */
  listPipelines(): Record<string, { savedAt: string }> {
    const out: Record<string, { savedAt: string }> = {};
    for (const [path, saved] of Object.entries(this.loadPipelines())) {
      out[path] = { savedAt: saved.savedAt };
    }
    return out;
  }

  // ── Run history ────────────────────────────────────────────────────

  appendRun(run: PersistedRun): void {
    const runs = this.loadRuns();
    runs.unshift(run);
    if (runs.length > MAX_PERSISTED_RUNS) runs.length = MAX_PERSISTED_RUNS;
    this.write('runs.json', runs);
  }

  listRuns(): PersistedRun[] {
    return [...this.loadRuns()];
  }

  // ── Internals ──────────────────────────────────────────────────────

  private loadPipelines(): Record<string, SavedPipeline> {
    if (this.pipelines === null) {
      this.pipelines = this.read<Record<string, SavedPipeline>>('pipelines.json', {});
    }
    return this.pipelines;
  }

  private loadRuns(): PersistedRun[] {
    if (this.runs === null) {
      const raw = this.read<PersistedRun[]>('runs.json', []);
      this.runs = Array.isArray(raw) ? raw : [];
    }
    return this.runs;
  }

  private read<T>(file: string, fallback: T): T {
    try {
      const raw = readFileSync(join(this.dir, file), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback; // missing or corrupt — start clean
    }
  }

  private write(file: string, value: unknown): void {
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      const target = join(this.dir, file);
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, JSON.stringify(value, null, 1));
      renameSync(tmp, target);
    } catch {
      // Persistence is a convenience; a read-only disk must not take
      // down detection/execution.
    }
  }
}
