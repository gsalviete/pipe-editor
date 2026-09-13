// T-WORKSPACE-103 (UX-03) — the bundle downloads as one archive, paths intact.
//
// Artifacts were delivered one at a time with the path flattened
// (`frontend/Dockerfile` → `frontend__Dockerfile`), so a five-service bundle
// was ~16 downloads the user then renamed and re-filed by hand. For a
// product whose proposition is "generate everything together", the last mile
// was manual.
//
// The archive is read back with JSZip here rather than inspected as bytes:
// what matters is that extracting it puts every file where it belongs.

import { describe, expect, it, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { downloadZip } from './ui';

/**
 * Capture the blob handed to the anchor, without a real download.
 *
 * jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, so
 * they are defined before being replaced rather than spied on.
 */
function captureDownload(): { blob: () => Blob; filename: () => string } {
  const created: Blob[] = [];
  const names: string[] = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      created.push(blob);
      return 'blob:mock';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return { blob: () => created[0], filename: () => names[0] };
}

afterEach(() => vi.restoreAllMocks());

const BUNDLE = [
  { path: 'frontend/Dockerfile', content: 'FROM node:20-alpine\nCMD ["node","x"]\n' },
  { path: 'frontend/.dockerignore', content: 'node_modules\n' },
  { path: 'frontend/nginx.conf', content: 'server { listen 80; }\n' },
  { path: 'backend/Dockerfile', content: 'FROM node:20-alpine\n' },
  { path: 'docker-compose.yml', content: 'services:\n  api: {}\n' },
  { path: '.github/workflows/ci.yml', content: 'name: CI\non:\n  push: {}\n' },
];

describe('T-WORKSPACE-103 (UX-03) — downloadZip', () => {
  it('produces one archive named for the bundle', async () => {
    const captured = captureDownload();
    await downloadZip('pipe-editor-bundle.zip', BUNDLE);
    expect(captured.filename()).toBe('pipe-editor-bundle.zip');
    expect(captured.blob()).toBeInstanceOf(Blob);
  });

  it('preserves every path, including nested ones', async () => {
    const captured = captureDownload();
    await downloadZip('pipe-editor-bundle.zip', BUNDLE);

    const zip = await JSZip.loadAsync(await captured.blob().arrayBuffer());
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
    expect(paths.sort()).toEqual(BUNDLE.map((f) => f.path).sort());

    // The flattening this replaces would have produced these.
    expect(paths).not.toContain('frontend__Dockerfile');
    expect(paths.some((p) => p.includes('__'))).toBe(false);
  });

  it('preserves every file\'s bytes', async () => {
    const captured = captureDownload();
    await downloadZip('pipe-editor-bundle.zip', BUNDLE);

    const zip = await JSZip.loadAsync(await captured.blob().arrayBuffer());
    for (const file of BUNDLE) {
      expect(await zip.file(file.path)!.async('string')).toBe(file.content);
    }
  });

  it('handles an empty bundle without producing a broken archive', async () => {
    const captured = captureDownload();
    await downloadZip('empty.zip', []);
    const zip = await JSZip.loadAsync(await captured.blob().arrayBuffer());
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('round-trips non-ASCII content', async () => {
    const captured = captureDownload();
    const files = [{ path: 'a/notes.md', content: '# Notas — café ☕\n' }];
    await downloadZip('x.zip', files);
    const zip = await JSZip.loadAsync(await captured.blob().arrayBuffer());
    expect(await zip.file('a/notes.md')!.async('string')).toBe(files[0].content);
  });
});
