// Docker naming rules, in one place.
//
// `project.name` comes from package.json or from the editor, so it is
// arbitrary text. Two distinct hazards follow, and they need distinct fixes:
//
//   1. It is interpolated into a Docker image reference. `@acme/api` is a
//      perfectly ordinary npm name and a completely invalid Docker tag, so
//      every artifact generated for a scoped package was broken.
//   2. It is interpolated into generated comments and shell commands, where
//      a newline injects lines into the artifact and `;` or backticks extend
//      the command.
//
// Before this module the workspace-bundle path slugged service ids with a
// private copy of the rule while the single-service path did not slug at
// all (adversarial review GEN-01).

/**
 * A valid Docker image-name component derived from arbitrary text.
 *
 * The reference grammar admits lowercase alphanumerics separated by `.`,
 * `_`, `__` or runs of `-`, and must start and end with an alphanumeric.
 * Anything else collapses to `-`.
 *
 * `"@acme/api"` becomes `"acme-api"`; `"My App!"` becomes `"my-app"`;
 * `"---"` becomes the fallback.
 */
export function dockerTagSlug(value: string, fallback = 'app'): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    // A 48-character cut can land on a separator.
    .replace(/-+$/g, '');
  return normalized === '' ? fallback : normalized;
}

/**
 * Text safe to interpolate into a generated comment line.
 *
 * Strips every C0/C1 control character - newlines and carriage returns
 * included - so a crafted `project.name` cannot break out of the comment and
 * inject directives into a Dockerfile or a YAML document. Collapses the
 * resulting whitespace and bounds the length.
 */
export function sanitizeForComment(value: string, maxLength = 120): string {
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}
