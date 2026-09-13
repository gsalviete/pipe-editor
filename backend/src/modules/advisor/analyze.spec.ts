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
  it('T-ADVISOR-001 (ADVISOR-AC-001) — the canonical fixture scores an A with no critical findings', () => {
    const d = analyzePipeline(loadIr());
    expect(d.grade).toBe('A');
    expect(d.findings.filter((f) => f.severity === 'critical')).toEqual([]);
  });

  it('T-ADVISOR-002 (ADVISOR-AC-002) — unpinned images are critical', () => {
    const ir = loadIr();
    ir.stages[0].container.image = 'node:latest';
    const d = analyzePipeline(ir);
    expect(d.findings.some((f) => f.id === 'image-unpinned:install')).toBe(true);
    expect(d.score).toBeLessThanOrEqual(75);
  });

  it('T-ADVISOR-009 (ADVISOR-FR-009) — runtime drift between stage image and project runtime', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) =>
      s.id === 'test' ? { ...s, container: { image: 'node:18-alpine' } } : s,
    );
    expect(ids(ir)).toContain('runtime-drift:test');
  });

  it('T-ADVISOR-004b (ADVISOR-FR-010) — a disabled install stage is critical', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'install' ? { ...s, enabled: false } : s));
    expect(ids(ir)).toContain('missing-install');
  });

  it('T-ADVISOR-006 (ADVISOR-AC-006) — disabled tests and non-frozen installs', () => {
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

  it('T-ADVISOR-005 (ADVISOR-AC-005) — hardcoded secrets are critical', () => {
    const ir = loadIr();
    ir.stages[0].steps[0].env = { NPM_TOKEN: 'npm_abc123' };
    const d = analyzePipeline(ir);
    const finding = d.findings.find((f) => f.id.startsWith('secret-in-env'));
    expect(finding?.severity).toBe('critical');
  });

  it('T-ADVISOR-007 (ADVISOR-AC-007) — docker-build without a build stage on a TS project', () => {
    const ir = loadIr();
    ir.stages = ir.stages.map((s) => (s.id === 'build' ? { ...s, enabled: false } : s));
    expect(ids(ir)).toContain('docker-build-without-build');
  });

  it('T-ADVISOR-008 (ADVISOR-AC-008) — findings ordered critical → warning → info', () => {
    const ir = loadIr();
    ir.stages[0].container.image = 'node:latest'; // critical
    ir.stages = ir.stages.map((s) => (s.id === 'test' ? { ...s, enabled: false } : s)); // warning
    const d = analyzePipeline(ir);
    const severities = d.findings.map((f) => f.severity);
    expect(severities.indexOf('critical')).toBeLessThan(severities.indexOf('warning'));
  });
});
