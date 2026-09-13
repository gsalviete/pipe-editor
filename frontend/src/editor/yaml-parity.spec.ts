// T-ARCH-002 (ARCH-02) — one YAML parser, both sides of the wire.
//
// The backend depended on js-yaml ^4.1.0 and the frontend on ^5.0.0. The
// editor parses pasted YAML and round-trips exported YAML with a DIFFERENT
// MAJOR VERSION than the one that will parse it server-side on import, so
// any 1.1/1.2 behaviour change between the two majors became a
// "works in the browser, fails in the API" class of bug. EDITOR-AC-020's
// round-trip proof only ever exercised the frontend's parser.
//
// This suite does two things: it pins the versions to the same one, and it
// runs the export → import round trip across the boundary, using the
// backend's own generators and importer from `@modules` alongside the
// frontend's js-yaml.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { canonicalEquals, serializeCanonical, validate, type PipelineIR } from '@modules/ir';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures');

function loadIr(): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, 'node-pnpm-nest-basic', 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

function declaredVersion(pkg: string): string {
  const json = JSON.parse(readFileSync(join(REPO_ROOT, pkg, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...json.dependencies, ...json.devDependencies };
  return deps['js-yaml'];
}

function installedVersion(pkg: string): string {
  return (
    JSON.parse(
      readFileSync(join(REPO_ROOT, pkg, 'node_modules', 'js-yaml', 'package.json'), 'utf-8'),
    ) as { version: string }
  ).version;
}

describe('T-ARCH-002 — the two packages agree on js-yaml', () => {
  it('declares the same range on both sides', () => {
    expect(declaredVersion('frontend')).toBe(declaredVersion('backend'));
  });

  it('resolves to the same installed version on both sides', () => {
    expect(installedVersion('frontend')).toBe(installedVersion('backend'));
  });
});

describe('T-ARCH-002 — YAML written by one side is read the same by the other', () => {
  // The values that distinguish YAML 1.1 from 1.2, and the ones this
  // product actually interpolates into documents.
  const AMBIGUOUS = {
    yes: 'yes',
    no: 'no',
    on: 'on',
    off: 'off',
    sexagesimal: '12:30:45',
    leadingZero: '0755',
    version: '1.20',
    nullish: 'null',
    tilde: '~',
    star: '*',
    empty: '',
    multiline: '# comment\nnpm ci\nnpm test',
  };

  it('round-trips ambiguous scalars unchanged', () => {
    const text = yamlDump(AMBIGUOUS, { lineWidth: -1 });
    expect(yamlLoad(text)).toEqual(AMBIGUOUS);
  });

  it('reads the bare `on:` key as the string "on", as GitHub Actions expects', () => {
    expect(Object.keys(yamlLoad('on:\n  push:\n    branches: [main]\n') as object)).toEqual(['on']);
  });

  it('survives the editor export → re-parse round trip for a real IR', () => {
    const ir = loadIr();
    const text = yamlDump(JSON.parse(serializeCanonical(ir)) as unknown, { lineWidth: -1 });
    const reparsed = yamlLoad(text) as PipelineIR;
    expect(validate(reparsed)).toEqual([]);
    expect(canonicalEquals(reparsed, ir)).toBe(true);
  });

  it('survives it for an IR full of values that break naive quoting', () => {
    const ir = loadIr();
    ir.project.name = '@acme/api';
    ir.triggers = [{ kind: 'on-push', branches: ['*', 'release: x', 'yes'] }];
    ir.stages = ir.stages.map((s) =>
      s.id === 'test'
        ? {
            ...s,
            name: 'Build: prod',
            steps: [
              {
                ...s.steps[0],
                run: '# prepare\nnpm ci\nif [ -f .env ]; then\n  echo ok\nfi',
                env: { A_KEY: 'has: colon', B_KEY: '*star' },
              },
            ],
          }
        : s,
    );
    expect(validate(ir)).toEqual([]);

    const text = yamlDump(JSON.parse(serializeCanonical(ir)) as unknown, { lineWidth: -1 });
    const reparsed = yamlLoad(text) as PipelineIR;
    expect(validate(reparsed)).toEqual([]);
    expect(canonicalEquals(reparsed, ir)).toBe(true);
  });
});
