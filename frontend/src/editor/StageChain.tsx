// The stage chain's presentational components (FE-05).
//
// Extracted from Editor.tsx, which had grown to ~1,640 lines holding
// discovery, drag-and-drop, import, share links, autosave, the toolbar and
// every node renderer. These five are pure presentation: they take a stage
// and some callbacks and render it. Nothing here reads or writes the
// editor's state.

import { useState } from 'react';
import type { Stage } from '@modules/ir';

function StepRow({
  stage,
  stepIndex,
  onCommit,
}: {
  stage: Stage;
  stepIndex: number;
  onCommit: (run: string) => void;
}) {
  const step = stage.steps[stepIndex];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.run);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== '' && trimmed !== step.run) onCommit(trimmed);
    else setDraft(step.run);
  }

  if (editing) {
    return (
      <div className="stage-node__step stage-node__step--editing">
        <input
          type="text"
          className="stage-node__step-input"
          aria-label={`${stage.id} step ${stepIndex + 1} command`}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(step.run);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="stage-node__step">
      <code>{step.run}</code>
      <button
        type="button"
        className="stage-node__step-edit"
        aria-label={`Edit ${stage.id} step ${stepIndex + 1}`}
        title="Edit command"
        onClick={() => {
          setDraft(step.run);
          setEditing(true);
        }}
      >
        ✎
      </button>
    </div>
  );
}

function ImageRow({
  stage,
  onCommit,
}: {
  stage: Stage;
  onCommit: (image: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stage.container.image);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== '' && trimmed !== stage.container.image) onCommit(trimmed);
    else setDraft(stage.container.image);
  }

  if (editing) {
    return (
      <div className="stage-node__image">
        <span className="label">image:</span>{' '}
        <input
          type="text"
          className="stage-node__step-input"
          aria-label={`${stage.id} image`}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(stage.container.image);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }
  return (
    <div className="stage-node__image">
      <span className="label">image:</span> <code>{stage.container.image}</code>
      <button
        type="button"
        className="stage-node__step-edit"
        aria-label={`Edit ${stage.id} image`}
        title="Change the container image"
        onClick={() => {
          setDraft(stage.container.image);
          setEditing(true);
        }}
      >
        ✎
      </button>
    </div>
  );
}

export function StageNode({
  stage,
  inEffectiveChain,
  onToggle,
  onEditStep,
  onEditImage,
  onDelete,
}: {
  stage: Stage;
  inEffectiveChain: boolean;
  onToggle: () => void;
  onEditStep: (stepIndex: number, run: string) => void;
  onEditImage: (image: string) => void;
  onDelete: () => void;
}) {
  const classes = ['stage-node'];
  if (!stage.enabled) classes.push('stage-node--disabled');
  if (!inEffectiveChain) classes.push('stage-node--out-of-chain');

  return (
    <div className={classes.join(' ')} data-stage-id={stage.id}>
      <div className="stage-node__header">
        <span className="stage-node__id">{stage.id}</span>
        <span className="stage-node__name">{stage.name}</span>
        <label className="stage-node__toggle">
          <input
            type="checkbox"
            checked={stage.enabled}
            onChange={onToggle}
            aria-label={`Toggle ${stage.id} enabled`}
          />
          <span>{stage.enabled ? 'enabled' : 'disabled'}</span>
        </label>
        <button
          type="button"
          className="stage-node__delete"
          aria-label={`Delete ${stage.id} stage`}
          title="Remove this stage from the pipeline (undoable)"
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      <div className="stage-node__body">
        <ImageRow stage={stage} onCommit={onEditImage} />
        {stage.steps.length === 0 ? (
          <div className="stage-node__step stage-node__step--empty">
            no steps declared
          </div>
        ) : (
          stage.steps.map((step, i) => (
            <StepRow
              key={step.id}
              stage={stage}
              stepIndex={i}
              onCommit={(run) => onEditStep(i, run)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function Connector({ active }: { active: boolean }) {
  return (
    <div
      className={`chain-connector ${
        active ? 'chain-connector--active' : 'chain-connector--inactive'
      }`}
      aria-hidden="true"
    />
  );
}

export function EffectiveChainCaption({ chain }: { chain: Stage[] }) {
  if (chain.length === 0) {
    return (
      <div
        className="effective-chain-caption effective-chain-caption--empty"
        data-testid="effective-chain-caption"
      >
        <span className="effective-chain-caption__label">Effective chain:</span>{' '}
        <em className="effective-chain-caption__empty">(empty — nothing to run)</em>
      </div>
    );
  }
  return (
    <div
      className="effective-chain-caption"
      data-testid="effective-chain-caption"
    >
      <span className="effective-chain-caption__label">Effective chain:</span>{' '}
      {chain.map((s, i) => (
        <span key={s.id} className="effective-chain-caption__item">
          <code className="effective-chain-caption__id">{s.id}</code>
          {i < chain.length - 1 && (
            <span className="effective-chain-caption__arrow" aria-hidden="true">
              {' '}→{' '}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
