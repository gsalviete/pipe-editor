// RunRegistry tests — the execute() dependency is injected as a fake
// so no Docker is involved.

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ExecuteOptions, ExecuteResult, StageResult } from '../executor';
import type { PipelineIR } from '../ir';
import { isTerminalRunEvent, RunEvent, RunRegistry } from './run-registry';

const FIXTURE_IR = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
    'utf-8',
  ),
) as PipelineIR;

function stageResult(stageId: string): StageResult {
  return {
    stageId,
    status: 'passed',
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 5,
  };
}

function executeResult(): ExecuteResult {
  return {
    aggregateStatus: 'passed',
    reason: null,
    stages: [stageResult('install')],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 10,
  };
}

function fakeExecute(
  behavior: 'resolve' | 'reject' | 'hang-until-abort' = 'resolve',
): (opts: ExecuteOptions) => Promise<ExecuteResult> {
  return async (opts) => {
    opts.onEvent?.({
      type: 'stage-started',
      stageId: 'install',
      at: new Date().toISOString(),
      image: 'node:20-alpine',
      shellCommand: 'corepack enable && pnpm install --frozen-lockfile',
    });
    opts.onEvent?.({ type: 'stage-output', stageId: 'install', stream: 'stdout', chunk: 'hello\n' });
    opts.onEvent?.({ type: 'stage-finished', result: stageResult('install') });
    if (behavior === 'reject') throw new Error('docker exploded');
    if (behavior === 'hang-until-abort') {
      await new Promise<void>((resolve) => {
        opts.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      return { ...executeResult(), aggregateStatus: 'aborted', reason: 'execution aborted by caller' };
    }
    return executeResult();
  };
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('RunRegistry', () => {
  it('streams progress events and finishes with run-finished; late subscribers get a full replay', async () => {
    const registry = new RunRegistry(fakeExecute());
    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');
    await settle();

    expect(registry.get(id)).toMatchObject({ status: 'finished', projectPath: 'project' });

    // Late subscription (after the run finished) replays everything.
    const seen: RunEvent[] = [];
    const unsub = registry.subscribe(id, (e) => seen.push(e));
    expect(unsub).toBeDefined();
    const types = seen.map((e) => e.type);
    expect(types).toEqual([
      'stage-started',
      'stage-output',
      'stage-finished',
      'run-finished',
    ]);
    expect(isTerminalRunEvent(seen[seen.length - 1])).toBe(true);
    unsub?.();
  });

  it('live subscribers receive events as they happen', async () => {
    let releaseRun: () => void = () => undefined;
    const gate = new Promise<void>((r) => (releaseRun = r));
    const registry = new RunRegistry(async (opts) => {
      opts.onEvent?.({
        type: 'stage-started',
        stageId: 'install',
        at: new Date().toISOString(),
        image: 'node:20-alpine',
        shellCommand: 'pnpm install',
      });
      await gate;
      return executeResult();
    });

    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');
    const seen: string[] = [];
    registry.subscribe(id, (e) => seen.push(e.type));
    expect(seen).toEqual(['stage-started']); // replayed
    expect(registry.get(id)?.status).toBe('running');

    releaseRun();
    await settle();
    expect(seen).toEqual(['stage-started', 'run-finished']);
    expect(registry.get(id)?.status).toBe('finished');
  });

  it('a rejecting execute() surfaces as run-error and status error', async () => {
    const registry = new RunRegistry(fakeExecute('reject'));
    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');
    await settle();

    expect(registry.get(id)).toMatchObject({ status: 'error', error: 'docker exploded' });
    const seen: RunEvent[] = [];
    registry.subscribe(id, (e) => seen.push(e));
    expect(seen[seen.length - 1]).toEqual({ type: 'run-error', message: 'docker exploded' });
  });

  it('abort() signals the run; unknown ids return false', async () => {
    const registry = new RunRegistry(fakeExecute('hang-until-abort'));
    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');
    expect(registry.get(id)?.status).toBe('running');

    expect(registry.abort('nope')).toBe(false);
    expect(registry.abort(id)).toBe(true);
    await settle();

    expect(registry.get(id)?.status).toBe('finished');
    expect(registry.get(id)?.result?.aggregateStatus).toBe('aborted');
  });

  it('retention: finished runs are evicted beyond the cap; running runs are kept', async () => {
    const registry = new RunRegistry(fakeExecute(), 2);
    const first = registry.start(FIXTURE_IR, '/abs/project', 'p1');
    await settle();
    const second = registry.start(FIXTURE_IR, '/abs/project', 'p2');
    await settle();
    const third = registry.start(FIXTURE_IR, '/abs/project', 'p3');
    await settle();

    expect(registry.get(first)).toBeUndefined();
    expect(registry.get(second)).toBeDefined();
    expect(registry.get(third)).toBeDefined();
  });

  it('a throwing subscriber does not break other subscribers', async () => {
    let releaseRun: () => void = () => undefined;
    const gate = new Promise<void>((r) => (releaseRun = r));
    const registry = new RunRegistry(async () => {
      await gate;
      return executeResult();
    });
    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');

    const good: string[] = [];
    registry.subscribe(id, () => {
      throw new Error('bad subscriber');
    });
    registry.subscribe(id, (e) => good.push(e.type));

    releaseRun();
    await settle();
    expect(good).toEqual(['run-finished']);
  });

  it('caps replayed output while preserving the terminal event (PRODUCT-AC-008)', async () => {
    const registry = new RunRegistry(async (opts) => {
      opts.onEvent?.({
        type: 'stage-output',
        stageId: 'install',
        stream: 'stdout',
        chunk: 'x'.repeat(600 * 1024),
      });
      return executeResult();
    });

    const id = registry.start(FIXTURE_IR, '/abs/project', 'project');
    await settle();

    const seen: RunEvent[] = [];
    registry.subscribe(id, (event) => seen.push(event));
    const replayedOutput = seen
      .filter((event): event is Extract<RunEvent, { type: 'stage-output' }> => event.type === 'stage-output')
      .reduce((total, event) => total + event.chunk.length, 0);

    expect(replayedOutput).toBe(512 * 1024);
    expect(seen.at(-1)?.type).toBe('run-finished');
  });
});
