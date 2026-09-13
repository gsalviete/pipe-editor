// GitHub Actions → PipelineIR importer. Best-effort with explicit
// warnings: jobs become stages (linearized in dependency order),
// `run:` steps become IR steps, marketplace actions without a local
// equivalent are skipped and reported. setup-node hints feed runtime
// inference.

import { load as yamlLoad } from 'js-yaml';
import type { PipelineIR, Stage, Step } from '../ir';
import { inferProject, kebab, uniqueId, ProjectEvidence } from './infer';
import { CiImportError, ImportResult, ImportWarning } from './types';

interface GhaStep {
  name?: unknown;
  uses?: unknown;
  run?: unknown;
  env?: Record<string, unknown>;
  'working-directory'?: unknown;
  with?: Record<string, unknown>;
}

interface GhaJob {
  name?: unknown;
  'runs-on'?: unknown;
  container?: unknown;
  needs?: unknown;
  env?: Record<string, unknown>;
  steps?: unknown;
  strategy?: unknown;
}

const DEFAULT_IMAGE = 'node:20-alpine';

export function importGithubActions(content: string): ImportResult {
  let doc: Record<string, unknown>;
  try {
    doc = (yamlLoad(content) ?? {}) as Record<string, unknown>;
  } catch (err) {
    throw new CiImportError(`Not valid YAML: ${(err as Error).message}`);
  }
  const jobs = doc.jobs as Record<string, GhaJob> | undefined;
  if (jobs === undefined || typeof jobs !== 'object') {
    throw new CiImportError('No `jobs:` section found — not a GitHub Actions workflow.');
  }

  const warnings: ImportWarning[] = [];
  const warn = (message: string) => warnings.push({ message });

  // ── Job order: topological over `needs`, stable by declaration. ──
  const jobIds = Object.keys(jobs);
  const needsOf = new Map<string, string[]>();
  for (const id of jobIds) {
    const raw = jobs[id].needs;
    const needs = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
    needsOf.set(id, needs.filter((n) => jobIds.includes(n)));
  }
  const ordered: string[] = [];
  const done = new Set<string>();
  while (ordered.length < jobIds.length) {
    const ready = jobIds.filter(
      (id) => !done.has(id) && (needsOf.get(id) ?? []).every((n) => done.has(n)),
    );
    if (ready.length === 0) {
      throw new CiImportError('The `needs:` graph contains a cycle.');
    }
    for (const id of ready) {
      ordered.push(id);
      done.add(id);
    }
  }
  const isLinear =
    jobIds.every((id) => (needsOf.get(id) ?? []).length <= 1) &&
    jobIds.filter((id) => (needsOf.get(id) ?? []).length === 0).length <= 1;
  if (jobIds.length > 1 && !isLinear) {
    warn(
      'The workflow has parallel or fan-in jobs; they were linearized into a sequential chain (pipe-editor v1 pipelines are linear).',
    );
  }

  // ── Convert each job to a stage. ──
  const evidence: ProjectEvidence = {
    commands: [],
    images: [],
    nodeVersionHints: [],
    displayName: typeof doc.name === 'string' ? doc.name : null,
  };
  const stages: Stage[] = [];
  const takenStageIds = new Set<string>();
  const workflowEnv = envRecord(doc.env as Record<string, unknown> | undefined);

  for (const jobId of ordered) {
    const job = jobs[jobId];
    if (job.strategy !== undefined) {
      warn(`Job "${jobId}": strategy/matrix is not supported locally and was ignored.`);
    }
    const image = resolveImage(job, jobId, warn, evidence);
    const jobEnv = { ...workflowEnv, ...envRecord(job.env) };

    const rawSteps = Array.isArray(job.steps) ? (job.steps as GhaStep[]) : [];
    const steps: Step[] = [];
    const takenStepIds = new Set<string>();
    for (let i = 0; i < rawSteps.length; i++) {
      const step = rawSteps[i];
      if (typeof step.uses === 'string') {
        const uses = step.uses;
        if (uses.startsWith('actions/checkout')) continue; // implied locally
        if (uses.startsWith('actions/setup-node')) {
          const v = step.with?.['node-version'];
          if (v !== undefined) evidence.nodeVersionHints.push(String(v));
          continue; // runtime comes from the container image locally
        }
        warn(
          `Job "${jobId}": action "${uses}" has no local equivalent and was skipped.`,
        );
        continue;
      }
      if (typeof step.run !== 'string') continue;
      // IMP-01 — a GitHub `run: |` block is a shell SCRIPT, not a list of
      // commands. It used to be flattened with ` && `, which silently
      // changed the meaning of the most common GHA idiom:
      //   - a line starting with `#` commented out the whole rest of the
      //     block, because ` && npm ci` became comment text;
      //   - loops, `if` blocks, heredocs and line continuations are not
      //     complete commands and cannot be chained with `&&` at all;
      //   - failure semantics differ (a script runs line by line; an `&&`
      //     chain short-circuits and collapses exit codes).
      // The newlines are preserved and the executor runs the script under
      // `set -e`, which keeps abort-on-failure without the rewriting.
      const run = step.run.replace(/\s+$/, '');
      const scriptNote = describeScript(run);
      if (scriptNote !== null) {
        warn(`Job "${jobId}": ${scriptNote}`);
      }
      evidence.commands.push(run);
      const base = kebab(typeof step.name === 'string' ? step.name : `step-${i + 1}`);
      steps.push({
        id: uniqueId(base, takenStepIds),
        run,
        workingDir:
          typeof step['working-directory'] === 'string' ? step['working-directory'] : '.',
        env: { ...jobEnv, ...envRecord(step.env) },
      });
    }

    if (steps.length === 0) {
      warn(`Job "${jobId}" contained no runnable commands and was dropped.`);
      continue;
    }
    stages.push({
      id: uniqueId(kebab(jobId), takenStageIds),
      name: typeof job.name === 'string' ? job.name : jobId,
      enabled: true,
      dependsOn: [], // linear chain re-linked below
      container: { image },
      steps,
    });
  }

  // Linear re-link in converted order.
  for (let i = 0; i < stages.length; i++) {
    stages[i] = { ...stages[i], dependsOn: i === 0 ? [] : [stages[i - 1].id] };
  }

  const { project, unresolved, inferenceWarnings } = inferProject(evidence);
  for (const message of inferenceWarnings) warn(message);
  const branches = extractPushBranches(doc);
  const ir: PipelineIR = {
    version: '0.1.0',
    project,
    ...(branches !== null ? { triggers: [{ kind: 'on-push', branches }] } : {}),
    stages,
    unresolved,
    metadata: {
      generatedAt: new Date().toISOString(),
      detectorVersion: 'ci-import/github-actions@0.1.0',
    },
  };
  return { ir, warnings, provider: 'github-actions' };
}

