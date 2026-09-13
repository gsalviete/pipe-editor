// Pure-logic tests for the Executor — no real Docker required.
// docker-client is mocked at the module boundary; the tests exercise
// the contract surface around validation, unrunnable detection,
// skip discipline, and aggregate status.
//
// Covers EXEC-AC-001…005 and parts of -015 (status equality on
// identical input; timestamps may differ).

import { readFileSync } from 'fs';
import { join } from 'path';
import { PipelineIR } from '../ir';

jest.mock('./docker-client', () => ({
  dockerAvailable: jest.fn().mockResolvedValue(true),
  runStageInContainer: jest.fn(),
}));

import { dockerAvailable, runStageInContainer } from './docker-client';
import { execute, InvalidExecuteOptionsError } from './index';

const FIXTURES = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
const FIXTURE_ROOT = join(FIXTURES, 'node-pnpm-nest-basic');

function loadFixtureIr(): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURE_ROOT, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

function mockRunStageAlwaysSucceeds(stdout = '', stderr = '') {
  (runStageInContainer as jest.Mock).mockImplementation(async () => ({
    exitCode: 0,
    stdout,
    stderr,
    aborted: false,
    argv: ['docker', 'run'],
  }));
}

describe('Executor (pure-logic)', () => {
  beforeEach(() => {
    (runStageInContainer as jest.Mock).mockReset();
    (dockerAvailable as jest.Mock).mockReset();
    (dockerAvailable as jest.Mock).mockResolvedValue(true);
  });

  it('T-EXEC-001 (EXEC-AC-001) — invalid IR rejects with InvalidExecuteOptionsError; no docker calls', async () => {
    await expect(
      execute({ ir: { version: '0.1.0' } as unknown as PipelineIR, projectPath: FIXTURE_ROOT }),
    ).rejects.toBeInstanceOf(InvalidExecuteOptionsError);
    expect(runStageInContainer).not.toHaveBeenCalled();
  });

  it('T-EXEC-002 (EXEC-AC-002) — PM-name null → unrunnable, stages: [], no docker calls', async () => {
    const ir = loadFixtureIr();
    ir.project.packageManager.name = null;
    ir.unresolved = [
      ...(ir.unresolved ?? []),
      {
        field: '/project/packageManager/name',
        reason: 'needs-user-input',
        message: 'No lockfile or packageManager field present.',
      },
    ];
    const res = await execute({ ir, projectPath: FIXTURE_ROOT });
    expect(res.aggregateStatus).toBe('unrunnable');
    expect(res.reason).toContain('/project/packageManager/name');
    expect(res.stages).toEqual([]);
    expect(runStageInContainer).not.toHaveBeenCalled();
  });

  it('T-EXEC-003 (EXEC-AC-003) — runtime.version null → unrunnable citing /project/runtime/version', async () => {
    const ir = loadFixtureIr();
    ir.project.runtime.version = null;
    ir.unresolved = [
      ...(ir.unresolved ?? []),
      {
        field: '/project/runtime/version',
        reason: 'needs-user-input',
        message: 'Runtime version is unknown.',
      },
    ];
    const res = await execute({ ir, projectPath: FIXTURE_ROOT });
    expect(res.aggregateStatus).toBe('unrunnable');
    expect(res.reason).toContain('/project/runtime/version');
    expect(runStageInContainer).not.toHaveBeenCalled();
  });

  it('T-EXEC-004 (EXEC-AC-004) — every stage disabled → unrunnable with empty-effective-chain reason; each Stage in stages[] as skipped:disabled', async () => {
    const ir = loadFixtureIr();
    ir.stages = ir.stages.map((s) => ({ ...s, enabled: false }));
    const res = await execute({ ir, projectPath: FIXTURE_ROOT });
    expect(res.aggregateStatus).toBe('unrunnable');
    expect(res.reason).toMatch(/empty-effective-chain/);
    // Every original Stage in the IR appears, each with appropriate skip.
    expect(res.stages).toHaveLength(ir.stages.length);
    const byId = new Map(res.stages.map((s) => [s.stageId, s]));
    expect(byId.get('install')?.status).toBe('skipped:disabled');
    expect(byId.get('lint')?.status).toBe('skipped:disabled');
    expect(byId.get('test')?.status).toBe('skipped:disabled');
    expect(byId.get('build')?.status).toBe('skipped:disabled');
    expect(byId.get('docker-build')?.status).toBe('skipped:docker-build-delegated');
    expect(runStageInContainer).not.toHaveBeenCalled();
  });

  it('T-EXEC-005 (EXEC-AC-005) — partially-disabled chain: disabled Stage appears as skipped:disabled; runnable Stages report their actual status', async () => {
    mockRunStageAlwaysSucceeds();
    const ir = loadFixtureIr();
    // Disable lint; keep install/test/build/docker-build as-is.
    ir.stages = ir.stages.map((s) => (s.id === 'lint' ? { ...s, enabled: false } : s));
    const res = await execute({ ir, projectPath: FIXTURE_ROOT });
    expect(res.aggregateStatus).toBe('passed');
    const byId = new Map(res.stages.map((s) => [s.stageId, s]));
    expect(byId.get('install')?.status).toBe('passed');
    expect(byId.get('lint')?.status).toBe('skipped:disabled');
    expect(byId.get('test')?.status).toBe('passed');
    expect(byId.get('build')?.status).toBe('passed');
    expect(byId.get('docker-build')?.status).toBe('skipped:docker-build-delegated');
    // runStageInContainer called for install, test, build (3 runnable Stages).
    expect(runStageInContainer).toHaveBeenCalledTimes(3);
  });

  it('docker-build is never started as a container, even when in the effective chain', async () => {
    mockRunStageAlwaysSucceeds();
    const ir = loadFixtureIr();
    await execute({ ir, projectPath: FIXTURE_ROOT });
    const calls = (runStageInContainer as jest.Mock).mock.calls as Array<[{ image: string }]>;
    for (const [req] of calls) {
      expect(req.image).not.toBe('docker:25');
    }
  });

  it('rejects when projectPath is missing / non-string / relative / not a directory', async () => {
    const ir = loadFixtureIr();
    await expect(
      // @ts-expect-error intentional misuse
      execute({ ir, projectPath: undefined }),
    ).rejects.toBeInstanceOf(InvalidExecuteOptionsError);
    await expect(
      execute({ ir, projectPath: 'relative/path' }),
    ).rejects.toBeInstanceOf(InvalidExecuteOptionsError);
    await expect(
      execute({ ir, projectPath: '/this/does/not/exist/anywhere' }),
    ).rejects.toBeInstanceOf(InvalidExecuteOptionsError);
  });

  it('stop-at-first-failure: subsequent runnable Stages become skipped:dependency-failed', async () => {
    let call = 0;
    (runStageInContainer as jest.Mock).mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        return { exitCode: 7, stdout: '', stderr: 'lint failed', aborted: false, argv: ['docker'] };
      }
      return { exitCode: 0, stdout: '', stderr: '', aborted: false, argv: ['docker'] };
    });

    const ir = loadFixtureIr();
    const res = await execute({ ir, projectPath: FIXTURE_ROOT });

    expect(res.aggregateStatus).toBe('failed');
    const byId = new Map(res.stages.map((s) => [s.stageId, s]));
    expect(byId.get('install')?.status).toBe('passed');
    expect(byId.get('lint')?.status).toBe('failed');
    expect(byId.get('lint')?.exitCode).toBe(7);
    expect(byId.get('lint')?.stderr).toContain('lint failed');
    expect(byId.get('test')?.status).toBe('skipped:dependency-failed');
    expect(byId.get('build')?.status).toBe('skipped:dependency-failed');
    expect(byId.get('docker-build')?.status).toBe('skipped:docker-build-delegated');
  });

  it('T-EXEC-015 (EXEC-AC-015) — determinism: two consecutive calls produce equal per-Stage status/exitCode (timestamps may differ)', async () => {
    mockRunStageAlwaysSucceeds('ok-stdout');
    const ir = loadFixtureIr();
    const a = await execute({ ir, projectPath: FIXTURE_ROOT });
    const b = await execute({ ir, projectPath: FIXTURE_ROOT });
    expect(a.stages.length).toBe(b.stages.length);
    for (let i = 0; i < a.stages.length; i++) {
      expect(a.stages[i].stageId).toBe(b.stages[i].stageId);
      expect(a.stages[i].status).toBe(b.stages[i].status);
      expect(a.stages[i].exitCode).toBe(b.stages[i].exitCode);
    }
  });
});
