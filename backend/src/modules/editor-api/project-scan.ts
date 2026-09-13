// Workspace project discovery — powers GET /api/projects so the UI
// can offer a picker instead of making the user type paths by hand.
//
// A "project" is any directory under the workspace root (bounded
// depth) containing a package.json. Monorepo children are listed as
// their own entries. The scan is defensive: unreadable directories
// and malformed manifests never abort discovery.

import { existsSync, lstatSync, readdirSync } from 'fs';
import { readManifestBounded } from './bounded-read';
import { basename, dirname, join, relative } from 'path';

export interface DiscoveredProject {
  /** Path relative to the workspace root; '.' when the root itself is a project. */
  path: string;
  name: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  scripts: string[];
  hasDockerfile: boolean;
  isMonorepoRoot: boolean;
  /** Existing CI configs inside the project (relative paths) — importable. */
  ciConfigs: string[];
}

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  isProject: boolean;
}

export interface WorkspaceDirectoryListing {
  workspaceRoot: string;
  currentPath: string;
  absolutePath: string;
  parentPath: string | null;
  isProject: boolean;
  directories: WorkspaceDirectoryEntry[];
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.pnpm-store',
  '.next',
  '.turbo',
  '.vite',
]);

const MAX_DEPTH = 3;
const MAX_PROJECTS = 200;
const MAX_DIRS_VISITED = 5000;
const MAX_SCRIPTS = 8;
const MAX_DIRECTORY_MATCHES = 20;

export function scanProjects(rootRealpath: string): DiscoveredProject[] {
  const projects: DiscoveredProject[] = [];
  // BFS so shallower (more likely intended) projects surface first.
  const queue: { dir: string; depth: number }[] = [{ dir: rootRealpath, depth: 0 }];
  let visited = 0;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    if (visited >= MAX_DIRS_VISITED || projects.length >= MAX_PROJECTS) break;
    visited += 1;

    const project = probeProject(rootRealpath, dir);
    if (project !== null) projects.push(project);

    if (depth >= MAX_DEPTH) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const child = join(dir, entry);
      try {
        // Discovery is informational and must never become a second, looser
        // filesystem boundary. Do not follow directory symlinks: they can
        // escape the workspace or create cycles even though /api/detect would
        // correctly reject the resulting path later.
        const stat = lstatSync(child);
        if (!stat.isSymbolicLink() && stat.isDirectory()) {
          queue.push({ dir: child, depth: depth + 1 });
        }
      } catch {
        /* dangling symlink or permission — skip */
      }
    }
  }

  return projects;
}

export function listWorkspaceDirectory(
  rootRealpath: string,
  directoryRealpath: string,
  displayRoot = rootRealpath,
): WorkspaceDirectoryListing {
  const currentPath = portableRelative(rootRealpath, directoryRealpath);
  const directories: WorkspaceDirectoryEntry[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(directoryRealpath).sort((left, right) =>
      left.localeCompare(right),
    );
  } catch {
    entries = [];
  }

  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const absolutePath = join(directoryRealpath, name);
    try {
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
      directories.push({
        name,
        path: portableRelative(rootRealpath, absolutePath),
        isProject: existsSync(join(absolutePath, 'package.json')),
      });
    } catch {
      /* unreadable directory — skip */
    }
  }

  return {
    workspaceRoot: displayRoot,
    currentPath,
    absolutePath:
      currentPath === '.' ? displayRoot : join(displayRoot, currentPath),
    parentPath:
      directoryRealpath === rootRealpath
        ? null
        : portableRelative(rootRealpath, dirname(directoryRealpath)),
    isProject: existsSync(join(directoryRealpath, 'package.json')),
    directories,
  };
}

/**
 * Resolve the basename exposed by a browser folder-drop back to paths inside
 * the configured workspace. Browsers intentionally hide the original host
 * path, so the caller may use a unique match and must surface ambiguity.
 */
export function findWorkspaceDirectoriesByName(
  rootRealpath: string,
  requestedName: string,
): string[] {
  const matches: string[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: rootRealpath, depth: 0 }];
  let visited = 0;

  while (
    queue.length > 0 &&
    visited < MAX_DIRS_VISITED &&
    matches.length < MAX_DIRECTORY_MATCHES
  ) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    visited += 1;
    if (dir !== rootRealpath && basename(dir) === requestedName) {
      matches.push(portableRelative(rootRealpath, dir));
    }
    if (depth >= 6) continue;

    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const child = join(dir, entry);
      try {
        const stat = lstatSync(child);
        if (!stat.isSymbolicLink() && stat.isDirectory()) {
          queue.push({ dir: child, depth: depth + 1 });
        }
      } catch {
        /* unreadable directory — skip */
      }
    }
  }

  return matches.sort();
}

function portableRelative(root: string, target: string): string {
  const path = relative(root, target);
  return path === '' ? '.' : path.split('\\').join('/');
}

function probeProject(root: string, dir: string): DiscoveredProject | null {
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) return null;

  let manifest: {
    name?: unknown;
    scripts?: Record<string, unknown>;
    packageManager?: unknown;
    workspaces?: unknown;
  } = {};
  try {
    // SEC-06 — bounded; the surrounding catch treats an oversized
    // manifest exactly like a malformed one.
    manifest = JSON.parse(readManifestBounded(manifestPath)) as typeof manifest;
  } catch {
    // Malformed manifest — still list it; detect() will report the error
    // with a proper diagnostic when the user picks it.
  }

  const rel = relative(root, dir);
  return {
    path: rel === '' ? '.' : rel,
    name:
      typeof manifest.name === 'string' && manifest.name.length > 0
        ? manifest.name
        : basename(dir),
    packageManager: detectPackageManager(dir, manifest.packageManager),
    scripts: Object.keys(manifest.scripts ?? {}).slice(0, MAX_SCRIPTS),
    hasDockerfile: existsSync(join(dir, 'Dockerfile')),
    isMonorepoRoot: manifest.workspaces !== undefined,
    ciConfigs: findCiConfigs(dir),
  };
}

function findCiConfigs(dir: string): string[] {
  const found: string[] = [];
  if (existsSync(join(dir, '.gitlab-ci.yml'))) found.push('.gitlab-ci.yml');
  const workflows = join(dir, '.github', 'workflows');
  if (existsSync(workflows)) {
    try {
      for (const f of readdirSync(workflows).sort()) {
        if (/\.ya?ml$/.test(f)) found.push(`.github/workflows/${f}`);
        if (found.length >= 6) break;
      }
    } catch {
      /* unreadable — ignore */
    }
  }
  return found;
}

function detectPackageManager(
  dir: string,
  packageManagerField: unknown,
): 'npm' | 'pnpm' | 'yarn' | null {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  if (typeof packageManagerField === 'string') {
    const name = packageManagerField.split('@')[0];
    if (name === 'npm' || name === 'pnpm' || name === 'yarn') return name;
  }
  return null;
}
