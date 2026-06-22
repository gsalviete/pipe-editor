// Detector Engine tests — T-DET-001…019, mapped 1:1 to the spec's ACs.
//
// Goldens live at test/fixtures/<name>/expected-ir.json. The
// node-pnpm-nest-basic fixture also carries real project sources so
// T-DET-008 can run a real `docker build .`.

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generate } from '../dockerfile-generator';
import {
  canonicalDigest,
  canonicalize,
  PipelineIR,
  Stage,
  validate,
} from '../ir';
import {
  ALL_RULES,
  Detector,
  MalformedPackageJsonError,
  NoManifestError,
  NoRootDirError,
  Rule,
  RuleConflictError,
  RuleRegistrationError,
} from './index';

const FIXTURES = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
const FIXTURE_PLACEHOLDER_PATH = '/abs/path/to/node-pnpm-nest-basic';
const FIXTURE_PLACEHOLDER_TIMESTAMP = '2026-06-15T10:00:00Z';

function loadExpected(fixture: string): PipelineIR {
  return JSON.parse(readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8')) as PipelineIR;
}

function newDetector(): Detector {
  return new Detector({ rules: ALL_RULES });
}

// For synthetic-rule scenarios that target one /project/* field, swap out the
// real DR-NNN that emits there so the synthetic rule is the sole producer for
// that field while the remaining rules still fill in the other required nullable
// fields (otherwise validate() complains about unfilled required fields).
function detectorWithSubstitution(replaceRuleId: string, syntheticRule: Rule): Detector {
  return new Detector({
    rules: [...ALL_RULES.filter((r) => r.id !== replaceRuleId), syntheticRule],
  });
}

// Normalize machine-specific fields so byte-equality is meaningful.
function normalize(ir: PipelineIR, rootPathPlaceholder: string): PipelineIR {
  const clone = JSON.parse(JSON.stringify(ir)) as PipelineIR;
  clone.project.rootPath = rootPathPlaceholder;
  clone.metadata.generatedAt = FIXTURE_PLACEHOLDER_TIMESTAMP;
  return clone;
}

describe('Detector Engine', () => {
  // ───────────────────────────────────────────────────────────────────────
  // T-DET-001 (DET-AC-001) — regression-lock against expected-ir.json.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-001 (DET-AC-001) — node-pnpm-nest-basic detects to expected IR (modulo rootPath + generatedAt)', () => {
    const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    const expected = loadExpected('node-pnpm-nest-basic');
    const normalized = normalize(ir, FIXTURE_PLACEHOLDER_PATH);
    expect(canonicalDigest(normalized)).toBe(canonicalDigest(canonicalize(expected)));
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-002 (DET-AC-002) — manifest-set frontier audit.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-002 (DET-AC-002) — rule reading outside the manifest set is refused at construction', () => {
    const badRule: Rule = {
      id: 'DR-BAD',
      reads: ['src/main.ts' as unknown as 'package.json'],
      kind: 'field',
      cases: [],
    };
    expect(() => new Detector({ rules: [badRule] })).toThrow(RuleRegistrationError);
    try {
      new Detector({ rules: [badRule] });
    } catch (e) {
      expect((e as Error).message).toContain('DR-BAD');
      expect((e as Error).message).toContain('src/main.ts');
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-003 (DET-AC-003) — IR-FR-009 truth table on synthetic cases.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-DET-003 (DET-AC-003) — IR-FR-009 truth table', () => {
    it('high → committed value', () => {
      const r: Rule = {
        id: 'DR-T1',
        reads: [],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
            confidence: 'high',
            onUncertainty: 'omit',
          },
        ],
      };
      const { ir } = detectorWithSubstitution('DR-002', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
      expect(ir.project.language).toBe('typescript');
    });

    it('medium + omit on a required field → collapses to unresolved', () => {
      const r: Rule = {
        id: 'DR-T2',
        reads: [],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
            confidence: 'medium',
            onUncertainty: 'omit',
          },
        ],
      };
      // /project/language is required nullable; medium+omit collapses to unresolved.
      const { ir } = detectorWithSubstitution('DR-002', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
      expect(ir.project.language).toBeNull();
      expect(ir.unresolved?.some((u) => u.field === '/project/language')).toBe(true);
    });

    it('medium + assume-default → committed default', () => {
      const r: Rule = {
        id: 'DR-T3',
        reads: [],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/language', value: 'IGNORED' }),
            confidence: 'medium',
            onUncertainty: 'assume-default',
            default: 'javascript',
          },
        ],
      };
      const { ir } = detectorWithSubstitution('DR-002', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
      expect(ir.project.language).toBe('javascript');
    });

    it('medium + needs-user-input → unresolved with message', () => {
      const r: Rule = {
        id: 'DR-T4',
        reads: [],
        kind: 'field',
        cases: [
          {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/language', value: null }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Pick a language.',
          },
        ],
      };
      const { ir } = detectorWithSubstitution('DR-002', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
      const u = (ir.unresolved ?? []).find((x) => x.field === '/project/language');
      expect(u?.message).toBe('Pick a language.');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-004 (DET-AC-004) — required-field collapse synthesizes message.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-004 (DET-AC-004) — required-field collapse synthesizes a non-empty message when none supplied', () => {
    const r: Rule = {
      id: 'DR-T-COLLAPSE',
      reads: [],
      kind: 'field',
      cases: [
        {
          condition: () => true,
          emit: () => ({ kind: 'field', target: '/project/runtime/version', value: null }),
          confidence: 'medium',
          onUncertainty: 'omit',
        },
      ],
    };
    const { ir } = detectorWithSubstitution('DR-004', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    const u = (ir.unresolved ?? []).find((x) => x.field === '/project/runtime/version');
    expect(u).toBeDefined();
    expect(u?.message.length).toBeGreaterThan(0);
    expect(u?.message).toContain('/project/runtime/version');
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-005 (DET-AC-005) — determinism modulo generatedAt.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-005 (DET-AC-005) — two consecutive detect() calls produce IRs equal modulo generatedAt', () => {
    const d = newDetector();
    const a = d.detect(join(FIXTURES, 'node-pnpm-nest-basic')).ir;
    const b = d.detect(join(FIXTURES, 'node-pnpm-nest-basic')).ir;
    expect(canonicalDigest(a)).toBe(canonicalDigest(b));
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-006 (DET-AC-006) — Stage and Step IDs match expected fixture.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-006 (DET-AC-006) — Stage and Step IDs match the fixture', () => {
    const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    expect(ir.stages.map((s) => s.id)).toEqual(['install', 'lint', 'test', 'build', 'docker-build']);
    for (const s of ir.stages) expect(s.steps.length).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-007 (DET-AC-007) — produced IR validates.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-007 (DET-AC-007) — produced IR has zero ValidationErrors', () => {
    const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    expect(validate(ir)).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-008 (DET-AC-008) — END-TO-END: docker build succeeds.
  // ───────────────────────────────────────────────────────────────────────
  const dockerAvailable = (() => {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  (dockerAvailable ? it : it.skip)(
    'T-DET-008 (DET-AC-008) — generate(detect(...)) → real `docker build .` succeeds',
    () => {
      const rootPath = join(FIXTURES, 'node-pnpm-nest-basic');
      const { ir } = newDetector().detect(rootPath);
      const { dockerfile, dockerignore } = generate(ir);

      // Work in a temp staging dir that mirrors the fixture's read-relevant files,
      // including the lockfile so `pnpm install --frozen-lockfile` is reproducible.
      const stage = mkdtempSync(join(tmpdir(), 'pipe-editor-det008-'));
      try {
        for (const f of [
          'package.json',
          'pnpm-lock.yaml',
          'nest-cli.json',
          'tsconfig.json',
          'src/main.ts',
          'src/app.module.ts',
          'src/app.controller.ts',
        ]) {
          const src = join(rootPath, f);
          const dst = join(stage, f);
          execSync(`mkdir -p "${dst.split('/').slice(0, -1).join('/')}"`);
          writeFileSync(dst, readFileSync(src));
        }
        writeFileSync(join(stage, 'Dockerfile'), dockerfile);
        writeFileSync(join(stage, '.dockerignore'), dockerignore);

        execSync(`docker build -t pipe-editor-fixture-test:ci .`, {
          cwd: stage,
          stdio: 'inherit',
          timeout: 480_000,
        });
      } finally {
        rmSync(stage, { recursive: true, force: true });
        try {
          execSync('docker image rm -f pipe-editor-fixture-test:ci', { stdio: 'ignore' });
        } catch {
          /* ignore cleanup failure */
        }
      }
    },
    540_000,
  );
  if (!dockerAvailable) {
    // eslint-disable-next-line no-console
    console.log('T-DET-008 skipped: docker CLI not available on this host');
  }

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-009 (DET-AC-009) — no scripts → install + docker-build only.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-009 (DET-AC-009) — package.json with no scripts emits install + docker-build only', () => {
    const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-no-scripts'));
    expect(ir.stages.map((s) => s.id)).toEqual(['install', 'docker-build']);
    expect(ir.stages[1].dependsOn).toEqual(['install']);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-010 (DET-AC-010) — lint present, test absent.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-010 (DET-AC-010) — lint emitted, test omitted; chain install→lint→build→docker-build', () => {
    const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-no-tests'));
    expect(ir.stages.map((s) => s.id)).toEqual(['install', 'lint', 'build', 'docker-build']);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-011 (DET-AC-011) — multi-lockfile precedence.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-DET-011 (DET-AC-011) — multi-lockfile precedence', () => {
    it('pnpm-lock + package-lock, no packageManager field → pnpm wins', () => {
      const { ir } = newDetector().detect(join(FIXTURES, 'node-pnpm-both-lockfiles'));
      expect(ir.project.packageManager.name).toBe('pnpm');
    });

    it('yarn.lock + package-lock, no packageManager field → yarn wins', () => {
      const { ir } = newDetector().detect(join(FIXTURES, 'node-yarn-npm-both-lockfiles'));
      expect(ir.project.packageManager.name).toBe('yarn');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-012 (DET-AC-012) — monorepo: top-level only.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-012 (DET-AC-012) — monorepo: rootPath is the top-level folder; sub-packages not descended', () => {
    const rootPath = join(FIXTURES, 'monorepo-pnpm');
    const { ir } = newDetector().detect(rootPath);
    expect(ir.project.rootPath).toBe(rootPath);
    expect(ir.project.name).toBe('monorepo-pnpm');
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-013 (DET-AC-013) — rule case order honored.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-013 (DET-AC-013) — first matching case wins; case order is honored', () => {
    const r: Rule = {
      id: 'DR-T-ORDER',
      reads: [],
      kind: 'field',
      cases: [
        {
          condition: () => true,
          emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
          confidence: 'high',
          onUncertainty: 'omit',
        },
        {
          condition: () => true,
          emit: () => ({ kind: 'field', target: '/project/language', value: 'javascript' }),
          confidence: 'high',
          onUncertainty: 'omit',
        },
      ],
    };
    const { ir } = detectorWithSubstitution('DR-002', r).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    expect(ir.project.language).toBe('typescript');
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-014 (DET-AC-014) — invalid Stage id rejected; rule conflict surfaced.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-DET-014 (DET-AC-014) — Stage id audit + rule conflict', () => {
    it('non-canonical Stage id is rejected at detect time with the offending rule', () => {
      const badStageStage: Stage = {
        id: 'wat',
        name: 'wat',
        enabled: true,
        dependsOn: [],
        container: { image: 'docker:25' },
        steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
      };
      const r: Rule = {
        id: 'DR-T-WAT',
        reads: [],
        kind: 'stage',
        cases: [
          {
            condition: () => true,
            emit: () => ({ kind: 'stage', stage: badStageStage }),
            confidence: 'high',
            onUncertainty: 'omit',
          },
        ],
      };
      expect(() =>
        new Detector({ rules: [...ALL_RULES, r] }).detect(join(FIXTURES, 'node-pnpm-nest-basic')),
      ).toThrow(/DR-T-WAT.*wat/);
    });

    it('two rules emitting the same canonical Stage id throw a conflict naming both rules', () => {
      const dupInstall: Rule = {
        id: 'DR-T-DUP-INSTALL',
        reads: [],
        kind: 'stage',
        cases: [
          {
            condition: () => true,
            emit: () => ({
              kind: 'stage',
              stage: {
                id: 'install',
                name: 'Install (dup)',
                enabled: true,
                dependsOn: [],
                container: { image: 'node:20-alpine' },
                steps: [{ id: 'dup-install', run: 'echo dup', workingDir: '.', env: {} }],
              },
            }),
            confidence: 'high',
            onUncertainty: 'omit',
          },
        ],
      };
      expect(() =>
        new Detector({ rules: [...ALL_RULES, dupInstall] }).detect(
          join(FIXTURES, 'node-pnpm-nest-basic'),
        ),
      ).toThrow(RuleConflictError);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-015 (DET-AC-015) — defensive read auditing.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-015 (DET-AC-015) — a rule that reads a manifest it did not declare sees undefined', () => {
    let observed: unknown = 'sentinel';
    const r: Rule = {
      id: 'DR-T-PEEK',
      reads: ['tsconfig.json'], // declared only tsconfig
      kind: 'field',
      cases: [
        {
          condition: (ctx) => {
            observed = ctx.manifests['package.json']; // undeclared
            return false;
          },
          emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
          confidence: 'high',
          onUncertainty: 'omit',
        },
      ],
    };
    // Run alongside ALL_RULES so required fields still get filled (the
    // synthetic rule never fires; the production DR-002 continues to emit).
    new Detector({ rules: [...ALL_RULES, r] }).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    expect(observed).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-016 (DET-AC-016) — PM-null total suppression (DET-FR-018(a)).
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-016 (DET-AC-016) — PM-null → stages: [] (all canonical Stages suppressed)', () => {
    // Fixture with scripts but no packageManager field and no lockfile.
    // Use a rule-set override: drop all PM-emitting cases by feeding the
    // detector a fixture that has none.
    const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-pmnull-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'pmnull',
          engines: { node: '20' },
          scripts: { lint: 'eslint .', test: 'jest', build: 'tsc' },
        }),
      );
      writeFileSync(join(dir, 'tsconfig.json'), '{}');
      const { ir } = newDetector().detect(dir);
      expect(ir.project.packageManager.name).toBeNull();
      expect(ir.stages).toEqual([]);
      expect((ir.unresolved ?? []).some((u) => u.field === '/project/packageManager/name')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-017 (DET-AC-017) — package.json hard-throw; tsconfig warn-and-skip.
  // ───────────────────────────────────────────────────────────────────────
  describe('T-DET-017 (DET-AC-017) — parse-error handling', () => {
    it('malformed package.json → hard throw', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-bad-pkg-'));
      try {
        writeFileSync(join(dir, 'package.json'), '{ this is not json,, }');
        expect(() => newDetector().detect(dir)).toThrow(MalformedPackageJsonError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('valid package.json + malformed tsconfig.json → warn-and-continue', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-bad-ts-'));
      try {
        writeFileSync(
          join(dir, 'package.json'),
          JSON.stringify({ name: 'x', engines: { node: '20' }, packageManager: 'pnpm@9.0.0' }),
        );
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
        writeFileSync(join(dir, 'tsconfig.json'), '{ broken json,, }');
        const { ir, warnings } = newDetector().detect(dir);
        expect(warnings.some((w) => w.manifest === 'tsconfig.json')).toBe(true);
        // tsconfig was absent from the engine's view → DR-002 case 2 fires
        // (assume-default 'javascript').
        expect(ir.project.language).toBe('javascript');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-018 (DET-AC-018) — PM known but install absent → orphan drop.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-018 (DET-AC-018) — PM known but install rule omitted → orphaned command Stages dropped, docker-build preserved', () => {
    const rulesNoInstall = ALL_RULES.filter((r) => r.id !== 'DR-007');
    const { ir } = new Detector({ rules: rulesNoInstall }).detect(
      join(FIXTURES, 'node-pnpm-nest-basic'),
    );
    expect(ir.stages.map((s) => s.id)).toEqual(['docker-build']);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-DET-019 (DET-AC-019) — pass-ordering: stage rule reads ctx.ir.project.
  // ───────────────────────────────────────────────────────────────────────
  it('T-DET-019 (DET-AC-019) — stage rule reads ctx.ir.project.runtime.version (committed by step 3)', () => {
    let observedVersion: unknown = 'sentinel';
    const stageRule: Rule = {
      id: 'DR-T-CTX',
      reads: [],
      kind: 'stage',
      cases: [
        {
          condition: (ctx) => {
            observedVersion = ctx.ir.project.runtime.version;
            return false;
          },
          emit: () => ({
            kind: 'stage',
            stage: {
              id: 'install',
              name: 'Install',
              enabled: true,
              dependsOn: [],
              container: { image: 'node:20-alpine' },
              steps: [{ id: 'noop', run: 'true', workingDir: '.', env: {} }],
            },
          }),
          confidence: 'high',
          onUncertainty: 'omit',
        },
      ],
    };
    new Detector({ rules: [...ALL_RULES, stageRule] }).detect(join(FIXTURES, 'node-pnpm-nest-basic'));
    expect(observedVersion).toBe('20');
  });

  // ───────────────────────────────────────────────────────────────────────
  // Engine error paths — sanity.
  // ───────────────────────────────────────────────────────────────────────
  it('throws on missing rootPath', () => {
    expect(() => newDetector().detect('/no/such/path/12345')).toThrow(NoRootDirError);
  });

  it('throws when no manifest is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pipe-editor-empty-'));
    try {
      expect(() => newDetector().detect(dir)).toThrow(NoManifestError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Precondition: fixture sources exist.
  it('precondition: every fixture used in tests exists', () => {
    for (const f of [
      'node-pnpm-nest-basic',
      'node-pnpm-no-tests',
      'node-pnpm-no-scripts',
      'node-pnpm-both-lockfiles',
      'node-yarn-npm-both-lockfiles',
      'monorepo-pnpm',
    ]) {
      expect(existsSync(join(FIXTURES, f, 'package.json'))).toBe(true);
    }
  });
});
