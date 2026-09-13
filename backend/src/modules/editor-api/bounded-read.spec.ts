// T-SEC-006 (SEC-06) — manifest reads are size-bounded.
//
// The CI-import path had a 512 KiB bound from the start; manifest reads had
// none, so one oversized file anywhere in the workspace turned a discovery
// scan into an out-of-memory kill.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  MAX_MANIFEST_BYTES,
  ManifestTooLargeError,
  readManifestBounded,
} from './bounded-read';
import { ALL_RULES, Detector } from '../detector';
import { scanProjects } from './project-scan';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pipe-editor-sec006-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A file just over the limit, written without holding it all in memory twice. */
function writeOversized(path: string): void {
  const chunk = 'x'.repeat(1024 * 1024);
  const parts: string[] = [];
  for (let written = 0; written <= MAX_MANIFEST_BYTES; written += chunk.length) {
    parts.push(chunk);
  }
  writeFileSync(path, parts.join(''));
}

describe('readManifestBounded', () => {
  it('reads an ordinary manifest', () => {
    const path = join(root, 'package.json');
    writeFileSync(path, '{"name":"app"}');
    expect(readManifestBounded(path)).toBe('{"name":"app"}');
  });

  it('refuses a file over the limit, naming the size', () => {
    const path = join(root, 'package.json');
    writeOversized(path);
    expect(() => readManifestBounded(path)).toThrow(ManifestTooLargeError);
    try {
      readManifestBounded(path);
    } catch (e) {
      expect((e as Error).message).toMatch(/MB manifest limit/);
    }
  });
});

describe('the bound holds at the three read sites', () => {
  it('the detector warns and carries on for an oversized lockfile', () => {
    const dir = join(root, 'app');
    mkdirSync(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', engines: { node: '20' } }));
    writeOversized(join(dir, 'pnpm-lock.yaml'));

    const { ir, warnings } = new Detector({ rules: ALL_RULES }).detect(dir);
    expect(warnings.some((w) => /manifest limit/.test(w.message))).toBe(true);
    // Detection still produced a usable document.
    expect(ir.project.name).toBe('app');
  });

  it('the detector refuses an oversized package.json rather than loading it', () => {
    const dir = join(root, 'app');
    mkdirSync(dir);
    writeOversized(join(dir, 'package.json'));
    expect(() => new Detector({ rules: ALL_RULES }).detect(dir)).toThrow(/manifest limit/);
  });

  // Discovery treats an oversized manifest exactly as it already treated a
  // malformed one: the project is still listed, under its directory name,
  // so detect() can give a proper diagnostic when the user picks it. What
  // changed is that the file is no longer read into memory to find out.
  it('discovery degrades on an oversized package.json instead of dying', () => {
    const good = join(root, 'good');
    mkdirSync(good);
    writeFileSync(
      join(good, 'package.json'),
      JSON.stringify({ name: 'good', scripts: { test: 'jest' } }),
    );
    const bad = join(root, 'bad');
    mkdirSync(bad);
    writeOversized(join(bad, 'package.json'));

    const projects = scanProjects(root);
    const names = projects.map((p) => p.name);
    expect(names).toContain('good');
    expect(names).toContain('bad');
    // Listed from the directory name, with nothing read out of the file.
    const degraded = projects.find((p) => p.name === 'bad')!;
    expect(degraded.scripts).toEqual([]);
    expect(projects.find((p) => p.name === 'good')!.scripts).toEqual(['test']);
  });
});
