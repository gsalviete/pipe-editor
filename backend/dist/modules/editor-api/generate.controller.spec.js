"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const request = require("supertest");
const editor_api_module_1 = require("./editor-api.module");
const workspace_root_1 = require("./workspace-root");
const REPO_ROOT = (0, path_1.resolve)(__dirname, '..', '..', '..', '..');
const FIXTURES = (0, path_1.join)(REPO_ROOT, 'test', 'fixtures');
function loadIr(fixture) {
    return JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'));
}
function loadGolden(fixture) {
    return {
        dockerfile: (0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, fixture, 'expected.Dockerfile'), 'utf-8'),
        dockerignore: (0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, fixture, 'expected.dockerignore'), 'utf-8'),
    };
}
describe('POST /api/generate', () => {
    let app;
    beforeAll(async () => {
        process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
        const moduleRef = await testing_1.Test.createTestingModule({
            imports: [editor_api_module_1.EditorApiModule],
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
        const base = loadIr('node-pnpm-nest-basic-no-build');
        const noBuildGolden = loadGolden('node-pnpm-nest-basic-no-build');
        const synthetic = { ...base, stages: [] };
        const res = await request(app.getHttpServer())
            .post('/api/generate')
            .send({ ir: synthetic });
        expect(res.status).toBe(200);
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
        const tmpBefore = (0, fs_1.readdirSync)((0, os_1.tmpdir)());
        const cwdBefore = (0, fs_1.readdirSync)(process.cwd());
        const res = await request(app.getHttpServer())
            .post('/api/generate')
            .send({ ir });
        expect(res.status).toBe(200);
        const tmpAfter = (0, fs_1.readdirSync)((0, os_1.tmpdir)());
        const cwdAfter = (0, fs_1.readdirSync)(process.cwd());
        const newInTmp = tmpAfter.filter((f) => !tmpBefore.includes(f));
        const newInCwd = cwdAfter.filter((f) => !cwdBefore.includes(f));
        expect(newInTmp.find((f) => /docker(file|ignore)/i.test(f))).toBeUndefined();
        expect(newInCwd.find((f) => /docker(file|ignore)/i.test(f))).toBeUndefined();
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
        const tmpProj = (0, fs_1.realpathSync)((0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-pmnull-')));
        try {
            const parent = (0, path_1.join)(tmpProj, '..');
            process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV] = (0, fs_1.realpathSync)(parent);
            await app.close();
            const m = await testing_1.Test.createTestingModule({
                imports: [editor_api_module_1.EditorApiModule],
            }).compile();
            app = m.createNestApplication();
            await app.init();
            const fs = await Promise.resolve().then(() => require('fs'));
            fs.writeFileSync((0, path_1.join)(tmpProj, 'package.json'), JSON.stringify({ name: 'pm-null', engines: { node: '20' } }));
            const projectPath = tmpProj.split('/').pop() ?? tmpProj.replace(/^.*\//, '');
            const detectRes = await request(app.getHttpServer())
                .post('/api/detect')
                .send({ projectPath });
            expect(detectRes.status).toBe(200);
            expect(detectRes.body.ir.project.packageManager.name).toBeNull();
            expect(detectRes.body.ir.unresolved.some((u) => u.field === '/project/packageManager/name')).toBe(true);
            const generateRes = await request(app.getHttpServer())
                .post('/api/generate')
                .send({ ir: detectRes.body.ir });
            expect(generateRes.status).toBe(422);
            expect(generateRes.body.error.code).toBe('UNRESOLVED_REQUIRED_FIELD');
        }
        finally {
            (0, fs_1.rmSync)(tmpProj, { recursive: true, force: true });
            process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
            await app.close();
            const m = await testing_1.Test.createTestingModule({
                imports: [editor_api_module_1.EditorApiModule],
            }).compile();
            app = m.createNestApplication();
            await app.init();
        }
    });
    it('T-EDITOR-034 (EDITOR-AC-034) — validate() is the gate: structural defects → 400 INVALID_IR even on superficially-valid IRs', async () => {
        const ir = loadIr('node-pnpm-nest-basic');
        ir.stages[0].dependsOn = ['no-such-stage'];
        const res = await request(app.getHttpServer())
            .post('/api/generate')
            .send({ ir });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_IR');
    });
});
//# sourceMappingURL=generate.controller.spec.js.map