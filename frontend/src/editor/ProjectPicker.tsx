// Project picker — auto-discovered projects from GET /api/projects,
// with search, favorites (pinned) and recents. A card click selects;
// explicit actions choose single-app editing or multi-service scanning.

import { useEffect, useMemo, useState } from 'react';
import {
  DiscoveredProject,
  getProjects,
  getSavedPipelinesIndex,
} from './api';
import {
  getFavorites,
  getRecents,
  RecentProject,
  toggleFavorite,
} from './recent-projects';

export function ProjectPicker({
  selectedPath,
  onSelect,
  onDetect,
  onScan,
  onImportCi,
  onWorkspaceRoot,
  busy,
}: {
  selectedPath: string;
  onSelect: (path: string) => void;
  onDetect: (path: string) => void;
  onScan: (path: string) => void;
  onImportCi: (path: string, file: string) => void;
  onWorkspaceRoot: (path: string) => void;
  busy: boolean;
}) {
  const [projects, setProjects] = useState<DiscoveredProject[] | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recents, setRecents] = useState<RecentProject[]>(() => getRecents());
  const [savedIndex, setSavedIndex] = useState<Record<string, { savedAt: string }>>({});

  useEffect(() => {
    let cancelled = false;
    getSavedPipelinesIndex()
      .then((idx) => !cancelled && setSavedIndex(idx))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [scanNonce, setScanNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    setLoadError(null);
    getProjects()
      .then((res) => {
        if (cancelled) return;
        setProjects(res.projects);
        setWorkspaceRoot(res.workspaceRoot);
        onWorkspaceRoot(res.workspaceRoot);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [onWorkspaceRoot, scanNonce]);

  // Re-read recents whenever the picker regains relevance (cheap).
  useEffect(() => {
    setRecents(getRecents());
  }, [busy]);

  const filtered = useMemo(() => {
    if (projects === null) return [];
    const q = query.trim().toLowerCase();
    const matches = q === ''
      ? projects
      : projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
        );
    const favSet = new Set(favorites);
    return [...matches].sort((a, b) => {
      const favDelta = Number(favSet.has(b.path)) - Number(favSet.has(a.path));
      if (favDelta !== 0) return favDelta;
      return 0; // keep scanner order (shallow first) otherwise
    });
  }, [projects, query, favorites]);

  if (projects === null) {
    return (
      <section className="picker" data-testid="project-picker">
        <div className="picker__loading" role="status">
          <span className="spinner" aria-hidden="true" /> Scanning workspace for projects…
        </div>
      </section>
    );
  }

  return (
    <section className="picker" data-testid="project-picker">
      <div className="picker__header">
        <h2>Projects</h2>
        {workspaceRoot && (
          <span className="picker__root" title={workspaceRoot}>
            workspace: <code>{workspaceRoot}</code>
          </span>
        )}
        {projects.length > 3 && (
          <input
            type="search"
            className="picker__search"
            placeholder="Filter projects…"
            aria-label="Filter projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      <p className="picker__root">
        Select a project below. <strong>Edit app</strong> opens one package;
        <strong> Scan services</strong> searches below that folder and prepares
        a Docker + CI bundle.
      </p>

      {loadError && (
        <div className="picker__error">
          Could not scan the workspace ({loadError}). Is the backend running
          with a valid <code>PIPE_EDITOR_WORKSPACE_ROOT</code>?{' '}
          <button
            type="button"
            className="btn btn--small"
            onClick={() => setScanNonce((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {recents.length > 0 && (
        <div className="picker__recents" data-testid="recent-projects">
          <span className="picker__recents-label">Recent:</span>
          {recents.map((r) => (
            <button
              key={r.path}
              type="button"
              className="picker__recent-chip"
              disabled={busy}
              onClick={() => onSelect(r.path)}
              onDoubleClick={() => onDetect(r.path)}
              title={r.path}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {projects.length === 0 && !loadError && (
        <div className="picker__empty">
          <p>
            No projects found under the workspace root. Put a project with a
            <code> package.json</code> inside it, or point
            <code> PIPE_EDITOR_WORKSPACE_ROOT</code> somewhere else and restart
            the backend.
          </p>
        </div>
      )}

      {filtered.length === 0 && projects.length > 0 && (
        <div className="picker__empty">No project matches “{query}”.</div>
      )}

      <div className="picker__grid">
        {filtered.map((p) => {
          const isFavorite = favorites.includes(p.path);
          return (
            <div
              key={p.path}
              className={`project-card ${selectedPath === p.path ? 'is-selected' : ''}`}
            >
              <button
                type="button"
                className="project-card__main"
                disabled={busy}
                onClick={() => onSelect(p.path)}
                onDoubleClick={() => onDetect(p.path)}
                aria-label={`Select ${p.name}`}
              >
                <span className="project-card__name">{p.name}</span>
                <span className="project-card__path">{p.path}</span>
                <span className="project-card__badges">
                  {savedIndex[p.path] && (
                    <span
                      className="badge badge--stale"
                      title={`You edited this pipeline on ${new Date(savedIndex[p.path].savedAt).toLocaleString()} — opening it will offer to restore your edits`}
                    >
                      ✎ saved edits
                    </span>
                  )}
                  {p.packageManager && (
                    <span className="badge badge--pm">{p.packageManager}</span>
                  )}
                  {p.isMonorepoRoot && <span className="badge">monorepo</span>}
                  {p.hasDockerfile && <span className="badge">Dockerfile</span>}
                  {p.scripts.slice(0, 4).map((s) => (
                    <span key={s} className="badge badge--script">
                      {s}
                    </span>
                  ))}
                </span>
              </button>
              {p.ciConfigs.length > 0 && (
                <div className="project-card__ci">
                  {p.ciConfigs.slice(0, 2).map((file) => (
                    <button
                      key={file}
                      type="button"
                      className="project-card__ci-chip"
                      disabled={busy}
                      onClick={() => onImportCi(p.path, file)}
                      aria-label={`Visualize existing CI ${file} of ${p.name}`}
                      title={`This project already has CI — convert ${file} into an editable, locally runnable pipeline`}
                    >
                      ⚡ {file.includes('gitlab') ? 'GitLab CI' : 'GitHub Actions'}: visualize
                    </button>
                  ))}
                </div>
              )}
              <div className="project-card__actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDetect(p.path)}
                  aria-label={`Detect ${p.name}`}
                >
                  Edit app
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onScan(p.path)}
                  aria-label={`Scan services ${p.name}`}
                >
                  Scan services
                </button>
              </div>
              <button
                type="button"
                className={`project-card__star ${isFavorite ? 'project-card__star--on' : ''}`}
                aria-label={
                  isFavorite ? `Unfavorite ${p.name}` : `Favorite ${p.name}`
                }
                aria-pressed={isFavorite}
                onClick={() => setFavorites(toggleFavorite(p.path))}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
