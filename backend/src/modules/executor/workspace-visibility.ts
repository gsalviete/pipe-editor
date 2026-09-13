// SEC-05 — prove the temp copy is visible to the Docker daemon before
// running anything against it.
//
// `docker-compose.exec.yml`'s own header admits the temp copy lives inside
// the backend container and is not visible to the host daemon. What it does
// not say is what Docker *does* in that situation: given
// `-v /tmp/pipe-editor-exec-xxx/workspace:/workspace` with a source path
// that does not exist on the host, the daemon **creates an empty directory**
// and mounts that. Every stage then runs against an empty workspace.
//
// Depending on the commands, that yields a confusing failure — or, for a
// tolerant script, a **passing** run that verified nothing. A green run that
// validated nothing contradicts the fidelity claim in ADR-0001, which the
// whole product rests on, so this is the one failure mode the executor must
// never allow.
//
// The check is a positive proof rather than an inference about the
// environment: write a marker into the temp copy, then ask a throwaway
// container to read it back through the same mount the stages will use. If
// the daemon cannot see it, nothing after this point would have meant
// anything.

import { randomUUID } from 'crypto';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

export const WORKSPACE_PROBE_IMAGE = 'busybox:1.36';

/** The marker filename, kept out of the way of anything a project might have. */
const MARKER_NAME = '.pipe-editor-visibility-probe';

export class WorkspaceNotVisibleError extends Error {
  readonly code = 'DOCKER_WORKSPACE_NOT_VISIBLE';
  constructor(readonly detail: string) {
    super(
      'The Docker daemon cannot see the temporary workspace copy, so a run here would ' +
        'execute against an empty directory and could report success without validating ' +
        'anything. Refusing to start. This happens when pipe-editor runs inside a container ' +
        'with the host Docker socket mounted: the copy lives in the container filesystem, ' +
        'which the host daemon cannot bind-mount. Run the backend directly on the host, or ' +
        'share a host temp directory with the container.',
    );
    this.name = 'WorkspaceNotVisibleError';
  }
}

/**
 * Assert that `hostPath` is visible to the Docker daemon.
 *
 * Writes a marker with a fresh random value, mounts the copy read-only into
 * a throwaway container, and requires the value back. The marker is removed
 * afterwards so a stage never sees it.
 */
export async function assertWorkspaceVisible(
  hostPath: string,
  options: { image?: string; timeoutMs?: number } = {},
): Promise<void> {
  const image = options.image ?? WORKSPACE_PROBE_IMAGE;
  const expected = randomUUID();
  const markerPath = join(hostPath, MARKER_NAME);
  writeFileSync(markerPath, expected);

  try {
    const { stdout, stderr, code } = await runProbe(
      image,
      hostPath,
      options.timeoutMs ?? 60_000,
    );
    if (code !== 0) {
      throw new WorkspaceNotVisibleError(
        `probe container exited ${String(code)}: ${stderr.trim() || '(no output)'}`,
      );
    }
    // A mounted-but-empty directory reads back nothing; a different value
    // would mean the mount resolved somewhere else entirely.
    if (stdout.trim() !== expected) {
      throw new WorkspaceNotVisibleError(
        stdout.trim() === ''
          ? 'the marker file was not present inside the container (the mount resolved to an empty directory)'
          : 'the marker file inside the container did not match the one just written',
      );
    }
  } finally {
    rmSync(markerPath, { force: true });
  }
}

function runProbe(
  image: string,
  hostPath: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    // Read-only mount, no network, constructed environment — the probe has
    // strictly less access than the stages that follow it.
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        `${hostPath}:/probe:ro`,
        image,
        'cat',
        `/probe/${MARKER_NAME}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += '\nprobe timed out';
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${err.message}`, code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
