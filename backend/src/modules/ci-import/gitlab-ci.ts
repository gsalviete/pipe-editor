// GitLab CI → PipelineIR importer. Jobs become stages ordered by the
// `stages:` list (then declaration order); script lines become steps;
// per-job images are kept; variables become step env. Parallel jobs
// inside one GitLab stage are linearized with a warning.

import { load as yamlLoad } from 'js-yaml';
import type { PipelineIR, Stage, Step } from '../ir';
import { inferProject, kebab, uniqueId, ProjectEvidence } from './infer';
import { CiImportError, ImportResult, ImportWarning } from './types';

const RESERVED_KEYS = new Set([
  'stages',
  'image',
  'services',
  'before_script',
  'after_script',
  'variables',
  'cache',
  'default',
  'include',
  'workflow',
]);

interface GitlabJob {
  stage?: unknown;
  image?: unknown;
  script?: unknown;
  before_script?: unknown;
  variables?: Record<string, unknown>;
  services?: unknown;
}

const DEFAULT_IMAGE = 'node:20-alpine';

export function importGitlabCi(content: string): ImportResult {
  let doc: Record<string, unknown>;
  try {
    doc = (yamlLoad(content) ?? {}) as Record<string, unknown>;
  } catch (err) {
    throw new CiImportError(`Not valid YAML: ${(err as Error).message}`);
  }

  const warnings: ImportWarning[] = [];
  const warn = (message: string) => warnings.push({ message });

  const jobEntries = Object.entries(doc).filter(
    ([key, value]) =>
      !RESERVED_KEYS.has(key) &&
      !key.startsWith('.') &&
      value !== null &&
      typeof value === 'object' &&
      (value as GitlabJob).script !== undefined,
  ) as [string, GitlabJob][];

  if (jobEntries.length === 0) {
    throw new CiImportError('No jobs with a `script:` found — not a GitLab CI configuration.');
  }

  // Order: by stages list, then declaration order.
  const declaredStages = Array.isArray(doc.stages) ? doc.stages.map(String) : [];
  const stageRank = (job: GitlabJob): number => {
    const s = typeof job.stage === 'string' ? job.stage : 'test'; // GitLab default
    const idx = declaredStages.indexOf(s);
    return idx === -1 ? declaredStages.length : idx;
  };
  const orderedJobs = [...jobEntries].sort((a, b) => stageRank(a[1]) - stageRank(b[1]));

  const byStage = new Map<string, number>();
  for (const [, job] of orderedJobs) {
    const s = typeof job.stage === 'string' ? job.stage : 'test';
    byStage.set(s, (byStage.get(s) ?? 0) + 1);
  }
  if ([...byStage.values()].some((n) => n > 1)) {
    warn(
      'Multiple jobs share a GitLab stage (they run in parallel there); they were linearized into a sequential chain.',
    );
  }

  const defaults = (doc.default ?? {}) as GitlabJob;
  const topImage = imageOf(doc.image) ?? imageOf(defaults.image);
  const topVariables = envRecord(doc.variables as Record<string, unknown> | undefined);
  const defaultBefore = scriptLines(defaults.before_script);

  const evidence: ProjectEvidence = {
    commands: [],
    images: [],
    nodeVersionHints: [],
    displayName: null,
  };
  const stages: Stage[] = [];
  const takenStageIds = new Set<string>();

  for (const [jobName, job] of orderedJobs) {
    const image = imageOf(job.image) ?? topImage ?? fallbackImage(jobName, warn);
    evidence.images.push(image);
    if (job.services !== undefined) {
      warn(`Job "${jobName}": services (e.g. dind, databases) are not started locally.`);
    }
    const env = { ...topVariables, ...envRecord(job.variables) };
    const lines = [...defaultBefore, ...scriptLines(job.before_script), ...scriptLines(job.script)];
    const steps: Step[] = [];
    const takenStepIds = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      evidence.commands.push(lines[i]);
      steps.push({
        id: uniqueId(kebab(`step-${i + 1}`), takenStepIds),
        run: lines[i],
        workingDir: '.',
        // IMP-02 — a fresh object per step. Sharing one reference across
        // every step of a job means a later per-step env edit silently
        // changes all of them.
        env: { ...env },
      });
    }
    if (steps.length === 0) {
      warn(`Job "${jobName}" contained no commands and was dropped.`);
      continue;
    }
    stages.push({
      id: uniqueId(kebab(jobName), takenStageIds),
      name: jobName,
      enabled: true,
      dependsOn: [],
      container: { image },
      steps,
    });
  }

  for (let i = 0; i < stages.length; i++) {
    stages[i] = { ...stages[i], dependsOn: i === 0 ? [] : [stages[i - 1].id] };
  }

  const { project, unresolved, inferenceWarnings } = inferProject(evidence);
  for (const message of inferenceWarnings) warn(message);
  const ir: PipelineIR = {
    version: '0.1.0',
    project,
    stages,
    unresolved,
    metadata: {
      generatedAt: new Date().toISOString(),
      detectorVersion: 'ci-import/gitlab-ci@0.1.0',
    },
  };
  return { ir, warnings, provider: 'gitlab-ci' };
}

function imageOf(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw !== null && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
    return (raw as { name: string }).name;
  }
  return null;
}

function fallbackImage(jobName: string, warn: (m: string) => void): string {
  warn(`Job "${jobName}" declared no image; assigned ${DEFAULT_IMAGE} for local execution.`);
  return DEFAULT_IMAGE;
}

function scriptLines(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.trim() === '' ? [] : [raw.trim()];
  if (Array.isArray(raw)) return raw.map((l) => String(l).trim()).filter((l) => l !== '');
  return [];
}

function envRecord(raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k] = String(v);
  }
  return out;
}
