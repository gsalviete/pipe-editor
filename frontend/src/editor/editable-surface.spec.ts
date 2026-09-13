// T-EDITOR-043 (EDITOR-AC-043) — the editable surface keeps the IR valid.
//
// The half EDITOR-AC-022 never had. The old criterion asserted the surface
// did not exist; the surface does exist, and what actually needs testing is
// that using it cannot produce a document `validate()` rejects — the chain
// stays linear and Stage ids stay unique, no matter the sequence of edits.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { validate, type PipelineIR } from '@modules/ir';
import {
  insertStageAfter,
  nextCustomStageId,
  removeStage,
  toggleStageEnabled,
  updateStageImage,
  updateStepRun,
} from './working-ir';

const FIXTURE = join(
  resolve(__dirname, '..', '..', '..'),
  'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json',
);

function baseIr(): PipelineIR {
  return JSON.parse(readFileSync(FIXTURE, 'utf-8')) as PipelineIR;
}

function addStage(ir: PipelineIR, after: string | null): PipelineIR {
  const id = nextCustomStageId(ir);
  return insertStageAfter(ir, after, {
    id,
    name: id,
    enabled: true,
    container: { image: 'node:20-alpine' },
    steps: [{ id: `${id}-1`, run: 'echo hi', workingDir: '.', env: {} }],
  });
}

/** The chain shape the validator enforces, read back independently. */
function chainOrder(ir: PipelineIR): string[] {
  const head = ir.stages.find((s) => s.dependsOn.length === 0);
  if (head === undefined) return [];
  const order = [head.id];
  for (;;) {
    const next = ir.stages.find((s) => s.dependsOn[0] === order[order.length - 1]);
    if (next === undefined) break;
    order.push(next.id);
  }
  return order;
}

describe('T-EDITOR-043 — every edit leaves a valid IR', () => {
  it('the fixture starts valid', () => {
    expect(validate(baseIr())).toEqual([]);
    expect(chainOrder(baseIr())).toEqual([
      'install', 'lint', 'test', 'build', 'docker-build',
    ]);
  });

  it('deleting a middle stage re-links its successor to its predecessor', () => {
    const next = removeStage(baseIr(), 'test');
    expect(validate(next)).toEqual([]);
    expect(chainOrder(next)).toEqual(['install', 'lint', 'build', 'docker-build']);
  });

  it('deleting the head re-roots the chain', () => {
    const next = removeStage(baseIr(), 'install');
    expect(validate(next)).toEqual([]);
    expect(chainOrder(next)).toEqual(['lint', 'test', 'build', 'docker-build']);
  });

  it('deleting the tail leaves a valid shorter chain', () => {
    const next = removeStage(baseIr(), 'docker-build');
    expect(validate(next)).toEqual([]);
    expect(chainOrder(next)).toEqual(['install', 'lint', 'test', 'build']);
  });

  it('adding at the head re-points the previous head', () => {
    const next = addStage(baseIr(), null);
    expect(validate(next)).toEqual([]);
    expect(chainOrder(next)).toEqual([
      'custom', 'install', 'lint', 'test', 'build', 'docker-build',
    ]);
  });

  it('adding in the middle splices without breaking the chain', () => {
    const next = addStage(baseIr(), 'lint');
    expect(validate(next)).toEqual([]);
    expect(chainOrder(next)).toEqual([
      'install', 'lint', 'custom', 'test', 'build', 'docker-build',
    ]);
  });

  it('stage ids stay unique across repeated additions', () => {
    let ir = baseIr();
    for (let i = 0; i < 5; i++) ir = addStage(ir, 'install');
    const ids = ir.stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['custom', 'custom-2', 'custom-3']));
    expect(validate(ir)).toEqual([]);
  });

  it('reuses a freed id rather than growing forever', () => {
    let ir = addStage(baseIr(), 'install');
    ir = removeStage(ir, 'custom');
    expect(nextCustomStageId(ir)).toBe('custom');
  });

  // The invariant statement of EDITOR-AC-043: any sequence, still valid.
  it('survives a long mixed sequence of edits', () => {
    let ir = baseIr();
    ir = addStage(ir, 'install');
    ir = toggleStageEnabled(ir, 'lint');
    ir = removeStage(ir, 'test');
    ir = addStage(ir, null);
    ir = updateStepRun(ir, 'install', 0, 'npm ci && echo done');
    ir = updateStageImage(ir, 'build', 'node:22-alpine');
    ir = removeStage(ir, 'install');
    ir = addStage(ir, 'build');
    ir = toggleStageEnabled(ir, 'build');

    expect(validate(ir)).toEqual([]);
    const ids = ir.stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every stage is on the single chain the validator requires.
    expect(chainOrder(ir)).toHaveLength(ir.stages.length);
  });

  it('deleting every stage leaves a valid empty pipeline', () => {
    let ir = baseIr();
    for (const id of ir.stages.map((s) => s.id)) ir = removeStage(ir, id);
    expect(ir.stages).toEqual([]);
    expect(validate(ir)).toEqual([]);
  });

  it('removing a stage that is not there changes nothing', () => {
    const ir = baseIr();
    expect(removeStage(ir, 'nope')).toBe(ir);
  });
});
