// Path containment for POST /api/detect (EDITOR-API-FR-004/005).
//
// The check operates on realpath(path.resolve(wsRoot, projectPath)) —
// i.e. AFTER symlink resolution along the entirety of the path — and
// against the cached realpath of the workspace root. A path that
// resolves to the workspace root ITSELF (realCandidate === wsRoot) is
// explicitly allowed; a path whose realpath sits strictly outside the
// workspace root is rejected.
//
// References: docs/specs/visual-editor.spec.md "Security model" and
// docs/adr/0008-workspace-root-containment-for-detect-endpoint.md.

import { realpathSync } from 'fs';
import { isAbsolute, resolve, sep } from 'path';

export type PathCheckResult =
  | { kind: 'ok'; realCandidate: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'not-found' }
  | { kind: 'outside' };

export function checkProjectPath(
  projectPath: unknown,
  wsRootRealpath: string,
): PathCheckResult {
  if (typeof projectPath !== 'string') {
    return { kind: 'invalid', reason: 'projectPath must be a string.' };
  }
  if (projectPath === '') {
    return { kind: 'invalid', reason: 'projectPath must not be empty.' };
  }
  if (projectPath.includes('\0')) {
    return { kind: 'invalid', reason: 'projectPath must not contain a NUL byte.' };
  }
  if (isAbsolute(projectPath)) {
    return {
      kind: 'invalid',
      reason:
        'projectPath must be a path relative to PIPE_EDITOR_WORKSPACE_ROOT; absolute paths are rejected.',
    };
  }

  const candidate = resolve(wsRootRealpath, projectPath);

  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidate);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'not-found' };
    }
    throw err;
  }

  if (realCandidate === wsRootRealpath) {
    return { kind: 'ok', realCandidate };
  }
  if (realCandidate.startsWith(wsRootRealpath + sep)) {
    return { kind: 'ok', realCandidate };
  }
  return { kind: 'outside' };
}
