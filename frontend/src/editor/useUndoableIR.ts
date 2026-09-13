// Undo/redo history for the Working IR. Every edit (toggle, step
// edit, add/remove stage) pushes a snapshot; undo/redo walk the
// stack. `reset` seeds a fresh history (used on detect).

import { useCallback, useRef, useState } from 'react';
import type { PipelineIR } from '@modules/ir';

const MAX_HISTORY = 100;

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
  const [workingIR, setWorkingIR] = useState<PipelineIR | null>(null);
  const past = useRef<PipelineIR[]>([]);
  const future = useRef<PipelineIR[]>([]);
  // Version counter so canUndo/canRedo re-render even though the
  // stacks live in refs.
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const apply = useCallback((next: PipelineIR) => {
    setWorkingIR((current) => {
      if (current !== null) {
        past.current.push(current);
        if (past.current.length > MAX_HISTORY) past.current.shift();
      }
      future.current = [];
      return next;
    });
    bump();
  }, []);

  const reset = useCallback((ir: PipelineIR | null) => {
    past.current = [];
    future.current = [];
    setWorkingIR(ir);
    bump();
  }, []);

  const undo = useCallback(() => {
    setWorkingIR((current) => {
      const previous = past.current.pop();
      if (previous === undefined || current === null) return current;
      future.current.push(current);
      return previous;
    });
    bump();
  }, []);

  const redo = useCallback(() => {
    setWorkingIR((current) => {
      const next = future.current.pop();
      if (next === undefined || current === null) return current;
      past.current.push(current);
      return next;
    });
    bump();
  }, []);

  return {
    workingIR,
    apply,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
