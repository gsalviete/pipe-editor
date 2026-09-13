// T-WIRE-001…005 (TEST-04) — HTTP-level contracts for the routes that had
// none.
//
// The review's TEST-04: `/api/advise`, `/api/state/*`, `/api/execute*`,
// `/api/projects` and `/api/directories*` had their underlying functions
// covered but not their wire contracts — the shape of the response, the
// status codes, the error envelope. A controller can serialize the wrong
// thing, validate the wrong field or return the wrong status while every
// unit test underneath it passes.
//
// `/api/state/*` is covered by state-key.spec.ts (T-STATE-005). The rest
// are here.

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as request from 'supertest';
import type { PipelineIR } from '../ir';
import { EditorApiModule } from './editor-api.module';
import { PIPE_EDITOR_WORKSPACE_ROOT_ENV } from './workspace-root';

function ir(overrides: Partial<PipelineIR> = {}): PipelineIR {
  return {
    version: '0.1.0',
    project: {
      name: 'web',
      rootPath: '.',
      language: 'typescript',
      runtime: { name: 'node', version: '20' },
      packageManager: { name: 'npm', version: '10' },
    },
    stages: [
      {
        id: 'install',
        name: 'Install',
        enabled: true,
        dependsOn: [],
        container: { image: 'node:20-alpine' },
        steps: [{ id: 'install-deps', run: 'npm ci', workingDir: '.', env: {} }],
      },
    ],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
    ...overrides,
  };
}

describe('HTTP wire contracts (TEST-04)', () => {
  let app: INestApplication;
  let root: string;
  let savedRoot: string | undefined;
  let savedData: string | undefined;

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pipe-editor-wire-')));
    mkdirSync(join(root, 'web'));
    writeFileSync(
      join(root, 'web', 'package.json'),
      JSON.stringify({
        name: 'web',
        engines: { node: '20' },
        packageManager: 'npm@10',
        scripts: { build: 'tsc', test: 'jest' },
      }),
    );
    writeFileSync(join(root, 'web', 'package-lock.json'), '{"lockfileVersion":3}');
    mkdirSync(join(root, 'empty-dir'));

    savedRoot = process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    savedData = process.env.PIPE_EDITOR_DATA_DIR;
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = root;
    process.env.PIPE_EDITOR_DATA_DIR = join(root, '.data');

    const moduleRef = await Test.createTestingModule({ imports: [EditorApiModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
    if (savedRoot === undefined) delete process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    else process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = savedRoot;
    if (savedData === undefined) delete process.env.PIPE_EDITOR_DATA_DIR;
    else process.env.PIPE_EDITOR_DATA_DIR = savedData;
  });

  // ── /api/advise ────────────────────────────────────────────────────────
  describe('T-WIRE-001 — POST /api/advise', () => {
    it('returns a Diagnosis with score, grade and findings', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/advise')
        .send({ ir: ir() })
        .expect(200);

      expect(typeof res.body.score).toBe('number');
      expect(res.body.score).toBeGreaterThanOrEqual(0);
      expect(res.body.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D']).toContain(res.body.grade);
      expect(Array.isArray(res.body.findings)).toBe(true);
      for (const finding of res.body.findings) {
        expect(finding).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            severity: expect.stringMatching(/^(critical|warning|info)$/),
            title: expect.any(String),
            detail: expect.any(String),
            fix: expect.any(String),
          }),
        );
      }
    });

    it('is advisory: a D-grade pipeline still returns 200', async () => {
      const bad = ir();
      bad.stages = [
        {
          ...bad.stages[0],
          container: { image: 'node:latest' },
          steps: [
            {
              id: 'install-deps',
              run: 'npm install',
              workingDir: '.',
              env: { API_KEY: 'sk-live-secret' },
            },
          ],
        },
      ];
      const res = await request(app.getHttpServer())
        .post('/api/advise')
        .send({ ir: bad })
        .expect(200);
      expect(res.body.grade).toBe('D');
    });

    it('rejects a malformed IR with the shared error envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/advise')
        .send({ ir: { version: 'nope' } })
        .expect(400);
      expect(res.body.error).toEqual(
        expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
      );
    });
  });

  // ── /api/projects ──────────────────────────────────────────────────────
  describe('T-WIRE-002 — GET /api/projects', () => {
    it('returns the workspace root and one entry per discovered project', async () => {
      const res = await request(app.getHttpServer()).get('/api/projects').expect(200);
      expect(typeof res.body.workspaceRoot).toBe('string');
      expect(Array.isArray(res.body.projects)).toBe(true);

      const web = res.body.projects.find((p: { path: string }) => p.path === 'web');
      expect(web).toEqual(
        expect.objectContaining({
          path: 'web',
          name: 'web',
          packageManager: 'npm',
          scripts: expect.arrayContaining(['build', 'test']),
          hasDockerfile: false,
          isMonorepoRoot: false,
        }),
      );
      // A directory with no manifest is not a project.
      expect(res.body.projects.map((p: { path: string }) => p.path)).not.toContain('empty-dir');
    });
  });

  // ── /api/directories ───────────────────────────────────────────────────
  describe('T-WIRE-003 — GET /api/directories', () => {
    it('lists contained directories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/directories?path=.')
        .expect(200);
      const names = (res.body.entries ?? res.body.directories ?? []).map(
        (e: { name?: string; path?: string }) => e.name ?? e.path,
      );
      expect(names).toEqual(expect.arrayContaining(['web']));
    });

    it('refuses a path outside the workspace with 403 and the error envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/directories?path=/etc')
        .expect(403);
      expect(res.body.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    });
  });

  // ── /api/execute ───────────────────────────────────────────────────────
  describe('T-WIRE-004 — the execute route family', () => {
    it('GET /api/execute/availability reports a boolean', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/execute/availability')
        .expect(200);
      expect(typeof res.body.available).toBe('boolean');
    });

    it('GET /api/execute returns the run history as an array', async () => {
      const res = await request(app.getHttpServer()).get('/api/execute').expect(200);
      expect(Array.isArray(res.body.runs)).toBe(true);
    });

    it('GET /api/execute/:runId is 404 with the error envelope for an unknown run', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/execute/00000000-0000-0000-0000-000000000000')
        .expect(404);
      expect(res.body.error.code).toBe('RUN_NOT_FOUND');
    });

    it('POST /api/execute validates the IR before doing anything', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/execute')
        .send({ projectPath: 'web', ir: { version: 'nope' } })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_IR');
    });

    it('POST /api/execute refuses a path outside the workspace', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/execute')
        .send({ projectPath: '/etc', ir: ir() })
        .expect(403);
      expect(res.body.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    });

    it('POST /api/execute/:runId/abort is 404 for an unknown run', async () => {
      await request(app.getHttpServer())
        .post('/api/execute/00000000-0000-0000-0000-000000000000/abort')
        .expect(404);
    });
  });

  // ── error envelope ─────────────────────────────────────────────────────
  describe('T-WIRE-005 — every error shares one envelope', () => {
    it.each([
      ['post', '/api/advise', { ir: null }],
      ['post', '/api/generate', { ir: null }],
      ['post', '/api/detect', { projectPath: '/etc' }],
      ['post', '/api/execute', { projectPath: '/etc', ir: null }],
    ] as const)('%s %s', async (method, route, body) => {
      const res = await request(app.getHttpServer())[method](route).send(body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toEqual(
        expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
      );
    });
  });
});
