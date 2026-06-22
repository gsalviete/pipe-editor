"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
const FIXTURE_PATH = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json');
function loadFixture() {
    return JSON.parse((0, fs_1.readFileSync)(FIXTURE_PATH, 'utf-8'));
}
describe('canonicalize / serialize', () => {
    it('T-IR-004 (IR-AC-004) — canonical stages are head-to-tail; input order is irrelevant', () => {
        const ir = loadFixture();
        const original = ['install', 'lint', 'test', 'build', 'docker-build'];
        const reversed = { ...ir, stages: [...ir.stages].reverse() };
        expect((0, index_1.canonicalize)(reversed).stages.map((s) => s.id)).toEqual(original);
        const shuffled = {
            ...ir,
            stages: [ir.stages[3], ir.stages[0], ir.stages[4], ir.stages[2], ir.stages[1]],
        };
        expect((0, index_1.canonicalize)(shuffled).stages.map((s) => s.id)).toEqual(original);
    });
    it('T-IR-008 (IR-AC-008) — two copies differing only in generatedAt canonicalize-equal', () => {
        const a = loadFixture();
        const b = loadFixture();
        b.metadata.generatedAt = '2030-01-01T00:00:00Z';
        expect((0, index_1.canonicalEquals)(a, b)).toBe(true);
        expect((0, index_1.canonicalDigest)(a)).toBe((0, index_1.canonicalDigest)(b));
    });
    it('T-IR-010 (IR-AC-010) — serializeCanonical is byte-identical across calls', () => {
        const ir = loadFixture();
        const a = (0, index_1.serializeCanonical)(ir);
        const b = (0, index_1.serializeCanonical)(ir);
        expect(a).toBe(b);
    });
    it('T-IR-010 (IR-AC-010) — key reordering at input produces identical bytes', () => {
        const ir = loadFixture();
        const reordered = JSON.parse(JSON.stringify({
            metadata: ir.metadata,
            unresolved: ir.unresolved,
            stages: ir.stages,
            triggers: ir.triggers,
            project: ir.project,
            version: ir.version,
        }));
        expect((0, index_1.serializeCanonical)(reordered)).toBe((0, index_1.serializeCanonical)(ir));
    });
    it('T-IR-011 (IR-AC-011) — enabled:false survives canonicalization', () => {
        const ir = loadFixture();
        ir.stages[1].enabled = false;
        const round = (0, index_1.canonicalize)(ir);
        const lint = round.stages.find((s) => s.id === 'lint');
        expect(lint).toBeDefined();
        expect(lint?.enabled).toBe(false);
        expect(lint?.dependsOn).toEqual(['install']);
    });
});
//# sourceMappingURL=canonical.spec.js.map