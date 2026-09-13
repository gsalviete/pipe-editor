// SEC-06 — a size bound on manifest reads.
//
// readManifests, probeProject and inspectWorkspace all read package.json and
// lockfiles with no size check, so a multi-hundred-megabyte file anywhere in
// the workspace — a vendored artifact, a generated blob, a hostile repo the
// user cloned in order to inspect it — turned a discovery scan into an OOM.
// The CI-import path has had a 512 KiB bound all along; manifests had none.
//
// The bound is deliberately generous. A large real package.json is a few
// hundred KiB; a pnpm-lock.yaml for a big monorepo can reach a megabyte or
// two. 8 MiB is far past anything legitimate and far short of a problem.

import { readFileSync, statSync } from 'fs';

export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

export class ManifestTooLargeError extends Error {
  constructor(
    readonly path: string,
    readonly size: number,
  ) {
    super(
      `${path} is ${Math.round(size / 1024 / 1024)} MB, over the ${
        MAX_MANIFEST_BYTES / 1024 / 1024
      } MB manifest limit. pipe-editor skipped it rather than loading it into memory.`,
    );
    this.name = 'ManifestTooLargeError';
  }
}

/**
 * Read a manifest, refusing anything over the limit.
 *
 * Throws `ManifestTooLargeError`, which each caller handles the way it
 * already handles a malformed manifest: the detector turns it into a
 * warning, discovery skips the project.
 */
export function readManifestBounded(path: string): string {
  const size = statSync(path).size;
  if (size > MAX_MANIFEST_BYTES) throw new ManifestTooLargeError(path, size);
  return readFileSync(path, 'utf-8');
}
