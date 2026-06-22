// Detector Engine — public types.
//
// Strict mirror of the Rule contract from docs/specs/detector-engine.spec.md
// (including the 2026-06-15 amendment that widens Case to take RuleCtx).

import { PackageManagerName, PipelineIR, Stage } from '../ir';

export type ManifestPath =
  | 'package.json'
  | 'pnpm-lock.yaml'
  | 'package-lock.json'
  | 'yarn.lock'
  | 'nest-cli.json'
  | 'tsconfig.json';

export const ENUMERATED_MANIFEST_SET: readonly ManifestPath[] = [
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'nest-cli.json',
  'tsconfig.json',
] as const;

export interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  packageManager?: string;
  engines?: { node?: string; [k: string]: string | undefined };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export interface TsConfigJson {
  compilerOptions?: { target?: string; module?: string };
  include?: string[];
  exclude?: string[];
}

export interface ParsedManifests {
  'package.json'?: PackageJson;
  'pnpm-lock.yaml'?: { lockfileVersion?: number | string };
  'package-lock.json'?: { lockfileVersion?: number };
  'yarn.lock'?: { __present: true };
  'nest-cli.json'?: Record<string, unknown>;
  'tsconfig.json'?: TsConfigJson;
}

// What rules see: only the manifests the rule declared in `reads`.
export type Manifests = Partial<ParsedManifests>;

// The partial IR observed by stage rules — `project` is committed by the
// project-fields pass, `stages` and `unresolved` are intentionally absent.
export interface PartialPipelineIR {
  readonly version: string;
  readonly project: PipelineIR['project'];
}

export interface RuleCtx {
  readonly manifests: Manifests;
  readonly ir: Readonly<PartialPipelineIR>;
  readonly rootPath: string;
}

export interface FieldEmission {
  kind: 'field';
  target: string;
  value: unknown;
}

export interface StageEmission {
  kind: 'stage';
  stage: Stage;
}

export type Emission = FieldEmission | StageEmission;

export interface Case {
  condition: (ctx: RuleCtx) => boolean;
  emit: (ctx: RuleCtx) => Emission;
  confidence: 'high' | 'medium' | 'low';
  onUncertainty: 'omit' | 'assume-default' | 'needs-user-input';
  default?: unknown;
  message?: string;
}

export interface Rule {
  id: string;
  reads: ManifestPath[];
  // 'field' rules emit at /project/*; 'stage' rules emit at /stages/+.
  // The engine evaluates field rules in step 3, stage rules in step 4
  // (per the pass-ordering guarantee).
  kind: 'field' | 'stage';
  cases: Case[];
}

// emitOutcome's result, per IR-FR-009.
export type Outcome =
  | { kind: 'committed'; value: unknown }
  | { kind: 'committed-stage'; stage: Stage }
  | { kind: 'unresolved'; field: string; message: string }
  | { kind: 'nothing' };

export const REQUIRED_NULLABLE_FIELDS = [
  '/project/language',
  '/project/runtime/name',
  '/project/runtime/version',
  '/project/packageManager/name',
  '/project/packageManager/version',
] as const;

// Canonical Stage IDs (closed set per Engine Decision 5).
export const CANONICAL_STAGE_IDS = [
  'install',
  'lint',
  'test',
  'build',
  'docker-build',
] as const;

export type CanonicalStageId = (typeof CANONICAL_STAGE_IDS)[number];

// Allowed JSON-Pointer targets for FieldEmissions.
export const ALLOWED_FIELD_TARGETS = [
  '/project/name',
  '/project/language',
  '/project/runtime/name',
  '/project/runtime/version',
  '/project/packageManager/name',
  '/project/packageManager/version',
] as const;

export type AllowedFieldTarget = (typeof ALLOWED_FIELD_TARGETS)[number];

export type SupportedPackageManager = Exclude<PackageManagerName, null>;
