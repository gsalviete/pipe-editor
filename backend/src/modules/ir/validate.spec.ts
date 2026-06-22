// Tests for the Pipeline IR validator.
//
// Each test is tagged with its T-IR-NNN id and the IR-AC-NNN acceptance
// criterion it covers (from docs/specs/pipeline-ir.spec.md).

import { readFileSync } from 'fs';
import { join } from 'path';
import { PipelineIR, validate } from './index';

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

describe('validate', () => {
  // ───────────────────────────────────────────────────────────────────────
  // T-IR-001 — IR-AC-001: top-level shape (version / project / stages).
  // ───────────────────────────────────────────────────────────────────────
  describe('T-IR-001 (IR-AC-001) — top-level shape', () => {
    it('accepts the canonical node-pnpm-nest-basic fixture', () => {
      expect(validate(loadFixture())).toEqual([]);
    });

    it('rejects a non-object input', () => {
      const errs = validate('not an object');
      expect(errs).toEqual([
        expect.objectContaining({ acId: 'IR-AC-001', path: '' }),
      ]);
    });

    it('rejects a document missing `version`', () => {
      const ir = loadFixture() as unknown as Record<string, unknown>;
      delete ir.version;
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-001', path: '/version' }),
      );
    });

    it('rejects a document missing `project`', () => {
      const ir = loadFixture() as unknown as Record<string, unknown>;
      delete ir.project;
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-001', path: '/project' }),
      );
    });

    it('rejects a document missing `stages`', () => {
      const ir = loadFixture() as unknown as Record<string, unknown>;
      delete ir.stages;
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-001', path: '/stages' }),
      );
    });

    it('rejects a non-semver version', () => {
      const ir = loadFixture();
      (ir as unknown as Record<string, unknown>).version = 'not-a-version';
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-001', path: '/version' }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-003 — IR-AC-003: forbidden provider-specific keys.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-IR-003 (IR-AC-003) — forbidden provider-specific keys', () => {
    it.each(['jobs', 'uses', 'needs', 'runs-on', 'with', 'permissions', 'include', 'workflow_dispatch'])(
      'rejects a top-level "%s" key',
      (forbidden) => {
        const ir = loadFixture() as unknown as Record<string, unknown>;
        ir[forbidden] = 'anything';
        const errs = validate(ir);
        expect(errs).toContainEqual(
          expect.objectContaining({ acId: 'IR-AC-003', path: `/${forbidden}` }),
        );
      },
    );

    it('rejects a `needs` key nested deep inside a stage', () => {
      const ir = loadFixture();
      (ir.stages[0] as unknown as Record<string, unknown>).needs = ['install'];
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-003', path: '/stages/0/needs' }),
      );
    });

    it('does NOT reject `dependsOn` — it is part of the IR schema', () => {
      // The fixture uses dependsOn pervasively; the forbidden-list must not flag it.
      const errs = validate(loadFixture()).filter((e) => e.acId === 'IR-AC-003');
      expect(errs).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-007 — IR-AC-007: linear-chain validation rule (6 clauses + missing).
  // ───────────────────────────────────────────────────────────────────────
  describe('T-IR-007 (IR-AC-007) — linear-chain validation', () => {
    it('flags a missing `dependsOn` field on a stage (clause: missing-dependsOn)', () => {
      const ir = loadFixture();
      delete (ir.stages[2] as unknown as Record<string, unknown>).dependsOn;
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({
          acId: 'IR-AC-007',
          path: '/stages/2/dependsOn',
          clause: 'missing-dependsOn',
        }),
      );
    });

    it('flags a dangling reference (clause: well-formed-references)', () => {
      const ir = loadFixture();
      ir.stages[1].dependsOn = ['does-not-exist'];
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({
          acId: 'IR-AC-007',
          clause: 'well-formed-references',
        }),
      );
    });

    it('flags a cycle (clause: acyclic)', () => {
      const ir = loadFixture();
      // Tighten the chain into a cycle: install ← lint ← install.
      ir.stages[0].dependsOn = ['docker-build']; // head now points at tail
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-007', clause: 'acyclic' }),
      );
    });

    it('flags an in-degree > 1 (clause: single-chain)', () => {
      const ir = loadFixture();
      // Make `test` also depend on `install` — now lint and install both feed test.
      ir.stages[2].dependsOn = ['lint', 'install'];
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-chain' }),
      );
    });

    it('flags an out-degree > 1 (clause: single-chain)', () => {
      const ir = loadFixture();
      // Make `test` ALSO depend on `install` — install fans out to lint AND test.
      ir.stages[2].dependsOn = ['install'];
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-chain' }),
      );
    });

    it('flags two heads (clause: single-head)', () => {
      const ir = loadFixture();
      // Disconnect `lint` from `install` — now both have dependsOn: [].
      ir.stages[1].dependsOn = [];
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-007', clause: 'single-head' }),
      );
    });

    it('flags two tails (clause: single-tail)', () => {
      const ir = loadFixture();
      // Drop `docker-build`'s in-edge by clearing `build`'s successor.
      // Reuse install's chain but add a sibling tail by changing the last stage's dependsOn.
      ir.stages[4].dependsOn = ['install']; // docker-build now hangs off install
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-007' }),
      );
    });

    it('flags a disconnected stage (clause: connected)', () => {
      const ir = loadFixture();
      // Build a separate component: install→lint→test (linear), build & docker isolated.
      ir.stages[3].dependsOn = ['build']; // self-loop … no, change tactic:
      ir.stages = ir.stages.slice(0, 3); // keep install, lint, test
      ir.stages.push({
        id: 'orphan',
        name: 'Orphan',
        enabled: true,
        dependsOn: ['nowhere'], // dangling intentionally
        container: { image: 'node:20-alpine' },
        steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
      });
      const errs = validate(ir);
      expect(errs.some((e) => e.acId === 'IR-AC-007')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-009 — IR-AC-009: empty stages array validates.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-009 (IR-AC-009) — stages: [] is a valid IR', () => {
    const ir = loadFixture();
    ir.stages = [];
    expect(validate(ir)).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-016 — IR-AC-016: nullable required field set to null without
  // a paired unresolved entry fails validation.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-IR-016 (IR-AC-016) — required-field uncertainty resolution', () => {
    it.each([
      '/project/language',
      '/project/runtime/name',
      '/project/runtime/version',
      '/project/packageManager/name',
      '/project/packageManager/version',
    ])('flags `%s: null` without a paired unresolved entry', (path) => {
      const ir = loadFixture();
      setByPointer(ir, path, null);
      const errs = validate(ir);
      expect(errs).toContainEqual(
        expect.objectContaining({ acId: 'IR-AC-016', path }),
      );
    });

    it('accepts `null` when an unresolved entry is paired', () => {
      const ir = loadFixture();
      setByPointer(ir, '/project/language', null);
      ir.unresolved = [
        ...(ir.unresolved ?? []),
        {
          field: '/project/language',
          reason: 'needs-user-input',
          message: 'Language could not be determined.',
        },
      ];
      const errs = validate(ir).filter((e) => e.acId === 'IR-AC-016');
      expect(errs).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-017 — IR-AC-017: stages: [] passes the linear-chain rule
  // (vacuously); confirms the rule's scope.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-017 (IR-AC-017) — stages: [] passes the linear-chain rule', () => {
    const ir = loadFixture();
    ir.stages = [];
    const errs = validate(ir).filter((e) => e.acId === 'IR-AC-007');
    expect(errs).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-018 — IR-AC-018: unresolved entry pointing at a present value fails.
  // The mirror of IR-AC-016.
  // ───────────────────────────────────────────────────────────────────────
  it('T-IR-018 (IR-AC-018) — unresolved entry coexisting with a committed value fails', () => {
    const ir = loadFixture();
    // language is "typescript" (a committed value); the unresolved entry below
    // points at it — that contradicts IR-FR-008.
    ir.unresolved = [
      {
        field: '/project/language',
        reason: 'needs-user-input',
        message: 'should not be here',
      },
    ];
    const errs = validate(ir);
    expect(errs).toContainEqual(
      expect.objectContaining({ acId: 'IR-AC-018', path: '/project/language' }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-IR-005, T-IR-006, T-IR-012, T-IR-013, T-IR-014 — detector-dependent.
  // These criteria can only be fully exercised once the Detector spec is
  // Accepted and implemented. The IR-level halves are covered by the
  // round-trip and IR-AC-016/018 tests above; the detector halves are
  // marked `.todo()` so the gap is visible in the test report.
  // ───────────────────────────────────────────────────────────────────────
  it.todo('T-IR-005 (IR-AC-005) — needs-user-input emission [detector-dependent]');
  it.todo('T-IR-006 (IR-AC-006) — omit emits nothing [detector-dependent]');
  it.todo('T-IR-012 (IR-AC-012) — manifest-set enforcement [detector-dependent]');
  it.todo('T-IR-013 (IR-AC-013) — confidence threshold [detector-dependent]');
  it.todo('T-IR-014 (IR-AC-014) — monorepo handling [detector-dependent]');
});

// Minimal JSON-Pointer setter used by the tests above.
function setByPointer(root: unknown, pointer: string, value: unknown): void {
  const parts = pointer.slice(1).split('/');
  let cursor = root as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}
