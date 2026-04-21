import { useState } from 'react';
import type { JobLog, StepLog, LogLine } from '../../types/pipeline';

// ─── Log line ─────────────────────────────────────────────────────────────────

const LINE_COLORS: Record<string, string> = {
  error: '#ff7b72',
  warning: '#e3b341',
  debug: '#6e7681',
  command: '#79c0ff',
  info: '#c9d1d9',
};

function LogLineRow({ line }: { line: LogLine }) {
  const color = line.isError ? '#ff7b72' : LINE_COLORS[line.level] ?? '#c9d1d9';
  const bg = line.isError ? 'rgba(248,81,73,0.08)' : 'transparent';

  return (
    <div
      className="flex gap-2 px-2 py-0.5 font-mono text-xs leading-5 group hover:bg-[#161b22]"
      style={{ background: bg }}
    >
      <span className="select-none text-[#6e7681] w-8 text-right flex-shrink-0">
        {line.lineNumber}
      </span>
      {line.timestamp && (
        <span className="text-[#484f58] flex-shrink-0 hidden group-hover:inline">
          {new Date(line.timestamp).toLocaleTimeString()}
        </span>
      )}
      <span style={{ color }} className="break-all whitespace-pre-wrap">
        {line.content || '\u00a0'}
      </span>
    </div>
  );
}

// ─── Step accordion ───────────────────────────────────────────────────────────

function StepSection({ step, defaultOpen }: { step: StepLog; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-[#21262d] rounded overflow-hidden mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#161b22] transition-colors"
        style={{ background: '#0d1117' }}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
          viewBox="0 0 16 16"
          fill="#8b949e"
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.19 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>

        <span className="font-mono text-xs text-[#c9d1d9] flex-1 truncate">
          {step.stepNumber + 1}. {step.stepName}
        </span>

        {step.hasErrors && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900 text-red-300 font-mono flex-shrink-0">
            {step.errorCount} error{step.errorCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-xs text-[#6e7681] flex-shrink-0">
          {step.lines.length} lines
        </span>
      </button>

      {open && (
        <div
          className="overflow-x-auto"
          style={{ background: '#010409', maxHeight: 400 }}
        >
          {step.lines.map((line) => (
            <LogLineRow key={line.lineNumber} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main log viewer ──────────────────────────────────────────────────────────

export function LogViewer({ log }: { log: JobLog }) {
  const errorSteps = log.steps.filter((s) => s.hasErrors);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-[#6e7681]">
          {log.steps.length} step{log.steps.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[#6e7681]">·</span>
        <span className="text-[#6e7681]">{log.totalLines} lines</span>
        {log.hasErrors && (
          <>
            <span className="text-[#6e7681]">·</span>
            <span className="text-red-400 font-semibold">
              {errorSteps.length} step{errorSteps.length !== 1 ? 's' : ''} failed
            </span>
          </>
        )}
      </div>

      {/* Steps */}
      <div>
        {log.steps.map((step) => (
          <StepSection
            key={step.stepNumber}
            step={step}
            // Auto-open the first failing step for quicker debugging
            defaultOpen={step.hasErrors}
          />
        ))}
      </div>
    </div>
  );
}
