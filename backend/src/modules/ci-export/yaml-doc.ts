// YAML emission for the CI exporters.
//
// Both exporters used to assemble YAML line by line, interpolating stage
// names, commands, branch names and env keys straight into the text. Every
// one of those is reachable from the editor's own controls, and several
// break the document: a stage renamed `Build: prod`, a multi-line command
// (the hand-rolled quoter produced a single-quoted scalar containing raw
// newlines), a branch literal `*` (an alias indicator in flow context), an
// env key containing `:`. Nothing re-parsed the result — although the
// workspace-bundle path had been re-parsing its own output all along, which
// made the omission here an inconsistency as much as a bug (review GEN-02).
//
// The fix is to stop writing YAML by hand. Build a plain JS object, let
// js-yaml serialize it, and assert the bytes parse back to what went in.

import * as yaml from 'js-yaml';

/** Raised when generated YAML does not parse back to its source object. */
export class GeneratedYamlDefectError extends Error {
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(
      `Generated ${provider} YAML did not survive a parse-back check: ${detail}. ` +
        'This is a generator defect, not a problem with your pipeline.',
    );
    this.name = 'GeneratedYamlDefectError';
  }
}

/**
 * Serialize `doc` and verify the result parses back to an equal document.
 *
 * `lineWidth: -1` disables line folding, which would otherwise wrap long
 * commands and change them. Multi-line strings become literal block
 * scalars, which is what a shell script in a `run:` block should be.
 *
 * The `'on':` fix-up: js-yaml quotes the key `on` because YAML 1.1 reads
 * it as a boolean. `'on'` and `on` denote the same string key — js-yaml's
 * own loader returns `"on"` for both, and so does GitHub's parser — but
 * every hand-written workflow in the world uses the bare form, and these
 * files are meant to be read and committed by people. The substitution is
 * anchored to column zero so it cannot touch a value, and the parse-back
 * assertion below runs *after* it.
 */
export function dumpYaml(doc: unknown, provider: string): string {
  const body = yaml
    .dump(doc, { lineWidth: -1, noRefs: true, quotingType: "'" })
    .replace(/^'on':/m, 'on:');

  let reparsed: unknown;
  try {
    reparsed = yaml.load(body);
  } catch (error) {
    throw new GeneratedYamlDefectError(provider, (error as Error).message);
  }
  if (JSON.stringify(sortKeys(reparsed)) !== JSON.stringify(sortKeys(doc))) {
    throw new GeneratedYamlDefectError(
      provider,
      'the parsed document differs from the document that was serialized',
    );
  }
  return body;
}

/** Prefix a comment header to a serialized document. */
export function withHeader(header: string[], body: string): string {
  const lines = header.map((line) => (line === '' ? '#' : `# ${line}`));
  return `${lines.join('\n')}\n\n${body}`;
}

// Key order is an artifact of construction, not meaning; compare content.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}
