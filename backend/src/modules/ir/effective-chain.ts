// The single shared disabled-stage splice algorithm mandated by IR-FR-014.
//
// Every consumer (Dockerfile Generator, GitHub Actions Generator, Executor)
// MUST import and call this function — they MUST NOT re-implement splicing
// inline. The mandate is a direct application of ADR-0003 (the IR is the
// source of truth; transforms every consumer depends on must themselves be
// shared) and protects the ADR-0001 fidelity claim from drift between
// consumers.
//
// Input:  a validated PipelineIR.
// Output: the effective list of Stages a consumer would render or run —
//         disabled Stages removed, dependents re-linked to skip over them.
// Side effects: none. The input IR is not mutated.

import { PipelineIR, Stage } from './types';

export function computeEffectiveChain(ir: PipelineIR): Stage[] {
  if (ir.stages.length === 0) return [];

  const byId = new Map<string, Stage>();
  for (const s of ir.stages) byId.set(s.id, s);

  const result: Stage[] = [];
  for (const stage of ir.stages) {
    if (!stage.enabled) continue;

    // Re-link: each entry in dependsOn is walked through disabled predecessors
    // until we find an enabled one (or run off the head). In v1 each entry's
    // own dependsOn has 0 or 1 elements, so the walk is a simple chain hop.
    const effectiveDependsOn: string[] = [];
    for (const depId of stage.dependsOn) {
      const resolved = walkPastDisabled(depId, byId);
      if (resolved !== undefined) effectiveDependsOn.push(resolved);
    }

    result.push({ ...stage, dependsOn: effectiveDependsOn });
  }

  return result;
}

// Follow dependsOn from `startId` upward until we find an enabled stage or
// hit a stage with no predecessors (the head); return that enabled stage's id,
// or undefined if we ran past the head while every visited stage was disabled.
function walkPastDisabled(startId: string, byId: Map<string, Stage>): string | undefined {
  let cursor: string | undefined = startId;
  const visited = new Set<string>();
  while (cursor !== undefined) {
    if (visited.has(cursor)) return undefined; // defensive: validated IR has no cycles
    visited.add(cursor);

    const node = byId.get(cursor);
    if (node === undefined) return undefined; // dangling ref; validator would have flagged
    if (node.enabled) return cursor;

    cursor = node.dependsOn[0]; // v1: 0 or 1 entry
  }
  return undefined;
}
