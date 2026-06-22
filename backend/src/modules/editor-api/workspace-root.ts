// Workspace-root configuration for the Editor API.
//
// Implements EDITOR-API-FR-003 and the Security model's startup rules
// from docs/specs/visual-editor.spec.md (Accepted 2026-06-21) and
// ADR-0008. The backend MUST refuse to listen when
// PIPE_EDITOR_WORKSPACE_ROOT is unset, empty, not absolute, or does
// not point at an existing directory. `realpath` is cached at startup
// so per-request containment checks compare against a stable value.

import { existsSync, realpathSync, statSync } from 'fs';
import { isAbsolute } from 'path';

export const PIPE_EDITOR_WORKSPACE_ROOT_ENV = 'PIPE_EDITOR_WORKSPACE_ROOT';

export const WORKSPACE_ROOT_TOKEN = 'EDITOR_WORKSPACE_ROOT';

export interface WorkspaceRoot {
  /** The raw value the user supplied via the env var. */
  raw: string;
  /** The realpath of the workspace root, cached at startup. */
  realpath: string;
}

export class WorkspaceRootConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceRootConfigError';
  }
}

export function resolveWorkspaceRoot(envValue: string | undefined): WorkspaceRoot {
  if (envValue === undefined || envValue === '') {
    throw new WorkspaceRootConfigError(
      `${PIPE_EDITOR_WORKSPACE_ROOT_ENV} must be set to an absolute path to an existing directory before the backend can start. See docs/adr/0008-workspace-root-containment-for-detect-endpoint.md.`,
    );
  }
  if (!isAbsolute(envValue)) {
    throw new WorkspaceRootConfigError(
      `${PIPE_EDITOR_WORKSPACE_ROOT_ENV} must be an absolute path; got ${JSON.stringify(envValue)}.`,
    );
  }
  if (!existsSync(envValue)) {
    throw new WorkspaceRootConfigError(
      `${PIPE_EDITOR_WORKSPACE_ROOT_ENV} must point at an existing directory; ${JSON.stringify(envValue)} does not exist.`,
    );
  }
  if (!statSync(envValue).isDirectory()) {
    throw new WorkspaceRootConfigError(
      `${PIPE_EDITOR_WORKSPACE_ROOT_ENV} must point at a directory; ${JSON.stringify(envValue)} is not a directory.`,
    );
  }
  return { raw: envValue, realpath: realpathSync(envValue) };
}
