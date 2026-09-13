// Workspace temp-copy materialization (EXEC-FR-007). The host
// projectPath is copied into a fresh temp directory with the
// normative exclusion list applied at copy time ONLY. Once the copy
// is created, the resulting path is mutable across the run.

import { cpSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { WORKSPACE_COPY_EXCLUSIONS } from './types';

export interface WorkspaceCopy {
  /** The temp directory the host project was copied into. Mounted into containers as /workspace. */
  hostPath: string;
  /** Removes the temp directory unless EXEC_KEEP_WORKSPACE is set. */
  cleanup: () => void;
}

export function materializeWorkspace(projectPath: string): WorkspaceCopy {
  const tmp = mkdtempSync(join(tmpdir(), 'pipe-editor-exec-'));
  const dest = join(tmp, 'workspace');

  cpSync(projectPath, dest, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      // EXEC-FR-007: exclusions apply to TOP-LEVEL entries of projectPath
      // only. A nested `src/dist` or a monorepo package's own
      // `node_modules` is NOT excluded here — only direct children whose
      // relative path is exactly one of the exclusion names.
      const rel = relative(projectPath, src);
      return !(WORKSPACE_COPY_EXCLUSIONS as readonly string[]).includes(rel);
    },
  });

  return {
    hostPath: dest,
    cleanup: () => {
      if (process.env.EXEC_KEEP_WORKSPACE) return;
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
