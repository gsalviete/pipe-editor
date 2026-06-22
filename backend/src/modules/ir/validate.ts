// Pipeline IR validator.
//
// Implements every validation rule in docs/specs/pipeline-ir.spec.md as a
// dedicated function tagged with the IR-AC-NNN it satisfies. The validator
// returns an array of ValidationError; an IR is valid iff the array is empty.
//
// Order of checks:
//   1. Forbidden-keys tree walk          → IR-AC-003 / IR-NFR-001
//   2. Top-level shape                   → IR-AC-001
//   3. Linear-chain (non-empty stages)   → IR-AC-007 (+ trivial pass for empty → IR-AC-017)
//   4. Required-field uncertainty        → IR-AC-016
//   5. Unresolved/value consistency      → IR-AC-018
//
// Each error includes a JSON Pointer `path` to the offending field.

import {
  FORBIDDEN_KEYS,
  PackageManagerName,
  PipelineIR,
  REQUIRED_NULLABLE_FIELDS,
} from './types';
import { ValidationError } from './errors';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VALID_PACKAGE_MANAGERS: PackageManagerName[] = ['npm', 'pnpm', 'yarn'];

export function validate(input: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...validateForbiddenKeys(input, ''));

  const shapeErrors = validateShape(input);
  errors.push(...shapeErrors);
  if (shapeErrors.length > 0) return errors;

  const ir = input as PipelineIR;

  errors.push(...validateLinearChain(ir));
  errors.push(...validateRequiredFieldUncertainty(ir));
  errors.push(...validateUnresolvedConsistency(ir));

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR-AC-003 / IR-NFR-001 — forbidden provider-specific keys, recursively.
// Walks the entire tree; any object key in FORBIDDEN_KEYS fails.
// ─────────────────────────────────────────────────────────────────────────────
function validateForbiddenKeys(node: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      errors.push(...validateForbiddenKeys(item, `${path}/${i}`));
    });
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        errors.push({
          acId: 'IR-AC-003',
          path: `${path}/${key}`,
          message: `forbidden provider-specific key "${key}"; the IR is provider-neutral (IR-NFR-001)`,
        });
      }
      errors.push(...validateForbiddenKeys(value, `${path}/${key}`));
    }
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR-AC-001 — top-level shape.
// Required: version (semver), project, stages (array, may be empty), metadata.
// Optional: triggers, unresolved.
// ─────────────────────────────────────────────────────────────────────────────
function validateShape(input: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [{ acId: 'IR-AC-001', path: '', message: 'IR document must be a JSON object' }];
  }
  const doc = input as Record<string, unknown>;

  if (typeof doc.version !== 'string' || !SEMVER_RE.test(doc.version)) {
    errors.push({
      acId: 'IR-AC-001',
      path: '/version',
      message: 'version is required and must be a valid semver string (IR-FR-001)',
    });
  }

  if (doc.project === undefined || doc.project === null || typeof doc.project !== 'object') {
    errors.push({
      acId: 'IR-AC-001',
      path: '/project',
      message: 'project is required (IR-FR-002)',
    });
  } else {
    errors.push(...validateProjectShape(doc.project as Record<string, unknown>));
  }

  if (!Array.isArray(doc.stages)) {
    errors.push({
      acId: 'IR-AC-001',
      path: '/stages',
      message: 'stages is required and must be an array (IR-FR-003)',
    });
  } else {
    doc.stages.forEach((stage, i) => {
      errors.push(...validateStageShape(stage, `/stages/${i}`));
    });
  }

  if (doc.metadata === undefined || typeof doc.metadata !== 'object' || doc.metadata === null) {
    errors.push({
      acId: 'IR-AC-001',
      path: '/metadata',
      message: 'metadata is required',
    });
  }

  if (doc.unresolved !== undefined) {
    if (!Array.isArray(doc.unresolved)) {
      errors.push({
        acId: 'IR-AC-001',
        path: '/unresolved',
        message: 'unresolved must be an array if present (IR-FR-008)',
      });
    } else {
      doc.unresolved.forEach((entry, i) => {
        errors.push(...validateUnresolvedShape(entry, `/unresolved/${i}`));
      });
    }
  }

  return errors;
}

