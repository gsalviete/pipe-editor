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
export declare const REQUIRED_NULLABLE_FIELDS: readonly ["/project/language", "/project/runtime/name", "/project/runtime/version", "/project/packageManager/name", "/project/packageManager/version"];
export declare const FORBIDDEN_KEYS: string[];
