import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  getDirectories,
  type WorkspaceDirectoryListing,
} from './api';

export function FolderPicker({
  open,
  initialPath,
  onClose,
  onChoose,
}: {
  open: boolean;
  initialPath: string;
  onClose: () => void;
  onChoose: (path: string) => void;
}) {
  const [listing, setListing] = useState<WorkspaceDirectoryListing | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedPath(null);
    try {
      setListing(await getDirectories(path));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof TypeError
            ? 'The local API is offline. Start the backend and try again.'
            : (cause as Error).message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(initialPath.trim() || '.');
  }, [initialPath, load, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  const breadcrumbs = useMemo(() => {
    if (listing === null || listing.currentPath === '.') return [];
    const parts = listing.currentPath.split('/');
    return parts.map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join('/'),
    }));
  }, [listing]);

  if (!open) return null;

  function choose(path: string) {
    onChoose(path);
    onClose();
  }

  return (
    <div className="folder-picker__backdrop" role="presentation">
      <section
        className="folder-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
      >
        <header className="folder-picker__header">
          <div>
            <span className="workspace-kicker">Workspace browser</span>
            <h2 id="folder-picker-title">Choose a folder</h2>
            <p>Single-click selects. Double-click or “Open” goes inside. Confirm when you reach the folder you want.</p>
          </div>
          <button type="button" className="folder-picker__close" onClick={onClose} aria-label="Close folder browser">×</button>
        </header>

        {listing && (
          <>
            <div className="folder-picker__root">
              <span>Allowed workspace root</span>
              <code>{listing.workspaceRoot}</code>
            </div>
            <nav className="folder-picker__breadcrumbs" aria-label="Current folder">
              <button type="button" onClick={() => void load('.')}>workspace</button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.path}>
                  <b>/</b>
                  <button type="button" onClick={() => void load(crumb.path)}>{crumb.name}</button>
                </span>
              ))}
            </nav>
          </>
        )}

        <div className="folder-picker__list" aria-busy={loading}>
          {loading && <div className="folder-picker__state"><span className="spinner" /> Loading folders…</div>}
          {!loading && error && (
            <div className="folder-picker__state folder-picker__state--error">
              <strong>Could not open that folder</strong>
              <span>{error}</span>
              <button type="button" className="btn btn--small" onClick={() => void load('.')}>Back to workspace root</button>
            </div>
          )}
          {!loading && !error && listing?.directories.length === 0 && (
            <div className="folder-picker__state">This folder has no visible subfolders.</div>
          )}
          {!loading && !error && listing?.directories.map((directory) => (
            <div
              key={directory.path}
              className={`folder-picker__row ${selectedPath === directory.path ? 'is-selected' : ''}`}
              onDoubleClick={() => void load(directory.path)}
            >
              <button
                type="button"
                className="folder-picker__select"
                aria-label={`Select ${directory.name}`}
                aria-pressed={selectedPath === directory.path}
                onClick={() => setSelectedPath(directory.path)}
              >
                <span className="folder-picker__icon" aria-hidden="true">▰</span>
                <span>
                  <strong>{directory.name}</strong>
                  <small>{directory.isProject ? 'Node project' : 'Folder'}</small>
                </span>
              </button>
              <button
                type="button"
                className="folder-picker__browse"
                onClick={() => void load(directory.path)}
                aria-label={`Open ${directory.name}`}
              >
                Open →
              </button>
            </div>
          ))}
        </div>

        <footer className="folder-picker__footer">
          <div>
            <span>Selected folder</span>
            <code>{selectedPath ?? listing?.currentPath ?? 'none'}</code>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          {listing && (
            <button type="button" className="btn" onClick={() => choose(listing.currentPath)}>
              Use current folder
            </button>
          )}
          <button
            type="button"
            className="btn folder-picker__confirm"
            disabled={selectedPath === null}
            onClick={() => selectedPath && choose(selectedPath)}
          >
            Use selected folder
          </button>
        </footer>
      </section>
    </div>
  );
}
