import type { GraphNode, JobLog } from '../../types/pipeline';
import { STATUS_STYLES, STATUS_LABEL } from '../PipelineGraph/StatusColors';
import { LogViewer } from '../LogViewer/LogViewer';

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: GraphNode['steps'][number] }) {
  return (
    <div className="px-3 py-2 rounded border border-[#21262d] bg-[#0d1117] text-sm">
      {step.name && (
        <div className="font-mono text-[#c9d1d9] mb-1 truncate">{step.name}</div>
      )}
      {step.uses && (
        <div className="font-mono text-[#79c0ff] text-xs">{step.uses}</div>
      )}
      {step.run && (
        <pre className="text-[#8b949e] text-xs mt-1 whitespace-pre-wrap break-words line-clamp-3">
          {step.run}
        </pre>
      )}
      {step.if && (
        <div className="text-[#6e7681] text-xs mt-1 font-mono">if: {step.if}</div>
      )}
    </div>
  );
}

// ─── Matrix section ───────────────────────────────────────────────────────────

function MatrixSection({ strategy }: { strategy: NonNullable<GraphNode['strategy']> }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
        Matrix Strategy
      </h3>
      <div className="space-y-1">
        {Object.entries(strategy.matrix).map(([key, values]) => (
          <div key={key} className="flex gap-2 text-sm font-mono">
            <span className="text-[#79c0ff]">{key}:</span>
            <span className="text-[#8b949e]">[{values.join(', ')}]</span>
          </div>
        ))}
      </div>
      {strategy.failFast != null && (
        <div className="text-xs text-[#6e7681] mt-1 font-mono">
          fail-fast: {String(strategy.failFast)}
        </div>
      )}
    </section>
  );
}

// ─── Timing section ───────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  node: GraphNode;
  jobLog: JobLog | null;
  loadingLog: boolean;
  onClose: () => void;
}

export function NodePanel({ node, jobLog, loadingLog, onClose }: Props) {
  const style = STATUS_STYLES[node.status];

  return (
    <aside
      className="flex flex-col h-full overflow-hidden border-l border-[#30363d]"
      style={{ background: '#0f1117', width: 420 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]"
        style={{ background: '#161b22' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: style.border }}
          />
          <h2
            className="font-mono font-semibold text-sm truncate"
            style={{ color: style.text }}
            title={node.label}
          >
            {node.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#21262d] transition-colors text-[#8b949e] hover:text-[#c9d1d9] flex-shrink-0 ml-2"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metadata */}
        <section className="px-4 py-3 border-b border-[#21262d] space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <MetaRow label="Status" value={STATUS_LABEL[node.status]} valueColor={style.text} />
            <MetaRow
              label="Runner"
              value={Array.isArray(node.runsOn) ? node.runsOn.join(', ') : node.runsOn}
            />
            {node.if && <MetaRow label="Condition" value={node.if} mono />}
            {node.startedAt && (
              <MetaRow label="Started" value={formatTimestamp(node.startedAt)} />
            )}
            {node.completedAt && (
              <MetaRow label="Completed" value={formatTimestamp(node.completedAt)} />
            )}
            {node.durationSeconds != null && (
              <MetaRow label="Duration" value={formatDuration(node.durationSeconds)} />
            )}
          </div>
        </section>

        {/* Matrix */}
        {node.strategy && (
          <section className="px-4 py-3 border-b border-[#21262d]">
            <MatrixSection strategy={node.strategy} />
          </section>
        )}

        {/* Steps */}
        <section className="px-4 py-3 border-b border-[#21262d]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
            Steps ({node.steps.length})
          </h3>
          <div className="space-y-1.5">
            {node.steps.length === 0 ? (
              <p className="text-[#6e7681] text-sm italic">No steps defined</p>
            ) : (
              node.steps.map((step, idx) => (
                <StepCard key={idx} step={step} />
              ))
            )}
          </div>
        </section>

        {/* Logs */}
        <section className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
            Logs
          </h3>
          {loadingLog ? (
            <div className="flex items-center gap-2 text-[#8b949e] text-sm py-4">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="28"
                  strokeDashoffset="10"
                />
              </svg>
              Loading logs...
            </div>
          ) : !node.runJobId ? (
            <p className="text-[#6e7681] text-sm italic">
              Select a workflow run to view logs.
            </p>
          ) : !jobLog ? (
            <p className="text-[#6e7681] text-sm italic">No logs available.</p>
          ) : (
            <LogViewer log={jobLog} />
          )}
        </section>
      </div>
    </aside>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MetaRow({
  label,
  value,
  valueColor,
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <>
      <span className="text-[#6e7681] text-xs">{label}</span>
      <span
        className={`text-xs truncate ${mono ? 'font-mono' : ''}`}
        style={{ color: valueColor ?? '#c9d1d9' }}
        title={value}
      >
        {value}
      </span>
    </>
  );
}
