"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
const FIXTURE_PATH = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json');
function loadFixture() {
    return JSON.parse((0, fs_1.readFileSync)(FIXTURE_PATH, 'utf-8'));
}
function ids(chain) {
    return chain.map((s) => s.id);
}
describe('computeEffectiveChain', () => {
    it('T-IR-015 (IR-AC-015) — disabling Lint yields Install → Test → Build → Docker', () => {
        const ir = loadFixture();
        ir.stages[1].enabled = false;
        const chain = (0, index_1.computeEffectiveChain)(ir);
        expect(ids(chain)).toEqual(['install', 'test', 'build', 'docker-build']);
        const test = chain.find((s) => s.id === 'test');
        expect(test?.dependsOn).toEqual(['install']);
        expect(ir.stages[1].id).toBe('lint');
        expect(ir.stages[1].enabled).toBe(false);
        expect(ir.stages[1].dependsOn).toEqual(['install']);
        const reIR = { ...ir, stages: chain };
        expect((0, index_1.validate)(reIR).filter((e) => e.acId === 'IR-AC-007')).toEqual([]);
    });
    describe('splice edge cases', () => {
        it('disabled head: next stage becomes the new head', () => {
            const ir = loadFixture();
            ir.stages[0].enabled = false;
            const chain = (0, index_1.computeEffectiveChain)(ir);
            expect(ids(chain)).toEqual(['lint', 'test', 'build', 'docker-build']);
            expect(chain[0].dependsOn).toEqual([]);
        });
        it('disabled tail: predecessor becomes the new tail', () => {
            const ir = loadFixture();
            ir.stages[4].enabled = false;
            const chain = (0, index_1.computeEffectiveChain)(ir);
            expect(ids(chain)).toEqual(['install', 'lint', 'test', 'build']);
            expect(chain[chain.length - 1].id).toBe('build');
        });
        it('consecutive disabled stages: transitive splice across both', () => {
            const ir = loadFixture();
            ir.stages[1].enabled = false;
            ir.stages[2].enabled = false;
            const chain = (0, index_1.computeEffectiveChain)(ir);
            expect(ids(chain)).toEqual(['install', 'build', 'docker-build']);
            const build = chain.find((s) => s.id === 'build');
            expect(build?.dependsOn).toEqual(['install']);
        });
        it('all stages disabled: effective chain is empty', () => {
            const ir = loadFixture();
            for (const s of ir.stages)
                s.enabled = false;
            expect((0, index_1.computeEffectiveChain)(ir)).toEqual([]);
        });
        it('empty stages array: effective chain is empty', () => {
            const ir = loadFixture();
            ir.stages = [];
            expect((0, index_1.computeEffectiveChain)(ir)).toEqual([]);
        });
        it('does NOT mutate the input IR', () => {
            const ir = loadFixture();
            const before = JSON.stringify(ir);
            ir.stages[2].enabled = false;
            (0, index_1.computeEffectiveChain)(ir);
            const after = JSON.stringify(ir);
            ir.stages[2].enabled = true;
            expect(JSON.stringify(ir)).toBe(before);
            expect(after).not.toBe(before);
        });
    });
});
//# sourceMappingURL=effective-chain.spec.js.map