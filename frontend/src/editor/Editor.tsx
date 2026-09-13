// The Visual Editor — detect → review → edit → generate → run.
//
// Loaded IR (the /api/detect snapshot) is immutable; every edit
// produces a new Working IR tracked by the undo/redo history.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import {
  canonicalEquals,
  computeEffectiveChain,
  normalizeProjectFieldValue,
  resolveProjectField,
  serializeCanonical,
  SUPPORTED_LANGUAGES,
  SUPPORTED_PACKAGE_MANAGERS,
  SUPPORTED_RUNTIMES,
  validate,
  type PipelineIR,
  type Stage,
  type ValidationError,
} from '@modules/ir';
import {
  ApiError,
  deleteSavedPipeline,
  getSavedPipeline,
  postDetect,
  postInspectWorkspace,
  postImport,
  postImportFromProject,
  putSavedPipeline,
  resolveDroppedDirectory,
  SavedPipeline,
  WorkspacePlan,
} from './api';
import { ArtifactsPanel } from './ArtifactsPanel';
import { DoctorPanel } from './DoctorPanel';
import { FolderPicker } from './FolderPicker';
import { ProjectPicker } from './ProjectPicker';
import { RunPanel } from './RunPanel';
import { WorkspaceStudio } from './WorkspaceStudio';
import { recordRecent } from './recent-projects';
import { download } from './ui';
import { useUndoableIR } from './useUndoableIR';
import { ShareLinkReview } from './CommandReview';
import {
  hasUnresolvedRequiredField,
  listPipelineCommands,
  type IRProvenance,
  insertStageAfter,
  nextCustomStageId,
  removeStage,
  setTriggerBranches,
  toggleStageEnabled,
  updateStageImage,
  updateStepRun,
} from './working-ir';

interface Warning {
  manifest: string;
  message: string;
}

function readableApiError(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'NO_MANIFEST') {
      return 'This folder is not a single app (it has no package.json). Use “Scan all services” to find the frontend, backend, and microservices inside it.';
    }
    if (error.code === 'PATH_OUTSIDE_WORKSPACE') {
      return `${error.message} Open “Browse folders” to see exactly which folders are available.`;
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof TypeError) {
    return `Could not ${action} because the local API is offline. Start it with "pnpm dev:backend" and try again.`;
  }
  return (error as Error).message;
}

interface DroppedDirectoryEntry {
  isDirectory: boolean;
  name: string;
}

function droppedDirectoryPath(
  dataTransfer: DataTransfer,
): { path: string; needsResolution: boolean } | null {
  for (let index = 0; index < dataTransfer.items.length; index += 1) {
    const item = dataTransfer.items[index] as DataTransferItem & {
      webkitGetAsEntry?: () => DroppedDirectoryEntry | null;
    };
    const entry = item.webkitGetAsEntry?.();
    if (!entry?.isDirectory) continue;
    const localFile = item.getAsFile() as (File & { path?: string }) | null;
    return localFile?.path
      ? { path: localFile.path, needsResolution: false }
      : { path: entry.name, needsResolution: true };
  }
  return null;
}

// ─── Stage node ──────────────────────────────────────────────────────

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

function StageNode({
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

function Connector({ active }: { active: boolean }) {
  return (
    <div
      className={`chain-connector ${
        active ? 'chain-connector--active' : 'chain-connector--inactive'
      }`}
      aria-hidden="true"
    />
  );
}

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="42" height="42" rx="12" />
      <circle cx="13" cy="14" r="3.5" />
      <circle cx="31" cy="22" r="3.5" />
      <circle cx="13" cy="30" r="3.5" />
      <path d="M16.5 14h4.25a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4H31M16.5 30h4.25a4 4 0 0 0 4-4v0a4 4 0 0 1 4-4H31" />
    </svg>
  );
}

// ─── Captions, prompts, banners ──────────────────────────────────────

