"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const dockerfile_generator_1 = require("../dockerfile-generator");
const ir_1 = require("../ir");
const index_1 = require("./index");
const FIXTURES = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
const FIXTURE_PLACEHOLDER_PATH = '/abs/path/to/node-pnpm-nest-basic';
const FIXTURE_PLACEHOLDER_TIMESTAMP = '2026-06-15T10:00:00Z';
function loadExpected(fixture) {
    return JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'));
}
function newDetector() {
    return new index_1.Detector({ rules: index_1.ALL_RULES });
}
function detectorWithSubstitution(replaceRuleId, syntheticRule) {
    return new index_1.Detector({
        rules: [...index_1.ALL_RULES.filter((r) => r.id !== replaceRuleId), syntheticRule],
    });
}
function normalize(ir, rootPathPlaceholder) {
    const clone = JSON.parse(JSON.stringify(ir));
    clone.project.rootPath = rootPathPlaceholder;
    clone.metadata.generatedAt = FIXTURE_PLACEHOLDER_TIMESTAMP;
    return clone;
}
describe('Detector Engine', () => {
    it('T-DET-001 (DET-AC-001) — node-pnpm-nest-basic detects to expected IR (modulo rootPath + generatedAt)', () => {
        const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        const expected = loadExpected('node-pnpm-nest-basic');
        const normalized = normalize(ir, FIXTURE_PLACEHOLDER_PATH);
        expect((0, ir_1.canonicalDigest)(normalized)).toBe((0, ir_1.canonicalDigest)((0, ir_1.canonicalize)(expected)));
    });
    it('T-DET-002 (DET-AC-002) — rule reading outside the manifest set is refused at construction', () => {
        const badRule = {
            id: 'DR-BAD',
            reads: ['src/main.ts'],
            kind: 'field',
            cases: [],
        };
        expect(() => new index_1.Detector({ rules: [badRule] })).toThrow(index_1.RuleRegistrationError);
        try {
            new index_1.Detector({ rules: [badRule] });
        }
        catch (e) {
            expect(e.message).toContain('DR-BAD');
            expect(e.message).toContain('src/main.ts');
        }
    });
    describe('T-DET-003 (DET-AC-003) — IR-FR-009 truth table', () => {
        it('high → committed value', () => {
            const r = {
                id: 'DR-T1',
                reads: [],
                kind: 'field',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
                        confidence: 'high',
                        onUncertainty: 'omit',
                    },
                ],
            };
            const { ir } = detectorWithSubstitution('DR-002', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
            expect(ir.project.language).toBe('typescript');
        });
        it('medium + omit on a required field → collapses to unresolved', () => {
            const r = {
                id: 'DR-T2',
                reads: [],
                kind: 'field',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
                        confidence: 'medium',
                        onUncertainty: 'omit',
                    },
                ],
            };
            const { ir } = detectorWithSubstitution('DR-002', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
            expect(ir.project.language).toBeNull();
            expect(ir.unresolved?.some((u) => u.field === '/project/language')).toBe(true);
        });
        it('medium + assume-default → committed default', () => {
            const r = {
                id: 'DR-T3',
                reads: [],
                kind: 'field',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({ kind: 'field', target: '/project/language', value: 'IGNORED' }),
                        confidence: 'medium',
                        onUncertainty: 'assume-default',
                        default: 'javascript',
                    },
                ],
            };
            const { ir } = detectorWithSubstitution('DR-002', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
            expect(ir.project.language).toBe('javascript');
        });
        it('medium + needs-user-input → unresolved with message', () => {
            const r = {
                id: 'DR-T4',
                reads: [],
                kind: 'field',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({ kind: 'field', target: '/project/language', value: null }),
                        confidence: 'medium',
                        onUncertainty: 'needs-user-input',
                        message: 'Pick a language.',
                    },
                ],
            };
            const { ir } = detectorWithSubstitution('DR-002', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
            const u = (ir.unresolved ?? []).find((x) => x.field === '/project/language');
            expect(u?.message).toBe('Pick a language.');
        });
    });
    it('T-DET-004 (DET-AC-004) — required-field collapse synthesizes a non-empty message when none supplied', () => {
        const r = {
            id: 'DR-T-COLLAPSE',
            reads: [],
            kind: 'field',
            cases: [
                {
                    condition: () => true,
                    emit: () => ({ kind: 'field', target: '/project/runtime/version', value: null }),
                    confidence: 'medium',
                    onUncertainty: 'omit',
                },
            ],
        };
        const { ir } = detectorWithSubstitution('DR-004', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        const u = (ir.unresolved ?? []).find((x) => x.field === '/project/runtime/version');
        expect(u).toBeDefined();
        expect(u?.message.length).toBeGreaterThan(0);
        expect(u?.message).toContain('/project/runtime/version');
    });
    it('T-DET-005 (DET-AC-005) — two consecutive detect() calls produce IRs equal modulo generatedAt', () => {
        const d = newDetector();
        const a = d.detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic')).ir;
        const b = d.detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic')).ir;
        expect((0, ir_1.canonicalDigest)(a)).toBe((0, ir_1.canonicalDigest)(b));
    });
    it('T-DET-006 (DET-AC-006) — Stage and Step IDs match the fixture', () => {
        const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect(ir.stages.map((s) => s.id)).toEqual(['install', 'lint', 'test', 'build', 'docker-build']);
        for (const s of ir.stages)
            expect(s.steps.length).toBe(1);
    });
    it('T-DET-007 (DET-AC-007) — produced IR has zero ValidationErrors', () => {
        const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect((0, ir_1.validate)(ir)).toEqual([]);
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
    (dockerAvailable ? it : it.skip)('T-DET-008 (DET-AC-008) — generate(detect(...)) → real `docker build .` succeeds', () => {
        const rootPath = (0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic');
        const { ir } = newDetector().detect(rootPath);
        const { dockerfile, dockerignore } = (0, dockerfile_generator_1.generate)(ir);
        const stage = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-det008-'));
        try {
            for (const f of [
                'package.json',
                'pnpm-lock.yaml',
                'nest-cli.json',
                'tsconfig.json',
                'src/main.ts',
                'src/app.module.ts',
                'src/app.controller.ts',
            ]) {
                const src = (0, path_1.join)(rootPath, f);
                const dst = (0, path_1.join)(stage, f);
                (0, child_process_1.execSync)(`mkdir -p "${dst.split('/').slice(0, -1).join('/')}"`);
                (0, fs_1.writeFileSync)(dst, (0, fs_1.readFileSync)(src));
            }
            (0, fs_1.writeFileSync)((0, path_1.join)(stage, 'Dockerfile'), dockerfile);
            (0, fs_1.writeFileSync)((0, path_1.join)(stage, '.dockerignore'), dockerignore);
            (0, child_process_1.execSync)(`docker build -t pipe-editor-fixture-test:ci .`, {
                cwd: stage,
                stdio: 'inherit',
                timeout: 480_000,
            });
        }
        finally {
            (0, fs_1.rmSync)(stage, { recursive: true, force: true });
            try {
                (0, child_process_1.execSync)('docker image rm -f pipe-editor-fixture-test:ci', { stdio: 'ignore' });
            }
            catch {
            }
        }
    }, 540_000);
    if (!dockerAvailable) {
        console.log('T-DET-008 skipped: docker CLI not available on this host');
    }
    it('T-DET-009 (DET-AC-009) — package.json with no scripts emits install + docker-build only', () => {
        const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-no-scripts'));
        expect(ir.stages.map((s) => s.id)).toEqual(['install', 'docker-build']);
        expect(ir.stages[1].dependsOn).toEqual(['install']);
    });
    it('T-DET-010 (DET-AC-010) — lint emitted, test omitted; chain install→lint→build→docker-build', () => {
        const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-no-tests'));
        expect(ir.stages.map((s) => s.id)).toEqual(['install', 'lint', 'build', 'docker-build']);
    });
    describe('T-DET-011 (DET-AC-011) — multi-lockfile precedence', () => {
        it('pnpm-lock + package-lock, no packageManager field → pnpm wins', () => {
            const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-pnpm-both-lockfiles'));
            expect(ir.project.packageManager.name).toBe('pnpm');
        });
        it('yarn.lock + package-lock, no packageManager field → yarn wins', () => {
            const { ir } = newDetector().detect((0, path_1.join)(FIXTURES, 'node-yarn-npm-both-lockfiles'));
            expect(ir.project.packageManager.name).toBe('yarn');
        });
    });
    it('T-DET-012 (DET-AC-012) — monorepo: rootPath is the top-level folder; sub-packages not descended', () => {
        const rootPath = (0, path_1.join)(FIXTURES, 'monorepo-pnpm');
        const { ir } = newDetector().detect(rootPath);
        expect(ir.project.rootPath).toBe(rootPath);
        expect(ir.project.name).toBe('monorepo-pnpm');
    });
    it('T-DET-013 (DET-AC-013) — first matching case wins; case order is honored', () => {
        const r = {
            id: 'DR-T-ORDER',
            reads: [],
            kind: 'field',
            cases: [
                {
                    condition: () => true,
                    emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
                    confidence: 'high',
                    onUncertainty: 'omit',
                },
                {
                    condition: () => true,
                    emit: () => ({ kind: 'field', target: '/project/language', value: 'javascript' }),
                    confidence: 'high',
                    onUncertainty: 'omit',
                },
            ],
        };
        const { ir } = detectorWithSubstitution('DR-002', r).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect(ir.project.language).toBe('typescript');
    });
    describe('T-DET-014 (DET-AC-014) — Stage id audit + rule conflict', () => {
        it('non-canonical Stage id is rejected at detect time with the offending rule', () => {
            const badStageStage = {
                id: 'wat',
                name: 'wat',
                enabled: true,
                dependsOn: [],
                container: { image: 'docker:25' },
                steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
            };
            const r = {
                id: 'DR-T-WAT',
                reads: [],
                kind: 'stage',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({ kind: 'stage', stage: badStageStage }),
                        confidence: 'high',
                        onUncertainty: 'omit',
                    },
                ],
            };
            expect(() => new index_1.Detector({ rules: [...index_1.ALL_RULES, r] }).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'))).toThrow(/DR-T-WAT.*wat/);
        });
        it('two rules emitting the same canonical Stage id throw a conflict naming both rules', () => {
            const dupInstall = {
                id: 'DR-T-DUP-INSTALL',
                reads: [],
                kind: 'stage',
                cases: [
                    {
                        condition: () => true,
                        emit: () => ({
                            kind: 'stage',
                            stage: {
                                id: 'install',
                                name: 'Install (dup)',
                                enabled: true,
                                dependsOn: [],
                                container: { image: 'node:20-alpine' },
                                steps: [{ id: 'dup-install', run: 'echo dup', workingDir: '.', env: {} }],
                            },
                        }),
                        confidence: 'high',
                        onUncertainty: 'omit',
                    },
                ],
            };
            expect(() => new index_1.Detector({ rules: [...index_1.ALL_RULES, dupInstall] }).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'))).toThrow(index_1.RuleConflictError);
        });
    });
    it('T-DET-015 (DET-AC-015) — a rule that reads a manifest it did not declare sees undefined', () => {
        let observed = 'sentinel';
        const r = {
            id: 'DR-T-PEEK',
            reads: ['tsconfig.json'],
            kind: 'field',
            cases: [
                {
                    condition: (ctx) => {
                        observed = ctx.manifests['package.json'];
                        return false;
                    },
                    emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
                    confidence: 'high',
                    onUncertainty: 'omit',
                },
            ],
        };
        new index_1.Detector({ rules: [...index_1.ALL_RULES, r] }).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect(observed).toBeUndefined();
    });
    it('T-DET-016 (DET-AC-016) — PM-null → stages: [] (all canonical Stages suppressed)', () => {
        const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-pmnull-'));
        try {
            (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'package.json'), JSON.stringify({
                name: 'pmnull',
                engines: { node: '20' },
                scripts: { lint: 'eslint .', test: 'jest', build: 'tsc' },
            }));
            (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'tsconfig.json'), '{}');
            const { ir } = newDetector().detect(dir);
            expect(ir.project.packageManager.name).toBeNull();
            expect(ir.stages).toEqual([]);
            expect((ir.unresolved ?? []).some((u) => u.field === '/project/packageManager/name')).toBe(true);
        }
        finally {
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    describe('T-DET-017 (DET-AC-017) — parse-error handling', () => {
        it('malformed package.json → hard throw', () => {
            const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-bad-pkg-'));
            try {
                (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'package.json'), '{ this is not json,, }');
                expect(() => newDetector().detect(dir)).toThrow(index_1.MalformedPackageJsonError);
            }
            finally {
                (0, fs_1.rmSync)(dir, { recursive: true, force: true });
            }
        });
        it('valid package.json + malformed tsconfig.json → warn-and-continue', () => {
            const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-bad-ts-'));
            try {
                (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'package.json'), JSON.stringify({ name: 'x', engines: { node: '20' }, packageManager: 'pnpm@9.0.0' }));
                (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'pnpm-lock.yaml'), '');
                (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'tsconfig.json'), '{ broken json,, }');
                const { ir, warnings } = newDetector().detect(dir);
                expect(warnings.some((w) => w.manifest === 'tsconfig.json')).toBe(true);
                expect(ir.project.language).toBe('javascript');
            }
            finally {
                (0, fs_1.rmSync)(dir, { recursive: true, force: true });
            }
        });
    });
    it('T-DET-018 (DET-AC-018) — PM known but install rule omitted → orphaned command Stages dropped, docker-build preserved', () => {
        const rulesNoInstall = index_1.ALL_RULES.filter((r) => r.id !== 'DR-007');
        const { ir } = new index_1.Detector({ rules: rulesNoInstall }).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect(ir.stages.map((s) => s.id)).toEqual(['docker-build']);
    });
    it('T-DET-019 (DET-AC-019) — stage rule reads ctx.ir.project.runtime.version (committed by step 3)', () => {
        let observedVersion = 'sentinel';
        const stageRule = {
            id: 'DR-T-CTX',
            reads: [],
            kind: 'stage',
            cases: [
                {
                    condition: (ctx) => {
                        observedVersion = ctx.ir.project.runtime.version;
                        return false;
                    },
                    emit: () => ({
                        kind: 'stage',
                        stage: {
                            id: 'install',
                            name: 'Install',
                            enabled: true,
                            dependsOn: [],
                            container: { image: 'node:20-alpine' },
                            steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
                        },
                    }),
                    confidence: 'high',
                    onUncertainty: 'omit',
                },
            ],
        };
        new index_1.Detector({ rules: [...index_1.ALL_RULES, stageRule] }).detect((0, path_1.join)(FIXTURES, 'node-pnpm-nest-basic'));
        expect(observedVersion).toBe('20');
    });
    it('throws on missing rootPath', () => {
        expect(() => newDetector().detect('/no/such/path/12345')).toThrow(index_1.NoRootDirError);
    });
    it('throws when no manifest is present', () => {
        const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-empty-'));
        try {
            expect(() => newDetector().detect(dir)).toThrow(index_1.NoManifestError);
        }
        finally {
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    it('precondition: every fixture used in tests exists', () => {
        for (const f of [
            'node-pnpm-nest-basic',
            'node-pnpm-no-tests',
            'node-pnpm-no-scripts',
            'node-pnpm-both-lockfiles',
            'node-yarn-npm-both-lockfiles',
            'monorepo-pnpm',
        ]) {
            expect((0, fs_1.existsSync)((0, path_1.join)(FIXTURES, f, 'package.json'))).toBe(true);
        }
    });
});
//# sourceMappingURL=engine.spec.js.map