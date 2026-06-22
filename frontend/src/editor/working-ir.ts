// Working-IR helpers — toggle Stage.enabled non-destructively
// (EDITOR-UI-FR-004 / EDITOR-UI-FR-012). Every toggle produces a NEW
// PipelineIR object; the Loaded IR (the snapshot returned by
// /api/detect) is never mutated.

import type { PipelineIR } from '@modules/ir';

export function toggleStageEnabled(ir: PipelineIR, stageId: string): PipelineIR {
  return {
    ...ir,
    stages: ir.stages.map((s) =>
      s.id === stageId ? { ...s, enabled: !s.enabled } : s,
    ),
  };
}

export function hasUnresolvedRequiredField(ir: PipelineIR): string | null {
  if (ir.project?.packageManager?.name == null) return '/project/packageManager/name';
  if (ir.project?.runtime?.version == null) return '/project/runtime/version';
  return null;
}
