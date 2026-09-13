// Tests for findUnrunnableReason — the single-source precheck
// consumed by EXEC, the Editor /api/generate controller, and the
// Dockerfile Generator (DOCKER-FR-015 / DOCKER-AC-014). Introduced
// by the Pipeline Executor spec's Decision D.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  findUnrunnableReason,
  PipelineIR,
  UnresolvedRequiredFieldError,
} from './index';

const FIXTURES = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

function loadIr(fixture: string): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

describe('findUnrunnableReason', () => {
  it('returns null for a fully-resolved IR (node-pnpm-nest-basic)', () => {
    const ir = loadIr('node-pnpm-nest-basic');
    expect(findUnrunnableReason(ir)).toBeNull();
  });

  it('returns unresolved-required-field with the PM-name path when packageManager.name is null', () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.project.packageManager.name = null;
    const reason = findUnrunnableReason(ir);
    expect(reason).toEqual({
      kind: 'unresolved-required-field',
      field: '/project/packageManager/name',
    });
  });

  it('returns the runtime.version field when runtime.version is null', () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.project.runtime.version = null;
    const reason = findUnrunnableReason(ir);
    expect(reason).toEqual({
      kind: 'unresolved-required-field',
      field: '/project/runtime/version',
    });
  });

  it('PM-name has precedence over runtime.version when both are null (first-match-wins)', () => {
    const ir = loadIr('node-pnpm-nest-basic');
    ir.project.packageManager.name = null;
    ir.project.runtime.version = null;
    expect(findUnrunnableReason(ir)?.kind).toBe('unresolved-required-field');
    expect((findUnrunnableReason(ir) as { field: string }).field).toBe(
      '/project/packageManager/name',
    );
  });

  it('UnresolvedRequiredFieldError carries the field path', () => {
    const err = new UnresolvedRequiredFieldError('/project/packageManager/name');
    expect(err.path).toBe('/project/packageManager/name');
    expect(err.name).toBe('UnresolvedRequiredFieldError');
    expect(err.message).toContain('/project/packageManager/name');
  });
});