function validateProjectShape(project: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof project.name !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: '/project/name', message: 'project.name is required' });
  }
  if (typeof project.rootPath !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: '/project/rootPath', message: 'project.rootPath is required' });
  }
  if (!isStringOrNull(project.language)) {
    errors.push({ acId: 'IR-AC-001', path: '/project/language', message: 'project.language must be string|null' });
  }
  if (typeof project.runtime !== 'object' || project.runtime === null) {
    errors.push({ acId: 'IR-AC-001', path: '/project/runtime', message: 'project.runtime is required' });
  } else {
    const runtime = project.runtime as Record<string, unknown>;
    if (!isStringOrNull(runtime.name)) {
      errors.push({ acId: 'IR-AC-001', path: '/project/runtime/name', message: 'runtime.name must be string|null' });
    }
    if (!isStringOrNull(runtime.version)) {
      errors.push({ acId: 'IR-AC-001', path: '/project/runtime/version', message: 'runtime.version must be string|null' });
    }
  }
  if (typeof project.packageManager !== 'object' || project.packageManager === null) {
    errors.push({ acId: 'IR-AC-001', path: '/project/packageManager', message: 'project.packageManager is required' });
  } else {
    const pm = project.packageManager as Record<string, unknown>;
    if (pm.name !== null && !VALID_PACKAGE_MANAGERS.includes(pm.name as PackageManagerName)) {
      errors.push({
        acId: 'IR-AC-001',
        path: '/project/packageManager/name',
        message: `packageManager.name must be one of ${VALID_PACKAGE_MANAGERS.join(' | ')} | null`,
      });
    }
    if (!isStringOrNull(pm.version)) {
      errors.push({ acId: 'IR-AC-001', path: '/project/packageManager/version', message: 'packageManager.version must be string|null' });
    }
  }
  return errors;
}

