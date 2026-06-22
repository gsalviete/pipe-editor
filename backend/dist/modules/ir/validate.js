"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const types_1 = require("./types");
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VALID_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'];
function validate(input) {
    const errors = [];
    errors.push(...validateForbiddenKeys(input, ''));
    const shapeErrors = validateShape(input);
    errors.push(...shapeErrors);
    if (shapeErrors.length > 0)
        return errors;
    const ir = input;
    errors.push(...validateLinearChain(ir));
    errors.push(...validateRequiredFieldUncertainty(ir));
    errors.push(...validateUnresolvedConsistency(ir));
    return errors;
}
function validateForbiddenKeys(node, path) {
    const errors = [];
    if (Array.isArray(node)) {
        node.forEach((item, i) => {
            errors.push(...validateForbiddenKeys(item, `${path}/${i}`));
        });
    }
    else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (types_1.FORBIDDEN_KEYS.includes(key)) {
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
function validateShape(input) {
    const errors = [];
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return [{ acId: 'IR-AC-001', path: '', message: 'IR document must be a JSON object' }];
    }
    const doc = input;
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
    }
    else {
        errors.push(...validateProjectShape(doc.project));
    }
    if (!Array.isArray(doc.stages)) {
        errors.push({
            acId: 'IR-AC-001',
            path: '/stages',
            message: 'stages is required and must be an array (IR-FR-003)',
        });
    }
    else {
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
        }
        else {
            doc.unresolved.forEach((entry, i) => {
                errors.push(...validateUnresolvedShape(entry, `/unresolved/${i}`));
            });
        }
    }
    return errors;
}
function validateProjectShape(project) {
    const errors = [];
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
    }
    else {
        const runtime = project.runtime;
        if (!isStringOrNull(runtime.name)) {
            errors.push({ acId: 'IR-AC-001', path: '/project/runtime/name', message: 'runtime.name must be string|null' });
        }
        if (!isStringOrNull(runtime.version)) {
            errors.push({ acId: 'IR-AC-001', path: '/project/runtime/version', message: 'runtime.version must be string|null' });
        }
    }
    if (typeof project.packageManager !== 'object' || project.packageManager === null) {
        errors.push({ acId: 'IR-AC-001', path: '/project/packageManager', message: 'project.packageManager is required' });
    }
    else {
        const pm = project.packageManager;
        if (pm.name !== null && !VALID_PACKAGE_MANAGERS.includes(pm.name)) {
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
function validateStageShape(stage, path) {
    const errors = [];
    if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
        return [{ acId: 'IR-AC-001', path, message: 'stage must be an object' }];
    }
    const s = stage;
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
        errors.push({
            acId: 'IR-AC-007',
            path: `${path}/dependsOn`,
            message: 'stage.dependsOn is required (IR-FR-006)',
            clause: 'missing-dependsOn',
        });
    }
    else if (!s.dependsOn.every((id) => typeof id === 'string')) {
        errors.push({ acId: 'IR-AC-001', path: `${path}/dependsOn`, message: 'stage.dependsOn entries must be strings' });
    }
    if (s.container === null || typeof s.container !== 'object') {
        errors.push({ acId: 'IR-AC-001', path: `${path}/container`, message: 'stage.container is required' });
    }
    else {
        const c = s.container;
        if (typeof c.image !== 'string') {
            errors.push({
                acId: 'IR-AC-001',
                path: `${path}/container/image`,
                message: 'container.image is required and non-nullable in v1',
            });
        }
    }
    if (!Array.isArray(s.steps)) {
        errors.push({ acId: 'IR-AC-001', path: `${path}/steps`, message: 'stage.steps must be an array' });
    }
    else {
        s.steps.forEach((step, i) => {
            errors.push(...validateStepShape(step, `${path}/steps/${i}`));
        });
    }
    return errors;
}
function validateStepShape(step, path) {
    const errors = [];
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
        return [{ acId: 'IR-AC-001', path, message: 'step must be an object' }];
    }
    const st = step;
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
function validateUnresolvedShape(entry, path) {
    const errors = [];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return [{ acId: 'IR-AC-001', path, message: 'unresolved entry must be an object' }];
    }
    const e = entry;
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
function validateLinearChain(ir) {
    if (ir.stages.length === 0)
        return [];
    const errors = [];
    const ids = new Set(ir.stages.map((s) => s.id));
    const seen = new Set();
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
    if (errors.length > 0)
        return errors;
    const inDegree = new Map();
    const outDegree = new Map();
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
    const heads = ir.stages.filter((s) => s.dependsOn.length === 0);
    if (heads.length !== 1) {
        errors.push({
            acId: 'IR-AC-007',
            path: `/stages`,
            message: `expected exactly one head (dependsOn: []); found ${heads.length}`,
            clause: 'single-head',
        });
    }
    const tails = ir.stages.filter((s) => (outDegree.get(s.id) ?? 0) === 0);
    if (tails.length !== 1) {
        errors.push({
            acId: 'IR-AC-007',
            path: `/stages`,
            message: `expected exactly one tail (out-degree 0); found ${tails.length}`,
            clause: 'single-tail',
        });
    }
    if (hasCycle(ir.stages)) {
        errors.push({
            acId: 'IR-AC-007',
            path: `/stages`,
            message: 'dependsOn graph contains a cycle',
            clause: 'acyclic',
        });
    }
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
function hasCycle(stages) {
    const adj = new Map();
    for (const s of stages)
        adj.set(s.id, [...s.dependsOn]);
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const s of stages)
        color.set(s.id, WHITE);
    function dfs(u) {
        color.set(u, GRAY);
        for (const v of adj.get(u) ?? []) {
            const c = color.get(v) ?? WHITE;
            if (c === GRAY)
                return true;
            if (c === WHITE && dfs(v))
                return true;
        }
        color.set(u, BLACK);
        return false;
    }
    for (const s of stages) {
        if (color.get(s.id) === WHITE && dfs(s.id))
            return true;
    }
    return false;
}
function forwardReach(start, stages) {
    const successors = new Map();
    for (const s of stages)
        successors.set(s.id, []);
    for (const s of stages) {
        for (const dep of s.dependsOn) {
            successors.get(dep)?.push(s.id);
        }
    }
    const reached = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
        const u = stack.pop();
        for (const v of successors.get(u) ?? []) {
            if (!reached.has(v)) {
                reached.add(v);
                stack.push(v);
            }
        }
    }
    return reached;
}
function validateRequiredFieldUncertainty(ir) {
    const errors = [];
    const unresolvedPaths = new Set((ir.unresolved ?? []).map((u) => u.field));
    for (const field of types_1.REQUIRED_NULLABLE_FIELDS) {
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
function validateUnresolvedConsistency(ir) {
    const errors = [];
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
function getByPointer(root, pointer) {
    if (pointer === '')
        return root;
    if (!pointer.startsWith('/'))
        return undefined;
    const parts = pointer.slice(1).split('/');
    let cursor = root;
    for (const part of parts) {
        if (cursor === null || cursor === undefined)
            return undefined;
        if (Array.isArray(cursor)) {
            const i = Number(part);
            if (!Number.isInteger(i) || i < 0 || i >= cursor.length)
                return undefined;
            cursor = cursor[i];
        }
        else if (typeof cursor === 'object') {
            cursor = cursor[part];
        }
        else {
            return undefined;
        }
    }
    return cursor;
}
function isStringOrNull(v) {
    return v === null || typeof v === 'string';
}
//# sourceMappingURL=validate.js.map