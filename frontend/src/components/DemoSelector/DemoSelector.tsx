import type { DemoWorkflow } from '../../types/pipeline';

interface Props {
  workflows: DemoWorkflow[];
  selected: DemoWorkflow | null;
  onSelect: (workflow: DemoWorkflow) => void;
}

export function DemoSelector({ workflows, selected, onSelect }: Props) {
  if (workflows.length === 0) {
    return (
      <div className="p-4 text-sm text-[#6e7681]">Loading demo workflows…</div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-2 py-1 text-xs text-[#6e7681] font-semibold uppercase tracking-wider">
        Demo Workflows
      </p>
      {workflows.map((wf) => {
        const isSelected = selected?.name === wf.name;
        return (
          <button
            key={wf.name}
            onClick={() => onSelect(wf)}
            className="w-full text-left px-3 py-2.5 rounded transition-colors"
            style={{
              background: isSelected ? 'rgba(88,166,255,0.1)' : 'transparent',
              border: `1px solid ${isSelected ? '#58a6ff' : 'transparent'}`,
            }}
          >
            <div
              className="text-sm font-semibold mb-0.5 truncate"
              style={{ color: isSelected ? '#58a6ff' : '#c9d1d9' }}
            >
              {wf.label}
            </div>
            <div className="text-xs leading-snug" style={{ color: '#6e7681' }}>
              {wf.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
