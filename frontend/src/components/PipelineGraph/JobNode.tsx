import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { GraphNode } from '../../types/pipeline';
import { STATUS_STYLES, STATUS_LABEL } from './StatusColors';

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: GraphNode['status'] }) {
  switch (status) {
    case 'success':
      return (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
      );
    case 'failure':
      return (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      );
    case 'running':
      return (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="28"
            strokeDashoffset="10"
          />
        </svg>
      );
    case 'queued':
      return (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" />
        </svg>
      );
    case 'skipped':
      return (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.75 2a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V2.75a.75.75 0 0 0-.75-.75h-1.5Zm9.586 5.25L7.159 3.573A.75.75 0 0 0 6 4.159v7.682a.75.75 0 0 0 1.159.586l4.177-3.677a.75.75 0 0 0 0-1.5Z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
        </svg>
      );
  }
}

// ─── Duration formatter ───────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Job node component ───────────────────────────────────────────────────────

export const JobNode = memo(function JobNode({ data, selected }: NodeProps<GraphNode>) {
  const style = STATUS_STYLES[data.status];

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: style.border, border: 'none', width: 8, height: 8 }}
      />

      <div
        className="relative flex flex-col gap-1 rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150"
        style={{
          width: 200,
          minHeight: 72,
          border: `1.5px solid ${selected ? '#58a6ff' : style.border}`,
          background: style.bg,
          boxShadow: selected
            ? '0 0 0 2px rgba(88,166,255,0.4)'
            : style.glow ?? 'none',
        }}
      >
        {/* Header: icon + name */}
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: style.text }}>
            <StatusIcon status={data.status} />
          </span>
          <span
            className="font-mono text-sm font-semibold truncate"
            style={{ color: style.text }}
            title={data.label}
          >
            {data.label}
          </span>
        </div>

        {/* Runner label */}
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#6e7681' }}>
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7.5a2 2 0 0 1-1.5 1.94v.06h.75a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5H2.5v-.06A2 2 0 0 1 1 10.5V3Zm2-0.5a.5.5 0 0 0-.5.5v7.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5H3Z" />
          </svg>
          <span className="truncate">
            {Array.isArray(data.runsOn) ? data.runsOn.join(', ') : data.runsOn}
          </span>
        </div>

        {/* Status badge + duration */}
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-mono ${style.badge}`}
          >
            {STATUS_LABEL[data.status]}
          </span>
          {data.durationSeconds != null && (
            <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
              {formatDuration(data.durationSeconds)}
            </span>
          )}
        </div>

        {/* Matrix indicator */}
        {data.strategy && (
          <div className="absolute top-1 right-1">
            <span className="text-xs px-1 rounded" style={{ background: '#21262d', color: '#8b949e' }}>
              matrix
            </span>
          </div>
        )}

        {/* Conditional indicator */}
        {data.if && (
          <div
            className="text-xs font-mono truncate mt-0.5"
            style={{ color: '#6e7681' }}
            title={`if: ${data.if}`}
          >
            if: {data.if}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: style.border, border: 'none', width: 8, height: 8 }}
      />
    </>
  );
});
