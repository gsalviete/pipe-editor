import { basename, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import { ALL_RULES, Detector } from '../detector';
import { scanProjects } from '../editor-api/project-scan';
import { isComposeFilename, MAX_TRACKED_COMPOSE_FILES } from './compose-files';
import { dockerTagSlug } from '../docker-naming';
import type {
  ServiceKind,
  ServiceStack,
  WorkspacePlan,
  WorkspaceService,
} from './types';

const MAX_WORKSPACE_SERVICES = 50;

interface PackageManifest {
  name?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

export function inspectWorkspace(
  workspaceRealpath: string,
  displayPath: string,
): WorkspacePlan {
  const detector = new Detector({ rules: ALL_RULES });
  const discovered = scanProjects(workspaceRealpath)
    .filter((candidate) => !isFixturePath(candidate.path))
    .slice(0, MAX_WORKSPACE_SERVICES);
  const warnings: WorkspacePlan['warnings'] = [];
  const services: WorkspaceService[] = [];
  const usedIds = new Set<string>();
  const usedHostPorts = new Set<number>();

  for (const candidate of discovered) {
    const absolutePath =
      candidate.path === '.' ? workspaceRealpath : join(workspaceRealpath, candidate.path);
    let manifest: PackageManifest;
    try {
      manifest = JSON.parse(readFileSync(join(absolutePath, 'package.json'), 'utf-8')) as PackageManifest;
    } catch (error) {
      warnings.push({
        path: candidate.path,
        message: `Skipped unreadable package.json: ${(error as Error).message}`,
      });
      continue;
    }

    try {
      const detected = detector.detect(absolutePath);
      const stack = classifyStack(manifest);
      const rootLooksLikeOrchestrator =
        candidate.path === '.' &&
        discovered.some((project) => project.path !== '.') &&
        !hasRunnableStart(manifest);
      if (rootLooksLikeOrchestrator) continue;
      const ports = allocatePorts(stack, usedHostPorts);
      const id = uniqueServiceId(slug(candidate.name), usedIds);
      services.push({
        id,
        name: candidate.name,
        path: normalizeRelativePath(candidate.path),
        enabled: true,
        stack,
        kind: kindFor(stack),
        containerPort: ports.container,
        hostPort: ports.host,
        startCommand: startCommandFor(stack, manifest, detected.ir.project.packageManager.name),
        ir: detected.ir,
      });
      for (const warning of detected.warnings) {
        warnings.push({
          path: candidate.path,
          message: `${warning.manifest}: ${warning.message}`,
        });
      }
    } catch (error) {
      warnings.push({
        path: candidate.path,
        message: `Could not create a service pipeline: ${(error as Error).message}`,
      });
    }
  }

  return {
    version: '0.1.0',
    name: workspaceName(workspaceRealpath),
    workspacePath: normalizeRelativePath(displayPath),
    services,
    existingComposeFiles: collectExistingComposeFiles(
      workspaceRealpath,
      services,
      warnings,
    ),
    warnings,
  };
}

function collectExistingComposeFiles(
  workspaceRoot: string,
  services: WorkspaceService[],
  warnings: WorkspacePlan['warnings'],
): string[] {
  const directories = new Map<string, string>([['.', workspaceRoot]]);
  for (const service of services) {
    directories.set(
      service.path,
      service.path === '.' ? workspaceRoot : join(workspaceRoot, service.path),
    );
  }

  const found = new Set<string>();
  for (const [relativePath, absolutePath] of directories) {
    try {
      const entries = readdirSync(absolutePath, { withFileTypes: true })
        .filter(
          (entry) =>
            (entry.isFile() || entry.isSymbolicLink()) && isComposeFilename(entry.name),
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        found.add(relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`);
        if (found.size >= MAX_TRACKED_COMPOSE_FILES) return [...found].sort();
      }
    } catch (error) {
      warnings.push({
        path: relativePath,
        message: `Could not inspect existing Compose files: ${(error as Error).message}`,
      });
    }
  }
  return [...found].sort();
}

function classifyStack(manifest: PackageManifest): ServiceStack {
  const packages = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  const scripts = Object.values(manifest.scripts ?? {}).filter(
    (value): value is string => typeof value === 'string',
  );
  if ('vite' in packages || scripts.some((script) => /(^|\s)vite(?:\s|$)/.test(script))) {
    return 'vite';
  }
  if ('@nestjs/core' in packages || scripts.some((script) => /(^|\s)nest(?:\s|$)/.test(script))) {
    return 'nestjs';
  }
  return 'node-generic';
}

function kindFor(stack: ServiceStack): ServiceKind {
  if (stack === 'vite') return 'frontend';
  if (stack === 'nestjs') return 'backend';
  return 'service';
}

function allocatePorts(
  stack: ServiceStack,
  usedHostPorts: Set<number>,
): { container: number; host: number } {
  const container = stack === 'vite' ? 80 : 3000;
  let host = stack === 'vite' ? 8080 : 3000;
  while (usedHostPorts.has(host)) host += 1;
  usedHostPorts.add(host);
  return { container, host };
}

function hasRunnableStart(manifest: PackageManifest): boolean {
  const scripts = manifest.scripts ?? {};
  return ['start', 'serve', 'preview'].some(
    (name) => typeof scripts[name] === 'string' && scripts[name] !== '',
  );
}

function startCommandFor(
  stack: ServiceStack,
  manifest: PackageManifest,
  packageManager: 'npm' | 'pnpm' | 'yarn' | null,
): string {
  if (stack === 'vite') return 'nginx -g "daemon off;"';
  if (stack === 'nestjs') return 'node dist/main.js';
  if (typeof manifest.scripts?.start === 'string' && packageManager !== null) {
    return packageManager === 'npm' ? 'npm start' : `${packageManager} start`;
  }
  return 'node index.js';
}

function workspaceName(root: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as PackageManifest;
    if (typeof manifest.name === 'string' && manifest.name.trim() !== '') return manifest.name;
  } catch {
    /* a workspace folder does not need its own manifest */
  }
  return basename(root);
}

// One shared rule (GEN-01); this wrapper only pins the fallback.
function slug(value: string): string {
  return dockerTagSlug(value, 'service');
}

function uniqueServiceId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeRelativePath(path: string): string {
  if (path === '' || path === '.') return '.';
  return path.split('\\').join('/');
}

function isFixturePath(path: string): boolean {
  return path
    .split(/[\\/]/)
    .some((segment, index, segments) =>
      segment === '__fixtures__' ||
      segment === '__mocks__' ||
      ((segment === 'test' || segment === 'tests') && segments[index + 1] === 'fixtures'),
    );
}
