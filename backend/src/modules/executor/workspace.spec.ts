// Workspace materialization tests (EXEC-FR-007). Pure filesystem —
// no Docker required. The normative exclusion list applies to
// TOP-LEVEL entries of projectPath only, at copy time only.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WORKSPACE_COPY_EXCLUSIONS } from './types';
import { materializeWorkspace } from './workspace';

describe('materializeWorkspace (EXEC-FR-007)', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'pipe-editor-ws-spec-'));
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  function touch(...segments: string[]): void {
    const file = join(project, ...segments);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, 'x');
  }

  it('excludes every normative top-level entry and keeps regular files', () => {
    touch('package.json');
    touch('src', 'main.ts');
    for (const excluded of WORKSPACE_COPY_EXCLUSIONS) {
      touch(excluded, 'inner.txt');
    }

    const ws = materializeWorkspace(project);
    try {
      expect(existsSync(join(ws.hostPath, 'package.json'))).toBe(true);
      expect(existsSync(join(ws.hostPath, 'src', 'main.ts'))).toBe(true);
      for (const excluded of WORKSPACE_COPY_EXCLUSIONS) {
        expect(existsSync(join(ws.hostPath, excluded))).toBe(false);
      }
    } finally {
      ws.cleanup();
    }
  });

  it('keeps NESTED entries whose name matches an exclusion (top-level only rule)', () => {
    touch('src', 'dist', 'bundle.js');
    touch('packages', 'a', 'node_modules', 'left-pad', 'index.js');
    touch('src', 'dist.ts');

    const ws = materializeWorkspace(project);
    try {
      expect(existsSync(join(ws.hostPath, 'src', 'dist', 'bundle.js'))).toBe(true);
      expect(
        existsSync(join(ws.hostPath, 'packages', 'a', 'node_modules', 'left-pad', 'index.js')),
      ).toBe(true);
      expect(existsSync(join(ws.hostPath, 'src', 'dist.ts'))).toBe(true);
    } finally {
      ws.cleanup();
    }
  });

  it('cleanup removes the temp copy', () => {
    touch('package.json');
    const ws = materializeWorkspace(project);
    expect(existsSync(ws.hostPath)).toBe(true);
    ws.cleanup();
    expect(existsSync(ws.hostPath)).toBe(false);
  });
});
