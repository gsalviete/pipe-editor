// Path-security unit tests — covers the algorithmic side of
// EDITOR-AC-003, -004, -005, -006, -025 without going through HTTP.
// The HTTP-level tests in detect.controller.spec.ts assert the same
// rules end-to-end (status codes + envelope).

import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkProjectPath } from './path-security';

function setupWorkspace(): { wsRoot: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-ws-'));
  const ws = realpathSync(dir);
  return {
    wsRoot: ws,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('checkProjectPath — security model rules', () => {
  it('rejects non-string projectPath (EDITOR-AC-005 family)', () => {
    expect(checkProjectPath(undefined, '/tmp').kind).toBe('invalid');
    expect(checkProjectPath(null, '/tmp').kind).toBe('invalid');
    expect(checkProjectPath(42, '/tmp').kind).toBe('invalid');
  });

  it('rejects empty projectPath', () => {
    expect(checkProjectPath('', '/tmp').kind).toBe('invalid');
  });

  it('rejects projectPath containing NUL bytes (EDITOR-AC-005)', () => {
    expect(checkProjectPath('safe\0../etc', '/tmp').kind).toBe('invalid');
  });

  it('accepts contained absolute paths and rejects absolute paths outside the workspace', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      mkdirSync(join(wsRoot, 'absolute-child'));
      expect(checkProjectPath(join(wsRoot, 'absolute-child'), wsRoot).kind).toBe('ok');
      expect(checkProjectPath('/etc', wsRoot).kind).toBe('outside');
    } finally {
      cleanup();
    }
  });

  it('maps a host absolute path onto its container-mounted workspace alias', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      mkdirSync(join(wsRoot, 'mad-test'));
      const result = checkProjectPath(
        '/Users/example/projects/mad-test',
        wsRoot,
        '/Users/example/projects',
      );
      expect(result).toEqual({
        kind: 'ok',
        realCandidate: join(wsRoot, 'mad-test'),
      });
      expect(
        checkProjectPath('/Users/example/private', wsRoot, '/Users/example/projects').kind,
      ).toBe('outside');
    } finally {
      cleanup();
    }
  });

  it('returns not-found for a non-existing relative path', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      expect(checkProjectPath('definitely-not-here', wsRoot).kind).toBe('not-found');
    } finally {
      cleanup();
    }
  });

  it('rejects `..` traversals that escape the workspace (EDITOR-AC-004)', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      // Even when the target exists outside the workspace (/, /tmp, …),
      // a `..`-traversal that resolves outside wsRoot must be rejected.
      const result = checkProjectPath('../../../../etc', wsRoot);
      // Either outside (path exists outside) or not-found (etc may not
      // exist on some systems); both are non-ok and the kind MUST NOT
      // be 'ok'.
      expect(result.kind).not.toBe('ok');
    } finally {
      cleanup();
    }
  });

  it('rejects symlinks whose realpath escapes the workspace (EDITOR-AC-006)', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    const outside = mkdtempSync(join(tmpdir(), 'pipe-editor-outside-'));
    try {
      symlinkSync(realpathSync(outside), join(wsRoot, 'escape-link'));
      const result = checkProjectPath('escape-link', wsRoot);
      expect(result.kind).toBe('outside');
    } finally {
      cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('accepts symlinks whose realpath stays inside the workspace', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      mkdirSync(join(wsRoot, 'real'));
      symlinkSync(join(wsRoot, 'real'), join(wsRoot, 'alias'));
      const result = checkProjectPath('alias', wsRoot);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.realCandidate.startsWith(wsRoot)).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it('accepts a path that resolves to the workspace root itself (EDITOR-AC-025)', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      for (const candidate of ['.', './']) {
        const result = checkProjectPath(candidate, wsRoot);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.realCandidate).toBe(wsRoot);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('accepts a path that resolves to a subdirectory of the workspace root', () => {
    const { wsRoot, cleanup } = setupWorkspace();
    try {
      mkdirSync(join(wsRoot, 'sub'));
      writeFileSync(join(wsRoot, 'sub', 'marker'), '');
      const result = checkProjectPath('sub', wsRoot);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.realCandidate).toBe(join(wsRoot, 'sub'));
      }
    } finally {
      cleanup();
    }
  });
});
