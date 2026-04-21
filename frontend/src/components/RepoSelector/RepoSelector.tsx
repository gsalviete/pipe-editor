import { useState, useMemo } from 'react';
import type { RepoSummary } from '../../types/pipeline';

interface Props {
  repos: RepoSummary[];
  selectedRepo: RepoSummary | null;
  loading: boolean;
  onSelect: (repo: RepoSummary) => void;
}

export function RepoSelector({ repos, selectedRepo, loading, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return repos;
    const q = query.toLowerCase();
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [repos, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#8b949e] gap-2">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
        Loading repositories…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-[#30363d]">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6e7681]"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            type="text"
            placeholder="Filter repositories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
          />
        </div>
      </div>

      {/* List */}
      <ul className="flex-1 overflow-y-auto divide-y divide-[#21262d]">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-[#6e7681] text-sm italic">
            {query ? 'No repositories match.' : 'No repositories found.'}
          </li>
        )}
        {filtered.map((repo) => {
          const isSelected = selectedRepo?.id === repo.id;
          return (
            <li key={repo.id}>
              <button
                className="w-full text-left px-4 py-3 hover:bg-[#161b22] transition-colors"
                style={{
                  background: isSelected ? '#161b22' : undefined,
                  borderLeft: isSelected ? '2px solid #58a6ff' : '2px solid transparent',
                }}
                onClick={() => onSelect(repo)}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    {repo.private ? (
                      <path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z" />
                    ) : (
                      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Z" />
                    )}
                  </svg>
                  <span className="font-mono text-sm text-[#58a6ff] truncate">
                    {repo.fullName}
                  </span>
                </div>
                {repo.description && (
                  <p className="text-xs text-[#8b949e] mt-1 line-clamp-1">
                    {repo.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[#6e7681]">
                    {repo.defaultBranch}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
