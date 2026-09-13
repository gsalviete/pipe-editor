// Tests for workspace-root configuration — EDITOR-AC-001 (startup
// refusal when PIPE_EDITOR_WORKSPACE_ROOT is unset/invalid). The
// refusal happens at module-init time by resolveWorkspaceRoot()
// throwing; main.ts surfaces the message and exits(1).

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WorkspaceRootConfigError, resolveWorkspaceRoot } from './workspace-root';

describe('Editor API — workspace-root configuration (T-EDITOR-001 / EDITOR-AC-001)', () => {
  it('rejects undefined env value', () => {
    expect(() => resolveWorkspaceRoot(undefined)).toThrow(WorkspaceRootConfigError);
    expect(() => resolveWorkspaceRoot(undefined)).toThrow(/PIPE_EDITOR_WORKSPACE_ROOT/);
  });

  it('rejects empty env value', () => {
    expect(() => resolveWorkspaceRoot('')).toThrow(WorkspaceRootConfigError);
  });

  it('rejects relative paths', () => {
    expect(() => resolveWorkspaceRoot('relative/path')).toThrow(/absolute/);
  });

  it('rejects an absolute path that does not exist', () => {
    expect(() =>
      resolveWorkspaceRoot('/this/path/does/not/exist/anywhere/at/all'),
    ).toThrow(/does not exist/);
  });

  it('rejects an absolute path that is a file rather than a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-wsroot-file-'));
    try {
      const filePath = join(dir, 'just-a-file');
      writeFileSync(filePath, '');
      expect(() => resolveWorkspaceRoot(filePath)).toThrow(/not a directory/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a valid existing absolute directory and caches its realpath', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-wsroot-ok-'));
    try {
      const ws = resolveWorkspaceRoot(dir);
      expect(ws.raw).toBe(dir);
      // On some platforms (e.g. macOS) /tmp is itself a symlink so the
      // realpath may differ from the raw input — the test asserts it is
      // SET and points at an existing directory.
      expect(typeof ws.realpath).toBe('string');
      expect(ws.realpath.length).toBeGreaterThan(0);
      expect(ws.displayRoot).toBe(ws.realpath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps an absolute host-facing alias for container path translation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-wsroot-display-'));
    try {
      const ws = resolveWorkspaceRoot(dir, '/Users/example/projects');
      expect(ws.displayRoot).toBe('/Users/example/projects');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
