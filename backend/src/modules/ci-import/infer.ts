// Shared inference for CI imports: reconstruct the IR's project block
// from the evidence a CI config leaks — commands, container images,
// setup-action hints. Anything not inferable becomes a paired
// `unresolved` entry so the imported IR still validates.

import type { PipelineIR, UnresolvedEntry } from '../ir';

export interface ProjectEvidence {
  /** Every shell command found in the config. */
  commands: string[];
  /** Every container image referenced. */
  images: string[];
  /** e.g. actions/setup-node `node-version` values. */
  nodeVersionHints: string[];
  /** Workflow / pipeline display name, if any. */
  displayName: string | null;
}

export function inferProject(evidence: ProjectEvidence): {
  project: PipelineIR['project'];
  unresolved: UnresolvedEntry[];
  /**
   * IMP-03 — what was inferred rather than read. A CI config states very
   * little about the project directly; the importer used to warn about
   * skipped actions but never about the facts it had reconstructed from
   * command text, so a wrong guess reached the Dockerfile silently.
   */
  inferenceWarnings: string[];
} {
  const text = evidence.commands.join('\n');

  // IMP-03 — prefer the binary that actually runs an install over any
  // mention anywhere. Scanning all command text for `\bpnpm\b` first meant
  // a workflow running `npm ci` but mentioning pnpm in a comment or a cache
  // key was classified pnpm, which then drove the install command, the
  // Dockerfile's lockfile line and the corepack prefix.
  const fromInstall = packageManagerFromInstallCommand(evidence.commands);
  let packageManager = fromInstall;
  let packageManagerGuessed = false;
  if (packageManager === null) {
    if (/\bpnpm\b/.test(text)) packageManager = 'pnpm';
    else if (/\byarn\b/.test(text)) packageManager = 'yarn';
    else if (/\bnpm\b|\bnpx\b/.test(text)) packageManager = 'npm';
    packageManagerGuessed = packageManager !== null;
  }

  let runtimeName: string | null = null;
  let runtimeVersion: string | null = null;
  for (const image of evidence.images) {
    const m = /^node:(\d+)/.exec(image);
    if (m) {
      runtimeName = 'node';
      runtimeVersion = m[1];
      break;
    }
    if (image.startsWith('node')) runtimeName = 'node';
  }
  if (runtimeVersion === null && evidence.nodeVersionHints.length > 0) {
    const m = /(\d+)/.exec(evidence.nodeVersionHints[0]);
    if (m) {
      runtimeName = 'node';
      runtimeVersion = m[1];
    }
  }
  if (runtimeName === null && packageManager !== null) runtimeName = 'node';

  const language = /\btsc\b|typescript|ts-node|ts-jest/.test(text)
    ? 'typescript'
    : null;

  const project: PipelineIR['project'] = {
    name: kebab(evidence.displayName ?? 'imported-pipeline'),
    rootPath: '.',
    language,
    runtime: { name: runtimeName, version: runtimeVersion },
    packageManager: { name: packageManager, version: null },
  };

  const unresolved: UnresolvedEntry[] = [];
  const need = (field: string, value: unknown) => {
    if (value === null) {
      unresolved.push({
        field,
        reason: 'needs-user-input',
        message: `Could not be inferred from the imported CI configuration; please specify.`,
      });
    }
  };
  need('/project/language', language);
  need('/project/runtime/name', runtimeName);
  need('/project/runtime/version', runtimeVersion);
  need('/project/packageManager/name', packageManager);
  need('/project/packageManager/version', project.packageManager.version);

  const inferenceWarnings: string[] = [];
  if (packageManagerGuessed) {
    inferenceWarnings.push(
      `No install command was found, so the package manager was guessed as "${packageManager}" ` +
        'from other text in the configuration. Check it before generating artifacts — it drives ' +
        'the install command, the lockfile the Dockerfile copies and the corepack prefix.',
    );
  } else if (fromInstall !== null) {
    inferenceWarnings.push(
      `Package manager inferred as "${fromInstall}" from the install command.`,
    );
  }
  if (runtimeVersion !== null && evidence.images.every((i) => !/^node:\d+/.test(i))) {
    inferenceWarnings.push(
      `Node version inferred as "${runtimeVersion}" from a setup-node hint rather than a container image.`,
    );
  }
  if (language !== null) {
    inferenceWarnings.push(
      `Language inferred as "${language}" from TypeScript tooling mentioned in the commands.`,
    );
  }

  return { project, unresolved, inferenceWarnings };
}

/** Kebab-case sanitizer for stage/step/project ids. */
export function kebab(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (s === '') s = 'job';
  if (/^[0-9]/.test(s)) s = `job-${s}`;
  return s;
}

/** Unique id helper: appends -2, -3… on collision. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * The package manager named by an actual install command, or null.
 *
 * Matches the install invocations the three managers use, anchored on the
 * binary at the start of a command rather than on a mention anywhere in
 * the text. Only an unambiguous answer counts: a config that installs with
 * two different managers returns null and falls through to the weaker
 * whole-text heuristic, which flags itself as a guess.
 */
export function packageManagerFromInstallCommand(
  commands: string[],
): 'npm' | 'pnpm' | 'yarn' | null {
  const found = new Set<'npm' | 'pnpm' | 'yarn'>();
  for (const command of commands) {
    for (const line of command.split('\n')) {
      const m = /(?:^|[;&|]\s*)(npm|pnpm|yarn)\s+(ci|install|i|add)\b/.exec(line.trim());
      if (m !== null) found.add(m[1] as 'npm' | 'pnpm' | 'yarn');
    }
  }
  return found.size === 1 ? [...found][0] : null;
}
