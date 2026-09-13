import { load as yamlLoad } from 'js-yaml';
import type { PipelineIR } from '../ir';
import { importGithubActions } from './github-actions';
import { importGitlabCi } from './gitlab-ci';
import { CiImportError, ImportProvider, ImportResult } from './types';

export { importGithubActions } from './github-actions';
export { importGitlabCi } from './gitlab-ci';
export { CiImportError } from './types';
export type { ImportProvider, ImportResult, ImportWarning } from './types';

/**
 * Provider detection for `provider: 'auto'`, decided on the parsed
 * document rather than on the raw text.
 *
 * IMP-04 — the previous version matched regexes against the file. A
 * Kubernetes manifest or an Azure Pipelines file matches `jobs:` plus
 * `steps:` well enough to pick a converter, which then failed somewhere
 * downstream with a message about the wrong thing. Parsing first costs
 * nothing (the importer parses anyway) and lets the check ask the
 * questions that actually distinguish the two formats.
 */
export function sniffProvider(content: string): ImportProvider | null {
  let doc: unknown;
  try {
    doc = yamlLoad(content);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const root = doc as Record<string, unknown>;

  // A Kubernetes manifest, an Azure Pipelines file or a Compose file can
  // carry job-like keys; these top-level fields say they are not ours.
  if (typeof root.apiVersion === 'string' || typeof root.kind === 'string') return null;
  if ('pool' in root || 'trigger' in root || 'pr' in root) return null;
  if ('services' in root && !('stages' in root) && !('jobs' in root)) return null;

  // GitHub Actions: a `jobs` mapping whose values are job objects.
  const jobs = root.jobs;
  if (isMapping(jobs)) {
    const values = Object.values(jobs).filter(isMapping);
    if (
      values.length > 0 &&
      values.some((j) => 'runs-on' in j || 'steps' in j || 'uses' in j || 'container' in j)
    ) {
      return 'github-actions';
    }
  }

  // GitLab CI: top-level `stages`, or any top-level mapping that looks
  // like a job (`script` is the one key every GitLab job must have).
  const looksLikeGitlabJob = (value: unknown): boolean =>
    isMapping(value) && ('script' in value || 'before_script' in value || 'extends' in value);
  if (Array.isArray(root.stages) && Object.values(root).some(looksLikeGitlabJob)) {
    return 'gitlab-ci';
  }
  if (Object.values(root).some(looksLikeGitlabJob)) return 'gitlab-ci';

  return null;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function importCiConfig(
  content: string,
  provider: ImportProvider | 'auto',
): ImportResult {
  if (provider === 'github-actions') return importGithubActions(content);
  if (provider === 'gitlab-ci') return importGitlabCi(content);
  const sniffed = sniffProvider(content);
  if (sniffed === null) {
    throw new CiImportError(
      'Could not recognize this as a GitHub Actions workflow or a GitLab CI configuration.',
    );
  }
  return sniffed === 'github-actions'
    ? importGithubActions(content)
    : importGitlabCi(content);
}

/**
 * Fill gaps in an imported IR with facts detected from the actual
 * project on disk (used by /api/import/from-project). Values the CI
 * config already implied win; the detector only supplies what the
 * config could not. Unresolved entries are rebuilt to match.
 */
export function mergeDetectedProjectFacts(
  imported: PipelineIR,
  detected: PipelineIR,
): PipelineIR {
  const project: PipelineIR['project'] = {
    ...imported.project,
    name: detected.project.name, // the real project name beats the workflow title
    rootPath: detected.project.rootPath,
    language: imported.project.language ?? detected.project.language,
    runtime: {
      name: imported.project.runtime.name ?? detected.project.runtime.name,
      version: imported.project.runtime.version ?? detected.project.runtime.version,
    },
    packageManager: {
      name: imported.project.packageManager.name ?? detected.project.packageManager.name,
      version:
        imported.project.packageManager.version ?? detected.project.packageManager.version,
    },
  };

  const stillNull = new Set<string>();
  if (project.language === null) stillNull.add('/project/language');
  if (project.runtime.name === null) stillNull.add('/project/runtime/name');
  if (project.runtime.version === null) stillNull.add('/project/runtime/version');
  if (project.packageManager.name === null) stillNull.add('/project/packageManager/name');
  if (project.packageManager.version === null) stillNull.add('/project/packageManager/version');

  const unresolved = [
    ...(imported.unresolved ?? []).filter((u) => stillNull.has(u.field)),
    // Carry over detector-side entries for fields that remain null and
    // weren't already covered.
    ...(detected.unresolved ?? []).filter(
      (u) =>
        stillNull.has(u.field) &&
        !(imported.unresolved ?? []).some((iu) => iu.field === u.field),
    ),
  ];

  return { ...imported, project, unresolved };
}
