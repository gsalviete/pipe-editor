// Run panel — starts a local pipeline run (POST /api/execute),
// follows it live over SSE, renders per-stage status + streaming
// logs, and supports abort. Docker availability gates the button.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineIR } from '@modules/ir';
import { UntrustedRunConfirm } from './CommandReview';
import { listPipelineCommands, type IRProvenance } from './working-ir';
import {
  abortRun,
  ApiError,
  getExecuteAvailability,
  listRuns,
  openRunStream,
  RunEvent,
  RunResult,
  RunSummary,
  StageRunResult,
  startRun,
} from './api';
import { CopyButton } from './ui';

type LiveStageStatus = 'pending' | 'running' | StageRunResult['status'];

interface LiveStage {
  id: string;
  name: string;
  status: LiveStageStatus;
  logs: string;
  result?: StageRunResult;
  startedAtMs?: number;
  image?: string;
  shellCommand?: string;
}

interface LiveRun {
  runId: string | null;
  phase: 'starting' | 'running' | 'done' | 'error';
  stages: LiveStage[];
  result?: RunResult;
  error?: string;
}

const MAX_LIVE_LOG_CHARS = 256 * 1024;
const LIVE_LOG_TRUNCATION_MARKER =
  '\n[pipe-editor: earlier live output truncated to protect this tab]\n';

function appendLiveLog(current: string, chunk: string): string {
  const alreadyTruncated = current.startsWith(LIVE_LOG_TRUNCATION_MARKER);
  const body = alreadyTruncated
    ? current.slice(LIVE_LOG_TRUNCATION_MARKER.length) + chunk
    : current + chunk;
  if (!alreadyTruncated && body.length <= MAX_LIVE_LOG_CHARS) return body;
  return (
    LIVE_LOG_TRUNCATION_MARKER +
    body.slice(-(MAX_LIVE_LOG_CHARS - LIVE_LOG_TRUNCATION_MARKER.length))
  );
}

function statusIcon(status: LiveStageStatus): string {
  switch (status) {
    case 'pending':
      return '◌';
    case 'running':
      return '●';
    case 'passed':
      return '✓';
    case 'failed':
      return '✗';
    default:
      return '⊘'; // any skip
  }
}

