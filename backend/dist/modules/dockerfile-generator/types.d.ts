export interface DockerfileArtifacts {
    dockerfile: string;
    dockerignore: string;
}
export type SupportedRuntime = 'node';
export declare const SUPPORTED_RUNTIMES: readonly SupportedRuntime[];
export type BuildMode = 'multi-stage' | 'single-zero-steps' | 'single-disabled' | 'single-not-declared';
