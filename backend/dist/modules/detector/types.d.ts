import { PackageManagerName, PipelineIR, Stage } from '../ir';
export type ManifestPath = 'package.json' | 'pnpm-lock.yaml' | 'package-lock.json' | 'yarn.lock' | 'nest-cli.json' | 'tsconfig.json';
export declare const ENUMERATED_MANIFEST_SET: readonly ManifestPath[];
export interface PackageJson {
    name?: string;
    version?: string;
    type?: string;
    packageManager?: string;
    engines?: {
        node?: string;
        [k: string]: string | undefined;
    };
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    workspaces?: string[] | {
        packages?: string[];
    };
}
export interface TsConfigJson {
    compilerOptions?: {
        target?: string;
        module?: string;
    };
    include?: string[];
    exclude?: string[];
}
export interface ParsedManifests {
    'package.json'?: PackageJson;
    'pnpm-lock.yaml'?: {
        lockfileVersion?: number | string;
    };
    'package-lock.json'?: {
        lockfileVersion?: number;
    };
    'yarn.lock'?: {
        __present: true;
    };
    'nest-cli.json'?: Record<string, unknown>;
    'tsconfig.json'?: TsConfigJson;
}
export type Manifests = Partial<ParsedManifests>;
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
    kind: 'field' | 'stage';
    cases: Case[];
}
export type Outcome = {
    kind: 'committed';
    value: unknown;
} | {
    kind: 'committed-stage';
    stage: Stage;
} | {
    kind: 'unresolved';
    field: string;
    message: string;
} | {
    kind: 'nothing';
};
export declare const REQUIRED_NULLABLE_FIELDS: readonly ["/project/language", "/project/runtime/name", "/project/runtime/version", "/project/packageManager/name", "/project/packageManager/version"];
export declare const CANONICAL_STAGE_IDS: readonly ["install", "lint", "test", "build", "docker-build"];
export type CanonicalStageId = (typeof CANONICAL_STAGE_IDS)[number];
export declare const ALLOWED_FIELD_TARGETS: readonly ["/project/name", "/project/language", "/project/runtime/name", "/project/runtime/version", "/project/packageManager/name", "/project/packageManager/version"];
export type AllowedFieldTarget = (typeof ALLOWED_FIELD_TARGETS)[number];
export type SupportedPackageManager = Exclude<PackageManagerName, null>;
