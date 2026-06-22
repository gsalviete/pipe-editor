// The Visual Editor — top-level component for the EDITOR spec.
//
// Implements EDITOR-UI-FR-001…015. Two interactions: toggle
// Stage.enabled, and read `unresolved` prompts. Connectors reflect
// computeEffectiveChain(workingIR). The Loaded IR (the snapshot
// returned by /api/detect) is kept separately and is never mutated.

import { useMemo, useState } from 'react';
import { dump as yamlDump } from 'js-yaml';
import {
  computeEffectiveChain,
  serializeCanonical,
  type PipelineIR,
  type Stage,
} from '@modules/ir';
import { ApiError, postDetect, postGenerate } from './api';
import { hasUnresolvedRequiredField, toggleStageEnabled } from './working-ir';

interface Warning {
  manifest: string;
  message: string;
}

interface GeneratedArtifacts {
  dockerfile: string;
  dockerignore: string;
}

function StageNode({
  stage,
  inEffectiveChain,
  onToggle,
}: {
  stage: Stage;
  inEffectiveChain: boolean;
  onToggle: () => void;
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
      </div>
      <div className="stage-node__body">
        <div className="stage-node__image">
          <span className="label">image:</span>{' '}
          <code>{stage.container.image}</code>
        </div>
        {stage.steps[0] ? (
          <div className="stage-node__step">
            <span className="label">step[0].run:</span>{' '}
            <code>{stage.steps[0].run}</code>
          </div>
        ) : (
          <div className="stage-node__step stage-node__step--empty">
            no steps declared
          </div>
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

function UnresolvedPrompt({
  entry,
  primary,
}: {
  entry: { field: string; message: string };
  primary: boolean;
}) {
  const classes = ['unresolved-prompt'];
  if (primary) classes.push('unresolved-prompt--primary');
  return (
    <div className={classes.join(' ')} data-field={entry.field}>
      <code className="unresolved-prompt__field">{entry.field}</code>
      <span className="unresolved-prompt__message">{entry.message}</span>
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

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Editor() {
  const [projectPath, setProjectPath] = useState('');
  const [loadedIR, setLoadedIR] = useState<PipelineIR | null>(null);
  const [workingIR, setWorkingIR] = useState<PipelineIR | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);

  const [artifacts, setArtifacts] = useState<GeneratedArtifacts | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);

  const effectiveChainIds = useMemo(() => {
    if (workingIR === null) return new Set<string>();
    return new Set(computeEffectiveChain(workingIR).map((s) => s.id));
  }, [workingIR]);

  const blockingUnresolved = workingIR
    ? hasUnresolvedRequiredField(workingIR)
    : null;

  async function onDetect() {
    setDetectLoading(true);
    setDetectError(null);
    setArtifacts(null);
    setGenerateError(null);
    try {
      const res = await postDetect(projectPath);
      // Take a frozen snapshot of the Loaded IR so the immutability
      // assertion in EDITOR-AC-024 holds even if downstream code is
      // careless.
      setLoadedIR(Object.freeze(JSON.parse(JSON.stringify(res.ir))) as PipelineIR);
      setWorkingIR(res.ir);
      setWarnings(res.warnings);
    } catch (err) {
      if (err instanceof ApiError) {
        setDetectError(`${err.code}: ${err.message}`);
      } else {
        setDetectError((err as Error).message);
      }
      setLoadedIR(null);
      setWorkingIR(null);
      setWarnings([]);
    } finally {
      setDetectLoading(false);
    }
  }

  function onToggleStage(stageId: string) {
    if (workingIR === null) return;
    setWorkingIR(toggleStageEnabled(workingIR, stageId));
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
    // Round-trip-safe: yaml.dump produces a YAML representation whose
    // yaml.load() returns a structurally-equal IR. The serializeCanonical
    // → JSON.parse step ensures sorted-key form before YAML emission.
    const canonicalObject = JSON.parse(serializeCanonical(workingIR));
    const yamlStr = yamlDump(canonicalObject, { sortKeys: true, noRefs: true });
    download(
      `${workingIR.project.name}.pipeline.yaml`,
      yamlStr,
      'application/x-yaml',
    );
  }

  async function onGenerateDockerfile() {
    if (workingIR === null) return;
    setGenerateLoading(true);
    setGenerateError(null);
    setArtifacts(null);
    try {
      const res = await postGenerate(workingIR);
      setArtifacts(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setGenerateError(`${err.code}: ${err.message}`);
      } else {
        setGenerateError((err as Error).message);
      }
    } finally {
      setGenerateLoading(false);
    }
  }

  return (
    <div className="editor" data-testid="editor-root">
      <header className="editor__header">
        <h1>pipe-editor</h1>
        <p className="editor__tagline">
          Detect → review → toggle → export — no remote runner required.
        </p>
      </header>

      <section className="editor__detect">
        <label htmlFor="projectPath">projectPath</label>
        <input
          id="projectPath"
          type="text"
          placeholder="path/relative/to/workspace-root"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          disabled={detectLoading}
        />
        <button
          type="button"
          onClick={onDetect}
          disabled={detectLoading || projectPath === ''}
        >
          {detectLoading ? 'Detecting…' : 'Detect'}
        </button>
        {detectError && (
          <div className="editor__error" role="alert">
            {detectError}
          </div>
        )}
      </section>

      {workingIR && (() => {
        const pmName = workingIR.unresolved?.find(
          (u) => u.field === '/project/packageManager/name',
        );
        const showPmPrimary =
          workingIR.stages.length === 0 && pmName !== undefined;
        const remainingUnresolved = (workingIR.unresolved ?? []).filter(
          (u) => !(showPmPrimary && u.field === '/project/packageManager/name'),
        );
        return (
        <>
          {showPmPrimary && (
            <UnresolvedPrompt entry={pmName!} primary />
          )}

          <WarningsBanner warnings={warnings} />

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
            <button
              type="button"
              onClick={onGenerateDockerfile}
              disabled={generateLoading || blockingUnresolved !== null}
              title={
                blockingUnresolved
                  ? `Resolve ${blockingUnresolved} before generating.`
                  : undefined
              }
            >
              {generateLoading ? 'Generating…' : 'Generate Dockerfile'}
            </button>
            {blockingUnresolved !== null && (
              <span className="editor__hint">
                Resolve <code>{blockingUnresolved}</code> before generating.
              </span>
            )}
          </section>

          {generateError && (
            <div className="editor__error" role="alert">
              {generateError}
            </div>
          )}

          {artifacts && (
            <section className="editor__artifacts" data-testid="artifacts">
              <h2>Generated Dockerfile</h2>
              <pre>
                <code>{artifacts.dockerfile}</code>
              </pre>
              <h2>Generated .dockerignore</h2>
              <pre>
                <code>{artifacts.dockerignore}</code>
              </pre>
            </section>
          )}
        </>
        );
      })()}

      {loadedIR && (
        // Hidden debug attribute so a test can assert the Loaded IR
        // remains canonicalEquals to the original after toggles
        // (EDITOR-AC-024).
        <span
          data-testid="loaded-ir-digest"
          data-loaded-ir={serializeCanonical(loadedIR)}
          hidden
        />
      )}
    </div>
  );
}
