// T-IR-020…022 — value constraints on the two IR fields that leave the
// document and land somewhere that can reinterpret them (a shell argv, a
// YAML mapping), plus a bound on client-supplied nesting.
//
// These live in validate() on purpose: every consumer — the executor, both
// CI exporters, the Dockerfile generator, the workspace validator and the
// editor — calls it, so the rule holds once for all of them (ADR-0003).

import { canonicalDigest, serializeCanonical } from './canonical';
import { MAX_DOCUMENT_DEPTH, validate } from './validate';
import type { PipelineIR, Stage } from './types';

function irWith(stage: Partial<Stage>): PipelineIR {
  return {
    version: '0.1.0',
    project: {
      name: 'app',
      rootPath: '/w/app',
      language: 'typescript',
      runtime: { name: 'node', version: '20' },
      packageManager: { name: 'npm', version: '10' },
    },
    stages: [
      {
        id: 'install',
        name: 'Install',
        enabled: true,
        dependsOn: [],
        container: { image: 'node:20-alpine' },
        steps: [{ id: 'install-deps', run: 'npm ci', workingDir: '.', env: {} }],
        ...stage,
      },
    ],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };
}

describe('T-IR-020 (SEC-03) — container.image must be a real reference', () => {
  it.each([
    'node:20-alpine',
    'node',
    'docker:25',
    'registry.example.com/team/api:1.2.3',
    'registry.example.com:5000/team/api:1.2.3',
    'ghcr.io/owner/image@sha256:' + 'a'.repeat(64),
    'my-registry.io/a.b_c/d:tag_1.2-3',
  ])('accepts %p', (image) => {
    const errors = validate(irWith({ container: { image } }));
    expect(errors.filter((e) => e.path.endsWith('/container/image'))).toEqual([]);
  });

  // The one that matters: the executor builds
  //   docker run --rm ... <image> sh -c <cmd>
  // so a value starting with `-` is read by the Docker CLI as another
  // option and the image slot shifts to `sh`.
  it.each([
    '--privileged',
    '-v/etc:/etc',
    'node:20-alpine --network=host',
    'UPPER:tag',
    'node:20 alpine',
    '',
    'node:',
    ':tag',
    'node:tag with space',
  ])('rejects %p', (image) => {
    const errors = validate(irWith({ container: { image } }));
    const imageErrors = errors.filter((e) => e.path.endsWith('/container/image'));
    expect(imageErrors.length).toBeGreaterThan(0);
    expect(imageErrors[0].acId).toBe('IR-AC-020');
  });
});

describe('T-IR-021 (SEC-04) — env keys must be environment variable names', () => {
  function withEnv(env: Record<string, unknown>): PipelineIR {
    return irWith({
      steps: [
        {
          id: 'install-deps',
          run: 'npm ci',
          workingDir: '.',
          env: env as Record<string, string>,
        },
      ],
    });
  }

  it.each([{ CI: 'true' }, { _PRIVATE: '1' }, { A1_B2: 'x' }, {}])(
    'accepts %p',
    (env) => {
      expect(validate(withEnv(env)).filter((e) => e.path.includes('/env'))).toEqual([]);
    },
  );

  it.each([
    ['a key with a colon', { 'A:B': 'x' }],
    ['a leading dash', { '-flag': 'x' }],
    ['a leading digit', { '1ST': 'x' }],
    ['an empty key', { '': 'x' }],
    ['a dotted key', { 'a.b': 'x' }],
    ['a key with a newline', { 'A\nB': 'x' }],
  ])('rejects %s', (_label, env) => {
    const errors = validate(withEnv(env)).filter((e) => e.acId === 'IR-AC-021');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-string value', () => {
    const errors = validate(withEnv({ OK: 42 })).filter((e) => e.acId === 'IR-AC-021');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('T-IR-022 (SEC-07) — client-supplied nesting is bounded', () => {
  function deepDocument(depth: number): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    let node = root;
    for (let i = 0; i < depth; i++) {
      const next: Record<string, unknown> = {};
      node.nested = next;
      node = next;
    }
    return root;
  }

  it('reports a validation error instead of blowing the stack', () => {
    const ir = irWith({});
    (ir as unknown as Record<string, unknown>).extra = deepDocument(200_000);
    // Before the cap this threw RangeError: Maximum call stack size
    // exceeded, which the controller surfaced as an opaque 500.
    let errors: ReturnType<typeof validate>;
    expect(() => {
      errors = validate(ir);
    }).not.toThrow();
    expect(errors!.some((e) => e.acId === 'IR-AC-022')).toBe(true);
  });

  it('accepts a document at the limit', () => {
    const ir = irWith({});
    (ir as unknown as Record<string, unknown>).extra = deepDocument(MAX_DOCUMENT_DEPTH - 10);
    expect(validate(ir).some((e) => e.acId === 'IR-AC-022')).toBe(false);
  });

  // serializeCanonical and canonicalDigest run on documents that have not
  // necessarily been validated first — the state store and the share-link
  // decoder both canonicalize in order to compare — so the guard cannot
  // live only in the validator.
  it.each([
    ['serializeCanonical', serializeCanonical],
    ['canonicalDigest', canonicalDigest],
  ])('%s is bounded too', (_name, fn) => {
    const ir = irWith({});
    (ir as unknown as Record<string, unknown>).extra = deepDocument(200_000);
    expect(() => fn(ir)).toThrow(/maximum depth/i);
  });

  it('leaves a real IR unaffected', () => {
    expect(validate(irWith({}))).toEqual([]);
    expect(() => serializeCanonical(irWith({}))).not.toThrow();
  });
});
