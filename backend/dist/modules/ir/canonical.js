"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalize = canonicalize;
exports.serializeCanonical = serializeCanonical;
exports.canonicalDigest = canonicalDigest;
exports.canonicalEquals = canonicalEquals;
function canonicalize(ir) {
    return {
        ...ir,
        stages: topologicalOrder(ir.stages),
    };
}
function serializeCanonical(ir) {
    return JSON.stringify(deepSortKeys(canonicalize(ir)));
}
function canonicalDigest(ir) {
    const stripped = {
        ...canonicalize(ir),
        metadata: { ...ir.metadata, generatedAt: '' },
    };
    return JSON.stringify(deepSortKeys(stripped));
}
function canonicalEquals(a, b) {
    return canonicalDigest(a) === canonicalDigest(b);
}
function topologicalOrder(stages) {
    if (stages.length === 0)
        return [];
    const byId = new Map();
    for (const s of stages)
        byId.set(s.id, s);
    const head = stages.find((s) => s.dependsOn.length === 0);
    if (head === undefined)
        return [...stages];
    const successors = new Map();
    for (const s of stages)
        successors.set(s.id, []);
    for (const s of stages) {
        for (const dep of s.dependsOn)
            successors.get(dep)?.push(s.id);
    }
    const ordered = [];
    const visited = new Set();
    let cursor = head.id;
    while (cursor !== undefined) {
        if (visited.has(cursor))
            break;
        visited.add(cursor);
        const node = byId.get(cursor);
        if (node === undefined)
            break;
        ordered.push(node);
        cursor = (successors.get(cursor) ?? [])[0];
    }
    for (const s of stages) {
        if (!visited.has(s.id))
            ordered.push(s);
    }
    return ordered;
}
function deepSortKeys(value) {
    if (Array.isArray(value))
        return value.map(deepSortKeys);
    if (value === null || typeof value !== 'object')
        return value;
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const k of keys)
        sorted[k] = deepSortKeys(value[k]);
    return sorted;
}
//# sourceMappingURL=canonical.js.map