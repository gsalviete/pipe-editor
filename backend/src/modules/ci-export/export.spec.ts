// CI export tests: structure, effective-chain fidelity, YAML sanity
// (both artifacts must parse), corepack handling, empty-chain honesty.

import { readFileSync } from 'fs';
import { join } from 'path';
import { load as yamlLoad } from 'js-yaml';
import type { PipelineIR } from '../ir';
import { generateGithubActions } from './github-actions';
import { dindServiceFor, generateGitlabCi } from './gitlab-ci';

const FIXTURE = join(
  __dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json',
);

function loadIr(): PipelineIR {
  return JSON.parse(readFileSync(FIXTURE, 'utf-8')) as PipelineIR;
}

describe('generateGithubActions', () => {
  it('T-CIEXPORT-001 (CIEXPORT-AC-001) — parseable workflow: one shared-workspace job + docker-build job', () => {
    const { filename, content } = generateGithubActions(loadIr());
    expect(filename).toBe('.github/workflows/ci.yml');

    const doc = yamlLoad(content) as Record<string, any>;
    expect(doc.name).toBe('CI');
    // js-yaml (YAML 1.2 default schema) parses the bare `on:` key as boolean true.
    const on = doc.on ?? doc[true as unknown as string] ?? (doc as any)[String(true)];
    expect(on.push.branches).toEqual(['main']);

    const pipeline = doc.jobs.pipeline;
    expect(pipeline.container.image).toBe('node:20-alpine');
    const stepNames = pipeline.steps.map((s: any) => s.name ?? s.uses);
    expect(stepNames[0]).toBe('actions/checkout@v4');
    // The fixture's install command already enables corepack itself, so
    // no dedicated corepack step is injected — just the live stages.
    expect(stepNames.slice(1)).toEqual(['Install', 'Lint', 'Test', 'Build']);
    expect(pipeline.steps[1].run).toContain('pnpm install --frozen-lockfile');

    expect(doc.jobs['docker-build'].needs).toBe('pipeline');
    expect(doc.jobs['docker-build'].steps[1].run).toContain('docker build');
  });

  it('T-CIEXPORT-003 (CIEXPORT-AC-003) — disabled stages spliced out (effective chain, not document order)', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'lint' ? { ...s, enabled: false } : s));
    const { content } = generateGithubActions(ir);
    expect(content).not.toContain('pnpm lint');
    expect(content).toContain('pnpm test');
  });

  it('T-CIEXPORT-015 (CIEXPORT-AC-015) — corepack enabled exactly once; npm never gets a step', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) =>
      s.id === 'install'
        ? { ...s, steps: s.steps.map((st) => ({ ...st, run: 'pnpm install --frozen-lockfile' })) }
        : s,
    );
    expect(generateGithubActions(ir).content).toContain('corepack enable');

    ir.project.packageManager = { name: 'npm', version: '10' };
    ir.stages = ir.stages.map((s) =>
      s.id === 'install'
        ? { ...s, steps: s.steps.map((st) => ({ ...st, run: 'npm ci' })) }
        : s,
    );
    expect(generateGithubActions(ir).content).not.toContain('corepack');
  });

  it('T-CIEXPORT-014a (CIEXPORT-AC-014) — all-disabled chain produces an honest noop workflow', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => ({ ...s, enabled: false }));
    const { content } = generateGithubActions(ir);
    expect(content).toContain('noop');
    expect(content).toContain('every stage is disabled');
    expect(() => yamlLoad(content)).not.toThrow();
  });

  it('T-CIEXPORT-016 (CIEXPORT-FR-015) — IR triggers override the default branch list', () => {
    const ir = loadIr();
    ir.triggers = [{ kind: 'on-push', branches: ['main', 'develop'] }];
    const doc = yamlLoad(generateGithubActions(ir).content) as any;
    const on = doc.on ?? (doc as any)[String(true)];
    expect(on.push.branches).toEqual(['main', 'develop']);
  });
});

describe('generateGitlabCi', () => {
  it('T-CIEXPORT-002 (CIEXPORT-AC-002) — per-stage jobs, per-job images, lockfile-keyed cache', () => {
    const { filename, content } = generateGitlabCi(loadIr());
    expect(filename).toBe('.gitlab-ci.yml');

    const doc = yamlLoad(content) as Record<string, any>;
    expect(doc.stages).toEqual(['install', 'lint', 'test', 'build', 'docker-build']);
    expect(doc.install.image).toBe('node:20-alpine');
    // The cache lives in one hidden job that every stage `extends`.
    expect(doc['.workspace-cache'].cache.key.files).toEqual(['pnpm-lock.yaml']);
    expect(doc.install.extends).toBe('.workspace-cache');
    // Install's own command already enables corepack — no duplicate line.
    expect(doc.install.script).toEqual(['corepack enable && pnpm install --frozen-lockfile']);
    // GEN-05: the image is the IR's (DR-011 puts docker:25 there), not a
    // number hardcoded in the generator. The dind service is derived from
    // the same reference so the two cannot drift apart.
    expect(doc['docker-build'].image).toBe('docker:25');
    expect(doc['docker-build'].services).toEqual(['docker:25-dind']);
  });

  it('T-CIEXPORT-012 (CIEXPORT-AC-012) — docker-build image comes from the IR; privileged runner declared', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) =>
      s.id === 'docker-build' ? { ...s, container: { image: 'docker:28' } } : s,
    );
    const { content } = generateGitlabCi(ir);
    const doc = yamlLoad(content) as Record<string, any>;
    expect(doc['docker-build'].image).toBe('docker:28');
    expect(doc['docker-build'].services).toEqual(['docker:28-dind']);
    // The privileged-runner requirement is a real deployment constraint;
    // the output used to require it silently.
    expect(content).toMatch(/privileged/i);
  });

  it('T-CIEXPORT-012b (CIEXPORT-AC-012) — docker:dind fallback for a reference with no tag', () => {
    expect(dindServiceFor('docker')).toBe('docker:dind');
    expect(dindServiceFor('docker@sha256:' + 'a'.repeat(64))).toBe('docker:dind');
    expect(dindServiceFor('registry.test/docker:25')).toBe('registry.test/docker:25-dind');
  });

  it('T-CIEXPORT-013 (CIEXPORT-AC-013) — GitLab keeps per-stage images; GitHub notes the divergence', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) =>
      s.id === 'test' ? { ...s, container: { image: 'node:22-alpine' } } : s,
    );
    const doc = yamlLoad(generateGitlabCi(ir).content) as any;
    expect(doc.test.image).toBe('node:22-alpine');
    expect(doc.install.image).toBe('node:20-alpine');

    // GitHub cannot honour it — one shared workspace needs one container —
    // so the divergence is reported in the header instead of being dropped.
    const gha = generateGithubActions(ir);
    expect(gha.content).toMatch(/NOTE: stage "test" declared image node:22-alpine/);
    expect(gha.content).toMatch(/node:20-alpine so they share one workspace/);
    const ghaDoc = yamlLoad(gha.content) as any;
    expect(Object.keys(ghaDoc.jobs).sort()).toEqual(['docker-build', 'pipeline']);
  });

  it('T-CIEXPORT-014b (CIEXPORT-AC-014) — all-disabled chain produces an honest noop job', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => ({ ...s, enabled: false }));
    const doc = yamlLoad(generateGitlabCi(ir).content) as any;
    expect(doc.stages).toEqual(['noop']);
  });
});