function EffectiveChainCaption({ chain }: { chain: Stage[] }) {
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

// EDITOR-UI-FR-018 — the input half of the null ⟺ unresolved design.
// Each required-nullable field gets the narrowest control that can express
// its value: a select where the value set is closed, a text box where it is
// not. Fields outside this table render as a read-only prompt.
const RESOLVABLE_FIELD_INPUTS: Record<
  string,
  { label: string; options?: readonly string[]; placeholder?: string; hint?: string }
> = {
  '/project/runtime/version': {
    label: 'Node version',
    placeholder: '20',
    hint: 'Major version only — 20, v20.11.0 and >=20 all commit as 20.',
  },
  '/project/runtime/name': { label: 'Runtime', options: SUPPORTED_RUNTIMES },
  '/project/packageManager/name': {
    label: 'Package manager',
    options: SUPPORTED_PACKAGE_MANAGERS,
  },
  '/project/packageManager/version': {
    label: 'Package manager version',
    placeholder: '10',
    hint: 'Major version only.',
  },
  '/project/language': { label: 'Language', options: SUPPORTED_LANGUAGES },
};

function UnresolvedPrompt({
  entry,
  primary,
  onResolve,
}: {
  entry: { field: string; message: string };
  primary: boolean;
  onResolve?: (field: string, value: string) => void;
}) {
  const input = RESOLVABLE_FIELD_INPUTS[entry.field];
  const [draft, setDraft] = useState('');
  const [rejected, setRejected] = useState(false);
  const classes = ['unresolved-prompt'];
  if (primary) classes.push('unresolved-prompt--primary');

  function commit() {
    if (onResolve === undefined) return;
    const value = draft.trim();
    if (value === '') return;
    // The IR's own normalizer decides; an unusable value is reported here
    // rather than written, so the null ⟺ unresolved invariant is never
    // broken by a typo.
    if (normalizeProjectFieldValue(entry.field as never, value) === null) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onResolve(entry.field, value);
  }

  return (
    <div className={classes.join(' ')} data-field={entry.field}>
      <code className="unresolved-prompt__field">{entry.field}</code>
      <span className="unresolved-prompt__message">{entry.message}</span>
      {input !== undefined && onResolve !== undefined && (
        <div className="unresolved-prompt__resolve">
          {input.options !== undefined ? (
            <select
              className="unresolved-prompt__input"
              aria-label={input.label}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setRejected(false);
                if (e.target.value !== '') onResolve(entry.field, e.target.value);
              }}
            >
              <option value="">Choose…</option>
              {input.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="unresolved-prompt__input"
              aria-label={input.label}
              value={draft}
              placeholder={input.placeholder}
              onChange={(e) => {
                setDraft(e.target.value);
                setRejected(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
            />
          )}
          {input.options === undefined && (
            <button
              type="button"
              className="btn btn--small"
              onClick={commit}
              disabled={draft.trim() === ''}
            >
              Set {input.label.toLowerCase()}
            </button>
          )}
          {rejected && (
            <span className="unresolved-prompt__error" role="alert">
              {`"${draft.trim()}" is not a value this field accepts.`}
            </span>
          )}
          {!rejected && input.hint !== undefined && (
            <span className="unresolved-prompt__hint">{input.hint}</span>
          )}
        </div>
      )}
    </div>
  );
}

function WarningsBanner({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="warnings-banner" role="status" aria-live="polite">
      <strong>Detection produced {warnings.length} warning(s):</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>
            <code>{w.manifest}</code>: {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ValidationBanner({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="validation-banner" role="alert" data-testid="validation-errors">
      <strong>The working pipeline is invalid:</strong>
      <ul>
        {errors.slice(0, 5).map((e, i) => (
          <li key={i}>
            <code>{e.path}</code> — {e.message}
          </li>
        ))}
        {errors.length > 5 && <li>…and {errors.length - 5} more.</li>}
      </ul>
    </div>
  );
}

// ─── Trigger (branch) editor ─────────────────────────────────────────

function TriggerEditor({
  ir,
  onCommit,
}: {
  ir: PipelineIR;
  onCommit: (branches: string[]) => void;
}) {
  const current = ir.triggers?.[0]?.branches ?? [];
  const display = current.length > 0 ? current.join(', ') : 'main';
  const isDefault = current.length === 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);

  function commit() {
    setEditing(false);
    const branches = draft.split(',').map((b) => b.trim()).filter((b) => b !== '');
    const changed = branches.join(',') !== current.join(',');
    if (changed && !(isDefault && branches.join(',') === 'main')) onCommit(branches);
    else setDraft(display);
  }

  if (editing) {
    return (
      <span className="trigger-editor">
        <span className="label">on push to:</span>
        <input
          type="text"
          className="stage-node__step-input trigger-editor__input"
          aria-label="Trigger branches"
          value={draft}
          autoFocus
          placeholder="main, develop"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(display);
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }
  return (
    <span className="trigger-editor">
      <span className="label">on push to:</span>{' '}
      <code>{display}</code>
      {isDefault && <span className="trigger-editor__default">(default)</span>}
      <button
        type="button"
        className="stage-node__step-edit trigger-editor__edit"
        aria-label="Edit trigger branches"
        title="Branches the exported CI configs trigger on"
        onClick={() => {
          setDraft(display);
          setEditing(true);
        }}
      >
        ✎
      </button>
    </span>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────

// Unicode-safe base64 for the share-link hash.
function encodeShareHash(json: string): string {
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeShareHash(hash: string): string {
  return decodeURIComponent(escape(atob(hash)));
}

export function Editor() {
  const [projectPath, setProjectPath] = useState('');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  // SEC-02 — where the current document came from. `detected` is the only
  // provenance whose commands the user implicitly authored.
  const [provenance, setProvenance] = useState<IRProvenance>('detected');
  // A share link never loads on its own; it waits here until the user has
  // seen its commands.
  const [pendingShare, setPendingShare] = useState<PipelineIR | null>(null);
  const [loadedIR, setLoadedIR] = useState<PipelineIR | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspacePlan, setWorkspacePlan] = useState<WorkspacePlan | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<SavedPipeline | null>(null);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('pipe-editor:onboarded') === null;
    } catch {
      return false;
    }
  });
  function dismissOnboarding() {
    setShowOnboarding(false);
    try {
      window.localStorage.setItem('pipe-editor:onboarded', '1');
    } catch {
      /* private mode */
    }
  }
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const { workingIR, apply, reset, undo, redo, canUndo, canRedo } = useUndoableIR();

  const effectiveChain = useMemo(() => {
    if (workingIR === null) return [] as Stage[];
    return computeEffectiveChain(workingIR);
  }, [workingIR]);
  const effectiveChainIds = useMemo(
    () => new Set(effectiveChain.map((s) => s.id)),
    [effectiveChain],
  );

  const validationErrors = useMemo(
    () => (workingIR === null ? [] : validate(workingIR)),
    [workingIR],
  );
  const irValid = validationErrors.length === 0;

  const blockingUnresolved = workingIR
    ? hasUnresolvedRequiredField(workingIR)
    : null;

  const onDetect = useCallback(
    async (pathOverride?: string) => {
      const path = pathOverride ?? projectPath;
      if (path === '') return;
      setProjectPath(path);
      setDetectLoading(true);
      setDetectError(null);
      try {
        const res = await postDetect(path);
        setLoadedIR(Object.freeze(JSON.parse(JSON.stringify(res.ir))) as PipelineIR);
        reset(res.ir);
        setWarnings(res.warnings);
        setDetectedPath(path);
        setImportedFrom(null);
        setProvenance('detected');
        setWorkspacePlan(null);
        setSaveState(null);
        recordRecent(path, res.ir.project.name);
        // Continuity: offer to restore autosaved edits from a previous
        // session when they differ from what detection just produced.
        setRestoreCandidate(null);
        getSavedPipeline(path)
          .then((saved) => {
            if (saved !== null && !canonicalEquals(saved.ir, res.ir)) {
              setRestoreCandidate(saved);
            }
          })
          .catch(() => undefined);
      } catch (err) {
        setDetectError(readableApiError(err, 'detect this project'));
        setLoadedIR(null);
        reset(null);
        setWarnings([]);
        setDetectedPath(null);
      } finally {
        setDetectLoading(false);
      }
    },
    [projectPath, reset],
  );

  const onInspectWorkspace = useCallback(
    async (pathOverride?: string) => {
      const path = pathOverride ?? projectPath;
      if (path === '') return;
      setProjectPath(path);
      setWorkspaceLoading(true);
      setDetectError(null);
      try {
        const plan = await postInspectWorkspace(path);
        setWorkspacePlan(plan);
        setLoadedIR(null);
        reset(null);
        setWarnings([]);
        setDetectedPath(null);
        setImportedFrom(null);
        setRestoreCandidate(null);
        recordRecent(path, plan.name);
      } catch (err) {
        setDetectError(readableApiError(err, 'scan this workspace'));
        setWorkspacePlan(null);
      } finally {
        setWorkspaceLoading(false);
      }
    },
    [projectPath, reset],
  );

  const loadIrIntoEditor = useCallback(
    (
      ir: PipelineIR,
      opts: {
        source: string;
        warnings?: Warning[];
        runnablePath?: string | null;
        provenance?: IRProvenance;
      },
    ) => {
      setLoadedIR(Object.freeze(JSON.parse(JSON.stringify(ir))) as PipelineIR);
      reset(ir);
      setWarnings(opts.warnings ?? []);
      setDetectedPath(opts.runnablePath ?? null);
      setImportedFrom(opts.source);
      setProvenance(opts.provenance ?? 'imported');
    },
    [reset],
  );

  // Import from raw text: a pipe-editor pipeline (JSON/YAML) loads
  // directly; anything else is sent to the CI migration engine, which
  // understands GitHub Actions workflows and GitLab CI configs.
  const loadExternalIR = useCallback(
    async (text: string, sourceLabel: string) => {
      setDetectError(null);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        try {
          parsed = yamlLoad(text);
        } catch {
          setDetectError(`Could not parse ${sourceLabel} as JSON or YAML.`);
          return;
        }
      }

      const looksLikeIR =
        parsed !== null &&
        typeof parsed === 'object' &&
        'stages' in (parsed as object) &&
        'project' in (parsed as object);

      if (looksLikeIR) {
        const errors = validate(parsed);
        if (errors.length > 0) {
          setDetectError(
            `${sourceLabel} is not a valid pipeline: ${errors[0].path} — ${errors[0].message}` +
              (errors.length > 1 ? ` (+${errors.length - 1} more)` : ''),
          );
          return;
        }
        loadIrIntoEditor(parsed as PipelineIR, { source: sourceLabel });
        return;
      }

      // Not our format — try the CI migration engine.
      try {
        const res = await postImport(text);
        const providerLabel =
          res.provider === 'github-actions' ? 'GitHub Actions' : 'GitLab CI';
        loadIrIntoEditor(res.ir, {
          source: `${sourceLabel} · converted from ${providerLabel}`,
          warnings: res.warnings.map((w) => ({ manifest: sourceLabel, message: w.message })),
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setDetectError(`${sourceLabel}: ${err.message}`);
        } else {
          setDetectError(
            `${sourceLabel} is neither a pipe-editor pipeline nor a recognizable CI configuration.`,
          );
        }
      }
    },
    [loadIrIntoEditor],
  );

  // "Visualize this project's existing CI" — the file lives inside a
  // workspace project, so the imported pipeline is immediately runnable.
  const onImportProjectCi = useCallback(
    async (path: string, file: string) => {
      setDetectError(null);
      setDetectLoading(true);
      try {
        const res = await postImportFromProject(path, file);
        const providerLabel =
          res.provider === 'github-actions' ? 'GitHub Actions' : 'GitLab CI';
        loadIrIntoEditor(res.ir, {
          source: `${file} · converted from ${providerLabel}`,
          warnings: res.warnings.map((w) => ({ manifest: file, message: w.message })),
          runnablePath: path,
        });
        setProjectPath(path);
        recordRecent(path, res.ir.project.name);
      } catch (err) {
        setDetectError(
          err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message,
        );
      } finally {
        setDetectLoading(false);
      }
    },
    [loadIrIntoEditor],
  );

  // Share links: #ir=<base64(canonical JSON)>.
  //
  // SEC-02 — a link is the least deliberate of the three import paths: it
  // can be sent to someone and opened without any act of importing. It
  // therefore never loads on its own. The document is decoded, validated
  // and held; the user sees every command it carries and decides.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#ir=')) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    try {
      const parsed: unknown = JSON.parse(decodeShareHash(hash.slice(4)));
      const errors = validate(parsed);
      if (errors.length > 0) {
        setDetectError('The shared link does not contain a valid pipeline.');
        return;
      }
      setPendingShare(parsed as PipelineIR);
    } catch {
      setDetectError('The shared link is corrupted and could not be decoded.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onShareLink() {
    if (workingIR === null) return;
    const url = `${window.location.origin}${window.location.pathname}#ir=${encodeShareHash(
      serializeCanonical(workingIR),
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {
      setDetectError('Clipboard unavailable — copy the URL from the address bar after opening it.');
    }
  }

  function onImportFile(file: File | undefined | null) {
    if (!file) return;
    void file.text().then((text) => void loadExternalIR(text, file.name));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const droppedFolder = droppedDirectoryPath(e.dataTransfer);
    if (droppedFolder !== null) {
      let folderPath = droppedFolder.path;
      if (droppedFolder.needsResolution) {
        try {
          const { matches } = await resolveDroppedDirectory(folderPath);
          if (matches.length === 0) {
            setDetectError(
              `Could not find “${folderPath}” inside the configured workspace. Use “Browse folders” or update WORKSPACE_HOST_PATH.`,
            );
            return;
          }
          if (matches.length > 1) {
            setDetectError(
              `More than one folder is named “${folderPath}”: ${matches.join(', ')}. Use “Browse folders” to choose the right one.`,
            );
            return;
          }
          [folderPath] = matches;
        } catch (error) {
          setDetectError(readableApiError(error, 'resolve the dropped folder'));
          return;
        }
      }
      setProjectPath(folderPath);
      setDetectError(null);
      setDropMessage(`Folder selected: ${folderPath}. Choose how you want to open it.`);
      return;
    }
    onImportFile(e.dataTransfer.files?.[0]);
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  // Autosave: persist the working pipeline (debounced) whenever it
  // differs from the detected baseline; delete the save once the user
  // is back at baseline. Paused while a restore decision is pending.
  useEffect(() => {
    if (
      workingIR === null ||
      loadedIR === null ||
      detectedPath === null ||
      restoreCandidate !== null ||
      !irValid
    ) {
      return;
    }
    const dirty = !canonicalEquals(workingIR, loadedIR);
    // Pristine and nothing saved this session: no server call (also
    // avoids racing the restore-candidate fetch right after detect).
    if (!dirty && saveState === null) return;
    const t = setTimeout(() => {
      setSaveState('saving');
      (dirty
        ? putSavedPipeline(detectedPath, workingIR)
        : deleteSavedPipeline(detectedPath)
      )
        .then(() => setSaveState(dirty ? 'saved' : null))
        .catch(() => setSaveState(null));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingIR, loadedIR, detectedPath, restoreCandidate, irValid]);

  // Any edit made while the restore bar is open implicitly dismisses it
  // (the user chose to start from the freshly detected pipeline).
  useEffect(() => {
    if (restoreCandidate !== null && canUndo) setRestoreCandidate(null);
  }, [canUndo, restoreCandidate]);

  function onRestoreSaved() {
    if (restoreCandidate === null) return;
    apply(restoreCandidate.ir); // undoable: ⌘Z returns to the detected pipeline
    setRestoreCandidate(null);
  }

  function onDiscardSaved() {
    if (restoreCandidate === null || detectedPath === null) return;
    void deleteSavedPipeline(detectedPath).catch(() => undefined);
    setRestoreCandidate(null);
  }

  // Keyboard shortcuts: ⌘/Ctrl+Z undo, ⌘/Ctrl+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return; // let text fields keep native undo
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  function onToggleStage(stageId: string) {
    if (workingIR === null) return;
    apply(toggleStageEnabled(workingIR, stageId));
  }

  function onEditStep(stageId: string, stepIndex: number, run: string) {
    if (workingIR === null) return;
    apply(updateStepRun(workingIR, stageId, stepIndex, run));
  }

  function onDeleteStage(stageId: string) {
    if (workingIR === null) return;
    apply(removeStage(workingIR, stageId));
  }

  function onAddStage() {
    if (workingIR === null) return;
    const id = nextCustomStageId(workingIR);
    // Insert before docker-build when present; otherwise at the tail.
    const dockerBuild = workingIR.stages.find((s) => s.id === 'docker-build');
    const afterId = dockerBuild
      ? dockerBuild.dependsOn[0] ?? null
      : workingIR.stages[workingIR.stages.length - 1]?.id ?? null;
    const image =
      workingIR.stages[0]?.container.image ??
      `node:${workingIR.project.runtime.version ?? '20'}-alpine`;
    apply(
      insertStageAfter(workingIR, afterId, {
        id,
        name: 'Custom stage',
        enabled: true,
        container: { image },
        steps: [
          {
            id: `${id}-run`,
            run: 'echo "edit me — this command runs in the stage container"',
            workingDir: '.',
            env: {},
          },
        ],
      }),
    );
  }

  function onResetToDetected() {
    if (loadedIR === null) return;
    reset(JSON.parse(JSON.stringify(loadedIR)) as PipelineIR);
  }

  function onEditImage(stageId: string, image: string) {
    if (workingIR === null) return;
    apply(updateStageImage(workingIR, stageId, image));
  }

  function onEditTrigger(branches: string[]) {
    if (workingIR === null) return;
    apply(setTriggerBranches(workingIR, branches));
  }

  // EDITOR-UI-FR-018 — commit a value to a required-nullable /project/*
  // field. resolveProjectField drops the paired unresolved entry in the
  // same operation, so the IR never passes through a state that violates
  // null ⟺ unresolved. Undoable like every other edit.
  function onResolveField(field: string, value: string) {
    if (workingIR === null) return;
    const next = resolveProjectField(workingIR, field, value);
    if (next !== workingIR) apply(next);
  }

  function onSwitchProject() {
    setLoadedIR(null);
    reset(null);
    setWarnings([]);
    setDetectedPath(null);
    setImportedFrom(null);
    setProvenance('detected');
    setPendingShare(null);
    setDetectError(null);
    setWorkspacePlan(null);
  }

  function onExportJson() {
    if (workingIR === null) return;
    const json = serializeCanonical(workingIR);
    download(
      `${workingIR.project.name}.pipeline.json`,
      json + '\n',
      'application/json',
    );
  }

  function onExportYaml() {
    if (workingIR === null) return;
    const canonicalObject = JSON.parse(serializeCanonical(workingIR));
    const yamlStr = yamlDump(canonicalObject, { sortKeys: true, noRefs: true });
    download(
      `${workingIR.project.name}.pipeline.yaml`,
      yamlStr,
      'application/x-yaml',
    );
  }

  return (
    <div
      className={`editor ${dragActive ? 'editor--dragging' : ''}`}
      data-testid="editor-root"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      {dragActive && (
        <div className="editor__drop-overlay" role="status">
          <span aria-hidden="true">↓</span>
          <strong>Drop the folder here</strong>
          <small>Or drop a JSON/YAML file to import a pipeline</small>
        </div>
      )}
      <header className="editor__header">
        <div className="editor__brand">
          <BrandMark />
          <div>
            <span className="editor__eyebrow">Local CI studio</span>
            <h1>Pipe Editor</h1>
          </div>
        </div>
        <div className="editor__header-copy">
          <p className="editor__tagline">
            Understand, shape and prove your pipeline before the push.
          </p>
          <div className="editor__trust-row" aria-label="Product guarantees">
            <span>Local-first</span>
            <span>Portable output</span>
            <span>Spec-driven</span>
          </div>
        </div>
      </header>

      <section className="editor__detect">
        <div className="editor__detect-copy">
          <label htmlFor="projectPath">Choose a project folder</label>
          <span>
            Relative to <code>{workspaceRoot || 'the configured workspace root'}</code>,
            or paste a contained absolute path.
          </span>
        </div>
        <div className="editor__detect-field">
          <span className="editor__prompt" aria-hidden="true">▰</span>
          <input
            id="projectPath"
            aria-label="projectPath"
            type="text"
            placeholder="folder or /contained/absolute/path"
            value={projectPath}
            onChange={(e) => {
              setProjectPath(e.target.value);
              setDropMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onDetect();
            }}
            disabled={detectLoading || workspaceLoading}
          />
          <button
            type="button"
            className="editor__browse-button"
            onClick={() => setFolderPickerOpen(true)}
          >
            Browse folders
          </button>
        </div>
        <div className="editor__open-actions">
          <button
            type="button"
            onClick={() => void onDetect()}
            disabled={detectLoading || workspaceLoading || projectPath === ''}
            title="Open one Node app in the visual pipeline editor"
          >
            <strong>{detectLoading ? 'Opening…' : 'Edit one app'}</strong>
            <small>Detect its CI stages</small>
          </button>
          <button
            type="button"
            className="btn--workspace"
            onClick={() => void onInspectWorkspace()}
            disabled={detectLoading || workspaceLoading || projectPath === ''}
            title="Find frontend, backend, and worker services below this folder"
          >
            <strong>{workspaceLoading ? 'Scanning…' : 'Scan all services'}</strong>
            <small>Build Docker + CI bundle</small>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.yml,.yaml,application/json"
          hidden
          aria-label="Import pipeline file"
          onChange={(e) => {
            onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn--ghost"
          onClick={() => fileInputRef.current?.click()}
          title="Load a previously exported pipeline (.json / .yaml) — or just drag the file anywhere onto this page"
        >
          Import CI file
        </button>
        {(workingIR || workspacePlan) && (
          <button
            type="button"
            className="btn--ghost"
            onClick={onSwitchProject}
            title="Back to the project list"
          >
            Switch project
          </button>
        )}
        {detectError && (
          <div className="editor__error" role="alert">
            {detectError}
          </div>
        )}
        {dropMessage && !detectError && (
          <div className="editor__selection-note" role="status">{dropMessage}</div>
        )}
      </section>

      <FolderPicker
        open={folderPickerOpen}
        initialPath={projectPath}
        onClose={() => setFolderPickerOpen(false)}
        onChoose={(path) => {
          setProjectPath(path);
          setDropMessage(`Folder selected: ${path}. Choose “Edit one app” or “Scan all services”.`);
          setDetectError(null);
        }}
      />

      {workingIR === null && workspacePlan === null && !detectLoading && !workspaceLoading && showOnboarding && (
        <div className="onboarding" data-testid="onboarding">
          <div className="onboarding__intro">
            <span className="onboarding__kicker">From repository to confidence</span>
            <h2>Your CI pipeline, made visible.</h2>
            <p>
              Pipe Editor reads project manifests, builds an explainable pipeline
              and lets you verify its commands in isolated local containers.
            </p>
          </div>
          <div className="onboarding__steps">
            <div className="onboarding__step">
              <span className="onboarding__num">1</span>
              <strong>Discover</strong>
              <span>
                Scan a local project or turn an existing CI file into an editable
                pipeline.
              </span>
            </div>
            <div className="onboarding__step">
              <span className="onboarding__num">2</span>
              <strong>Shape</strong>
              <span>
                Edit stages, images and commands with undo, autosave and live
                validation.
              </span>
            </div>
            <div className="onboarding__step">
              <span className="onboarding__num">3</span>
              <strong>Prove</strong>
              <span>
                Run the same commands locally, inspect logs, then export portable
                Docker and CI files.
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={dismissOnboarding}
          >
            Got it — don't show again
          </button>
        </div>
      )}

      {workingIR === null && workspacePlan === null && !detectLoading && !workspaceLoading && (
        <ProjectPicker
          selectedPath={projectPath}
          onSelect={(path) => {
            setProjectPath(path);
            setDropMessage(`Folder selected: ${path}. Choose how you want to open it.`);
          }}
          onDetect={(path) => void onDetect(path)}
          onScan={(path) => void onInspectWorkspace(path)}
          onImportCi={(path, file) => void onImportProjectCi(path, file)}
          onWorkspaceRoot={setWorkspaceRoot}
          busy={detectLoading || workspaceLoading}
        />
      )}

      {pendingShare !== null && (
        <ShareLinkReview
          commands={listPipelineCommands(pendingShare)}
          onLoad={() => {
            loadIrIntoEditor(pendingShare, {
              source: 'a shared link',
              provenance: 'shared',
            });
            setPendingShare(null);
          }}
          onDiscard={() => setPendingShare(null)}
        />
      )}

      {(detectLoading || workspaceLoading) && workingIR === null && workspacePlan === null && (
        <div className="editor__loading" role="status">
          <span className="spinner" aria-hidden="true" />{' '}
          {workspaceLoading ? 'Finding services…' : 'Detecting project…'}
        </div>
      )}

      {workspacePlan && (
        <WorkspaceStudio initialPlan={workspacePlan} onBack={onSwitchProject} />
      )}

      {workingIR && (() => {
        const pmName = workingIR.unresolved?.find(
          (u) => u.field === '/project/packageManager/name',
        );
        const showPmPrimary =
          workingIR.stages.length === 0 && pmName !== undefined;
        const remainingUnresolved = (workingIR.unresolved ?? []).filter(
          (u) => !(showPmPrimary && u.field === '/project/packageManager/name'),
        );
        const project = workingIR.project;
        return (
        <>
          <section className="project-info" data-testid="project-info">
            <span className="project-info__name">{project.name}</span>
            {detectedPath && <code className="project-info__path">{detectedPath}</code>}
            {importedFrom && (
              <span className="badge badge--stale" title="Loaded from a file or share link, not detected from the workspace">
                imported from {importedFrom}
              </span>
            )}
            {project.runtime.name && (
              <span className="badge badge--pm">
                {project.runtime.name} {project.runtime.version ?? '?'}
              </span>
            )}
            {project.packageManager.name && (
              <span className="badge badge--pm">
                {project.packageManager.name} {project.packageManager.version ?? ''}
              </span>
            )}
            {project.language && <span className="badge">{project.language}</span>}
            <span className="project-info__spacer" />
            <TriggerEditor ir={workingIR} onCommit={onEditTrigger} />
          </section>

          {restoreCandidate && (
            <div className="restore-bar" role="status" data-testid="restore-bar">
              <span>
                You have saved edits for this project from{' '}
                {new Date(restoreCandidate.savedAt).toLocaleString()} that differ
                from the freshly detected pipeline.
              </span>
              <button type="button" className="btn btn--small" onClick={onRestoreSaved}>
                Restore my edits
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={onDiscardSaved}>
                Discard them
              </button>
            </div>
          )}

          {showPmPrimary && (
            <UnresolvedPrompt entry={pmName!} primary onResolve={onResolveField} />
          )}

          <WarningsBanner warnings={warnings} />
          <ValidationBanner errors={validationErrors} />

          <div className="editor__workspace">
          <main className="editor__canvas" aria-label="Pipeline editor">
          <div className="editor__toolbar" data-testid="toolbar">
            <button
              type="button"
              className="btn btn--small"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⇧⌘Z)"
            >
              ↪ Redo
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={onResetToDetected}
              disabled={!canUndo && !canRedo}
              title="Discard every edit and return to the detected pipeline"
            >
              Reset to detected
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void onShareLink()}
              title="Copy a URL that opens this exact pipeline in any pipe-editor"
            >
              {shareCopied ? 'Link copied ✓' : '🔗 Share link'}
            </button>
            <span className="editor__toolbar-spacer" />
            {saveState !== null && detectedPath !== null && (
              <span className="save-indicator" data-testid="save-indicator">
                {saveState === 'saving' ? 'Saving…' : 'Saved ✓'}
              </span>
            )}
            <button
              type="button"
              className="btn btn--small"
              onClick={onAddStage}
              title="Insert a custom stage into the chain"
            >
              + Add stage
            </button>
          </div>

          <EffectiveChainCaption chain={effectiveChain} />

          <section className="editor__chain" data-testid="chain">
            {workingIR.stages.length === 0 ? (
              <div className="editor__empty-chain">
                No stages were detected. See unresolved prompts above for
                what blocks pipeline emission.
              </div>
            ) : (
              workingIR.stages.map((stage, i) => (
                <div key={stage.id} className="chain-row">
                  <StageNode
                    stage={stage}
                    inEffectiveChain={effectiveChainIds.has(stage.id)}
                    onToggle={() => onToggleStage(stage.id)}
                    onEditStep={(stepIndex, run) => onEditStep(stage.id, stepIndex, run)}
                    onEditImage={(image) => onEditImage(stage.id, image)}
                    onDelete={() => onDeleteStage(stage.id)}
                  />
                  {i < workingIR.stages.length - 1 && (
                    <Connector
                      active={
                        effectiveChainIds.has(stage.id) &&
                        effectiveChainIds.has(workingIR.stages[i + 1].id)
                      }
                    />
                  )}
                </div>
              ))
            )}
          </section>

          </main>
          <aside className="editor__rail" aria-label="Pipeline tools">

          <DoctorPanel workingIR={workingIR} irValid={irValid} />

          {remainingUnresolved.length > 0 && (
            <section
              className="editor__unresolved"
              data-testid="unresolved-list"
            >
              <h2>Unresolved</h2>
              {remainingUnresolved.map((u, i) => (
                <UnresolvedPrompt
                  key={`${u.field}-${i}`}
                  entry={u}
                  primary={false}
                  onResolve={onResolveField}
                />
              ))}
            </section>
          )}

          <section className="editor__actions">
            <button type="button" onClick={onExportJson}>
              Export JSON
            </button>
            <button type="button" onClick={onExportYaml}>
              Export YAML
            </button>
            {blockingUnresolved !== null && (
              <span className="editor__hint">
                Resolve <code>{blockingUnresolved}</code> before generating.
              </span>
            )}
          </section>

          <ArtifactsPanel
            workingIR={workingIR}
            irValid={irValid}
            blockingUnresolved={blockingUnresolved}
          />

          {detectedPath ? (
            <RunPanel
              projectPath={detectedPath}
              workingIR={workingIR}
              irValid={irValid}
              blockingUnresolved={blockingUnresolved}
              provenance={provenance}
              provenanceLabel={importedFrom}
            />
          ) : (
            <div className="editor__hint editor__hint--block">
              This pipeline was imported, so there is no local project to run
              it against. Detect a workspace project to unlock ▶ Run.
            </div>
          )}
          </aside>
          </div>
        </>
        );
      })()}

      {loadedIR && (
        <span
          data-testid="loaded-ir-digest"
          data-loaded-ir={serializeCanonical(loadedIR)}
          hidden
        />
      )}

      <footer className="editor__footer">
        <span>⌘Z undo · ⇧⌘Z redo · Enter opens one app</span>
      </footer>
    </div>
  );
}
