// Working-IR helpers — every mutation is non-destructive: it returns
// a NEW PipelineIR. The Loaded IR (the snapshot returned by
// /api/detect) is never touched; undo/redo snapshots rely on this.

import { findUnrunnableReason, type PipelineIR, type Stage } from '@modules/ir';

export function toggleStageEnabled(ir: PipelineIR, stageId: string): PipelineIR {
  return {
    ...ir,
    stages: ir.stages.map((s) =>
      s.id === stageId ? { ...s, enabled: !s.enabled } : s,
    ),
  };
}

/**
 * UX-02: the runnability gate is the backend's, not a local copy.
 * `findUnrunnableReason` is the same symbol the Dockerfile generator,
 * both CI exporters and the executor consult, so the UI can no longer
 * enable Generate/Run for an IR the API answers 422 on.
 */
export function hasUnresolvedRequiredField(ir: PipelineIR): string | null {
  const reason = findUnrunnableReason(ir);
  return reason !== null && reason.kind === 'unresolved-required-field'
    ? reason.field
    : null;
}

/** Replace the run command of one step. Whitespace-only commands are rejected upstream. */
export function updateStepRun(
  ir: PipelineIR,
  stageId: string,
  stepIndex: number,
  run: string,
): PipelineIR {
  return {
    ...ir,
    stages: ir.stages.map((s) =>
      s.id === stageId
        ? {
            ...s,
            steps: s.steps.map((step, i) => (i === stepIndex ? { ...step, run } : step)),
          }
        : s,
    ),
  };
}

/** Replace a stage's container image. */
export function updateStageImage(ir: PipelineIR, stageId: string, image: string): PipelineIR {
  return {
    ...ir,
    stages: ir.stages.map((s) =>
      s.id === stageId ? { ...s, container: { ...s.container, image } } : s,
    ),
  };
}

/** Set the on-push trigger branches (creates the trigger when absent). */
export function setTriggerBranches(ir: PipelineIR, branches: string[]): PipelineIR {
  const clean = branches.map((b) => b.trim()).filter((b) => b !== '');
  if (clean.length === 0) {
    const { triggers: _dropped, ...rest } = ir;
    return rest as PipelineIR;
  }
  return { ...ir, triggers: [{ kind: 'on-push', branches: clean }] };
}

/** First free id in the custom-stage namespace: custom, custom-2, custom-3… */
export function nextCustomStageId(ir: PipelineIR): string {
  const taken = new Set(ir.stages.map((s) => s.id));
  if (!taken.has('custom')) return 'custom';
  for (let n = 2; ; n++) {
    const id = `custom-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Insert a new stage into the linear chain immediately after
 * `afterStageId` (or at the head when null). Successor links are
 * re-pointed so the chain stays linear and valid.
 */
export function insertStageAfter(
  ir: PipelineIR,
  afterStageId: string | null,
  stage: Omit<Stage, 'dependsOn'>,
): PipelineIR {
  const newStage: Stage = {
    ...stage,
    dependsOn: afterStageId === null ? [] : [afterStageId],
  };
  const stages: Stage[] = [];

  if (afterStageId === null) {
    // New head: the previous head (dependsOn: []) now depends on the new stage.
    stages.push(newStage);
    for (const s of ir.stages) {
      stages.push(s.dependsOn.length === 0 ? { ...s, dependsOn: [newStage.id] } : s);
    }
    return { ...ir, stages };
  }

  for (const s of ir.stages) {
    stages.push(
      s.dependsOn.includes(afterStageId) ? { ...s, dependsOn: [newStage.id] } : s,
    );
    // Document order mirrors chain order: place the new stage right
    // after its predecessor.
    if (s.id === afterStageId) stages.push(newStage);
  }
  return { ...ir, stages };
}

/**
 * Remove a stage from the linear chain, re-linking its successor to
 * its predecessor (same splice semantics as disabling, but permanent).
 */
export function removeStage(ir: PipelineIR, stageId: string): PipelineIR {
  const target = ir.stages.find((s) => s.id === stageId);
  if (target === undefined) return ir;
  const predecessor = target.dependsOn[0];

  return {
    ...ir,
    stages: ir.stages
      .filter((s) => s.id !== stageId)
      .map((s) =>
        s.dependsOn.includes(stageId)
          ? { ...s, dependsOn: predecessor === undefined ? [] : [predecessor] }
          : s,
      ),
  };
}
