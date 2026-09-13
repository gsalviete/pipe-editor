// T-STATE-005 (STATE-AC-005) — one project, one saved pipeline.
//
// StateStore.savePipeline was keyed by the raw client string, so `demo-api`,
// `./demo-api`, `demo-api/` and the contained absolute path were four
// different saves for one project. Whether the restore bar and the picker's
// "edited" badges appeared therefore depended on how the user happened to
// type the path (adversarial review ARCH-05).

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import * as request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EditorApiModule } from './editor-api.module';
import { stateKeyFor } from './path-security';
import { PIPE_EDITOR_WORKSPACE_ROOT_ENV } from './workspace-root';

describe('stateKeyFor', () => {
  it('reduces every spelling of a contained path to one key', () => {
    const root = resolve('/ws');
    expect(stateKeyFor(root, resolve('/ws/demo-api'))).toBe('demo-api');
    expect(stateKeyFor(root, resolve('/ws/a/b'))).toBe('a/b');
  });

  it('reports the workspace root itself as ".", matching the project scan', () => {
    const root = resolve('/ws');
    expect(stateKeyFor(root, root)).toBe('.');
  });
});

describe('T-STATE-005 (STATE-AC-005) — over real HTTP', () => {
  let app: INestApplication;
  let root: string;
  let savedEnv: string | undefined;

  const IR = {
    version: '0.1.0',
    project: {
      name: 'demo-api',
      rootPath: '.',
      language: 'typescript',
      runtime: { name: 'node', version: '20' },
      packageManager: { name: 'npm', version: '10' },
    },
    stages: [],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };

  beforeAll(async () => {
    // realpath: on macOS `/var` is a symlink to `/private/var`, and
    // containment is checked against the root's realpath.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pipe-editor-statekey-')));
    mkdirSync(join(root, 'demo-api'));
    writeFileSync(join(root, 'demo-api', 'package.json'), '{"name":"demo-api"}');
    savedEnv = process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = root;
    process.env.PIPE_EDITOR_DATA_DIR = join(root, '.data');

    const moduleRef = await Test.createTestingModule({
      imports: [EditorApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    else process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = savedEnv;
    delete process.env.PIPE_EDITOR_DATA_DIR;
  });

  // The four spellings a user can reach the same project by.
  const SPELLINGS = ['demo-api', './demo-api', 'demo-api/'];

  it('saves under one key no matter how the path was typed', async () => {
    await request(app.getHttpServer())
      .put('/api/state/pipeline')
      .send({ projectPath: SPELLINGS[0], ir: IR })
      .expect(200);

    // Every other spelling reads back the same save…
    for (const spelling of SPELLINGS.slice(1)) {
      const res = await request(app.getHttpServer())
        .get(`/api/state/pipeline?projectPath=${encodeURIComponent(spelling)}`)
        .expect(200);
      expect(res.body.saved).not.toBeNull();
      expect(res.body.saved.ir.project.name).toBe('demo-api');
    }

    // …and the index holds ONE entry, not four.
    const index = await request(app.getHttpServer())
      .get('/api/state/pipelines')
      .expect(200);
    expect(Object.keys(index.body.pipelines)).toEqual(['demo-api']);
  });

  it('the absolute contained path is the same project too', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/state/pipeline?projectPath=${encodeURIComponent(join(root, 'demo-api'))}`)
      .expect(200);
    expect(res.body.saved).not.toBeNull();
  });

  it('deleting through a different spelling clears the one save', async () => {
    await request(app.getHttpServer())
      .delete('/api/state/pipeline')
      .send({ projectPath: './demo-api' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/state/pipeline?projectPath=demo-api')
      .expect(200);
    expect(res.body.saved).toBeNull();

    const index = await request(app.getHttpServer())
      .get('/api/state/pipelines')
      .expect(200);
    expect(Object.keys(index.body.pipelines)).toEqual([]);
  });
});
