// T-EXEC-101 (SEC-05) — the workspace-visibility probe.
//
// The failure this prevents is the worst one the executor can produce: a
// bind mount whose source does not exist on the host is CREATED as an empty
// directory by the daemon rather than refused, so every stage runs against
// an empty workspace and a tolerant script reports success having validated
// nothing. That directly contradicts ADR-0001's fidelity claim.

import { execSync } from 'child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertWorkspaceVisible,
  WorkspaceNotVisibleError,
} from './workspace-visibility';

const dockerAvailable = (() => {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('WorkspaceNotVisibleError', () => {
  it('carries the documented code and explains the container-in-container case', () => {
    const error = new WorkspaceNotVisibleError('probe saw nothing');
    expect(error.code).toBe('DOCKER_WORKSPACE_NOT_VISIBLE');
    expect(error.detail).toBe('probe saw nothing');
    expect(error.message).toMatch(/report success without validating anything/i);
    expect(error.message).toMatch(/host Docker socket/i);
  });
});

(dockerAvailable ? describe : describe.skip)(
  'T-EXEC-101 (SEC-05) — assertWorkspaceVisible against a real daemon',
  () => {
    let workspace: string;

    beforeEach(() => {
      workspace = mkdtempSync(join(tmpdir(), 'pipe-editor-vis-'));
      writeFileSync(join(workspace, 'package.json'), '{"name":"probe-fixture"}');
    });
    afterEach(() => rmSync(workspace, { recursive: true, force: true }));

    it('passes for a directory the daemon can mount', async () => {
      await expect(assertWorkspaceVisible(workspace)).resolves.toBeUndefined();
    });

    it('leaves no marker behind for the stages to see', async () => {
      await assertWorkspaceVisible(workspace);
      expect(readdirSync(workspace)).toEqual(['package.json']);
    });

    it('removes the marker even when the probe fails', async () => {
      await expect(
        assertWorkspaceVisible(workspace, {
          image: 'pipe-editor-nonexistent-probe-image:never',
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow(WorkspaceNotVisibleError);
      expect(readdirSync(workspace)).toEqual(['package.json']);
    });

    it('refuses when the probe container cannot run at all', async () => {
      await expect(
        assertWorkspaceVisible(workspace, {
          image: 'pipe-editor-nonexistent-probe-image:never',
          timeoutMs: 30_000,
        }),
      ).rejects.toMatchObject({ code: 'DOCKER_WORKSPACE_NOT_VISIBLE' });
    });
  },
);

if (!dockerAvailable) {
  // eslint-disable-next-line no-console
  console.log('T-EXEC-101 skipped: docker CLI not available on this host');
}
