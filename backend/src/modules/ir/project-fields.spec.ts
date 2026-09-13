// T-IR-019 (IR-AC-019) — committing a value to a required-nullable field
// drops its paired unresolved entry atomically, so the null ⟺ unresolved
// invariant never breaks mid-edit.

import { PipelineIR, validate } from './index';
import {
  majorFromVersionText,
  normalizeProjectFieldValue,
  resolveProjectField,
} from './project-fields';

function unresolvedIR(): PipelineIR {
  return {
    version: '0.1.0',
    project: {
      name: 'app',
      rootPath: '/w/app',
      language: null,
      runtime: { name: null, version: null },
      packageManager: { name: null, version: null },
    },
    stages: [],
    unresolved: [
      { field: '/project/language', reason: 'needs-user-input', message: 'pick one' },
      { field: '/project/runtime/name', reason: 'needs-user-input', message: 'pick one' },
      { field: '/project/runtime/version', reason: 'needs-user-input', message: 'pick one' },
      { field: '/project/packageManager/name', reason: 'needs-user-input', message: 'pick one' },
      { field: '/project/packageManager/version', reason: 'needs-user-input', message: 'pick one' },
    ],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };
}

describe('resolveProjectField', () => {
  it('the starting fixture is a valid IR', () => {
    expect(validate(unresolvedIR())).toEqual([]);
  });

  it.each([
    ['/project/runtime/version', '20', (ir: PipelineIR) => ir.project.runtime.version],
    ['/project/runtime/name', 'node', (ir: PipelineIR) => ir.project.runtime.name],
    ['/project/packageManager/name', 'pnpm', (ir: PipelineIR) => ir.project.packageManager.name],
    ['/project/packageManager/version', '9', (ir: PipelineIR) => ir.project.packageManager.version],
    ['/project/language', 'typescript', (ir: PipelineIR) => ir.project.language],
  ])('commits %s and drops its unresolved entry', (field, value, read) => {
    const next = resolveProjectField(unresolvedIR(), field, value);
    expect(read(next)).toBe(value);
    expect((next.unresolved ?? []).map((u) => u.field)).not.toContain(field);
    // The invariant holds at every step: still exactly one entry per null field.
    expect(validate(next)).toEqual([]);
  });

  it('never mutates the input IR', () => {
    const ir = unresolvedIR();
    const before = JSON.stringify(ir);
    resolveProjectField(ir, '/project/runtime/version', '20');
    expect(JSON.stringify(ir)).toBe(before);
  });

  it('resolving every field removes the unresolved key entirely', () => {
    let ir = unresolvedIR();
    ir = resolveProjectField(ir, '/project/language', 'typescript');
    ir = resolveProjectField(ir, '/project/runtime/name', 'node');
    ir = resolveProjectField(ir, '/project/runtime/version', '20');
    ir = resolveProjectField(ir, '/project/packageManager/name', 'npm');
    ir = resolveProjectField(ir, '/project/packageManager/version', '10');
    expect(ir.unresolved).toBeUndefined();
    expect(validate(ir)).toEqual([]);
  });

  it('normalizes a full semver down to the major the IR carries', () => {
    const next = resolveProjectField(unresolvedIR(), '/project/runtime/version', 'v20.11.0');
    expect(next.project.runtime.version).toBe('20');
  });

  it.each([
    ['/project/runtime/version', 'lts/hydrogen'],
    ['/project/runtime/version', ''],
    ['/project/packageManager/name', 'bun'],
    ['/project/runtime/name', 'python'],
    ['/project/name', 'anything'],
  ])('refuses %s = %p and returns the IR unchanged', (field, value) => {
    const ir = unresolvedIR();
    expect(resolveProjectField(ir, field, value)).toBe(ir);
  });
});

describe('normalizeProjectFieldValue', () => {
  it('lowercases the language', () => {
    expect(normalizeProjectFieldValue('/project/language', 'TypeScript')).toBe('typescript');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeProjectFieldValue('/project/packageManager/name', '  pnpm ')).toBe('pnpm');
  });
});

describe('majorFromVersionText', () => {
  it.each([
    ['20', '20'],
    ['v20', '20'],
    ['20.11.0', '20'],
    ['>=18', '18'],
    ['^22.0.0', '22'],
  ])('%p → %p', (i, o) => expect(majorFromVersionText(i)).toBe(o));

  it.each(['lts/hydrogen', 'node', 'stable', '', 'latest'])('rejects %p', (i) =>
    expect(majorFromVersionText(i)).toBeNull(),
  );
});
