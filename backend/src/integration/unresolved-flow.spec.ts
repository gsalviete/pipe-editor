// T-FLOW-001…003 — the whole journey for a project that does not look
// like the original fixtures.
//
// The adversarial review's TEST-01: every one of the 11 original fixtures
// declared `engines.node`, so 290 green tests never exercised the path an
// ordinary Node project actually takes. These tests assert the FULL flow
// — detect → refuse → resolve → generate → export — not just detection.

import { join } from 'path';
import { generateGithubActions, generateGitlabCi } from '../modules/ci-export';
import { ALL_RULES, Detector } from '../modules/detector';
import { generate } from '../modules/dockerfile-generator';
import {
  findUnrunnableReason,
  resolveProjectField,
  validate,
  type PipelineIR,
} from '../modules/ir';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures');

function detect(fixture: string): PipelineIR {
  return new Detector({ rules: ALL_RULES }).detect(join(FIXTURES, fixture)).ir;
}

describe('T-FLOW-001 — a Node project that declares no version anywhere', () => {
  // A plain project declares neither `engines.node` nor `packageManager`,
  // so TWO required fields land unresolved — the runtime version and the
  // package-manager version. Both used to be unreachable from the UI.
  it('detects into a valid IR with two required fields unresolved', () => {
    const ir = detect('node-npm-no-engines');
    expect(validate(ir)).toEqual([]);
    expect(ir.project.runtime.version).toBeNull();
    expect(ir.project.packageManager.version).toBeNull();
    expect((ir.unresolved ?? []).map((u) => u.field).sort()).toEqual([
      '/project/packageManager/version',
      '/project/runtime/version',
    ]);
    // Everything the manifests *do* say is resolved.
    expect(ir.project.packageManager.name).toBe('npm');
    expect(ir.project.runtime.name).toBe('node');
    expect(ir.project.language).toBe('typescript');
  });

  it('is refused by generate and export while the field is unresolved', () => {
    const ir = detect('node-npm-no-engines');
    expect(findUnrunnableReason(ir)).toEqual({
      kind: 'unresolved-required-field',
      field: '/project/packageManager/version',
    });
    expect(() => generate(ir)).toThrow();
    // GEN-08: all three generators refuse, not just the Dockerfile one.
    expect(() => generateGithubActions(ir)).toThrow(/unresolved/i);
    expect(() => generateGitlabCi(ir)).toThrow(/unresolved/i);
  });

  // The point of the whole exercise: the dead end now has an exit.
  it('becomes generatable and exportable once the field is resolved', () => {
    let resolved = detect('node-npm-no-engines');
    // Resolve them one at a time; the invariant must hold in between.
    resolved = resolveProjectField(resolved, '/project/runtime/version', '20');
    expect(validate(resolved)).toEqual([]);
    resolved = resolveProjectField(resolved, '/project/packageManager/version', '10');

    expect(validate(resolved)).toEqual([]);
    expect(findUnrunnableReason(resolved)).toBeNull();
    expect(resolved.unresolved).toBeUndefined();

    const { dockerfile, dockerignore } = generate(resolved);
    expect(dockerfile).toContain('FROM node:20-alpine');
    expect(dockerignore).toContain('node_modules');

    for (const exporter of [generateGithubActions, generateGitlabCi]) {
      const artifact = exporter(resolved);
      expect(artifact.content.length).toBeGreaterThan(0);
    }
  });

  it('still emits the full stage chain despite the unresolved version', () => {
    const ir = detect('node-npm-no-engines');
    expect(ir.stages.map((s) => s.id)).toEqual([
      'install',
      'lint',
      'test',
      'build',
      'docker-build',
    ]);
    // The documented coherence: images fall back while the field is null.
    expect(ir.stages[0].container.image).toBe('node:lts-alpine');
  });
});

describe('T-FLOW-002 (GEN-04) — a declared package manager with no lockfile', () => {
  function detectFull(fixture: string) {
    return new Detector({ rules: ALL_RULES }).detect(join(FIXTURES, fixture));
  }

  it('detects as pnpm from the packageManager field alone', () => {
    const ir = detect('node-pm-field-no-lockfile');
    expect(validate(ir)).toEqual([]);
    expect(ir.project.packageManager).toEqual({ name: 'pnpm', version: '9' });
    expect(findUnrunnableReason(ir)).toBeNull();
  });

  // The command used to be `pnpm install --frozen-lockfile`, which aborts
  // outright when there is no lockfile — presented as a finished artifact.
  it('emits a resolving install, not a frozen one', () => {
    const ir = detect('node-pm-field-no-lockfile');
    const install = ir.stages.find((s) => s.id === 'install');
    expect(install?.steps[0].run).toBe('corepack enable && pnpm install');
    expect(install?.steps[0].run).not.toContain('--frozen-lockfile');
  });

  it('warns that the pipeline is not reproducible without a lockfile', () => {
    const { warnings } = detectFull('node-pm-field-no-lockfile');
    const lockWarning = warnings.find((w) => w.manifest === 'pnpm-lock.yaml');
    expect(lockWarning).toBeDefined();
    expect(lockWarning!.message).toMatch(/no pnpm-lock\.yaml was found/i);
    expect(lockWarning!.message).toMatch(/reproducible/i);
  });

  it('generates a Dockerfile that can actually build', () => {
    const { dockerfile } = generate(detect('node-pm-field-no-lockfile'));
    // The COPY tolerates the missing lockfile...
    expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml* ./');
    // ...and the install does not demand one.
    expect(dockerfile).not.toContain('--frozen-lockfile');
    expect(dockerfile).toContain('RUN pnpm install');
  });

  it('still emits a frozen install when the lockfile is present', () => {
    const ir = detect('node-pnpm-nest-basic');
    const install = ir.stages.find((s) => s.id === 'install');
    expect(install?.steps[0].run).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(generate(ir).dockerfile).toContain('--frozen-lockfile');
    expect(detectFull('node-pnpm-nest-basic').warnings).toEqual([]);
  });
});

describe('T-FLOW-003 — fixture goldens agree with their own manifests', () => {
  // Regression lock for a defect found while writing these fixtures: two
  // checked-in expected-ir.json files declared npm/yarn but carried the
  // pnpm install command, copy-pasted from the pnpm fixture. The Dockerfile
  // generator branches on packageManager.name and ignores the step's text,
  // so its goldens passed and nothing noticed — but CI export and the
  // executor emit step.run verbatim.
  const INSTALL_BY_PM: Record<string, string> = {
    npm: 'npm ci',
    pnpm: 'corepack enable && pnpm install --frozen-lockfile',
    yarn: 'corepack enable && yarn install --frozen-lockfile',
  };

  const goldens = ['node-npm-nest-basic', 'node-yarn-nest-basic', 'node-pnpm-nest-basic'];

  it.each(goldens)("%s's install command matches its declared package manager", (fixture) => {
    const ir = JSON.parse(
      require('fs').readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
    ) as PipelineIR;
    const pm = ir.project.packageManager.name;
    const install = ir.stages.find((s) => s.id === 'install');
    expect(pm).not.toBeNull();
    expect(install?.steps[0].run).toBe(INSTALL_BY_PM[pm as string]);
  });
});
