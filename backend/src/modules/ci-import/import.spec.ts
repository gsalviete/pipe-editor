// CI import tests: real-world-shaped GHA + GitLab configs convert to
// VALID IRs, inference fills the project block, unsupported constructs
// warn instead of failing, and pipe-editor's own exports round-trip.

import { readFileSync } from 'fs';
import { join } from 'path';
import { validate, type PipelineIR } from '../ir';
import { generateGithubActions, generateGitlabCi } from '../ci-export';
import {
  importCiConfig,
  importGithubActions,
  importGitlabCi,
  mergeDetectedProjectFacts,
  sniffProvider,
} from './index';

const GHA_SAMPLE = `
name: Node CI
on:
  push:
    branches: [main, develop]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install deps
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm lint
      - uses: codecov/codecov-action@v4
      - name: Compile
        run: pnpm tsc --noEmit
  docker:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - name: Image
        run: docker build -t app:ci .
`;

const GITLAB_SAMPLE = `
stages: [install, test]
default:
  image: node:22-alpine
variables:
  CI_FLAG: 'yes'
install:
  stage: install
  script:
    - corepack enable
    - yarn install --frozen-lockfile
unit:
  stage: test
  image: node:22
  variables:
    NODE_ENV: test
  script: yarn test
lint:
  stage: test
  script:
    - yarn lint
.hidden-template:
  script: [echo hidden]
`;

describe('importGithubActions', () => {
  it('T-CIIMPORT-001 (CIIMPORT-AC-001/008) — jobs → stages, run → steps, actions skipped with warnings, project inferred', () => {
    const { ir, warnings } = importGithubActions(GHA_SAMPLE);

    expect(validate(ir)).toEqual([]);
    expect(ir.stages.map((s) => s.id)).toEqual(['build', 'docker']);
    expect(ir.stages[0].steps.map((s) => s.run)).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm lint',
      'pnpm tsc --noEmit',
    ]);
    expect(ir.stages[1].dependsOn).toEqual(['build']);
    expect(ir.triggers?.[0].branches).toEqual(['main', 'develop']);

    // Inference: pnpm + setup-node 20 + tsc.
    expect(ir.project.packageManager.name).toBe('pnpm');
    expect(ir.project.runtime).toEqual({ name: 'node', version: '20' });
    expect(ir.project.language).toBe('typescript');
    // PM version stays unresolved (paired entry keeps the IR valid).
    expect(ir.unresolved?.map((u) => u.field)).toContain('/project/packageManager/version');

    const messages = warnings.map((w) => w.message).join('\n');
    expect(messages).toContain('codecov/codecov-action@v4');
    expect(messages).toContain('VM runner'); // no container → default image warning
  });

  it('T-CIIMPORT-005 (CIIMPORT-FR-005) — parallel jobs linearized with a warning', () => {
    const parallel = `
jobs:
  a:
    steps: [{ run: echo a }]
  b:
    steps: [{ run: echo b }]
`;
    const { ir, warnings } = importGithubActions(parallel);
    expect(validate(ir)).toEqual([]);
    expect(ir.stages).toHaveLength(2);
    expect(ir.stages[1].dependsOn).toEqual([ir.stages[0].id]);
    expect(warnings.map((w) => w.message).join()).toContain('linearized');
  });

  it('rejects YAML without jobs', () => {
    expect(() => importGithubActions('stages: [a]')).toThrow(/jobs/);
  });
});

describe('importGitlabCi', () => {
  it('T-CIIMPORT-002 (CIIMPORT-AC-002) — jobs ordered by stages list, per-job images, variables applied', () => {
    const { ir, warnings } = importGitlabCi(GITLAB_SAMPLE);

    expect(validate(ir)).toEqual([]);
    expect(ir.stages.map((s) => s.id)).toEqual(['install', 'unit', 'lint']);
    expect(ir.stages[0].container.image).toBe('node:22-alpine');
    expect(ir.stages[1].container.image).toBe('node:22');
    expect(ir.stages[1].steps[0].env).toMatchObject({ CI_FLAG: 'yes', NODE_ENV: 'test' });
    expect(ir.stages.some((s) => s.id.includes('hidden'))).toBe(false);

    expect(ir.project.packageManager.name).toBe('yarn');
    expect(ir.project.runtime).toEqual({ name: 'node', version: '22' });
    expect(warnings.map((w) => w.message).join()).toContain('linearized');
  });

  it('rejects YAML without script jobs', () => {
    expect(() => importGitlabCi('name: CI\njobs: {}')).toThrow(/script/);
  });
});

describe('round-trip with the exporters', () => {
  function fixtureIr(): PipelineIR {
    return JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
        'utf-8',
      ),
    ) as PipelineIR;
  }

  it('T-CIIMPORT-009 (CIIMPORT-AC-009) — our GitHub export re-imports as a valid IR with the same commands', () => {
    const original = fixtureIr();
    const exported = generateGithubActions(original);
    const { ir } = importCiConfig(exported.content, 'auto');
    expect(validate(ir)).toEqual([]);
    // The single shared-workspace job carries every live stage command.
    const commands = ir.stages.flatMap((s) => s.steps.map((st) => st.run)).join('\n');
    expect(commands).toContain('pnpm install --frozen-lockfile');
    expect(commands).toContain('pnpm test');
    expect(ir.project.packageManager.name).toBe('pnpm');
  });

  it('our GitLab export re-imports with one stage per original live stage', () => {
    const original = fixtureIr();
    const exported = generateGitlabCi(original);
    const { ir } = importCiConfig(exported.content, 'auto');
    expect(validate(ir)).toEqual([]);
    expect(ir.stages.map((s) => s.id)).toEqual([
      'install',
      'lint',
      'test',
      'build',
      'docker-build',
    ]);
  });
});

describe('mergeDetectedProjectFacts', () => {
  it('T-CIIMPORT-013 (CIIMPORT-FR-013) — merge fills only the gaps and shrinks unresolved', () => {
    const { ir: imported } = importGithubActions(GHA_SAMPLE); // pnpm/node 20/ts inferred; pm.version null
    const detected: PipelineIR = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
        'utf-8',
      ),
    );
    const merged = mergeDetectedProjectFacts(imported, detected);

    expect(validate(merged)).toEqual([]);
    // Imported inference kept…
    expect(merged.project.runtime.version).toBe('20');
    // …detector filled the gap the workflow could not answer.
    expect(merged.project.packageManager.version).toBe(detected.project.packageManager.version);
    expect(merged.project.name).toBe(detected.project.name);
    expect(merged.unresolved).toEqual([]);
    // Stages come from the WORKFLOW, not the detector.
    expect(merged.stages.map((s) => s.id)).toEqual(['build', 'docker']);
  });
});

describe('sniffProvider', () => {
  it('recognizes both formats', () => {
    expect(sniffProvider(GHA_SAMPLE)).toBe('github-actions');
    expect(sniffProvider(GITLAB_SAMPLE)).toBe('gitlab-ci');
    expect(sniffProvider('just: text')).toBeNull();
  });
});
