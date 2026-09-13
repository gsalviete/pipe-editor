// Single-source precheck for "is this IR runnable?". Consumed by
// the Dockerfile Generator (generate() throws via this helper), the
// Editor's /api/generate controller (422 UNRESOLVED_REQUIRED_FIELD),
// and the Executor (aggregateStatus: 'unrunnable'). Introduced by
// the Pipeline Executor spec's Decision D (2026-06-22) to retire the
// per-caller `== null` precheck that had drifted between callers.
//
// The function is pure. The "empty-effective-chain" reason is
// reserved for the Executor; other callers MAY treat that as
// runnable (the Dockerfile Generator emits the "disabled" or
// "not declared" single-stage variant for an empty effective chain).

import type { PipelineIR } from './types';

export type UnrunnableReason =
  | { kind: 'unresolved-required-field'; field: string }
  | { kind: 'empty-effective-chain'; explanation: string };

const REQUIRED_NULLABLE_PROBES: { field: string; read: (ir: PipelineIR) => unknown }[] = [
  { field: '/project/packageManager/name', read: (ir) => ir.project?.packageManager?.name },
  { field: '/project/packageManager/version', read: (ir) => ir.project?.packageManager?.version },
  { field: '/project/runtime/name', read: (ir) => ir.project?.runtime?.name },
  { field: '/project/runtime/version', read: (ir) => ir.project?.runtime?.version },
  { field: '/project/language', read: (ir) => ir.project?.language },
];

export function findUnrunnableReason(ir: PipelineIR): UnrunnableReason | null {
  for (const probe of REQUIRED_NULLABLE_PROBES) {
    if (probe.read(ir) === null) {
      return { kind: 'unresolved-required-field', field: probe.field };
    }
  }
  return null;
}

export class UnresolvedRequiredFieldError extends Error {
  readonly path: string;
  constructor(field: string) {
    super(
      `Pipeline IR is not runnable: required field ${field} is unresolved. Resolve the corresponding unresolved entry before invoking this operation.`,
    );
    this.name = 'UnresolvedRequiredFieldError';
    this.path = field;
  }
}
