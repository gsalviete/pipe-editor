// StateStore tests — persistence, isolation per workspace, corruption
// tolerance, run-history cap.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';
import type { PipelineIR } from '../ir';
import { StateStore } from './store';

const FIXTURE_IR = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
    'utf-8',
  ),
) as PipelineIR;

describe('StateStore', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pipe-editor-state-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('saves, reads back (across instances), lists and deletes pipelines', () => {
    const store = new StateStore(dataDir, '/ws/a');
    expect(store.getPipeline('proj')).toBeNull();

    const saved = store.savePipeline('proj', FIXTURE_IR);
    expect(saved.savedAt).toBeTruthy();

    // A fresh instance (simulating a backend restart) sees the data.
    const reopened = new StateStore(dataDir, '/ws/a');
    expect(reopened.getPipeline('proj')?.ir.project.name).toBe(FIXTURE_IR.project.name);
    expect(Object.keys(reopened.listPipelines())).toEqual(['proj']);

    expect(reopened.deletePipeline('proj')).toBe(true);
    expect(reopened.deletePipeline('proj')).toBe(false);
    expect(new StateStore(dataDir, '/ws/a').getPipeline('proj')).toBeNull();
  });

  it('namespaces state per workspace root', () => {
    new StateStore(dataDir, '/ws/a').savePipeline('proj', FIXTURE_IR);
    expect(new StateStore(dataDir, '/ws/b').getPipeline('proj')).toBeNull();
    expect(readdirSync(join(dataDir, 'workspaces'))).toHaveLength(1);
  });

  it('tolerates corrupt files by starting clean', () => {
    const store = new StateStore(dataDir, '/ws/a');
    store.savePipeline('proj', FIXTURE_IR);
    // Corrupt every file in the workspace dir.
    const wsDir = join(dataDir, 'workspaces', readdirSync(join(dataDir, 'workspaces'))[0]);
    writeFileSync(join(wsDir, 'pipelines.json'), '{ not json');
    const reopened = new StateStore(dataDir, '/ws/a');
    expect(reopened.getPipeline('proj')).toBeNull();
    // …and can save again over the corruption.
    reopened.savePipeline('proj', FIXTURE_IR);
    expect(new StateStore(dataDir, '/ws/a').getPipeline('proj')).not.toBeNull();
  });

  it('caps persisted run history at 20, newest first', () => {
    const store = new StateStore(dataDir, '/ws/a');
    for (let i = 0; i < 60; i++) {
      store.appendRun({
        id: `run-${i}`,
        status: 'finished',
        createdAt: new Date().toISOString(),
        projectPath: 'proj',
      });
    }
    const runs = new StateStore(dataDir, '/ws/a').listRuns();
    expect(runs).toHaveLength(20);
    expect(runs[0].id).toBe('run-59');
    expect(runs[19].id).toBe('run-40');
  });

  it('write failures never throw (read-only data dir)', () => {
    const store = new StateStore(join(dataDir, 'blocked'), '/ws/a');
    mkdirSync(join(dataDir, 'blocked'), { recursive: true });
    // Make the parent read-only so mkdir of workspaces/ fails.
    // (chmod-based tests are flaky across platforms; simulate by
    // pointing the dir at a FILE instead.)
    writeFileSync(join(dataDir, 'blocked', 'workspaces'), 'a file, not a dir');
    expect(() => store.savePipeline('proj', FIXTURE_IR)).not.toThrow();
  });
});
