// Detector Engine — the 10-step detect(rootPath) pipeline.
//
// Strict implementation of docs/specs/detector-engine.spec.md.

import { existsSync, statSync } from 'fs';
import { basename } from 'path';
import {
  canonicalize,
  PipelineIR,
  Stage,
  UnresolvedEntry,
  validate,
} from '../ir';
import {
  InvalidProducedIRError,
  NoManifestError,
  NoRootDirError,
  RuleConflictError,
  RuleDefectError,
  RuleRegistrationError,
} from './errors';
import { emitOutcome } from './emit-outcome';
import { hasLockfileFor } from './rules/dr-007-install';
import { readManifests, Warning } from './manifests';
import {
  ALLOWED_FIELD_TARGETS,
  AllowedFieldTarget,
  CANONICAL_STAGE_IDS,
  CanonicalStageId,
  Case,
  ENUMERATED_MANIFEST_SET,
  Manifests,
  PartialPipelineIR,
  Rule,
  RuleCtx,
} from './types';

export interface DetectorOptions {
  rules: Rule[];
  // Optional override for the detector version emitted into IR.metadata.
  detectorVersion?: string;
}

export class Detector {
  private readonly rules: Rule[];
  private readonly detectorVersion: string;

  constructor(opts: DetectorOptions) {
    this.detectorVersion = opts.detectorVersion ?? '0.1.0';
    this.rules = auditRules(opts.rules);
  }

  detect(rootPath: string): { ir: PipelineIR; warnings: Warning[] } {
    // Step 1 — verify root.
    if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
      throw new NoRootDirError(rootPath);
    }

    // Step 2 — read manifests (package.json hard-throws; others warn).
    const { manifests, warnings, anyPresent } = readManifests(rootPath);
    if (!anyPresent) throw new NoManifestError(rootPath);

    // Build the in-progress IR's project block defaults.
    const project: PipelineIR['project'] = {
      name: basename(rootPath),
      rootPath,
      language: null,
      runtime: { name: null, version: null },
      packageManager: { name: null, version: null },
    };
    const unresolvedByField = new Map<string, UnresolvedEntry>();

    const ctxFor = (rule: Rule): RuleCtx => ({
      manifests: filterManifests(manifests, rule.reads),
      ir: { version: '0.1.0', project },
      rootPath,
    });

