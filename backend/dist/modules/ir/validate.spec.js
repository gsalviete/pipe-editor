"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
const FIXTURE_PATH = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json');
function loadFixture() {
    return JSON.parse((0, fs_1.readFileSync)(FIXTURE_PATH, 'utf-8'));
}
describe('validate', () => {
    describe('T-IR-001 (IR-AC-001) — top-level shape', () => {
        it('accepts the canonical node-pnpm-nest-basic fixture', () => {
            expect((0, index_1.validate)(loadFixture())).toEqual([]);
        });
        it('rejects a non-object input', () => {
            const errs = (0, index_1.validate)('not an object');
            expect(errs).toEqual([
                expect.objectContaining({ acId: 'IR-AC-001', path: '' }),
            ]);
        });
        it('rejects a document missing `version`', () => {
            const ir = loadFixture();
            delete ir.version;
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-001', path: '/version' }));
        });
        it('rejects a document missing `project`', () => {
            const ir = loadFixture();
            delete ir.project;
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-001', path: '/project' }));
        });
        it('rejects a document missing `stages`', () => {
            const ir = loadFixture();
            delete ir.stages;
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-001', path: '/stages' }));
        });
        it('rejects a non-semver version', () => {
            const ir = loadFixture();
            ir.version = 'not-a-version';
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-001', path: '/version' }));
        });
    });
    describe('T-IR-003 (IR-AC-003) — forbidden provider-specific keys', () => {
        it.each(['jobs', 'uses', 'needs', 'runs-on', 'with', 'permissions', 'include', 'workflow_dispatch'])('rejects a top-level "%s" key', (forbidden) => {
            const ir = loadFixture();
            ir[forbidden] = 'anything';
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-003', path: `/${forbidden}` }));
        });
        it('rejects a `needs` key nested deep inside a stage', () => {
            const ir = loadFixture();
            ir.stages[0].needs = ['install'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-003', path: '/stages/0/needs' }));
        });
        it('does NOT reject `dependsOn` — it is part of the IR schema', () => {
            const errs = (0, index_1.validate)(loadFixture()).filter((e) => e.acId === 'IR-AC-003');
            expect(errs).toEqual([]);
        });
    });
    describe('T-IR-007 (IR-AC-007) — linear-chain validation', () => {
        it('flags a missing `dependsOn` field on a stage (clause: missing-dependsOn)', () => {
            const ir = loadFixture();
            delete ir.stages[2].dependsOn;
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({
                acId: 'IR-AC-007',
                path: '/stages/2/dependsOn',
                clause: 'missing-dependsOn',
            }));
        });
        it('flags a dangling reference (clause: well-formed-references)', () => {
            const ir = loadFixture();
            ir.stages[1].dependsOn = ['does-not-exist'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({
                acId: 'IR-AC-007',
                clause: 'well-formed-references',
            }));
        });
        it('flags a cycle (clause: acyclic)', () => {
            const ir = loadFixture();
            ir.stages[0].dependsOn = ['docker-build'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-007', clause: 'acyclic' }));
        });
        it('flags an in-degree > 1 (clause: single-chain)', () => {
            const ir = loadFixture();
            ir.stages[2].dependsOn = ['lint', 'install'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-chain' }));
        });
        it('flags an out-degree > 1 (clause: single-chain)', () => {
            const ir = loadFixture();
            ir.stages[2].dependsOn = ['install'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-chain' }));
        });
        it('flags two heads (clause: single-head)', () => {
            const ir = loadFixture();
            ir.stages[1].dependsOn = [];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-head' }));
        });
        it('flags two tails (clause: single-tail)', () => {
            const ir = loadFixture();
            ir.stages[4].dependsOn = ['install'];
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-007' }));
        });
        it('flags a disconnected stage (clause: connected)', () => {
            const ir = loadFixture();
            ir.stages[3].dependsOn = ['build'];
            ir.stages = ir.stages.slice(0, 3);
            ir.stages.push({
                id: 'orphan',
                name: 'Orphan',
                enabled: true,
                dependsOn: ['nowhere'],
                container: { image: 'node:20-alpine' },
                steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
            });
            const errs = (0, index_1.validate)(ir);
            expect(errs.some((e) => e.acId === 'IR-AC-007')).toBe(true);
        });
    });
    it('T-IR-009 (IR-AC-009) — stages: [] is a valid IR', () => {
        const ir = loadFixture();
        ir.stages = [];
        expect((0, index_1.validate)(ir)).toEqual([]);
    });
    describe('T-IR-016 (IR-AC-016) — required-field uncertainty resolution', () => {
        it.each([
            '/project/language',
            '/project/runtime/name',
            '/project/runtime/version',
            '/project/packageManager/name',
            '/project/packageManager/version',
        ])('flags `%s: null` without a paired unresolved entry', (path) => {
            const ir = loadFixture();
            setByPointer(ir, path, null);
            const errs = (0, index_1.validate)(ir);
            expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-016', path }));
        });
        it('accepts `null` when an unresolved entry is paired', () => {
            const ir = loadFixture();
            setByPointer(ir, '/project/language', null);
            ir.unresolved = [
                ...(ir.unresolved ?? []),
                {
                    field: '/project/language',
                    reason: 'needs-user-input',
                    message: 'Language could not be determined.',
                },
            ];
            const errs = (0, index_1.validate)(ir).filter((e) => e.acId === 'IR-AC-016');
            expect(errs).toEqual([]);
        });
    });
    it('T-IR-017 (IR-AC-017) — stages: [] passes the linear-chain rule', () => {
        const ir = loadFixture();
        ir.stages = [];
        const errs = (0, index_1.validate)(ir).filter((e) => e.acId === 'IR-AC-007');
        expect(errs).toEqual([]);
    });
    it('T-IR-018 (IR-AC-018) — unresolved entry coexisting with a committed value fails', () => {
        const ir = loadFixture();
        ir.unresolved = [
            {
                field: '/project/language',
                reason: 'needs-user-input',
                message: 'should not be here',
            },
        ];
        const errs = (0, index_1.validate)(ir);
        expect(errs).toContainEqual(expect.objectContaining({ acId: 'IR-AC-018', path: '/project/language' }));
    });
    it.todo('T-IR-005 (IR-AC-005) — needs-user-input emission [detector-dependent]');
    it.todo('T-IR-006 (IR-AC-006) — omit emits nothing [detector-dependent]');
    it.todo('T-IR-012 (IR-AC-012) — manifest-set enforcement [detector-dependent]');
    it.todo('T-IR-013 (IR-AC-013) — confidence threshold [detector-dependent]');
    it.todo('T-IR-014 (IR-AC-014) — monorepo handling [detector-dependent]');
});
function setByPointer(root, pointer, value) {
    const parts = pointer.slice(1).split('/');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
        cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
}
//# sourceMappingURL=validate.spec.js.map