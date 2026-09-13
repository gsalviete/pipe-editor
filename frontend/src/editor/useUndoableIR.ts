// Undo/redo history for the Working IR.
//
// FE-01 — this used to push onto a ref-held stack *inside* a
// `setWorkingIR` updater. Updater functions must be pure: React 18's
// StrictMode invokes them twice in development, so every edit pushed TWO
// history entries and the first ⌘Z appeared to do nothing. `main.tsx`
// renders inside StrictMode, so that was the default development
// experience — and the bug was in the mechanism, not in the symptom:
// history is state, and it belongs in the same reducer as the value it
// describes so the two can never disagree.
//
// One reducer over `{ past, present, future }` makes every transition a
// pure function of the previous state, which is idempotent under a double
// invoke by construction.

import { useCallback, useMemo, useReducer } from 'react';
import type { PipelineIR } from '@modules/ir';

const MAX_HISTORY = 100;

interface HistoryState {
  past: PipelineIR[];
  present: PipelineIR | null;
  future: PipelineIR[];
}

type HistoryAction =
  | { type: 'apply'; next: PipelineIR }
  | { type: 'reset'; ir: PipelineIR | null }
  | { type: 'undo' }
  | { type: 'redo' };

const EMPTY: HistoryState = { past: [], present: null, future: [] };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'apply': {
      // Applying the identical object is not an edit — React can replay a
      // dispatch, and a no-op must not consume an undo slot.
      if (state.present === action.next) return state;
      const past =
        state.present === null ? state.past : [...state.past, state.present].slice(-MAX_HISTORY);
      return { past, present: action.next, future: [] };
    }
    case 'reset':
      return { past: [], present: action.ir, future: [] };
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined || state.present === null) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [...state.future, state.present],
      };
    }
    case 'redo': {
      const next = state.future[state.future.length - 1];
      if (next === undefined || state.present === null) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(0, -1),
      };
    }
  }
}

export interface UndoableIR {
  workingIR: PipelineIR | null;
  /** Apply an edit: push the new IR onto the history. */
  apply: (next: PipelineIR) => void;
  /** Seed a fresh history (detect / reset-to-detected). */
  reset: (ir: PipelineIR | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoableIR(): UndoableIR {
  const [state, dispatch] = useReducer(historyReducer, EMPTY);

  const apply = useCallback((next: PipelineIR) => dispatch({ type: 'apply', next }), []);
  const reset = useCallback((ir: PipelineIR | null) => dispatch({ type: 'reset', ir }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return useMemo(
    () => ({
      workingIR: state.present,
      apply,
      reset,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, apply, reset, undo, redo],
  );
}
