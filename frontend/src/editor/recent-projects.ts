// Recents + favorites, persisted in localStorage. Defensive: storage
// may be unavailable (private mode) or hold garbage — never throw.

export interface RecentProject {
  path: string;
  name: string;
  lastUsedAt: string;
}

const RECENTS_KEY = 'pipe-editor:recent-projects';
const FAVORITES_KEY = 'pipe-editor:favorite-projects';
const MAX_RECENTS = 8;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — recents are a convenience only */
  }
}

export function getRecents(): RecentProject[] {
  const items = read<RecentProject[]>(RECENTS_KEY, []);
  return Array.isArray(items) ? items.filter((r) => typeof r?.path === 'string') : [];
}

export function recordRecent(path: string, name: string): RecentProject[] {
  const next: RecentProject[] = [
    { path, name, lastUsedAt: new Date().toISOString() },
    ...getRecents().filter((r) => r.path !== path),
  ].slice(0, MAX_RECENTS);
  write(RECENTS_KEY, next);
  return next;
}

export function getFavorites(): string[] {
  const items = read<string[]>(FAVORITES_KEY, []);
  return Array.isArray(items) ? items.filter((p) => typeof p === 'string') : [];
}

export function toggleFavorite(path: string): string[] {
  const current = getFavorites();
  const next = current.includes(path)
    ? current.filter((p) => p !== path)
    : [...current, path];
  write(FAVORITES_KEY, next);
  return next;
}
