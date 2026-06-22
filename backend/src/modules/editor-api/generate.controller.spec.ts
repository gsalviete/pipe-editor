// HTTP integration tests for POST /api/generate.
//
// Covers EDITOR-AC-026…034 plus the readonly-on-disk assertion. The
// endpoint takes a (possibly client-supplied) PipelineIR and returns
// { dockerfile, dockerignore } from the Dockerfile Generator.
//
// Per the Trust boundary section of visual-editor.spec.md, the
// controller validates the IR before passing it through.

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync, readdirSync, realpathSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import * as request from 'supertest';
import { PipelineIR } from '../ir';
import { EditorApiModule } from './editor-api.module';
import { PIPE_EDITOR_WORKSPACE_ROOT_ENV } from './workspace-root';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures');

function loadIr(fixture: string): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

function loadGolden(fixture: string): { dockerfile: string; dockerignore: string } {
  return {
    dockerfile: readFileSync(
      join(FIXTURES, fixture, 'expected.Dockerfile'),
      'utf-8',
    ),
    dockerignore: readFileSync(
      join(FIXTURES, fixture, 'expected.dockerignore'),
      'utf-8',
    ),
  };
}

describe('POST /api/generate', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
    const moduleRef = await Test.createTestingModule({
      imports: [EditorApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-EDITOR-026 (EDITOR-AC-026) — happy path: returns dockerfile + dockerignore byte-equal to goldens', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    const golden = loadGolden('node-pnpm-nest-basic');
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(200);
    expect(res.body.dockerfile).toBe(golden.dockerfile);
    expect(res.body.dockerignore).toBe(golden.dockerignore);
  });

  it('T-EDITOR-027 (EDITOR-AC-027) — PM-name unresolved → 422 UNRESOLVED_REQUIRED_FIELD citing /project/packageManager/name', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.project.packageManager.name = null;
    ir.unresolved = [
      ...(ir.unresolved ?? []),
      {
        field: '/project/packageManager/name',
        reason: 'needs-user-input',
        message: 'No lockfile or packageManager field present.',
      },
    ];
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNRESOLVED_REQUIRED_FIELD');
    expect(res.body.error.detail?.field).toBe('/project/packageManager/name');
  });

  it('T-EDITOR-028 (EDITOR-AC-028) — synthetic stages:[] IR with PM resolved → 200 single-stage "not declared" variant', async () => {
    // v1-unreachable from detect()+editor combined; this is the
    // forward-compatibility branch (see Trust boundary section of
    // visual-editor.spec.md). The fixture node-pnpm-nest-basic-no-build
    // already exercises header variant 3 ("not declared") at the
    // generator level; here we go one step further and remove ALL
    // stages, which still resolves to variant 3 (build is absent
    // from the IR).
    const base = loadIr('node-pnpm-nest-basic-no-build');
    const noBuildGolden = loadGolden('node-pnpm-nest-basic-no-build');
    const synthetic: PipelineIR = { ...base, stages: [] };
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir: synthetic });
    expect(res.status).toBe(200);
    // The same single-stage "not declared" body the no-build fixture
    // produces — build is absent from the IR in both cases.
    expect(res.body.dockerfile).toBe(noBuildGolden.dockerfile);
    expect(res.body.dockerignore).toBe(noBuildGolden.dockerignore);
  });

  it('T-EDITOR-029 (EDITOR-AC-029) — all stages disabled → 200 single-stage "disabled" variant', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.stages = ir.stages.map((s) => ({ ...s, enabled: false }));
    const disabledGolden = loadGolden('node-pnpm-nest-basic-build-disabled');
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(200);
    expect(res.body.dockerfile).toBe(disabledGolden.dockerfile);
    expect(res.body.dockerignore).toBe(disabledGolden.dockerignore);
  });

  it('T-EDITOR-030 (EDITOR-AC-030) — endpoint is read-only: no files created in cwd or tmpdir during a generate call', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    const tmpBefore = readdirSync(tmpdir());
    const cwdBefore = readdirSync(process.cwd());
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(200);
    const tmpAfter = readdirSync(tmpdir());
    const cwdAfter = readdirSync(process.cwd());
    // The endpoint's responsibility is "no file emission". Other
    // tests in the same process may write/clean files in tmp, so we
    // assert ONLY that no new file with a "dockerfile"-like name has
    // appeared as a side effect of this single generate call.
    const newInTmp = tmpAfter.filter((f) => !tmpBefore.includes(f));
    const newInCwd = cwdAfter.filter((f) => !cwdBefore.includes(f));
    expect(
      newInTmp.find((f) => /docker(file|ignore)/i.test(f)),
    ).toBeUndefined();
    expect(
      newInCwd.find((f) => /docker(file|ignore)/i.test(f)),
    ).toBeUndefined();
  });

  it('T-EDITOR-031 (EDITOR-AC-031) — invalid IR (missing required field) → 400 INVALID_IR with validator diagnostics', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir: { version: '0.1.0' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IR');
    expect(Array.isArray(res.body.error.detail)).toBe(true);
    expect(res.body.error.detail.length).toBeGreaterThan(0);
  });

  it('T-EDITOR-031b — missing ir field → 400 INVALID_IR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IR');
  });

  it('T-EDITOR-031c — extra top-level field → 400 INVALID_IR', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir, extra: 'no' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IR');
  });

  it('T-EDITOR-032 (EDITOR-AC-032) — unsupported runtime → 422 UNSUPPORTED_RUNTIME', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.project.runtime.name = 'python';
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNSUPPORTED_RUNTIME');
    expect(res.body.error.detail?.field).toBe('/project/runtime/name');
    expect(res.body.error.detail?.supported).toEqual(['node']);
  });

  it('T-EDITOR-033 (EDITOR-AC-033) — detect→generate split on PM-null IR: detect 200 with unresolved entry; generate 422', async () => {
    // Build a PM-null fixture inside a temp dir under the wsRoot so
    // detect() can find it. detect should return 200 with the
    // unresolved entry; the same IR fed to /api/generate should 422.
    const tmpProj = realpathSync(
      mkdtempSync(join(tmpdir(), 'pipe-editor-pmnull-')),
    );
    try {
      // Move workspace root to a parent dir of the tmp project.
      const parent = join(tmpProj, '..');
      process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = realpathSync(parent);
      // Re-create app with new wsRoot.
      await app.close();
      const m = await Test.createTestingModule({
        imports: [EditorApiModule],
      }).compile();
      app = m.createNestApplication();
      await app.init();

      // Project: package.json with no scripts, no lockfile, no
      // packageManager field — produces a PM-null total-suppression IR
      // per DET-FR-018(a).
      const fs = await import('fs');
      fs.writeFileSync(
        join(tmpProj, 'package.json'),
        JSON.stringify({ name: 'pm-null', engines: { node: '20' } }),
      );

      const projectPath =
        tmpProj.split('/').pop() ?? tmpProj.replace(/^.*\//, '');
      const detectRes = await request(app.getHttpServer())
        .post('/api/detect')
        .send({ projectPath });
      expect(detectRes.status).toBe(200);
      expect(detectRes.body.ir.project.packageManager.name).toBeNull();
      expect(
        (detectRes.body.ir.unresolved as { field: string }[]).some(
          (u) => u.field === '/project/packageManager/name',
        ),
      ).toBe(true);

      const generateRes = await request(app.getHttpServer())
        .post('/api/generate')
        .send({ ir: detectRes.body.ir });
      expect(generateRes.status).toBe(422);
      expect(generateRes.body.error.code).toBe('UNRESOLVED_REQUIRED_FIELD');
    } finally {
      rmSync(tmpProj, { recursive: true, force: true });
      // Restore the wsRoot expected by the rest of the suite.
      process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
      await app.close();
      const m = await Test.createTestingModule({
        imports: [EditorApiModule],
      }).compile();
      app = m.createNestApplication();
      await app.init();
    }
  });

  it('T-EDITOR-034 (EDITOR-AC-034) — validate() is the gate: structural defects → 400 INVALID_IR even on superficially-valid IRs', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    // Introduce a structural defect: dependsOn references a stage id
    // that does not exist. validate() must reject; the controller must
    // emit 400 INVALID_IR rather than handing this off to generate().
    ir.stages[0].dependsOn = ['no-such-stage'];
    const res = await request(app.getHttpServer())
      .post('/api/generate')
      .send({ ir });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IR');
  });
});