    // Step 3 — project-fields pass.
    const fieldEmitterByTarget = new Map<string, string>(); // target → ruleId
    for (const rule of this.rules.filter((r) => r.kind === 'field')) {
      const ctx = ctxFor(rule);
      const fired = firstMatchedCase(rule, ctx);
      if (fired === undefined) continue;
      const outcome = emitOutcome(fired, ctx);
      switch (outcome.kind) {
        case 'committed': {
          const target = (fired.emit(ctx) as { target: string }).target;
          assertAllowedFieldTarget(rule.id, target);
          const conflictOwner = fieldEmitterByTarget.get(target);
          if (conflictOwner !== undefined && conflictOwner !== rule.id) {
            throw new RuleConflictError(conflictOwner, rule.id, target);
          }
          fieldEmitterByTarget.set(target, rule.id);
          writeProjectField(project, target, outcome.value);
          // If a prior catch-all queued an unresolved for this field, clear it.
          unresolvedByField.delete(target);
          break;
        }
        case 'unresolved': {
          // Only the first unresolved per field path wins; project-field rules
          // are evaluated once so this is naturally fine.
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

    // Step 4 — stage emission pass.
    const stagesById = new Map<CanonicalStageId, Stage>();
    const stageEmitterById = new Map<string, string>();
    const stageCtxFor = (rule: Rule): RuleCtx => ({
      manifests: filterManifests(manifests, rule.reads),
      ir: { version: '0.1.0', project },
      rootPath,
    });

    for (const rule of this.rules.filter((r) => r.kind === 'stage')) {
      const ctx = stageCtxFor(rule);
      const fired = firstMatchedCase(rule, ctx);
      if (fired === undefined) continue;
      const outcome = emitOutcome(fired, ctx);
      if (outcome.kind !== 'committed-stage') continue;

      const stage = outcome.stage;
      assertCanonicalStageId(rule.id, stage.id);
      const owner = stageEmitterById.get(stage.id);
      if (owner !== undefined && owner !== rule.id) {
        throw new RuleConflictError(owner, rule.id, `/stages/${stage.id}`);
      }
      stageEmitterById.set(stage.id, rule.id);
      stagesById.set(stage.id as CanonicalStageId, stage);
    }

    // GEN-04 — say so when the declared package manager has no lockfile.
    // DR-005 resolves the manager from `packageManager` before consulting
    // lockfiles, so this combination is reachable and used to yield a
    // `--frozen-lockfile` install that cannot succeed. DR-007 now emits a
    // resolving install instead; this warning explains why the artifact is
    // not reproducible until a lockfile is committed.
    const pmName = project.packageManager.name;
    if (pmName !== null && !hasLockfileFor({ manifests, ir: { version: '0.1.0', project }, rootPath }, pmName)) {
      warnings.push({
        manifest: LOCKFILE_NAME_BY_PM[pmName],
        message:
          `The project declares ${pmName} but no ${LOCKFILE_NAME_BY_PM[pmName]} was found. ` +
          'The install stage uses a resolving install instead of a frozen one, so dependency ' +
          'versions can drift between runs. Commit a lockfile to make the pipeline reproducible.',
      });
    }

    // Step 5 — install-dependency invariant (DET-FR-018).
    // (a) PM-null total suppression.
    if (project.packageManager.name === null) {
      stagesById.clear();
    } else {
      // (b) orphaned-command-Stage drop.
      if (!stagesById.has('install')) {
        for (const id of ['lint', 'test', 'build'] as CanonicalStageId[]) {
          stagesById.delete(id);
        }
      }
    }

    // Step 6 — chain composition (canonical order; skip absent).
    const stages: Stage[] = [];
    let previous: string | undefined;
    for (const id of CANONICAL_STAGE_IDS) {
      const stage = stagesById.get(id);
      if (stage === undefined) continue;
      stages.push({
        ...stage,
        dependsOn: previous === undefined ? [] : [previous],
      });
      previous = id;
    }

    // Step 7 — triggers pass-through (do NOT inject default).
    // Step 8 — canonicalize.
    // Step 9 — validate.
    // Step 10 — return.

    const ir: PipelineIR = {
      version: '0.1.0',
      project,
      stages,
      unresolved: [...unresolvedByField.values()],
      metadata: {
        generatedAt: new Date().toISOString(),
        detectorVersion: this.detectorVersion,
      },
    };
    const canonical = canonicalize(ir);
    const errors = validate(canonical);
    if (errors.length > 0) {
      throw new InvalidProducedIRError(errors);
    }
    return { ir: canonical, warnings };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function auditRules(rules: Rule[]): Rule[] {
  const allowed = new Set<string>(ENUMERATED_MANIFEST_SET);
  for (const r of rules) {
    for (const m of r.reads) {
      if (!allowed.has(m)) {
        throw new RuleRegistrationError(
          r.id,
          `reads "${m}" outside the enumerated manifest set`,
        );
      }
    }
    // Probe each case for a stage emission with a canonical id (best-effort;
    // emit is pure and may not produce a useful result without ctx, but a
    // non-canonical id can sometimes be detected by introspecting a sample
    // emit on a synthetic empty ctx). We keep this conservative and defer
    // hard checks to detect-time (assertCanonicalStageId).
    void r;
  }
  return rules;
}

function firstMatchedCase(rule: Rule, ctx: RuleCtx): Case | undefined {
  for (const c of rule.cases) {
    try {
      if (c.condition(ctx)) return c;
    } catch (e) {
      throw new RuleDefectError(
        rule.id,
        `case.condition threw: ${(e as Error).message}`,
      );
    }
  }
  return undefined;
}

function filterManifests(all: Manifests, declared: readonly string[]): Manifests {
  const out: Manifests = {};
  for (const key of declared) {
    const k = key as keyof Manifests;
    if (k in all) (out as Record<string, unknown>)[k] = all[k];
  }
  return out;
}

function assertAllowedFieldTarget(ruleId: string, target: string): void {
  if (!(ALLOWED_FIELD_TARGETS as readonly string[]).includes(target)) {
    throw new RuleDefectError(
      ruleId,
      `emits at unknown field target "${target}"; allowed: ${ALLOWED_FIELD_TARGETS.join(', ')}`,
    );
  }
}

function assertCanonicalStageId(ruleId: string, stageId: string): void {
  if (!(CANONICAL_STAGE_IDS as readonly string[]).includes(stageId)) {
    throw new RuleDefectError(
      ruleId,
      `emits Stage with non-canonical id "${stageId}"; allowed: ${CANONICAL_STAGE_IDS.join(', ')}`,
    );
  }
}

function writeProjectField(
  project: PartialPipelineIR['project'],
  target: AllowedFieldTarget | string,
  value: unknown,
): void {
  switch (target) {
    case '/project/name':
      (project as { name: string }).name = value as string;
      return;
    case '/project/language':
      (project as { language: string | null }).language = value as string | null;
      return;
    case '/project/runtime/name':
      (project.runtime as { name: string | null }).name = value as string | null;
      return;
    case '/project/runtime/version':
      (project.runtime as { version: string | null }).version = value as string | null;
      return;
    case '/project/packageManager/name':
      (project.packageManager as { name: string | null }).name = value as string | null;
      return;
    case '/project/packageManager/version':
      (project.packageManager as { version: string | null }).version = value as string | null;
      return;
  }
}

const LOCKFILE_NAME_BY_PM: Record<'npm' | 'pnpm' | 'yarn', string> = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
};