function resolveImage(
  job: GhaJob,
  jobId: string,
  warn: (m: string) => void,
  evidence: ProjectEvidence,
): string {
  const c = job.container;
  let image: string | null = null;
  if (typeof c === 'string') image = c;
  else if (c !== null && typeof c === 'object' && typeof (c as { image?: unknown }).image === 'string') {
    image = (c as { image: string }).image;
  }
  if (image === null) {
    warn(
      `Job "${jobId}" runs directly on a VM runner (${String(job['runs-on'] ?? 'unknown')}); assigned container image ${DEFAULT_IMAGE} for local execution.`,
    );
    image = DEFAULT_IMAGE;
  }
  evidence.images.push(image);
  return image;
}

function envRecord(raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k] = String(v);
  }
  return out;
}

function extractPushBranches(doc: Record<string, unknown>): string[] | null {
  // YAML 1.1/1.2 quirk: a bare `on:` key may parse as boolean true.
  const on =
    (doc.on as Record<string, unknown> | undefined) ??
    ((doc as Record<string, unknown>)[String(true)] as Record<string, unknown> | undefined);
  if (on === undefined || on === null || typeof on !== 'object') return null;
  const push = (on as { push?: { branches?: unknown } }).push;
  if (push && Array.isArray(push.branches)) return push.branches.map(String);
  return null;
}

/**
 * A note for a multi-line `run:` block worth telling the user about, or
 * null for an ordinary one.
 *
 * These blocks are preserved verbatim, so nothing is broken — but shell
 * comments and control flow are exactly the content the previous ` && `
 * flattening destroyed, and a user re-importing an old export deserves to
 * know the step is a script rather than a single command.
 */
export function describeScript(run: string): string | null {
  const lines = run.split('\n');
  if (lines.length < 2) return null;
  const hasComment = lines.some((l) => l.trimStart().startsWith('#'));
  const hasControlFlow = /^\s*(if|for|while|case|until|function)\b|<<-?\s*['"]?\w+/m.test(run);
  const parts: string[] = [];
  if (hasComment) parts.push('comments');
  if (hasControlFlow) parts.push('shell control flow');
  if (parts.length === 0) return null;
  return (
    `a multi-line run block containing ${parts.join(' and ')} was imported as ` +
    'a single script step and is preserved verbatim; edit it as a whole.'
  );
}
