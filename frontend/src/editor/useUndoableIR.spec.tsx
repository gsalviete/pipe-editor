// T-EDITOR-044 (FE-01) — undo/redo survives StrictMode.
//
// The old implementation pushed onto a ref-held stack inside a setState
// updater. React 18 StrictMode invokes updaters twice in development, so
// every edit pushed two history entries and the first ⌘Z appeared to do
// nothing. main.tsx renders inside StrictMode, so that was the default
// development experience.

import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { PipelineIR } from '@modules/ir';
import { historyReducer, useUndoableIR } from './useUndoableIR';

function ir(name: string): PipelineIR {
  return {
    version: '0.1.0',
    project: {
      name,
      rootPath: '/w/app',
      language: 'typescript',
      runtime: { name: 'node', version: '20' },
      packageManager: { name: 'npm', version: '10' },
    },
    stages: [],
    metadata: { generatedAt: '2026-09-13T00:00:00.000Z', detectorVersion: '0.1.0' },
  };
}

describe('historyReducer', () => {
  const empty = { past: [], present: null, future: [] };

  it('apply from empty sets the present without pushing history', () => {
    const next = historyReducer(empty, { type: 'apply', next: ir('a') });
    expect(next.present?.project.name).toBe('a');
    expect(next.past).toEqual([]);
  });

  it('undo and redo walk the timeline', () => {
    let s = historyReducer(empty, { type: 'reset', ir: ir('a') });
    s = historyReducer(s, { type: 'apply', next: ir('b') });
    s = historyReducer(s, { type: 'apply', next: ir('c') });
    expect(s.present?.project.name).toBe('c');

    s = historyReducer(s, { type: 'undo' });
    expect(s.present?.project.name).toBe('b');
    s = historyReducer(s, { type: 'undo' });
    expect(s.present?.project.name).toBe('a');

    s = historyReducer(s, { type: 'redo' });
    expect(s.present?.project.name).toBe('b');
  });

  it('a new edit clears the redo future', () => {
    let s = historyReducer(empty, { type: 'reset', ir: ir('a') });
    s = historyReducer(s, { type: 'apply', next: ir('b') });
    s = historyReducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = historyReducer(s, { type: 'apply', next: ir('c') });
    expect(s.future).toEqual([]);
  });

  it('undo at the start and redo at the end are no-ops', () => {
    const s = historyReducer(empty, { type: 'reset', ir: ir('a') });
    expect(historyReducer(s, { type: 'undo' })).toBe(s);
    expect(historyReducer(s, { type: 'redo' })).toBe(s);
  });

  it('reset drops both stacks', () => {
    let s = historyReducer(empty, { type: 'reset', ir: ir('a') });
    s = historyReducer(s, { type: 'apply', next: ir('b') });
    s = historyReducer(s, { type: 'reset', ir: ir('z') });
    expect(s).toEqual({ past: [], present: expect.objectContaining({}), future: [] });
    expect(s.present?.project.name).toBe('z');
  });

  it('bounds the history', () => {
    let s = historyReducer(empty, { type: 'reset', ir: ir('0') });
    for (let i = 1; i <= 150; i++) s = historyReducer(s, { type: 'apply', next: ir(String(i)) });
    expect(s.past.length).toBeLessThanOrEqual(100);
    expect(s.present?.project.name).toBe('150');
  });

  // The property the old implementation lacked: applying the same action
  // twice — which is what a doubled invoke amounts to — must not double
  // the history.
  it('is idempotent for the same object, so a replayed dispatch costs nothing', () => {
    const edit = ir('b');
    let s = historyReducer(empty, { type: 'reset', ir: ir('a') });
    s = historyReducer(s, { type: 'apply', next: edit });
    const after = historyReducer(s, { type: 'apply', next: edit });
    expect(after).toBe(s);
    expect(after.past).toHaveLength(1);
  });
});

function Harness() {
  const { workingIR, apply, reset, undo, canUndo } = useUndoableIR();
  return (
    <div>
      <span data-testid="name">{workingIR?.project.name ?? '(none)'}</span>
      <span data-testid="can-undo">{String(canUndo)}</span>
      <button type="button" onClick={() => reset(ir('a'))}>
        reset
      </button>
      <button type="button" onClick={() => apply(ir('b'))}>
        edit
      </button>
      <button type="button" onClick={undo}>
        undo
      </button>
    </div>
  );
}

describe('T-EDITOR-044 (FE-01) — inside StrictMode', () => {
  it('one edit costs exactly one undo', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    act(() => screen.getByRole('button', { name: 'reset' }).click());
    act(() => screen.getByRole('button', { name: 'edit' }).click());
    expect(screen.getByTestId('name').textContent).toBe('b');
    expect(screen.getByTestId('can-undo').textContent).toBe('true');

    // The bug: this first press used to undo one of two duplicate entries
    // and appear to do nothing.
    act(() => screen.getByRole('button', { name: 'undo' }).click());
    expect(screen.getByTestId('name').textContent).toBe('a');
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });
});
