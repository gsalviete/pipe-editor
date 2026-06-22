// Tests for the shared disabled-stage splice algorithm (IR-FR-014).
//
// Covers T-IR-015 (IR-AC-015) plus the splice edge cases verified by the
// reviewer by hand: disabled head, disabled tail, consecutive disabled,
// all disabled.

import { readFileSync } from 'fs';
import { join } from 'path';
import { computeEffectiveChain, PipelineIR, validate } from './index';

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

function ids(chain: { id: string }[]): string[] {
  return chain.map((s) => s.id);
}

describe('computeEffectiveChain', () => {
  // ───────────────────────────────────────────────────────────────────────
  // T-IR-015 (IR-AC-015) — disabled middle stage splices out cleanly.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-015 (IR-AC-015) — disabling Lint yields Install → Test → Build → Docker', () => {
    const ir = loadFixture();
    ir.stages[1].enabled = false; // disable `lint`

    const chain = computeEffectiveChain(ir);
    expect(ids(chain)).toEqual(['install', 'test', 'build', 'docker-build']);

    // Test's effective dependsOn now points directly at install.
    const test = chain.find((s) => s.id === 'test');
    expect(test?.dependsOn).toEqual(['install']);

    // The original IR document is unchanged — lint is still present, disabled,
    // with its original dependsOn.
    expect(ir.stages[1].id).toBe('lint');
    expect(ir.stages[1].enabled).toBe(false);
    expect(ir.stages[1].dependsOn).toEqual(['install']);

    // The effective chain still satisfies the linear-chain rule.
    const reIR: PipelineIR = { ...ir, stages: chain };
    expect(validate(reIR).filter((e) => e.acId === 'IR-AC-007')).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Edge cases the reviewer verified by hand. The splice MUST preserve a
  // valid linear chain in each one.
  // ───────────────────────────────────────────────────────────────────────
  describe('splice edge cases', () => {
    it('disabled head: next stage becomes the new head', () => {
      const ir = loadFixture();
      ir.stages[0].enabled = false; // disable `install`

      const chain = computeEffectiveChain(ir);
      expect(ids(chain)).toEqual(['lint', 'test', 'build', 'docker-build']);
      expect(chain[0].dependsOn).toEqual([]); // new head
    });

    it('disabled tail: predecessor becomes the new tail', () => {
      const ir = loadFixture();
      ir.stages[4].enabled = false; // disable `docker-build`

      const chain = computeEffectiveChain(ir);
      expect(ids(chain)).toEqual(['install', 'lint', 'test', 'build']);
      // build's dependsOn is unchanged; it just has no successor in the effective chain.
      expect(chain[chain.length - 1].id).toBe('build');
    });

    it('consecutive disabled stages: transitive splice across both', () => {
      const ir = loadFixture();
      ir.stages[1].enabled = false; // disable lint
      ir.stages[2].enabled = false; // disable test

      const chain = computeEffectiveChain(ir);
      expect(ids(chain)).toEqual(['install', 'build', 'docker-build']);

      // build now depends directly on install (skipping the two disabled stages).
      const build = chain.find((s) => s.id === 'build');
      expect(build?.dependsOn).toEqual(['install']);
    });

    it('all stages disabled: effective chain is empty', () => {
      const ir = loadFixture();
      for (const s of ir.stages) s.enabled = false;

      expect(computeEffectiveChain(ir)).toEqual([]);
    });

    it('empty stages array: effective chain is empty', () => {
      const ir = loadFixture();
      ir.stages = [];
      expect(computeEffectiveChain(ir)).toEqual([]);
    });

    it('does NOT mutate the input IR', () => {
      const ir = loadFixture();
      const before = JSON.stringify(ir);
      ir.stages[2].enabled = false;
      computeEffectiveChain(ir);
      // The splice should not have mutated the IR document beyond what we did
      // ourselves (flipping enabled); the dependsOn arrays on every stage are
      // untouched.
      const after = JSON.stringify(ir);
      // Re-flip and check structural identity.
      ir.stages[2].enabled = true;
      expect(JSON.stringify(ir)).toBe(before);
      expect(after).not.toBe(before); // sanity check
    });
  });
});
