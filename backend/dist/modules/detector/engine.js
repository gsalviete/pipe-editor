"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Detector = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const ir_1 = require("../ir");
const errors_1 = require("./errors");
const emit_outcome_1 = require("./emit-outcome");
const manifests_1 = require("./manifests");
const types_1 = require("./types");
class Detector {
    constructor(opts) {
        this.detectorVersion = opts.detectorVersion ?? '0.1.0';
        this.rules = auditRules(opts.rules);
    }
    detect(rootPath) {
        if (!(0, fs_1.existsSync)(rootPath) || !(0, fs_1.statSync)(rootPath).isDirectory()) {
            throw new errors_1.NoRootDirError(rootPath);
        }
        const { manifests, warnings, anyPresent } = (0, manifests_1.readManifests)(rootPath);
        if (!anyPresent)
            throw new errors_1.NoManifestError(rootPath);
        const project = {
            name: (0, path_1.basename)(rootPath),
            rootPath,
            language: null,
            runtime: { name: null, version: null },
            packageManager: { name: null, version: null },
        };
        const unresolvedByField = new Map();
        const ctxFor = (rule) => ({
            manifests: filterManifests(manifests, rule.reads),
            ir: { version: '0.1.0', project },
            rootPath,
        });
        const fieldEmitterByTarget = new Map();
        for (const rule of this.rules.filter((r) => r.kind === 'field')) {
            const ctx = ctxFor(rule);
            const fired = firstMatchedCase(rule, ctx);
            if (fired === undefined)
                continue;
            const outcome = (0, emit_outcome_1.emitOutcome)(fired, ctx);
            switch (outcome.kind) {
                case 'committed': {
                    const target = fired.emit(ctx).target;
                    assertAllowedFieldTarget(rule.id, target);
                    const conflictOwner = fieldEmitterByTarget.get(target);
                    if (conflictOwner !== undefined && conflictOwner !== rule.id) {
                        throw new errors_1.RuleConflictError(conflictOwner, rule.id, target);
                    }
                    fieldEmitterByTarget.set(target, rule.id);
                    writeProjectField(project, target, outcome.value);
                    unresolvedByField.delete(target);
                    break;
                }
                case 'unresolved': {
                    if (!unresolvedByField.has(outcome.field)) {
                        unresolvedByField.set(outcome.field, {
                            field: outcome.field,
                            reason: 'needs-user-input',
                            message: outcome.message,
                        });
                    }
                    break;
                }
                case 'nothing':
                case 'committed-stage':
                    break;
            }
        }
        const stagesById = new Map();
        const stageEmitterById = new Map();
        const stageCtxFor = (rule) => ({
            manifests: filterManifests(manifests, rule.reads),
            ir: { version: '0.1.0', project },
            rootPath,
        });
        for (const rule of this.rules.filter((r) => r.kind === 'stage')) {
            const ctx = stageCtxFor(rule);
            const fired = firstMatchedCase(rule, ctx);
            if (fired === undefined)
                continue;
            const outcome = (0, emit_outcome_1.emitOutcome)(fired, ctx);
            if (outcome.kind !== 'committed-stage')
                continue;
            const stage = outcome.stage;
            assertCanonicalStageId(rule.id, stage.id);
            const owner = stageEmitterById.get(stage.id);
            if (owner !== undefined && owner !== rule.id) {
                throw new errors_1.RuleConflictError(owner, rule.id, `/stages/${stage.id}`);
            }
            stageEmitterById.set(stage.id, rule.id);
            stagesById.set(stage.id, stage);
        }
        if (project.packageManager.name === null) {
            stagesById.clear();
        }
        else {
            if (!stagesById.has('install')) {
                for (const id of ['lint', 'test', 'build']) {
                    stagesById.delete(id);
                }
            }
        }
        const stages = [];
        let previous;
        for (const id of types_1.CANONICAL_STAGE_IDS) {
            const stage = stagesById.get(id);
            if (stage === undefined)
                continue;
            stages.push({
                ...stage,
                dependsOn: previous === undefined ? [] : [previous],
            });
            previous = id;
        }
        const ir = {
            version: '0.1.0',
            project,
            stages,
            unresolved: [...unresolvedByField.values()],
            metadata: {
                generatedAt: new Date().toISOString(),
                detectorVersion: this.detectorVersion,
            },
        };
        const canonical = (0, ir_1.canonicalize)(ir);
        const errors = (0, ir_1.validate)(canonical);
        if (errors.length > 0) {
            throw new errors_1.InvalidProducedIRError(errors);
        }
        return { ir: canonical, warnings };
    }
}
exports.Detector = Detector;
function auditRules(rules) {
    const allowed = new Set(types_1.ENUMERATED_MANIFEST_SET);
    for (const r of rules) {
        for (const m of r.reads) {
            if (!allowed.has(m)) {
                throw new errors_1.RuleRegistrationError(r.id, `reads "${m}" outside the enumerated manifest set`);
            }
        }
        void r;
    }
    return rules;
}
function firstMatchedCase(rule, ctx) {
    for (const c of rule.cases) {
        try {
            if (c.condition(ctx))
                return c;
        }
        catch (e) {
            throw new errors_1.RuleDefectError(rule.id, `case.condition threw: ${e.message}`);
        }
    }
    return undefined;
}
function filterManifests(all, declared) {
    const out = {};
    for (const key of declared) {
        const k = key;
        if (k in all)
            out[k] = all[k];
    }
    return out;
}
function assertAllowedFieldTarget(ruleId, target) {
    if (!types_1.ALLOWED_FIELD_TARGETS.includes(target)) {
        throw new errors_1.RuleDefectError(ruleId, `emits at unknown field target "${target}"; allowed: ${types_1.ALLOWED_FIELD_TARGETS.join(', ')}`);
    }
}
function assertCanonicalStageId(ruleId, stageId) {
    if (!types_1.CANONICAL_STAGE_IDS.includes(stageId)) {
        throw new errors_1.RuleDefectError(ruleId, `emits Stage with non-canonical id "${stageId}"; allowed: ${types_1.CANONICAL_STAGE_IDS.join(', ')}`);
    }
}
function writeProjectField(project, target, value) {
    switch (target) {
        case '/project/name':
            project.name = value;
            return;
        case '/project/language':
            project.language = value;
            return;
        case '/project/runtime/name':
            project.runtime.name = value;
            return;
        case '/project/runtime/version':
            project.runtime.version = value;
            return;
        case '/project/packageManager/name':
            project.packageManager.name = value;
            return;
        case '/project/packageManager/version':
            project.packageManager.version = value;
            return;
    }
}
//# sourceMappingURL=engine.js.map