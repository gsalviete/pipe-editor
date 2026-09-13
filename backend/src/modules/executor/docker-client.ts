// Thin wrapper around the docker CLI. Stateless; one container per
// call. The Executor uses these two functions; the rest of the
// pipeline-executor.spec.md contract lives in execute.ts.
//
// Security:
//   - --network defaults to bridge (no --network override).
//   - no --privileged.
//   - no /var/run/docker.sock mount.
//   - the only -v mount is the workspace temp-copy (host → /workspace).
//   - env is constructed, never inherited; we pass each key explicitly
//     via -e KEY=value (no --env-file, no --env-host).

import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const MAX_CAPTURED_STREAM_CHARS = 256 * 1024;
export const OUTPUT_TRUNCATION_MARKER =
  '\n[pipe-editor: earlier output truncated to protect memory]\n';

/** Keep the most useful (latest) part of a stream within a hard memory bound. */
export function appendBoundedOutput(current: string, chunk: string): string {
  const alreadyTruncated = current.startsWith(OUTPUT_TRUNCATION_MARKER);
  const body = alreadyTruncated
    ? current.slice(OUTPUT_TRUNCATION_MARKER.length) + chunk
    : current + chunk;
  if (!alreadyTruncated && body.length <= MAX_CAPTURED_STREAM_CHARS) return body;
  const tailSize = MAX_CAPTURED_STREAM_CHARS - OUTPUT_TRUNCATION_MARKER.length;
  return OUTPUT_TRUNCATION_MARKER + body.slice(-tailSize);
}

export interface RunStageRequest {
  image: string;
  shellCommand: string;
  env: Record<string, string>;
  workspaceHostPath: string;
  workingDir: string;
  signal?: AbortSignal;
  /** Live output listener; chunks are also accumulated into the result. */
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface RunStageResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  aborted: boolean;
  /** The exact argv passed to the docker CLI — surfaced for AC-007. */
  argv: string[];
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    const result = await runRaw('docker', ['--version'], { timeoutMs: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runStageInContainer(req: RunStageRequest): Promise<RunStageResult> {
  // cidfile lets us reliably target the spawned container with
  // docker stop/kill on abort, even if our spawn() child dies first.
  const cidDir = mkdtempSync(join(tmpdir(), 'pipe-editor-cid-'));
  const cidFile = join(cidDir, 'cid');

  const argv: string[] = [
    'run',
    '--rm',
    `--cidfile=${cidFile}`,
    '-w',
    req.workingDir,
    '-v',
    `${req.workspaceHostPath}:/workspace`,
  ];

  for (const [k, v] of Object.entries(req.env)) {
    argv.push('-e', `${k}=${v}`);
  }

  argv.push(req.image, 'sh', '-c', req.shellCommand);

  try {
    const result = await runRaw('docker', argv, {
      signal: req.signal,
      // No timeout here — Stage timeouts are an OQ. Caller's AbortSignal
      // is the only cancellation surface in v1.
      cidFile,
      onOutput: req.onOutput,
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      aborted: result.aborted,
      argv: ['docker', ...argv],
    };
  } finally {
    try {
      rmSync(cidDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

interface RawRunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cidFile?: string;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

interface RawRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  aborted: boolean;
}

function runRaw(
  command: string,
  args: string[],
  opts: RawRunOptions = {},
): Promise<RawRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let aborted = false;
    let timer: NodeJS.Timeout | null = null;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdout = appendBoundedOutput(stdout, text);
      try {
        opts.onOutput?.('stdout', text);
      } catch {
        /* listener errors must not kill the run */
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderr = appendBoundedOutput(stderr, text);
      try {
        opts.onOutput?.('stderr', text);
      } catch {
        /* listener errors must not kill the run */
      }
    });

    const onAbort = () => {
      aborted = true;
      stopContainer(opts.cidFile);
      // Kill the docker CLI client. The container itself is stopped
      // via the cidfile path above; --rm cleans it up.
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        aborted = true;
        try {
          child.kill('SIGKILL');
        } catch {
          /* gone */
        }
      }, opts.timeoutMs);
    }

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        aborted,
      });
    });
  });
}

function stopContainer(cidFile: string | undefined) {
  if (!cidFile || !existsSync(cidFile)) return;
  let cid = '';
  try {
    cid = readFileSync(cidFile, 'utf-8').trim();
  } catch {
    return;
  }
  if (!cid) return;
  // Best-effort stop; ignore failures because the docker CLI client
  // dying may have already removed the container via --rm.
  try {
    spawn('docker', ['stop', '-t', '5', cid], { stdio: 'ignore' }).unref();
  } catch {
    /* nothing else to do */
  }
}