function statusLabel(status: LiveStageStatus): string {
  if (status.startsWith('skipped:')) return status.slice('skipped:'.length);
  return status;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

// ─── Execution timeline (profiler) ───────────────────────────────────
// Gantt-style view of a finished run: one bar per executed stage,
// positioned on the run's real time axis, plus each stage's share of
// the total and a faster/slower delta vs the previous run of the same
// project when one exists.

function ExecutionTimeline({
  stages,
  result,
  previousDurations,
}: {
  stages: LiveStage[];
  result: RunResult;
  previousDurations: Map<string, number> | null;
}) {
  const executed = stages.filter(
    (s) => s.result?.startedAt && s.result?.finishedAt,
  );
  if (executed.length === 0) return null;

  const t0 = Math.min(...executed.map((s) => Date.parse(s.result!.startedAt as string)));
  const t1 = Math.max(...executed.map((s) => Date.parse(s.result!.finishedAt as string)));
  const span = Math.max(t1 - t0, 1);

  return (
    <div className="timeline" data-testid="execution-timeline">
      <div className="timeline__header">
        <span className="timeline__title">Execution timeline</span>
        <span className="timeline__total">{formatMs(result.durationMs)} total</span>
      </div>
      {stages.map((s) => {
        const r = s.result;
        if (!r || !r.startedAt || !r.finishedAt) {
          return (
            <div key={s.id} className="timeline__row timeline__row--skipped">
              <span className="timeline__label">{s.id}</span>
              <span className="timeline__skip">not executed ({statusLabel(s.status)})</span>
            </div>
          );
        }
        const left = ((Date.parse(r.startedAt) - t0) / span) * 100;
        const width = Math.max((r.durationMs / span) * 100, 0.75);
        const share = Math.round((r.durationMs / Math.max(result.durationMs, 1)) * 100);
        const prev = previousDurations?.get(s.id);
        const delta = prev !== undefined ? r.durationMs - prev : null;
        return (
          <div key={s.id} className="timeline__row">
            <span className="timeline__label">{s.id}</span>
            <div className="timeline__track">
              <div
                className={`timeline__bar timeline__bar--${r.status.replace(':', '-')}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${s.id}: ${formatMs(r.durationMs)} (${share}% of the run)`}
              />
            </div>
            <span className="timeline__duration">
              {formatMs(r.durationMs)}
              <span className="timeline__share"> · {share}%</span>
            </span>
            {delta !== null && Math.abs(delta) >= 100 && (
              <span
                className={`timeline__delta timeline__delta--${delta > 0 ? 'slower' : 'faster'}`}
                title="Compared with the previous run of this project"
              >
                {delta > 0 ? '▲' : '▼'} {formatMs(Math.abs(delta))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageLog({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre className="run-stage__log" ref={ref}>
      <code>{text || '(no output)'}</code>
    </pre>
  );
}

export function RunPanel({
  projectPath,
  workingIR,
  irValid,
  blockingUnresolved,
  provenance,
  provenanceLabel,
}: {
  projectPath: string;
  workingIR: PipelineIR;
  irValid: boolean;
  blockingUnresolved: string | null;
  /** SEC-02 — where this IR came from. */
  provenance: IRProvenance;
  /** Human-readable source, e.g. "a shared link" or "ci.yml". */
  provenanceLabel: string | null;
}) {
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [run, setRun] = useState<LiveRun | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, setTick] = useState(0);
  // SEC-02 — has the user confirmed the commands of THIS loaded pipeline?
  // Reset whenever a different pipeline is loaded (see the effect below),
  // so confirming one import does not silently cover the next.
  const [reviewed, setReviewed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const closeStream = useRef<(() => void) | null>(null);

  const needsReview = provenance !== 'detected' && !reviewed;
  const commands = useMemo(() => listPipelineCommands(workingIR), [workingIR]);

  useEffect(() => {
    setReviewed(false);
    setReviewOpen(false);
  }, [provenance, provenanceLabel]);

  useEffect(() => {
    let cancelled = false;
    getExecuteAvailability()
      .then((res) => !cancelled && setDockerAvailable(res.available))
      .catch(() => !cancelled && setDockerAvailable(null));
    listRuns()
      .then((res) => !cancelled && setHistory(res.runs))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function refreshHistory() {
    listRuns()
      .then((res) => setHistory(res.runs))
      .catch(() => undefined);
  }

  // Re-open a retained run: rebuild the panel state from its stored result.
  function loadPastRun(summary: RunSummary) {
    if (!summary.result) return;
    closeStream.current?.();
    setStartError(null);
    setRun({
      runId: summary.id,
      phase: 'done',
      result: summary.result,
      stages: summary.result.stages.map((r) => ({
        id: r.stageId,
        name: r.stageId,
        status: r.status,
        logs: r.stdout + r.stderr,
        result: r,
      })),
    });
  }

  // Ticker so running-stage durations update.
  const running = run?.phase === 'running' || run?.phase === 'starting';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => () => closeStream.current?.(), []);

  const disabledReason = useMemo(() => {
    if (running) return null;
    if (dockerAvailable === false) return 'Docker is not available — start Docker Desktop / the daemon.';
    if (blockingUnresolved) return `Resolve ${blockingUnresolved} first.`;
    if (!irValid) return 'Fix the pipeline validation errors first.';
    return null;
  }, [running, dockerAvailable, blockingUnresolved, irValid]);

  function applyEvent(event: RunEvent) {
    setRun((current) => {
      if (current === null) return current;
      switch (event.type) {
        case 'stage-started':
          return {
            ...current,
            phase: 'running',
            stages: current.stages.map((s) =>
              s.id === event.stageId
                ? {
                    ...s,
                    status: 'running',
                    startedAtMs: Date.now(),
                    image: event.image,
                    shellCommand: event.shellCommand,
                  }
                : s,
            ),
          };
        case 'stage-output':
          return {
            ...current,
            stages: current.stages.map((s) =>
              s.id === event.stageId
                ? { ...s, logs: appendLiveLog(s.logs, event.chunk) }
                : s,
            ),
          };
        case 'stage-finished':
          return {
            ...current,
            stages: current.stages.map((s) =>
              s.id === event.result.stageId
                ? {
                    ...s,
                    status: event.result.status,
                    result: event.result,
                    logs: s.logs || event.result.stdout + event.result.stderr,
                  }
                : s,
            ),
          };
        case 'run-finished':
          return { ...current, phase: 'done', result: event.result };
        case 'run-error':
          return { ...current, phase: 'error', error: event.message };
      }
    });
    if (event.type === 'run-finished' || event.type === 'run-error') {
      refreshHistory();
    }
    if (event.type === 'stage-started') {
      // Auto-expand the stage that just started; collapse nothing.
      setExpanded((e) => ({ ...e, [event.stageId]: true }));
    }
    if (event.type === 'stage-finished' && event.result.status === 'passed') {
      setExpanded((e) => ({ ...e, [event.result.stageId]: false }));
    }
  }

  function onRunClicked() {
    // SEC-02 — an IR the user did not author gets its commands listed and
    // acknowledged before the first run. After that, this pipeline is
    // treated as reviewed for the rest of the session.
    if (needsReview) {
      setReviewOpen(true);
      return;
    }
    void onRun();
  }

  async function onRun() {
    setStartError(null);
    setReviewOpen(false);
    closeStream.current?.();
    setRun({
      runId: null,
      phase: 'starting',
      stages: workingIR.stages.map((s) => ({
        id: s.id,
        name: s.name,
        status: 'pending',
        logs: '',
      })),
    });
    try {
      const { runId } = await startRun(projectPath, workingIR);
      setRun((r) => (r === null ? r : { ...r, runId }));
      closeStream.current = openRunStream(runId, applyEvent, () =>
        setRun((r) =>
          r !== null && (r.phase === 'running' || r.phase === 'starting')
            ? { ...r, phase: 'error', error: 'Lost connection to the run stream.' }
            : r,
        ),
      );
    } catch (err) {
      setRun(null);
      if (err instanceof ApiError && err.code === 'DOCKER_UNAVAILABLE') {
        setDockerAvailable(false);
        setStartError(err.message);
      } else {
        setStartError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function onAbort() {
    if (run?.runId) {
      try {
        await abortRun(run.runId);
      } catch {
        /* run may have already finished */
      }
    }
  }

  const aggregate = run?.result;

  // Previous comparable run (same project, finished, not the current one)
  // for timeline regression deltas.
  const previousDurations = useMemo(() => {
    if (run === null || aggregate === undefined) return null;
    const prev = history.find(
      (h) =>
        h.id !== run.runId &&
        h.status === 'finished' &&
        h.result !== undefined &&
        h.projectPath === projectPath,
    );
    if (!prev?.result) return null;
    return new Map(prev.result.stages.map((s) => [s.stageId, s.durationMs]));
  }, [run, aggregate, history, projectPath]);

  return (
    <section className="run-panel" data-testid="run-panel">
      <div className="run-panel__bar">
        <button
          type="button"
          className="btn btn--run"
          onClick={onRunClicked}
          disabled={running || disabledReason !== null}
          title={disabledReason ?? 'Run the effective chain locally in Docker containers'}
        >
          {running ? 'Running…' : '▶ Run pipeline'}
        </button>
        {running && (
          <button type="button" className="btn btn--abort" onClick={onAbort}>
            Abort
          </button>
        )}
        {disabledReason !== null && !running && (
          <span className="run-panel__hint">{disabledReason}</span>
        )}
        {dockerAvailable === false && !running && run === null && (
          <span className="run-panel__docker-off">docker unavailable</span>
        )}
        {needsReview && !running && (
          <span className="run-panel__hint run-panel__hint--untrusted">
            Imported pipeline — its commands need a look before the first run.
          </span>
        )}
      </div>

      {reviewOpen && (
        <UntrustedRunConfirm
          source={provenanceLabel ?? 'somewhere other than this project'}
          commands={commands}
          onConfirm={() => {
            setReviewed(true);
            void onRun();
          }}
          onCancel={() => setReviewOpen(false)}
        />
      )}

      {startError && (
        <div className="editor__error" role="alert">
          {startError}
        </div>
      )}

      {run && (
        <div className="run-panel__stages" data-testid="run-stages">
          {run.stages.map((s) => {
            const isOpen = expanded[s.id] ?? s.status === 'failed';
            const duration =
              s.result?.durationMs ??
              (s.status === 'running' && s.startedAtMs
                ? Date.now() - s.startedAtMs
                : null);
            return (
              <div
                key={s.id}
                className={`run-stage run-stage--${s.status.replace(':', '-')}`}
                data-stage-id={s.id}
              >
                <button
                  type="button"
                  className="run-stage__header"
                  onClick={() => setExpanded((e) => ({ ...e, [s.id]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <span className={`run-stage__icon run-stage__icon--${s.status.replace(':', '-')}`} aria-hidden="true">
                    {statusIcon(s.status)}
                  </span>
                  <span className="run-stage__id">{s.id}</span>
                  <span className="run-stage__status">{statusLabel(s.status)}</span>
                  {duration !== null && (
                    <span className="run-stage__duration">{formatMs(duration)}</span>
                  )}
                  {s.result?.exitCode !== undefined &&
                    s.result?.exitCode !== null &&
                    s.result.exitCode !== 0 && (
                      <span className="run-stage__exit">exit {s.result.exitCode}</span>
                    )}
                </button>
                {isOpen && (s.logs || s.result?.skipReason || s.status === 'failed') && (
                  <div className="run-stage__body">
                    {s.result?.skipReason && (
                      <div className="run-stage__skip-reason">{s.result.skipReason}</div>
                    )}
                    {(s.logs || s.status === 'running') && <StageLog text={s.logs} />}
                    {s.status === 'failed' && s.image && s.shellCommand && (
                      <div className="run-stage__reproduce">
                        <span className="run-stage__reproduce-label">
                          Reproduce in your project directory:
                        </span>
                        <code className="run-stage__reproduce-cmd">
                          {reproduceCommand(s.image, s.shellCommand)}
                        </code>
                        <CopyButton
                          text={reproduceCommand(s.image, s.shellCommand)}
                          label="Copy command"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aggregate && (
        <div
          className={`run-panel__result run-panel__result--${aggregate.aggregateStatus}`}
          role="status"
          data-testid="run-result"
        >
          <strong>
            {aggregate.aggregateStatus === 'passed' && '✓ Pipeline passed'}
            {aggregate.aggregateStatus === 'failed' && '✗ Pipeline failed'}
            {aggregate.aggregateStatus === 'aborted' && '⊘ Run aborted'}
            {aggregate.aggregateStatus === 'unrunnable' && '⚠ Pipeline not runnable'}
          </strong>{' '}
          in {formatMs(aggregate.durationMs)}
          {aggregate.reason && <span className="run-panel__reason"> — {aggregate.reason}</span>}
        </div>
      )}

      {run && aggregate && (
        <ExecutionTimeline
          stages={run.stages}
          result={aggregate}
          previousDurations={previousDurations}
        />
      )}

      {run?.phase === 'error' && (
        <div className="editor__error" role="alert">
          {run.error}
        </div>
      )}

      {history.length > 0 && (
        <div className="run-history" data-testid="run-history">
          <button
            type="button"
            className="run-history__toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? '▾' : '▸'} Run history ({history.length})
          </button>
          {historyOpen && (
            <ul className="run-history__list">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="run-history__item"
                    disabled={h.status === 'running' || !h.result}
                    onClick={() => loadPastRun(h)}
                    title={h.result ? 'View this run' : 'Still running / no result'}
                  >
                    <span
                      className={`run-history__dot run-history__dot--${
                        h.result?.aggregateStatus ?? h.status
                      }`}
                      aria-hidden="true"
                    />
                    <code>{h.projectPath}</code>
                    <span className="run-history__meta">
                      {h.result?.aggregateStatus ?? h.status}
                      {h.result ? ` · ${formatMs(h.result.durationMs)}` : ''} ·{' '}
                      {new Date(h.createdAt).toLocaleTimeString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function reproduceCommand(image: string, shellCommand: string): string {
  return `docker run --rm -v "$PWD":/workspace -w /workspace ${image} sh -c '${shellCommand.replace(/'/g, `'\\''`)}'`;
}
