const COMPOSE_FILENAME = /^(?:docker-)?compose(?:[._-][a-z0-9][a-z0-9._-]*)?\.ya?ml$/i;

export const MAX_TRACKED_COMPOSE_FILES = 200;

export function isComposeFilename(filename: string): boolean {
  return COMPOSE_FILENAME.test(filename);
}

export function composeDirectory(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '.' : path.slice(0, separator);
}

export function nextComposeArtifactPath(
  directory: string,
  existingComposeFiles: readonly string[],
): string {
  const prefix = directory === '.' ? '' : `${directory}/`;
  const existing = new Set(existingComposeFiles);
  const directoryAlreadyHasCompose = existingComposeFiles.some(
    (path) => composeDirectory(path) === directory,
  );

  if (!directoryAlreadyHasCompose) return `${prefix}docker-compose.yml`;

  let candidate = `${prefix}docker-compose.pipe-editor.yml`;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${prefix}docker-compose.pipe-editor-${suffix}.yml`;
    suffix += 1;
  }
  return candidate;
}
