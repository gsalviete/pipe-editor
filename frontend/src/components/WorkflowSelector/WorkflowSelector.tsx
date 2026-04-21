import type { WorkflowSummary, WorkflowRun } from '../../types/pipeline';

// ─── Workflow list ────────────────────────────────────────────────────────────

interface WorkflowListProps {
  workflows: WorkflowSummary[];
  selected: WorkflowSummary | null;
  loading: boolean;
  onSelect: (wf: WorkflowSummary) => void;
}

export function WorkflowList({ workflows, selected, loading, onSelect }: WorkflowListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#8b949e] text-sm px-4 py-3">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
        Loading workflows…
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-[#6e7681] italic">No workflows found.</p>
    );
  }

  return (
    <ul className="divide-y divide-[#21262d]">
      {workflows.map((wf) => {
        const isSelected = selected?.id === wf.id;
        return (
          <li key={wf.id}>
            <button
              className="w-full text-left px-4 py-2.5 hover:bg-[#161b22] transition-colors flex items-center gap-2"
              style={{
                background: isSelected ? '#161b22' : undefined,
                borderLeft: isSelected ? '2px solid #58a6ff' : '2px solid transparent',
              }}
              onClick={() => onSelect(wf)}
            >
              <svg className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" />
              </svg>
              <div className="min-w-0">
                <div className="font-mono text-sm text-[#c9d1d9] truncate">{wf.name}</div>
                <div className="text-xs text-[#6e7681] truncate">{wf.path}</div>
              </div>
              {wf.state !== 'active' && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 flex-shrink-0">
                  disabled
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Run selector ─────────────────────────────────────────────────────────────

const CONCLUSION_COLORS: Record<string, string> = {
  success: '#3fb950',
  failure: '#f85149',
  cancelled: '#6e7681',
  skipped: '#6e7681',
  timed_out: '#f0883e',
  null: '#388bfd',
};

function runColor(run: WorkflowRun): string {
  return CONCLUSION_COLORS[run.conclusion ?? 'null'] ?? '#8b949e';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RunSelectorProps {
  runs: WorkflowRun[];
  selected: WorkflowRun | null;
  loading: boolean;
  onSelect: (run: WorkflowRun) => void;
}

export function RunSelector({ runs, selected, loading, onSelect }: RunSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#8b949e] text-sm px-4 py-3">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
        Loading runs…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-[#6e7681] italic">No runs found.</p>
    );
  }

  return (
    <ul className="divide-y divide-[#21262d]">
      {runs.map((run) => {
        const isSelected = selected?.id === run.id;
        const color = runColor(run);
        return (
          <li key={run.id}>
            <button
              className="w-full text-left px-4 py-2.5 hover:bg-[#161b22] transition-colors"
              style={{
                background: isSelected ? '#161b22' : undefined,
                borderLeft: isSelected ? `2px solid ${color}` : '2px solid transparent',
              }}
              onClick={() => onSelect(run)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="font-mono text-xs text-[#8b949e]">#{run.id}</span>
                <span className="text-sm text-[#c9d1d9] truncate">{run.headBranch}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-[#6e7681]">
                <span>{run.triggerEvent}</span>
                <span>·</span>
                <span>{run.actor}</span>
                <span>·</span>
                <span>{formatDate(run.createdAt)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
