// Value shapes for the required-nullable `/project/*` fields.
//
// These answer "what is a well-formed value for this IR field?" and are
// therefore an IR concern, not a detector or an editor one. Both sides use
// them: the Detector to decide whether a piece of evidence resolves a field
// (DR-004), and the Visual Editor to normalize what the user types into an
// unresolved prompt (EDITOR-UI-FR-018). One rule, one implementation.

import type { PackageManagerName, PipelineIR, UnresolvedEntry } from './types';
import { REQUIRED_NULLABLE_FIELDS } from './types';

export type RequiredNullableField = (typeof REQUIRED_NULLABLE_FIELDS)[number];

/** The package managers v1 supports, in the order the editor offers them. */
export const SUPPORTED_PACKAGE_MANAGERS: readonly PackageManagerName[] = [
  'npm',
  'pnpm',
  'yarn',
] as const;

/** The runtimes v1 supports. The Dockerfile generator refuses anything else. */
export const SUPPORTED_RUNTIMES: readonly string[] = ['node'] as const;

/** The languages the detector can emit (DR-002). */
export const SUPPORTED_LANGUAGES: readonly string[] = ['typescript', 'javascript'] as const;

/**
 * Major version from a free-text version pin, or null when the text names no
 * concrete version. Stricter than a bare digit-run search: the text must
 * *start* with an optional range operator or `v` followed by digits, so nvm
 * aliases (`lts/hydrogen`, `node`, `stable`) resolve to null rather than
 * becoming an unpullable `node:lts/hydrogen-alpine` image tag.
 *
 * `"20"` → `"20"`; `"v20.11.0"` → `"20"`; `">=18"` → `"18"`;
 * `"lts/hydrogen"` → `null`.
 */
export function majorFromVersionText(raw: string): string | null {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(?:[>=<~^]=?|v)?\s*(\d+)(?:[.\-+a-zA-Z0-9]*)?$/);
  return m === null ? null : m[1];
}

/**
 * Normalize what a user typed for one required-nullable field into the value
 * the IR should carry, or null when the input is not a valid value for it.
 */
export function normalizeProjectFieldValue(
  field: RequiredNullableField,
  raw: string,
): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  switch (field) {
    case '/project/runtime/version':
    case '/project/packageManager/version':
      return majorFromVersionText(trimmed);
    case '/project/packageManager/name':
      return (SUPPORTED_PACKAGE_MANAGERS as readonly string[]).includes(trimmed)
        ? trimmed
        : null;
    case '/project/runtime/name':
      return (SUPPORTED_RUNTIMES as readonly string[]).includes(trimmed) ? trimmed : null;
    case '/project/language':
      return trimmed.toLowerCase();
    default:
      return null;
  }
}

function isRequiredNullableField(field: string): field is RequiredNullableField {
  return (REQUIRED_NULLABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * Commit a value to one required-nullable `/project/*` field and drop the
 * paired `unresolved` entry in the same operation, so the IR never passes
 * through a state that violates the null ⟺ unresolved invariant (IR-AC-016 /
 * IR-AC-018). Returns a NEW IR; the input is never mutated.
 *
 * Returns the IR unchanged when `field` is not a required-nullable field or
 * when `value` does not normalize to a valid value for it — callers surface
 * the rejection in the UI rather than writing a bad value.
 */
export function resolveProjectField(
  ir: PipelineIR,
  field: string,
  rawValue: string,
): PipelineIR {
  if (!isRequiredNullableField(field)) return ir;
  const value = normalizeProjectFieldValue(field, rawValue);
  if (value === null) return ir;

  const project = structuredCloneProject(ir.project);
  switch (field) {
    case '/project/language':
      project.language = value;
      break;
    case '/project/runtime/name':
      project.runtime.name = value;
      break;
    case '/project/runtime/version':
      project.runtime.version = value;
      break;
    case '/project/packageManager/name':
      project.packageManager.name = value as PackageManagerName;
      break;
    case '/project/packageManager/version':
      project.packageManager.version = value;
      break;
  }

  const remaining: UnresolvedEntry[] = (ir.unresolved ?? []).filter(
    (u) => u.field !== field,
  );
  const next: PipelineIR = { ...ir, project };
  if (remaining.length === 0) delete next.unresolved;
  else next.unresolved = remaining;
  return next;
}

function structuredCloneProject(project: PipelineIR['project']): PipelineIR['project'] {
  return {
    ...project,
    runtime: { ...project.runtime },
    packageManager: { ...project.packageManager },
  };
}
