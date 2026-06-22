// Tests for canonical (deterministic) IR serialization.
//
// Covers T-IR-004 (topological order), T-IR-008 (determinism modulo
// metadata.generatedAt), T-IR-010 (byte-identical canonical JSON), and
// T-IR-011's IR-level half (enabled:false round-trips intact through the
// document).

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  canonicalDigest,
  canonicalEquals,
  canonicalize,
  PipelineIR,
  serializeCanonical,
} from './index';

const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'node-pnpm-nest-basic',
  'expected-ir.json',
);

function loadFixture(): PipelineIR {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as PipelineIR;
}

describe('canonicalize / serialize', () => {
  // ───────────────────────────────────────────────────────────────────────
  // T-IR-004 (IR-AC-004) — canonical form orders stages topologically.
  // Shuffling the input array MUST NOT change the canonical chain order.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-004 (IR-AC-004) — canonical stages are head-to-tail; input order is irrelevant', () => {
    const ir = loadFixture();
    const original = ['install', 'lint', 'test', 'build', 'docker-build'];

    const reversed = { ...ir, stages: [...ir.stages].reverse() };
    expect(canonicalize(reversed).stages.map((s) => s.id)).toEqual(original);

    // A different permutation arrives at the same canonical order.
    const shuffled = {
      ...ir,
      stages: [ir.stages[3], ir.stages[0], ir.stages[4], ir.stages[2], ir.stages[1]],
    };
    expect(canonicalize(shuffled).stages.map((s) => s.id)).toEqual(original);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-008 (IR-AC-008) — determinism modulo metadata.generatedAt.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-008 (IR-AC-008) — two copies differing only in generatedAt canonicalize-equal', () => {
    const a = loadFixture();
    const b = loadFixture();
    b.metadata.generatedAt = '2030-01-01T00:00:00Z';
    expect(canonicalEquals(a, b)).toBe(true);
    expect(canonicalDigest(a)).toBe(canonicalDigest(b));
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-010 (IR-AC-010) — serializeCanonical is byte-identical run-to-run.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-010 (IR-AC-010) — serializeCanonical is byte-identical across calls', () => {
    const ir = loadFixture();
    const a = serializeCanonical(ir);
    const b = serializeCanonical(ir);
    expect(a).toBe(b);
  });

  it('T-IR-010 (IR-AC-010) — key reordering at input produces identical bytes', () => {
    const ir = loadFixture();
    // Build a structurally-equal document with reordered top-level keys.
    const reordered = JSON.parse(
      JSON.stringify({
        metadata: ir.metadata,
        unresolved: ir.unresolved,
        stages: ir.stages,
        triggers: ir.triggers,
        project: ir.project,
        version: ir.version,
      }),
    ) as PipelineIR;
    expect(serializeCanonical(reordered)).toBe(serializeCanonical(ir));
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-011 (IR-AC-011, IR-level half) — enabled:false round-trips intact.
  // The "skipped by Executor / omitted from Artifacts" half is covered by
  // effective-chain.spec.ts and by the future Executor/Generator specs.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-011 (IR-AC-011) — enabled:false survives canonicalization', () => {
    const ir = loadFixture();
    ir.stages[1].enabled = false;

    const round = canonicalize(ir);
    const lint = round.stages.find((s) => s.id === 'lint');
    expect(lint).toBeDefined();
    expect(lint?.enabled).toBe(false);
    expect(lint?.dependsOn).toEqual(['install']);
  });
});
