"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMajor = extractMajor;
exports.isNonEmptyString = isNonEmptyString;
exports.nodeImageFor = nodeImageFor;
exports.stepShape = stepShape;
function extractMajor(version) {
    const m = version.match(/(\d+)/);
    return m === null ? version : m[1];
}
function isNonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
}
function nodeImageFor(ctx) {
    const v = ctx.ir.project.runtime.version;
    return v === null ? 'node:lts-alpine' : `node:${v}-alpine`;
}
function stepShape(id, run) {
    return { id, run, workingDir: '.', env: {} };
}
//# sourceMappingURL=helpers.js.map