// Autosave for the Working IR (STATE-FR-006), extracted from Editor.tsx
// as part of FE-05.
//
// The whole feature is four moving parts — a debounce, a dirty check, a
// two-state indicator and a "has anything been saved yet" fact — that were
// spread across three places in a 1,640-line component. Together in one
// hook they fit on a screen, and the FE-02 reasoning about which of them is
// state and which is a ref stays next to the code it explains.

import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalEquals, type PipelineIR } from '@modules/ir';
import { deleteSavedPipeline, putSavedPipeline } from './api';

export type SaveState = 'saving' | 'saved' | null;

const DEBOUNCE_MS = 700;

export interface AutosaveOptions {
  /** The edited document, or null when nothing is loaded. */
  workingIR: PipelineIR | null;
  /** The detected baseline the working document is compared against. */
  loadedIR: PipelineIR | null;
  /** The project to save under, or null for a pipeline not bound to one. */
  detectedPath: string | null;
  /** True while the IR passes validate(); an invalid document is not saved. */
  irValid: boolean;
  /** Autosave pauses while the user is deciding whether to restore. */
  paused: boolean;
}

export interface Autosave {
  saveState: SaveState;
  /**
   * Forget that anything has been persisted — call when a different
   * project is opened, so one project's save history cannot affect
   * another's first write.
   */
  forget: () => void;
}

export function useAutosave({
  workingIR,
  loadedIR,
  detectedPath,
  irValid,
  paused,
}: AutosaveOptions): Autosave {
  const [saveState, setSaveState] = useState<SaveState>(null);

  // FE-02 — "has anything been persisted for this project since it was
  // opened?" is a fact about the server, not render state. The effect
  // branches on it but must not re-run when it changes, because the effect
  // is what changes it; as a dependency it would re-debounce on its own
  // writes. That makes it a ref, and it is why the dependency list below is
  // complete without a suppression.
  const savedThisSession = useRef(false);

  const forget = useCallback(() => {
    savedThisSession.current = false;
    setSaveState(null);
  }, []);

  useEffect(() => {
    if (
      workingIR === null ||
      loadedIR === null ||
      detectedPath === null ||
      paused ||
      !irValid
    ) {
      return;
    }
    const dirty = !canonicalEquals(workingIR, loadedIR);
    // Pristine and nothing saved this session: no server call (also avoids
    // racing the restore-candidate fetch right after a detect).
    if (!dirty && !savedThisSession.current) return;

    const timer = setTimeout(() => {
      setSaveState('saving');
      (dirty
        ? putSavedPipeline(detectedPath, workingIR)
        : deleteSavedPipeline(detectedPath)
      )
        .then(() => {
          savedThisSession.current = dirty;
          setSaveState(dirty ? 'saved' : null);
        })
        .catch(() => setSaveState(null));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [workingIR, loadedIR, detectedPath, paused, irValid]);

  return { saveState, forget };
}
