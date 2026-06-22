"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const yaml = require("js-yaml");
const index_1 = require("./index");
const FIXTURE_PATH = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json');
function loadFixture() {
    return JSON.parse((0, fs_1.readFileSync)(FIXTURE_PATH, 'utf-8'));
}
describe('T-IR-002 (IR-AC-002) — JSON / YAML round-trip', () => {
    it('JSON round-trip preserves canonical digest', () => {
        const original = loadFixture();
        const round = JSON.parse(JSON.stringify(original));
        expect((0, index_1.canonicalDigest)(round)).toBe((0, index_1.canonicalDigest)(original));
    });
    it('YAML round-trip preserves canonical digest', () => {
        const original = loadFixture();
        const dumped = yaml.dump(original);
        const round = yaml.load(dumped);
        expect((0, index_1.canonicalDigest)(round)).toBe((0, index_1.canonicalDigest)(original));
    });
    it('YAML round-trip preserves stage array order', () => {
        const original = loadFixture();
        const round = yaml.load(yaml.dump(original));
        expect(round.stages.map((s) => s.id)).toEqual(original.stages.map((s) => s.id));
    });
    it('round-tripped document validates', () => {
        const original = loadFixture();
        const round = yaml.load(yaml.dump(original));
        expect((0, index_1.validate)(round)).toEqual([]);
    });
});
//# sourceMappingURL=roundtrip.spec.js.map