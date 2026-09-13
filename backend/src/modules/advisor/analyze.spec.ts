// Pipeline Doctor tests.

import { readFileSync } from 'fs';
import { join } from 'path';
import type { PipelineIR } from '../ir';
import { analyzePipeline } from './analyze';

function loadIr(): PipelineIR {
  return JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
      'utf-8',
    ),
  ) as PipelineIR;
}

function ids(ir: PipelineIR): string[] {
  return analyzePipeline(ir).findings.map((f) => f.id);
}

describe('analyzePipeline', () => {
  it('the canonical fixture scores an A with no critical findings', () => {
    const d = analyzePipeline(loadIr());
    expect(d.grade).toBe('A');
    expect(d.findings.filter((f) => f.severity === 'critical')).toEqual([]);
  });

  it('flags unpinned images as critical', () => {
    const ir = loadIr();
    ir.stages[0].container.image = 'node:latest';
    const d = analyzePipeline(ir);
    expect(d.findings.some((f) => f.id === 'image-unpinned:install')).toBe(true);
    expect(d.score).toBeLessThanOrEqual(75);
  });

  it('flags runtime drift between stage image and project runtime', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) =>
      s.id === 'test' ? { ...s, container: { image: 'node:18-alpine' } } : s,
    );
    expect(ids(ir)).toContain('runtime-drift:test');
  });

  it('flags a disabled install stage as critical (downstream will fail)', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'install' ? { ...s, enabled: false } : s));
    expect(ids(ir)).toContain('missing-install');
  });

  it('flags disabled tests and non-frozen installs', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'test' ? { ...s, enabled: false } : s));
    ir.stages = ir.stages.map((s) =>
      s.id === 'install'
        ? { ...s, steps: s.steps.map((st) => ({ ...st, run: 'pnpm install' })) }
        : s,
    );
    const found = ids(ir);
    expect(found).toContain('test-disabled');
    expect(found).toContain('unfrozen-install:install:install-deps');
  });

  it('flags hardcoded secrets as critical', () => {
    const ir = loadIr();
    ir.stages[0].steps[0].env = { NPM_TOKEN: 'npm_abc123' };
    const d = analyzePipeline(ir);
    const finding = d.findings.find((f) => f.id.startsWith('secret-in-env'));
    expect(finding?.severity).toBe('critical');
  });

  it('warns when docker-build runs without a build stage on a TS project', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'build' ? { ...s, enabled: false } : s));
    expect(ids(ir)).toContain('docker-build-without-build');
  });

  it('orders findings critical → warning → info', () => {
    const ir = loadIr();
    ir.stages[0].container.image = 'node:latest'; // critical
    ir.stages = ir.stages.map((s) => (s.id === 'test' ? { ...s, enabled: false } : s)); // warning
    const d = analyzePipeline(ir);
    const severities = d.findings.map((f) => f.severity);
    expect(severities.indexOf('critical')).toBeLessThan(severities.indexOf('warning'));
  });
});
