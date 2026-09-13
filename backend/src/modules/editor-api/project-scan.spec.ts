// Tests for workspace project discovery (GET /api/projects backing).

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  findWorkspaceDirectoriesByName,
  listWorkspaceDirectory,
  scanProjects,
} from './project-scan';

describe('scanProjects', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pipe-editor-scan-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function project(rel: string, manifest: Record<string, unknown>, extraFiles: string[] = []) {
    const dir = join(root, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
    for (const f of extraFiles) writeFileSync(join(dir, f), '');
  }

  it('finds projects at multiple depths, breadth-first, with metadata', () => {
    project('app-a', { name: 'app-a', scripts: { test: 'jest', build: 'tsc' } }, ['pnpm-lock.yaml', 'Dockerfile']);
    project('group/app-b', { name: 'app-b' }, ['yarn.lock']);
    project('group/app-c', { scripts: { lint: 'eslint' } }, ['package-lock.json']);

    const found = scanProjects(root);
    const byPath = new Map(found.map((p) => [p.path, p]));

    expect(byPath.get('app-a')).toMatchObject({
      name: 'app-a',
      packageManager: 'pnpm',
      hasDockerfile: true,
      scripts: expect.arrayContaining(['test', 'build']),
    });
    expect(byPath.get(join('group', 'app-b'))).toMatchObject({
      name: 'app-b',
      packageManager: 'yarn',
      hasDockerfile: false,
    });
    // No name in manifest → falls back to directory basename.
    expect(byPath.get(join('group', 'app-c'))).toMatchObject({
      name: 'app-c',
      packageManager: 'npm',
    });
    // Shallower project listed before deeper ones (BFS).
    expect(found.findIndex((p) => p.path === 'app-a')).toBeLessThan(
      found.findIndex((p) => p.path === join('group', 'app-b')),
    );
  });

  it('lists the workspace root itself as "." when it is a project', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root-proj' }));
    const found = scanProjects(root);
    expect(found[0]).toMatchObject({ path: '.', name: 'root-proj' });
  });

  it('T-STATE-009 (STATE-AC-009) — monorepo roots marked; never descends into node_modules or dot-dirs', () => {
    project('.', { name: 'mono', workspaces: ['packages/*'] });
    project('packages/lib', { name: 'lib' });
    project('node_modules/sneaky', { name: 'sneaky' });
    project('.hidden/nested', { name: 'hidden' });

    const found = scanProjects(root);
    const paths = found.map((p) => p.path);
    expect(paths).toContain('.');
    expect(paths).toContain(join('packages', 'lib'));
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(paths.some((p) => p.includes('.hidden'))).toBe(false);
    expect(found.find((p) => p.path === '.')?.isMonorepoRoot).toBe(true);
    expect(found.find((p) => p.path === join('packages', 'lib'))?.isMonorepoRoot).toBe(false);
  });

  it('tolerates malformed package.json (lists the project, empty scripts)', () => {
    const dir = join(root, 'broken');
    mkdirSync(dir);
    writeFileSync(join(dir, 'package.json'), '{ not json');
    const found = scanProjects(root);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: 'broken', name: 'broken', scripts: [] });
  });

  it('ignores directories beyond the depth bound', () => {
    project('a/b/c/d/deep', { name: 'too-deep' });
    project('a/b/ok', { name: 'ok' });
    const paths = scanProjects(root).map((p) => p.path);
    expect(paths).toContain(join('a', 'b', 'ok'));
    expect(paths.some((p) => p.includes('deep'))).toBe(false);
  });

  it('PRODUCT-AC-007 — never follows a directory symlink outside the workspace', () => {
    const outside = mkdtempSync(join(tmpdir(), 'pipe-editor-scan-outside-'));
    try {
      writeFileSync(
        join(outside, 'package.json'),
        JSON.stringify({ name: 'private-outside-project' }),
      );
      symlinkSync(outside, join(root, 'linked-project'), 'dir');

      const found = scanProjects(root);
      expect(found.some((project) => project.name === 'private-outside-project')).toBe(false);
      expect(found.some((project) => project.path === 'linked-project')).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('lists safe immediate folders for the interactive folder browser', () => {
    project('mad', { name: 'mad' });
    mkdirSync(join(root, 'group', 'nested'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'hidden'), { recursive: true });

    expect(listWorkspaceDirectory(root, root)).toMatchObject({
      workspaceRoot: root,
      currentPath: '.',
      absolutePath: root,
      parentPath: null,
      directories: [
        { name: 'group', path: 'group', isProject: false },
        { name: 'mad', path: 'mad', isProject: true },
      ],
    });
    expect(listWorkspaceDirectory(root, join(root, 'group'))).toMatchObject({
      currentPath: 'group',
      parentPath: '.',
      directories: [{ name: 'nested', path: 'group/nested', isProject: false }],
    });
  });

  it('resolves a browser-dropped folder basename without following symlinks', () => {
    mkdirSync(join(root, 'mad', 'mad-test'), { recursive: true });
    mkdirSync(join(root, 'archive', 'mad-test'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'mad-test'), { recursive: true });

    expect(findWorkspaceDirectoriesByName(root, 'mad-test')).toEqual([
      'archive/mad-test',
      'mad/mad-test',
    ]);
    expect(findWorkspaceDirectoriesByName(root, 'missing')).toEqual([]);
  });
});
