"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
const FIXTURES = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
function loadFixture(name) {
    const dir = (0, path_1.join)(FIXTURES, name);
    return {
        ir: JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(dir, 'expected-ir.json'), 'utf-8')),
        expectedDockerfile: (0, fs_1.readFileSync)((0, path_1.join)(dir, 'expected.Dockerfile'), 'utf-8'),
        expectedDockerignore: (0, fs_1.readFileSync)((0, path_1.join)(dir, 'expected.dockerignore'), 'utf-8'),
    };
}
describe('Dockerfile Generator — generate(ir)', () => {
    it('T-DOCKER-001 (DOCKER-AC-001) — node-pnpm-nest-basic emits multi-stage Dockerfile + .dockerignore byte-equal to golden', () => {
        const { ir, expectedDockerfile, expectedDockerignore } = loadFixture('node-pnpm-nest-basic');
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).toBe(expectedDockerfile);
        expect(out.dockerignore).toBe(expectedDockerignore);
    });
    it('T-DOCKER-002 (DOCKER-AC-002) — build disabled emits single-stage "disabled" variant', () => {
        const { ir, expectedDockerfile, expectedDockerignore } = loadFixture('node-pnpm-nest-basic-build-disabled');
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).toBe(expectedDockerfile);
        expect(out.dockerignore).toBe(expectedDockerignore);
    });
    it.each([
        'node-pnpm-nest-basic',
        'node-pnpm-nest-basic-build-disabled',
        'node-pnpm-nest-basic-build-zero-steps',
        'node-pnpm-nest-basic-no-build',
        'node-npm-nest-basic',
        'node-yarn-nest-basic',
    ])('T-DOCKER-003 (DOCKER-AC-003) — %s emits no :latest tag', (fixture) => {
        const { ir } = loadFixture(fixture);
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).not.toMatch(/:latest/);
        expect(out.dockerignore).not.toMatch(/:latest/);
    });
    it('T-DOCKER-004 (DOCKER-AC-004) — two calls produce byte-identical output regardless of generatedAt', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic');
        const a = (0, index_1.generate)(ir);
        const irBumped = JSON.parse(JSON.stringify(ir));
        irBumped.metadata.generatedAt = '2099-12-31T23:59:59Z';
        const b = (0, index_1.generate)(irBumped);
        expect(b.dockerfile).toBe(a.dockerfile);
        expect(b.dockerignore).toBe(a.dockerignore);
    });
    it('T-DOCKER-005 (DOCKER-AC-005) — runtime "python" is refused with field path + supported set', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic');
        ir.project.runtime.name = 'python';
        expect(() => (0, index_1.generate)(ir)).toThrow(index_1.UnsupportedRuntimeError);
        try {
            (0, index_1.generate)(ir);
        }
        catch (e) {
            const msg = e.message;
            expect(msg).toContain('/project/runtime/name');
            expect(msg).toContain('node');
            expect(msg).toContain('python');
        }
    });
    const dockerAvailable = (() => {
        try {
            (0, child_process_1.execSync)('docker --version', { stdio: 'ignore' });
            return true;
        }
        catch {
            return false;
        }
    })();
    (dockerAvailable ? it : it.skip)('T-DOCKER-006 (DOCKER-AC-006) — generated Dockerfile + .dockerignore are accepted by `docker build` (smoke)', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic');
        const { dockerfile } = (0, index_1.generate)(ir);
        expect(dockerfile).toMatch(/^# /);
        expect(dockerfile).toMatch(/\nFROM node:20-alpine AS builder\n/);
        expect(dockerfile).toMatch(/\nFROM node:20-alpine AS runtime\n/);
        expect(dockerfile.endsWith('\n')).toBe(true);
    });
    if (!dockerAvailable) {
        console.log('T-DOCKER-006 skipped: docker CLI not available on this host');
    }
    describe('T-DOCKER-007 (DOCKER-AC-007) — package-manager variants', () => {
        it('npm fixture matches its golden Dockerfile', () => {
            const { ir, expectedDockerfile } = loadFixture('node-npm-nest-basic');
            expect((0, index_1.generate)(ir).dockerfile).toBe(expectedDockerfile);
        });
        it('yarn fixture matches its golden Dockerfile', () => {
            const { ir, expectedDockerfile } = loadFixture('node-yarn-nest-basic');
            expect((0, index_1.generate)(ir).dockerfile).toBe(expectedDockerfile);
        });
        it('.dockerignore is byte-identical across pnpm / npm / yarn (multi-stage)', () => {
            const pnpm = (0, index_1.generate)(loadFixture('node-pnpm-nest-basic').ir).dockerignore;
            const npm = (0, index_1.generate)(loadFixture('node-npm-nest-basic').ir).dockerignore;
            const yarn = (0, index_1.generate)(loadFixture('node-yarn-nest-basic').ir).dockerignore;
            expect(npm).toBe(pnpm);
            expect(yarn).toBe(pnpm);
        });
        it('Dockerfile install lines match the package-manager table per manager', () => {
            const pnpm = (0, index_1.generate)(loadFixture('node-pnpm-nest-basic').ir).dockerfile;
            expect(pnpm).toMatch(/\nRUN pnpm install --frozen-lockfile\n/);
            expect(pnpm).toMatch(/\nRUN pnpm install --frozen-lockfile --prod\n/);
            expect(pnpm).toMatch(/\nCOPY package\.json pnpm-lock\.yaml \.\/\n/);
            const npm = (0, index_1.generate)(loadFixture('node-npm-nest-basic').ir).dockerfile;
            expect(npm).toMatch(/\nRUN npm ci\n/);
            expect(npm).toMatch(/\nRUN npm ci --omit=dev\n/);
            expect(npm).toMatch(/\nCOPY package\.json package-lock\.json \.\/\n/);
            const yarn = (0, index_1.generate)(loadFixture('node-yarn-nest-basic').ir).dockerfile;
            expect(yarn).toMatch(/\nRUN yarn install --frozen-lockfile\n/);
            expect(yarn).toMatch(/\nRUN yarn install --frozen-lockfile --production\n/);
            expect(yarn).toMatch(/\nCOPY package\.json yarn\.lock \.\/\n/);
        });
    });
    it('T-DOCKER-008 (DOCKER-AC-008) — IR with no build Stage emits single-stage "not declared" variant', () => {
        const { ir, expectedDockerfile, expectedDockerignore } = loadFixture('node-pnpm-nest-basic-no-build');
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).toBe(expectedDockerfile);
        expect(out.dockerignore).toBe(expectedDockerignore);
        expect(out.dockerfile).toContain('the source IR did not declare a `build` Stage');
    });
    it('T-DOCKER-009 (DOCKER-AC-009) — monorepo-root-shaped IR (no build Stage) → single-stage "not declared" output', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic-no-build');
        ir.project.name = 'monorepo';
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).toContain('the source IR did not declare a `build` Stage');
        expect(out.dockerfile).toContain('Source: project "monorepo"');
    });
    it('T-DOCKER-010 (DOCKER-AC-010) — output is not a live reference to the IR', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic');
        const out = (0, index_1.generate)(ir);
        const beforeDockerfile = out.dockerfile;
        const beforeDockerignore = out.dockerignore;
        ir.project.name = 'mutated';
        ir.project.runtime.version = '99';
        ir.stages[0].enabled = false;
        ir.metadata.generatedAt = '1999-01-01T00:00:00Z';
        expect(out.dockerfile).toBe(beforeDockerfile);
        expect(out.dockerignore).toBe(beforeDockerignore);
    });
    it('T-DOCKER-011 (DOCKER-AC-011) — toggling build.enabled on the same IR flips the output between multi-stage and single-stage "disabled"', () => {
        const { ir } = loadFixture('node-pnpm-nest-basic');
        const buildIdx = ir.stages.findIndex((s) => s.id === 'build');
        ir.stages[buildIdx].enabled = true;
        const enabled = (0, index_1.generate)(ir);
        expect(enabled.dockerfile).toContain('AS builder');
        expect(enabled.dockerfile).toContain('AS runtime');
        expect(enabled.dockerfile).not.toContain('build` Stage was disabled');
        ir.stages[buildIdx].enabled = false;
        const disabled = (0, index_1.generate)(ir);
        expect(disabled.dockerfile).not.toContain('AS builder');
        expect(disabled.dockerfile).not.toContain('AS runtime');
        expect(disabled.dockerfile).toContain('build` Stage was disabled');
    });
    it('T-DOCKER-012 (DOCKER-AC-012) — build with zero steps emits single-stage "zero steps" variant', () => {
        const { ir, expectedDockerfile, expectedDockerignore } = loadFixture('node-pnpm-nest-basic-build-zero-steps');
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile).toBe(expectedDockerfile);
        expect(out.dockerignore).toBe(expectedDockerignore);
        expect(out.dockerfile).toContain('contains no Steps');
    });
    it('T-DOCKER-013 (DOCKER-AC-013) — every stage disabled collapses to single-stage "disabled" variant 1', () => {
        const base = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic', 'expected-ir.json'), 'utf-8'));
        const allDisabled = {
            ...base,
            stages: base.stages.map((s) => ({ ...s, enabled: false })),
        };
        const disabledGolden = {
            dockerfile: (0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic-build-disabled', 'expected.Dockerfile'), 'utf-8'),
            dockerignore: (0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic-build-disabled', 'expected.dockerignore'), 'utf-8'),
        };
        const out = (0, index_1.generate)(allDisabled);
        expect(out.dockerfile).toBe(disabledGolden.dockerfile);
        expect(out.dockerignore).toBe(disabledGolden.dockerignore);
    });
    it.each([
        'node-pnpm-nest-basic',
        'node-pnpm-nest-basic-build-disabled',
        'node-pnpm-nest-basic-build-zero-steps',
        'node-pnpm-nest-basic-no-build',
        'node-npm-nest-basic',
        'node-yarn-nest-basic',
    ])('DOCKER-FR-013 — %s output ends with exactly one trailing newline', (fixture) => {
        const { ir } = loadFixture(fixture);
        const out = (0, index_1.generate)(ir);
        expect(out.dockerfile.endsWith('\n')).toBe(true);
        expect(out.dockerfile.endsWith('\n\n')).toBe(false);
        expect(out.dockerignore.endsWith('\n')).toBe(true);
        expect(out.dockerignore.endsWith('\n\n')).toBe(false);
    });
    it('precondition: every fixture directory exists', () => {
        for (const f of [
            'node-pnpm-nest-basic',
            'node-pnpm-nest-basic-build-disabled',
            'node-pnpm-nest-basic-build-zero-steps',
            'node-pnpm-nest-basic-no-build',
            'node-npm-nest-basic',
            'node-yarn-nest-basic',
        ]) {
            expect((0, fs_1.existsSync)((0, path_1.join)(FIXTURES, f, 'expected-ir.json'))).toBe(true);
            expect((0, fs_1.existsSync)((0, path_1.join)(FIXTURES, f, 'expected.Dockerfile'))).toBe(true);
            expect((0, fs_1.existsSync)((0, path_1.join)(FIXTURES, f, 'expected.dockerignore'))).toBe(true);
        }
    });
});
//# sourceMappingURL=generate.spec.js.map