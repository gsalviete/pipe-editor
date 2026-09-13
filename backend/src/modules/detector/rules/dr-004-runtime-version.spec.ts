// T-DET-020 (DET-AC-020) — DR-004's widened evidence set.
//
// Before this suite, DR-004 read only `engines.node`, so the very common
// "Node project pinned with .nvmrc or Volta" shape detected to
// runtime.version: null and became permanently ungeneratable and unrunnable
// (adversarial review UX-01b).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ALL_RULES, Detector } from '../index';
import { majorFromVersionText } from './helpers';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pipe-editor-dr004-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = join(root, 'app');
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const PKG = JSON.stringify({ name: 'app', scripts: { test: 'jest' } });

function detectVersion(files: Record<string, string>): string | null {
  const { ir } = new Detector({ rules: ALL_RULES }).detect(project(files));
  return ir.project.runtime.version;
}

function unresolvedFields(files: Record<string, string>): string[] {
  const { ir } = new Detector({ rules: ALL_RULES }).detect(project(files));
  return (ir.unresolved ?? []).map((u) => u.field);
}

describe('DR-004 — runtime version evidence', () => {
  it('still prefers engines.node', () => {
    const pkg = JSON.stringify({ name: 'app', engines: { node: '>=20.11' } });
    expect(detectVersion({ 'package.json': pkg, '.nvmrc': '18' })).toBe('20');
  });

  it('reads volta.node when engines.node is absent', () => {
    const pkg = JSON.stringify({ name: 'app', volta: { node: '20.11.1' } });
    expect(detectVersion({ 'package.json': pkg })).toBe('20');
  });

  it('reads .nvmrc when package.json declares no version', () => {
    expect(detectVersion({ 'package.json': PKG, '.nvmrc': 'v20.11.0\n' })).toBe('20');
  });

  it('reads .node-version when package.json declares no version', () => {
    expect(detectVersion({ 'package.json': PKG, '.node-version': '18.19.0' })).toBe('18');
  });

  it('prefers volta over .nvmrc, and .nvmrc over .node-version', () => {
    const pkg = JSON.stringify({ name: 'app', volta: { node: '22.1.0' } });
    expect(detectVersion({ 'package.json': pkg, '.nvmrc': '20', '.node-version': '18' })).toBe('22');
    expect(detectVersion({ 'package.json': PKG, '.nvmrc': '20', '.node-version': '18' })).toBe('20');
  });

  it('skips blank lines and # comments in .nvmrc', () => {
    expect(detectVersion({ 'package.json': PKG, '.nvmrc': '\n# pinned for CI\n20.11.0\n' })).toBe('20');
  });

  // An nvm alias names no concrete version; resolving it needs a network
  // lookup, so DR-004 must stay honest and leave the field unresolved
  // rather than interpolate the alias into a node:<v>-alpine tag.
  it.each(['lts/hydrogen', 'node', 'stable', ''])(
    'leaves the version unresolved for the .nvmrc alias %p',
    (alias) => {
      const files = { 'package.json': PKG, '.nvmrc': alias };
      expect(detectVersion(files)).toBeNull();
      expect(unresolvedFields(files)).toContain('/project/runtime/version');
    },
  );

  it('leaves the version unresolved when no evidence exists at all', () => {
    expect(detectVersion({ 'package.json': PKG })).toBeNull();
    expect(unresolvedFields({ 'package.json': PKG })).toContain('/project/runtime/version');
  });

  // A folder holding only a version file is not a project: `.nvmrc` and
  // `.node-version` are evidence, never the manifest that qualifies a folder.
  it('does not treat a lone .nvmrc as a manifest', () => {
    expect(() => detectVersion({ '.nvmrc': '20' })).toThrow(/manifest/i);
  });

  it('propagates the resolved version into stage images', () => {
    const { ir } = new Detector({ rules: ALL_RULES }).detect(
      project({ 'package.json': PKG, 'package-lock.json': '{"lockfileVersion":3}', '.nvmrc': '20' }),
    );
    const install = ir.stages.find((s) => s.id === 'install');
    expect(install?.container.image).toBe('node:20-alpine');
  });
});

describe('majorFromVersionText', () => {
  it.each([
    ['20', '20'],
    ['v20', '20'],
    ['20.11.0', '20'],
    ['v18.19.1', '18'],
    ['>=20', '20'],
    ['^22.0.0', '22'],
    ['  20.1.0  ', '20'],
  ])('%p → %p', (input, expected) => {
    expect(majorFromVersionText(input)).toBe(expected);
  });

  it.each(['lts/hydrogen', 'node', 'stable', '', 'latest', 'iojs-v1'])(
    'rejects %p',
    (input) => {
      expect(majorFromVersionText(input)).toBeNull();
    },
  );
});
