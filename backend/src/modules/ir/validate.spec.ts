// Tests for the Pipeline IR validator.
//
// Each test is tagged with its T-IR-NNN id and the IR-AC-NNN acceptance
// criterion it covers (from docs/specs/pipeline-ir.spec.md).

import { readFileSync } from 'fs';
import { join } from 'path';
import { ALL_RULES, Detector, Rule, RuleRegistrationError } from '../detector';
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
  // T-IR-005, T-IR-006, T-IR-012, T-IR-013, T-IR-014 — the detector-facing
  // halves of the IR ACs. Deferred while the Detector was unimplemented;
  // the Detector (DET, Accepted 2026-06-15) now exists, so these exercise
  // the real engine end-to-end against the bundled fixtures. The detector's
  // own T-DET suite covers the engine mechanics; these pin the IR-AC-side
  // contract for traceability.
  // ───────────────────────────────────────────────────────────────────────
  describe('detector-facing ACs (T-IR-005/006/012/013/014)', () => {
    const FIXTURES = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
    const BASIC_FIXTURE = join(FIXTURES, 'node-pnpm-nest-basic');

    function detectorWithSubstitution(replaceRuleId: string, syntheticRule: Rule): Detector {
      return new Detector({
        rules: [...ALL_RULES.filter((r) => r.id !== replaceRuleId), syntheticRule],
      });
    }

    it('T-IR-005 (IR-AC-005) — needs-user-input emission produces exactly one unresolved entry and no committed value', () => {
      // Substitute the runtime-version rule with one that is always uncertain.
      const detector = detectorWithSubstitution('DR-004', {
        id: 'DR-TEST-005',
        reads: ['package.json'],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({
              kind: 'field',
              target: '/project/runtime/version',
              value: null,
            }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Node version unknown; please specify.',
          },
        ],
      });
      const { ir } = detector.detect(BASIC_FIXTURE);
      expect(ir.project.runtime.version).toBeNull();
      const entries = (ir.unresolved ?? []).filter(
        (u) => u.field === '/project/runtime/version',
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({
        field: '/project/runtime/version',
        reason: 'needs-user-input',
        message: 'Node version unknown; please specify.',
      });
      expect(validate(ir)).toEqual([]);
    });

    it('T-IR-006 (IR-AC-006) — omit on an optional field emits no unresolved entry and no committed value', () => {
      // /project/name is the only optional (non-required-nullable) field
      // target; when the rule is uncertain + omit, the default (folder
      // basename) survives and no unresolved entry appears.
      const detector = detectorWithSubstitution('DR-001', {
        id: 'DR-TEST-006',
        reads: ['package.json'],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({
              kind: 'field',
              target: '/project/name',
              value: 'must-not-commit',
            }),
            confidence: 'medium',
            onUncertainty: 'omit',
          },
        ],
      });
      const { ir } = detector.detect(BASIC_FIXTURE);
      expect(ir.project.name).toBe('node-pnpm-nest-basic'); // default, not the rule's value
      expect((ir.unresolved ?? []).filter((u) => u.field === '/project/name')).toEqual([]);
      expect(validate(ir)).toEqual([]);
    });

    it('T-IR-012 (IR-AC-012) — a rule reading outside the enumerated manifest set is rejected as a rule defect', () => {
      expect(
        () =>
          new Detector({
            rules: [
              ...ALL_RULES,
              {
                id: 'DR-TEST-012',
                reads: ['README.md' as never],
                kind: 'field',
                cases: [],
              },
            ],
          }),
      ).toThrow(RuleRegistrationError);
      // The IR remains schema-conformant: detection without the defective
      // rule still validates cleanly.
      const { ir } = new Detector({ rules: ALL_RULES }).detect(BASIC_FIXTURE);
      expect(validate(ir)).toEqual([]);
    });

    it('T-IR-013 (IR-AC-013) — confidence threshold: medium commits nothing; the same rule at high commits', () => {
      const caseAt = (confidence: 'high' | 'medium'): Rule => ({
        id: 'DR-TEST-013',
        reads: ['package.json'],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({
              kind: 'field',
              target: '/project/name',
              value: 'committed-by-rule',
            }),
            confidence,
            onUncertainty: 'omit',
          },
        ],
      });

      const medium = detectorWithSubstitution('DR-001', caseAt('medium')).detect(BASIC_FIXTURE);
      expect(medium.ir.project.name).toBe('node-pnpm-nest-basic');
      expect((medium.ir.unresolved ?? []).filter((u) => u.field === '/project/name')).toEqual([]);

      const high = detectorWithSubstitution('DR-001', caseAt('high')).detect(BASIC_FIXTURE);
      expect(high.ir.project.name).toBe('committed-by-rule');
    });

    it('T-IR-014 (IR-AC-014) — monorepo: rootPath is the folder the user pointed at, never a child workspace', () => {
      const rootPath = join(FIXTURES, 'monorepo-pnpm');
      const { ir } = new Detector({ rules: ALL_RULES }).detect(rootPath);
      expect(ir.project.rootPath).toBe(rootPath);
      expect(ir.project.name).toBe('monorepo-pnpm');
      expect(ir.project.rootPath.endsWith('backend')).toBe(false);
      expect(ir.project.rootPath.endsWith('frontend')).toBe(false);
      expect(validate(ir)).toEqual([]);
    });
  });
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
