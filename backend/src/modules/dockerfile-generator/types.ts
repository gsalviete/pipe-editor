// Public types for the Dockerfile Generator.

export interface DockerfileArtifacts {
  dockerfile: string;
  dockerignore: string;
}

export type SupportedRuntime = 'node';

export const SUPPORTED_RUNTIMES: readonly SupportedRuntime[] = ['node'] as const;

// The four ways `generate` decides which template to emit (DOCKER-FR-003 /
// DOCKER-FR-004 + the three single-stage variants of Design Decision 5).
export type BuildMode =
  | 'multi-stage'           // build in effective chain AND has ≥ 1 Step
  | 'single-zero-steps'     // build in effective chain, steps.length === 0
  | 'single-disabled'       // build in IR but enabled === false
  | 'single-not-declared';  // build not present in IR at all
