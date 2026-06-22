// Canonical serialization of a Pipeline IR.
//
// Canonical form (per docs/specs/pipeline-ir.spec.md):
//   - `stages` is emitted in topological order from head to tail (IR-FR-003).
//   - Object keys are emitted in a deterministic order (alphabetical) so that
//     "same input → byte-identical output" holds (IR-AC-008, IR-AC-010).
//
// The metadata.generatedAt timestamp is excluded from determinism comparisons.
// `serializeCanonical` produces a JSON string; `canonicalEquals` compares two
// IRs structurally modulo generatedAt.

import { PipelineIR, Stage } from './types';

export function canonicalize(ir: PipelineIR): PipelineIR {
  return {
    ...ir,
    stages: topologicalOrder(ir.stages),
  };
}

export function serializeCanonical(ir: PipelineIR): string {
  return JSON.stringify(deepSortKeys(canonicalize(ir)));
}

// Produce a canonical string that ignores metadata.generatedAt — used for
// determinism comparison (IR-AC-008 / IR-AC-010).
export function canonicalDigest(ir: PipelineIR): string {
  const stripped: PipelineIR = {
    ...canonicalize(ir),
    metadata: { ...ir.metadata, generatedAt: '' },
  };
  return JSON.stringify(deepSortKeys(stripped));
}

export function canonicalEquals(a: PipelineIR, b: PipelineIR): boolean {
  return canonicalDigest(a) === canonicalDigest(b);
}

function topologicalOrder(stages: Stage[]): Stage[] {
  if (stages.length === 0) return [];

  const byId = new Map<string, Stage>();
  for (const s of stages) byId.set(s.id, s);

  // Linear chain (v1): pick the head (dependsOn: []) and walk via successors.
  const head = stages.find((s) => s.dependsOn.length === 0);
  if (head === undefined) return [...stages];

  const successors = new Map<string, string[]>();
  for (const s of stages) successors.set(s.id, []);
  for (const s of stages) {
    for (const dep of s.dependsOn) successors.get(dep)?.push(s.id);
  }

  const ordered: Stage[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = head.id;
  while (cursor !== undefined) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const node = byId.get(cursor);
    if (node === undefined) break;
    ordered.push(node);
    cursor = (successors.get(cursor) ?? [])[0]; // v1 linear: ≤ 1 successor
  }

  // Append any stage not covered by the walk last — defensive only; a valid
  // v1 IR covers every stage via the chain.
  for (const s of stages) {
    if (!visited.has(s.id)) ordered.push(s);
  }

  return ordered;
}

function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value === null || typeof value !== 'object') return value;
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) sorted[k] = deepSortKeys((value as Record<string, unknown>)[k]);
  return sorted;
}
