"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEffectiveChain = computeEffectiveChain;
function computeEffectiveChain(ir) {
    if (ir.stages.length === 0)
        return [];
    const byId = new Map();
    for (const s of ir.stages)
        byId.set(s.id, s);
    const result = [];
    for (const stage of ir.stages) {
        if (!stage.enabled)
            continue;
        const effectiveDependsOn = [];
        for (const depId of stage.dependsOn) {
            const resolved = walkPastDisabled(depId, byId);
            if (resolved !== undefined)
                effectiveDependsOn.push(resolved);
        }
        result.push({ ...stage, dependsOn: effectiveDependsOn });
    }
    return result;
}
function walkPastDisabled(startId, byId) {
    let cursor = startId;
    const visited = new Set();
    while (cursor !== undefined) {
        if (visited.has(cursor))
            return undefined;
        visited.add(cursor);
        const node = byId.get(cursor);
        if (node === undefined)
            return undefined;
        if (node.enabled)
            return cursor;
        cursor = node.dependsOn[0];
    }
    return undefined;
}
//# sourceMappingURL=effective-chain.js.map