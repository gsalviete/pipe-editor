import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as request from 'supertest';
import type { WorkspacePlan } from '../workspace-bundle';
import { EditorApiModule } from './editor-api.module';
import {
  PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT_ENV,
  PIPE_EDITOR_WORKSPACE_ROOT_ENV,
} from './workspace-root';

const DISPLAY_ROOT = '/Users/example/projects';

describe('workspace HTTP API', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pipe-editor-workspace-api-')));
    writePackage(join(root, 'apps', 'web'), {
      name: 'web',
      engines: { node: '20' },
      packageManager: 'npm@10',
      scripts: { build: 'vite build', test: 'vitest run' },
      devDependencies: { vite: '^6' },
    });
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = root;
    process.env[PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT_ENV] = DISPLAY_ROOT;
    const moduleRef = await Test.createTestingModule({ imports: [EditorApiModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env[PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT_ENV];
    rmSync(root, { recursive: true, force: true });
  });

  it('T-WORKSPACE-001 (WORKSPACE-AC-001) exposes contained workspace inspection', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/workspace/inspect')
      .send({ projectPath: '.' });

    expect(response.status).toBe(200);
    expect(response.body.services).toHaveLength(1);
    expect(response.body.services[0]).toMatchObject({
      path: 'apps/web',
      stack: 'vite',
      kind: 'frontend',
    });
    expect(response.body.existingComposeFiles).toEqual([]);
  });

  it('T-WORKSPACE-002 (WORKSPACE-AC-002) rejects a symlink escape through the common envelope', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'pipe-editor-workspace-outside-'));
    symlinkSync(outside, join(root, 'outside'));
    try {
      const response = await request(app.getHttpServer())
        .post('/api/workspace/inspect')
        .send({ projectPath: 'outside' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('accepts a contained absolute path and exposes safe folder browsing', async () => {
    const absoluteProject = `${DISPLAY_ROOT}/apps/web`;
    const inspected = await request(app.getHttpServer())
      .post('/api/workspace/inspect')
      .send({ projectPath: absoluteProject });
    expect(inspected.status).toBe(200);
    expect(inspected.body.workspacePath).toBe('apps/web');

    const rootListing = await request(app.getHttpServer())
      .get('/api/directories')
      .query({ path: '.' });
    expect(rootListing.status).toBe(200);
    expect(rootListing.body).toMatchObject({
      workspaceRoot: DISPLAY_ROOT,
      currentPath: '.',
      parentPath: null,
      directories: [{ name: 'apps', path: 'apps', isProject: false }],
    });

    const appsListing = await request(app.getHttpServer())
      .get('/api/directories')
      .query({ path: 'apps' });
    expect(appsListing.body.directories).toEqual([
      { name: 'web', path: 'apps/web', isProject: true },
    ]);

    const droppedFolder = await request(app.getHttpServer())
      .get('/api/directories/resolve')
      .query({ name: 'web' });
    expect(droppedFolder.status).toBe(200);
    expect(droppedFolder.body).toEqual({
      workspaceRoot: DISPLAY_ROOT,
      matches: ['apps/web'],
    });
  });

  it('T-WORKSPACE-004 (WORKSPACE-AC-004) generates a bundle from the inspected plan', async () => {
    const inspected = await request(app.getHttpServer())
      .post('/api/workspace/inspect')
      .send({ projectPath: '.' });
    const generated = await request(app.getHttpServer())
      .post('/api/workspace/generate')
      .send({
        plan: inspected.body as WorkspacePlan,
        provider: 'github-actions',
        composeMode: 'root',
      });

    expect(generated.status).toBe(200);
    expect(generated.body.artifacts.map((artifact: { path: string }) => artifact.path)).toContain(
      'docker-compose.yml',
    );
  });

  it('returns a stable validation error for malformed or unsupported generation input', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/workspace/generate')
      .send({ plan: {}, provider: 'jenkins', composeMode: 'cloud' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WORKSPACE_PLAN');
  });
});

function writePackage(path: string, manifest: Record<string, unknown>): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(path, 'package-lock.json'), '{}');
  writeFileSync(join(path, 'tsconfig.json'), '{}');
}
