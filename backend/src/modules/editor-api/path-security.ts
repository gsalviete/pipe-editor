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
import { isAbsolute, relative, resolve, sep } from 'path';

export type PathCheckResult =
  | { kind: 'ok'; realCandidate: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'not-found' }
  | { kind: 'outside' };

export function checkProjectPath(
  projectPath: unknown,
  wsRootRealpath: string,
  wsDisplayRoot = wsRootRealpath,
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
  // Absolute paths are accepted for a friendlier local-app experience, but
  // they pass through the exact same realpath containment boundary. This lets
  // users paste a Finder/terminal path without granting access outside the
  // configured workspace root.
  let candidate: string;
  if (isAbsolute(projectPath)) {
    const displayRelative = relative(wsDisplayRoot, projectPath);
    const belongsToDisplayRoot =
      displayRelative === '' ||
      (!displayRelative.startsWith(`..${sep}`) &&
        displayRelative !== '..' &&
        !isAbsolute(displayRelative));
    candidate = belongsToDisplayRoot
      ? resolve(wsRootRealpath, displayRelative)
      : projectPath;
  } else {
    candidate = resolve(wsRootRealpath, projectPath);
  }

  // Reject lexical escapes before touching the filesystem. A path that starts
  // outside the configured boundary should not change from 403 to 404 merely
  // because that outside target does not exist.
  if (
    candidate !== wsRootRealpath &&
    !candidate.startsWith(wsRootRealpath + sep)
  ) {
    return { kind: 'outside' };
  }

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

/**
 * The stable key a project's local state is stored under.
 *
 * ARCH-05 / STATE-FR-005 — the workspace-relative realpath. `demo-api`,
 * `./demo-api`, `demo-api/` and the contained absolute path all resolve to
 * the same `realCandidate`, so they all produce the same key; keyed by the
 * raw client string they were four separate saves for one project.
 *
 * The workspace root itself is `"."`, matching what `scanProjects` reports
 * for it, so the picker's "edited" badges key off the same value the picker
 * displays. Separators are normalized to `/` so a key written on Windows
 * reads the same everywhere.
 */
export function stateKeyFor(wsRootRealpath: string, realCandidate: string): string {
  const rel = relative(wsRootRealpath, realCandidate);
  return rel === '' ? '.' : rel.split(sep).join('/');
}
