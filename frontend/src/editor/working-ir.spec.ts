// Working-IR helper contract tests.

import { describe, expect, it } from 'vitest';
import type { PipelineIR } from '@modules/ir';
import { hasUnresolvedRequiredField } from './working-ir';

function baseIR(overrides: Partial<PipelineIR['project']> = {}): PipelineIR {
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
    stages: [],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };
}

// T-EDITOR-036 — EDITOR-AC-036 / EDITOR-UI-FR-017.
describe('hasUnresolvedRequiredField (UX-02)', () => {
  it('returns null for a fully resolved project', () => {
    expect(hasUnresolvedRequiredField(baseIR())).toBeNull();
  });

  // Regression: the UI used to check only packageManager.name and
  // runtime.version, so these three enabled Generate/Run client-side
  // and then failed with a 422 naming a field the UI never mentioned.
  it.each([
    ['/project/packageManager/version', { packageManager: { name: 'npm' as const, version: null } }],
    ['/project/runtime/name', { runtime: { name: null, version: '20' } }],
    ['/project/language', { language: null }],
  ])('blocks on %s, matching the backend gate', (field, overrides) => {
    expect(hasUnresolvedRequiredField(baseIR(overrides))).toBe(field);
  });

  it('reports fields in the backend probe order', () => {
    const ir = baseIR({
      language: null,
      packageManager: { name: null, version: null },
    });
    expect(hasUnresolvedRequiredField(ir)).toBe('/project/packageManager/name');
  });
});