function validateStageShape(stage: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
    return [{ acId: 'IR-AC-001', path, message: 'stage must be an object' }];
  }
  const s = stage as Record<string, unknown>;

  if (typeof s.id !== 'string' || !KEBAB_CASE_RE.test(s.id)) {
    errors.push({ acId: 'IR-AC-001', path: `${path}/id`, message: 'stage.id must be a kebab-case string' });
  }
  if (typeof s.name !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/name`, message: 'stage.name is required' });
  }
  if (typeof s.enabled !== 'boolean') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/enabled`, message: 'stage.enabled must be a boolean' });
  }
  if (!Array.isArray(s.dependsOn)) {
    // IR-FR-006 / IR-AC-007: missing dependsOn fails the linear-chain rule.
    errors.push({
      acId: 'IR-AC-007',
      path: `${path}/dependsOn`,
      message: 'stage.dependsOn is required (IR-FR-006)',
      clause: 'missing-dependsOn',
    });
  } else if (!s.dependsOn.every((id) => typeof id === 'string')) {
    errors.push({ acId: 'IR-AC-001', path: `${path}/dependsOn`, message: 'stage.dependsOn entries must be strings' });
  }

  if (s.container === null || typeof s.container !== 'object') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/container`, message: 'stage.container is required' });
  } else {
    const c = s.container as Record<string, unknown>;
    if (typeof c.image !== 'string') {
      // container.image is NON-nullable in v1 (see "container.image and reachability").
      errors.push({
        acId: 'IR-AC-001',
        path: `${path}/container/image`,
        message: 'container.image is required and non-nullable in v1',
      });
    }
  }

  if (!Array.isArray(s.steps)) {
    errors.push({ acId: 'IR-AC-001', path: `${path}/steps`, message: 'stage.steps must be an array' });
  } else {
    s.steps.forEach((step, i) => {
      errors.push(...validateStepShape(step, `${path}/steps/${i}`));
    });
  }

  return errors;
}

function validateStepShape(step: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (step === null || typeof step !== 'object' || Array.isArray(step)) {
    return [{ acId: 'IR-AC-001', path, message: 'step must be an object' }];
  }
  const st = step as Record<string, unknown>;
  if (typeof st.id !== 'string' || !KEBAB_CASE_RE.test(st.id)) {
    errors.push({ acId: 'IR-AC-001', path: `${path}/id`, message: 'step.id must be a kebab-case string' });
  }
  if (typeof st.run !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/run`, message: 'step.run is required' });
  }
  if (typeof st.workingDir !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/workingDir`, message: 'step.workingDir is required' });
  }
  if (st.env === null || typeof st.env !== 'object' || Array.isArray(st.env)) {
    errors.push({ acId: 'IR-AC-001', path: `${path}/env`, message: 'step.env must be an object' });
  }
  return errors;
}

function validateUnresolvedShape(entry: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [{ acId: 'IR-AC-001', path, message: 'unresolved entry must be an object' }];
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.field !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/field`, message: 'unresolved.field is required' });
  }
  if (e.reason !== 'needs-user-input') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/reason`, message: 'unresolved.reason must be "needs-user-input" (IR-FR-008)' });
  }
  if (typeof e.message !== 'string') {
    errors.push({ acId: 'IR-AC-001', path: `${path}/message`, message: 'unresolved.message is required' });
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR-AC-007 (and IR-AC-017 vacuously) — the linear-chain validation rule.
// Six clauses, applied only when stages is non-empty.
// ─────────────────────────────────────────────────────────────────────────────
function validateLinearChain(ir: PipelineIR): ValidationError[] {
  if (ir.stages.length === 0) return []; // IR-AC-017: vacuously satisfied.

  const errors: ValidationError[] = [];
  const ids = new Set(ir.stages.map((s) => s.id));

  // Duplicate IDs are a structural problem the chain rules then trip over;
  // surface it directly.
  const seen = new Set<string>();
  for (const s of ir.stages) {
    if (seen.has(s.id)) {
      errors.push({
        acId: 'IR-AC-007',
        path: `/stages`,
        message: `duplicate stage id "${s.id}"`,
        clause: 'well-formed-references',
      });
    }
    seen.add(s.id);
  }

  // Clause 6 — well-formed references. Every id in any dependsOn resolves.
  for (let i = 0; i < ir.stages.length; i++) {
    const s = ir.stages[i];
    for (const dep of s.dependsOn) {
      if (!ids.has(dep)) {
        errors.push({
          acId: 'IR-AC-007',
          path: `/stages/${i}/dependsOn`,
          message: `dependsOn references unknown stage "${dep}"`,
          clause: 'well-formed-references',
        });
      }
    }
  }
  if (errors.length > 0) return errors; // bail before walking a malformed graph

  // Build in-degree and out-degree maps.
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const s of ir.stages) {
    inDegree.set(s.id, 0);
    outDegree.set(s.id, 0);
  }
  for (const s of ir.stages) {
    for (const dep of s.dependsOn) {
      inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
      outDegree.set(dep, (outDegree.get(dep) ?? 0) + 1);
    }
  }

  // Clause 2 — single chain. in-degree ≤ 1 and out-degree ≤ 1.
  for (const s of ir.stages) {
    if ((inDegree.get(s.id) ?? 0) > 1) {
      errors.push({
        acId: 'IR-AC-007',
        path: `/stages`,
        message: `stage "${s.id}" has in-degree > 1 (linear chain requires ≤ 1)`,
        clause: 'single-chain',
      });
    }
    if ((outDegree.get(s.id) ?? 0) > 1) {
      errors.push({
        acId: 'IR-AC-007',
        path: `/stages`,
        message: `stage "${s.id}" has out-degree > 1 (linear chain requires ≤ 1)`,
        clause: 'single-chain',
      });
    }
  }

  // Clause 3 — single head: exactly one stage has dependsOn: [].
  const heads = ir.stages.filter((s) => s.dependsOn.length === 0);
  if (heads.length !== 1) {
    errors.push({
      acId: 'IR-AC-007',
      path: `/stages`,
      message: `expected exactly one head (dependsOn: []); found ${heads.length}`,
      clause: 'single-head',
    });
  }

  // Clause 4 — single tail: exactly one stage with out-degree 0.
  const tails = ir.stages.filter((s) => (outDegree.get(s.id) ?? 0) === 0);
  if (tails.length !== 1) {
    errors.push({
      acId: 'IR-AC-007',
      path: `/stages`,
      message: `expected exactly one tail (out-degree 0); found ${tails.length}`,
      clause: 'single-tail',
    });
  }

  // Clause 1 — acyclic. DFS from each node.
  if (hasCycle(ir.stages)) {
    errors.push({
      acId: 'IR-AC-007',
      path: `/stages`,
      message: 'dependsOn graph contains a cycle',
      clause: 'acyclic',
    });
  }

  // Clause 5 — connected. Walk forward from the head following the reversed
  // dependsOn relation: a stage S is reached from head H if S depends on H
  // (transitively). For our linear-chain rule, "reachable from the head
  // following dependsOn in reverse" = the chain head → ... → tail covers
  // every stage.
  if (heads.length === 1 && !hasCycle(ir.stages)) {
    const reachable = forwardReach(heads[0].id, ir.stages);
    for (const s of ir.stages) {
      if (!reachable.has(s.id)) {
        errors.push({
          acId: 'IR-AC-007',
          path: `/stages`,
          message: `stage "${s.id}" is not reachable from the head`,
          clause: 'connected',
        });
      }
    }
  }

  return errors;
}

function hasCycle(stages: PipelineIR['stages']): boolean {
  const adj = new Map<string, string[]>();
  for (const s of stages) adj.set(s.id, [...s.dependsOn]);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const s of stages) color.set(s.id, WHITE);

  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }

  for (const s of stages) {
    if (color.get(s.id) === WHITE && dfs(s.id)) return true;
  }
  return false;
}

// Forward reachability from `start` following the *reverse* of dependsOn:
// "S is forward-reachable from H" iff there is a path H → S in the chain,
// equivalently S transitively depends on H.
function forwardReach(start: string, stages: PipelineIR['stages']): Set<string> {
  const successors = new Map<string, string[]>();
  for (const s of stages) successors.set(s.id, []);
  for (const s of stages) {
    for (const dep of s.dependsOn) {
      successors.get(dep)?.push(s.id);
    }
  }
  const reached = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const u = stack.pop() as string;
    for (const v of successors.get(u) ?? []) {
      if (!reached.has(v)) {
        reached.add(v);
        stack.push(v);
      }
    }
  }
  return reached;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR-AC-016 — Required-field uncertainty resolution.
// Every required nullable field set to null MUST have a paired unresolved entry
// at the same field path.
// ─────────────────────────────────────────────────────────────────────────────
function validateRequiredFieldUncertainty(ir: PipelineIR): ValidationError[] {
  const errors: ValidationError[] = [];
  const unresolvedPaths = new Set((ir.unresolved ?? []).map((u) => u.field));

  for (const field of REQUIRED_NULLABLE_FIELDS) {
    const value = getByPointer(ir, field);
    if (value === null && !unresolvedPaths.has(field)) {
      errors.push({
        acId: 'IR-AC-016',
        path: field,
        message: `required nullable field "${field}" is null without a paired unresolved entry (Required-field uncertainty resolution)`,
      });
    }
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR-AC-018 — the mirror of IR-AC-016. An unresolved entry pointing at a
// present, non-null committed value is invalid (IR-FR-008's bidirectional
// implication).
// ─────────────────────────────────────────────────────────────────────────────
function validateUnresolvedConsistency(ir: PipelineIR): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const entry of ir.unresolved ?? []) {
    const value = getByPointer(ir, entry.field);
    if (value !== null && value !== undefined) {
      errors.push({
        acId: 'IR-AC-018',
        path: entry.field,
        message: `unresolved entry coexists with a present value at "${entry.field}" (IR-FR-008)`,
      });
    }
  }
  return errors;
}

// JSON-Pointer lookup. Supports the subset we use (no escapes for ~/0/1).
function getByPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  if (!pointer.startsWith('/')) return undefined;
  const parts = pointer.slice(1).split('/');
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const i = Number(part);
      if (!Number.isInteger(i) || i < 0 || i >= cursor.length) return undefined;
      cursor = cursor[i];
    } else if (typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string';
}
