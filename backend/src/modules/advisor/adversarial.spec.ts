// T-ADVISOR-101…103 — Doctor findings from the adversarial review.

import { analyzePipeline } from './analyze';
import type { PipelineIR, Stage } from '../ir';

function ir(stages: Stage[], overrides: Partial<PipelineIR['project']> = {}): PipelineIR {
  return {
    version: '0.1.0',
    project: {
      name: 'app',
      rootPath: '/w/app',
      language: 'typescript',
      runtime: { name: 'node', version: '20' },
      packageManager: { name: 'npm', version: '10' },
      ...overrides,
    },
    stages,
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };
}

function stage(id: string, image: string, runs: string[], dependsOn: string[] = []): Stage {
  return {
    id,
    name: id,
    enabled: true,
    dependsOn,
    container: { image },
    steps: runs.map((run, i) => ({ id: `${id}-${i + 1}`, run, workingDir: '.', env: {} })),
  };
}

describe('T-ADVISOR-101 (UX-05) — finding ids are unique per step', () => {
  it('emits one finding per unfrozen install step, with distinct ids', () => {
    const { findings } = analyzePipeline(
      ir([stage('install', 'node:20-alpine', ['npm install', 'npm install --no-save'])]),
    );
    const unfrozen = findings.filter((f) => f.id.startsWith('unfrozen-install:'));
    expect(unfrozen).toHaveLength(2);
    expect(new Set(unfrozen.map((f) => f.id)).size).toBe(2);
  });

  it('no two findings ever share an id', () => {
    const { findings } = analyzePipeline(
      ir([
        stage('install', 'node:lts-alpine', ['npm install', 'pnpm install']),
        stage('test', 'node:latest', ['npm test'], ['install']),
      ]),
    );
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('T-ADVISOR-102 (UX-06) — the product flags its own floating tag', () => {
  // node:lts-alpine is what DR-004's fallback emits when the runtime version
  // is unknown. It is neither `:latest` nor `node:<digits>`, so both existing
  // image rules missed the most common floating tag the tool produces.
  it.each(['node:lts-alpine', 'node:lts', 'node:current-alpine', 'node:stable'])(
    'flags %p',
    (image) => {
      const { findings } = analyzePipeline(ir([stage('install', image, ['npm ci'])]));
      expect(findings.map((f) => f.id)).toContain('image-floating-tag:install');
    },
  );

  it.each(['node:20-alpine', 'node:20.11.0-alpine', 'docker:25'])(
    'does not flag the pinned image %p',
    (image) => {
      const { findings } = analyzePipeline(ir([stage('install', image, ['npm ci'])]));
      expect(findings.map((f) => f.id)).not.toContain('image-floating-tag:install');
    },
  );

  it('still treats :latest as the more severe case', () => {
    const { findings } = analyzePipeline(ir([stage('install', 'node:latest', ['npm ci'])]));
    const unpinned = findings.find((f) => f.id === 'image-unpinned:install');
    expect(unpinned?.severity).toBe('critical');
  });
});

describe('T-ADVISOR-103 (GEN-03) — the dist/ assumption is surfaced', () => {
  it('reports the build-output assumption when a build stage will run', () => {
    const { findings } = analyzePipeline(
      ir([
        stage('install', 'node:20-alpine', ['npm ci']),
        stage('build', 'node:20-alpine', ['npm run build'], ['install']),
      ]),
    );
    const finding = findings.find((f) => f.id === 'build-output-assumed');
    expect(finding).toBeDefined();
    expect(finding!.detail).toMatch(/dist/);
    expect(finding!.severity).toBe('info');
  });

  it('does not report it when there is no effective build stage', () => {
    const { findings } = analyzePipeline(ir([stage('install', 'node:20-alpine', ['npm ci'])]));
    expect(findings.map((f) => f.id)).not.toContain('build-output-assumed');
  });

  it('does not report it when the build stage is disabled', () => {
    const build = { ...stage('build', 'node:20-alpine', ['npm run build'], ['install']), enabled: false };
    const { findings } = analyzePipeline(
      ir([stage('install', 'node:20-alpine', ['npm ci']), build]),
    );
    expect(findings.map((f) => f.id)).not.toContain('build-output-assumed');
  });
});
