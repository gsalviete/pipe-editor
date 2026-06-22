// Pipeline IR document types.
//
// These types mirror the schema in docs/specs/pipeline-ir.spec.md v0.1.0.
// If the schema changes, this file changes; the validator is what enforces
// the invariants the types alone cannot express (linear-chain, null⟺unresolved,
// forbidden fields).

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn';

export interface Project {
  name: string;
  rootPath: string;
  language: string | null;
  runtime: {
    name: string | null;
    version: string | null;
  };
  packageManager: {
    name: PackageManagerName | null;
    version: string | null;
  };
}

export type TriggerKind = 'on-push';

export interface Trigger {
  kind: TriggerKind;
  branches: string[];
}

export interface Step {
  id: string;
  run: string;
  workingDir: string;
  env: Record<string, string>;
}

export interface Container {
  // Non-nullable in v1; see "container.image and reachability" in the spec.
  image: string;
}

export interface Stage {
  id: string;
  name: string;
  enabled: boolean;
  dependsOn: string[];
  container: Container;
  steps: Step[];
}

export interface UnresolvedEntry {
  field: string;
  reason: 'needs-user-input';
  message: string;
}

export interface Metadata {
  generatedAt: string;
  detectorVersion: string;
}

export interface PipelineIR {
  version: string;
  project: Project;
  triggers?: Trigger[];
  stages: Stage[];
  unresolved?: UnresolvedEntry[];
  metadata: Metadata;
}

// The set of field paths that are required-and-nullable in the v0.1.0 schema
// (the "Required-field uncertainty resolution" subsection lists them).
// container.image is intentionally NOT in this list — it is non-nullable
// in v1; see "container.image and reachability".
export const REQUIRED_NULLABLE_FIELDS = [
  '/project/language',
  '/project/runtime/name',
  '/project/runtime/version',
  '/project/packageManager/name',
  '/project/packageManager/version',
] as const;

// CI-provider-specific keys that MUST NOT appear anywhere in an IR document
// (IR-NFR-001). The list is non-exhaustive but normative.
//
// Note: `dependsOn` is NOT in this list — it is the IR's own generic edge
// vocabulary. `needs` IS in the list because it is GitHub Actions's word for
// the same concept and would be a provider-neutrality violation.
export const FORBIDDEN_KEYS = [
  'jobs',
  'uses',
  'needs',
  'runs-on',
  'with',
  'permissions',
  'include',
  'workflow_dispatch',
];
