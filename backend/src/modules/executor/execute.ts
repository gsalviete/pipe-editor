// Pipeline Executor — public entry point. Implements
// pipeline-executor.spec.md (EXEC, Accepted 2026-06-22).
//
// One container per non-skipped Stage, stop-at-first-failure, shared
// temp-copy workspace bind-mounted at /workspace, constructed env
// (no host inheritance), docker-build delegated (no DinD).

import { isAbsolute } from 'path';
import { existsSync, statSync } from 'fs';
import {
  computeEffectiveChain,
  findUnrunnableReason,
  PipelineIR,
  Stage,
  validate,
} from '../ir';
import { dockerAvailable, runStageInContainer } from './docker-client';
import { DockerUnavailableError, InvalidExecuteOptionsError } from './errors';
import {
  AggregateStatus,
  ExecuteEvent,
  ExecuteOptions,
  ExecuteResult,
  StageResult,
  StageStatus,
} from './types';
import { materializeWorkspace } from './workspace';

const BASE_ENV: Record<string, string> = {
  LANG: 'C.UTF-8',
  CI: 'true',
};

const DOCKER_BUILD_SKIP_REASON =
  'EXEC v1 does not run `docker build` directly. Validate the docker-build Stage by running `docker build .` against the Dockerfile produced by generate(ir) (or POST /api/generate). See pipeline-executor.spec.md Decision B.';

export async function execute(opts: ExecuteOptions): Promise<ExecuteResult> {
  const startedAt = new Date();

  validateOpts(opts);
  const emit = (event: ExecuteEvent): void => {
    try {
      opts.onEvent?.(event);
    } catch {
      /* progress listeners must never affect the run */
    }
  };

  // EXEC-FR-002 — runnability precheck via the single-source helper.
  const unrunnable = findUnrunnableReason(opts.ir);
  if (unrunnable !== null) {
    const reason =
      unrunnable.kind === 'unresolved-required-field'
        ? `Pipeline is not runnable: required field ${unrunnable.field} is unresolved.`
        : `Pipeline is not runnable: ${unrunnable.explanation}`;
    return finalize(startedAt, {
      aggregateStatus: 'unrunnable',
      reason,
      stages: [],
    });
  }

  // Empty-effective-chain detection: distinct from "unrunnable due to
  // unresolved field". We treat all-disabled as 'unrunnable' with the
  // empty-effective-chain reason (per Decision D's reserved kind).
  const effective = computeEffectiveChain(opts.ir);
  const liveEffective = effective.filter((s) => s.id !== 'docker-build');
  if (liveEffective.length === 0 && opts.ir.stages.length > 0) {
    // Build the disabled-Stage results so the caller still sees every
    // Stage the IR declares.
    const stageResults = opts.ir.stages.map<StageResult>((s) =>
      s.id === 'docker-build'
        ? buildSkipResult(s, 'skipped:docker-build-delegated', DOCKER_BUILD_SKIP_REASON)
        : buildSkipResult(s, 'skipped:disabled', 'Stage disabled in IR'),
    );
    return finalize(startedAt, {
      aggregateStatus: 'unrunnable',
      reason: 'empty-effective-chain — every runnable Stage is disabled',
      stages: stageResults,
    });
  }

  // From here we will actually spawn containers. Require docker.
  if (!(await dockerAvailable())) {
    throw new DockerUnavailableError(
      'docker is not available on PATH (or the daemon is not running). The Executor requires a working docker CLI to run Stage containers.',
    );
  }

  const workspace = materializeWorkspace(opts.projectPath);
  const effectiveById = new Map(effective.map((s) => [s.id, s]));
  const stages: StageResult[] = [];
  let chainFailed = false;
  let chainAborted = false;

  try {
    for (const stage of opts.ir.stages) {
      // Disabled — not in effective chain. Emit skip, do not run.
      if (!effectiveById.has(stage.id)) {
        stages.push(
          buildSkipResult(stage, 'skipped:disabled', 'Stage disabled in IR'),
        );
        emit({ type: 'stage-finished', result: stages[stages.length - 1] });
        continue;
      }

      // EXEC-FR-005 — docker-build delegated. Skip without container.
      if (stage.id === 'docker-build') {
        stages.push(
          buildSkipResult(
            stage,
            'skipped:docker-build-delegated',
            DOCKER_BUILD_SKIP_REASON,
          ),
        );
        emit({ type: 'stage-finished', result: stages[stages.length - 1] });
        continue;
      }

      // A prior runnable Stage failed — skip remaining runnable ones.
      if (chainFailed || chainAborted) {
        stages.push(
          buildSkipResult(
            stage,
            'skipped:dependency-failed',
            chainAborted ? 'aborted' : 'a preceding Stage failed',
          ),
        );
        emit({ type: 'stage-finished', result: stages[stages.length - 1] });
        continue;
      }

      const result = await runStage(stage, workspace.hostPath, opts.ir, opts.signal, emit);
      stages.push(result);
      emit({ type: 'stage-finished', result });
      if (result.status === 'failed') {
        chainFailed = true;
        if (result.skipReason === 'aborted') {
          chainAborted = true;
        }
      }
      if (opts.signal?.aborted) {
        chainAborted = true;
      }
    }
  } finally {
    workspace.cleanup();
  }

  return finalize(startedAt, {
    aggregateStatus: aggregateOf(stages, chainAborted),
    reason: chainAborted
      ? 'execution aborted by caller'
      : chainFailed
        ? 'one or more Stages failed; see stages[].stderr'
        : null,
    stages,
  });
}

function validateOpts(opts: ExecuteOptions): void {
  if (!opts || typeof opts !== 'object') {
    throw new InvalidExecuteOptionsError('execute(opts) requires an options object.');
  }
  if (typeof opts.projectPath !== 'string' || opts.projectPath === '') {
    throw new InvalidExecuteOptionsError('opts.projectPath must be a non-empty string.');
  }
  if (!isAbsolute(opts.projectPath)) {
    throw new InvalidExecuteOptionsError(
      `opts.projectPath must be absolute; got ${JSON.stringify(opts.projectPath)}.`,
    );
  }
  if (!existsSync(opts.projectPath) || !statSync(opts.projectPath).isDirectory()) {
    throw new InvalidExecuteOptionsError(
      `opts.projectPath must point at an existing directory; ${JSON.stringify(opts.projectPath)} is not.`,
    );
  }
  if (opts.workspaceStrategy && opts.workspaceStrategy !== 'temp-copy') {
    throw new InvalidExecuteOptionsError(
      `opts.workspaceStrategy must be 'temp-copy' in v1; got ${JSON.stringify(opts.workspaceStrategy)}.`,
    );
  }
  if (!opts.ir || typeof opts.ir !== 'object') {
    throw new InvalidExecuteOptionsError('opts.ir is required.');
  }
  const validationErrors = validate(opts.ir);
  if (validationErrors.length > 0) {
    throw new InvalidExecuteOptionsError(
      'opts.ir failed validate(); see details.',
      validationErrors,
    );
  }
}

async function runStage(
  stage: Stage,
  workspaceHostPath: string,
  ir: PipelineIR,
  signal: AbortSignal | undefined,
  emit: (event: ExecuteEvent) => void,
): Promise<StageResult> {
  const startedAt = new Date();
  const stepEnv: Record<string, string> = {};
  for (const step of stage.steps) {
    Object.assign(stepEnv, step.env);
  }
  // EXEC-FR-010b — pnpm/yarn need corepack enabled per container. The
  // binary cache lives in COREPACK_HOME so the download in install
  // persists into downstream Stages via the shared /workspace mount.
  const pmName = ir.project.packageManager.name;
  const needsCorepackShim = pmName === 'pnpm' || pmName === 'yarn';
  const env = {
    ...BASE_ENV,
    ...(needsCorepackShim ? { COREPACK_HOME: '/workspace/.corepack' } : {}),
    ...stepEnv,
  };
  // IMP-01 — steps are separated by newlines, not ` && `, and the whole
  // script runs under `set -e`.
  //
  // ` && ` is not a safe joiner for shell scripts: a step ending in a `#`
  // comment turns the joiner and every later step into comment text, and a
  // step that is a loop or an `if` block is not a command ` && ` can chain.
  // Newlines are the shell's own separator and have neither problem.
  //
  // `set -e` restores what ` && ` was providing: `sh` does not abort on a
  // failed command by default, so without it a failing step would let the
  // rest of the stage run and the stage could report success.
  const joined = stage.steps.map((s) => s.run).join('\n');
  const shellCommand = needsCorepackShim
    ? `set -e\ncorepack enable\n${joined}`
    : `set -e\n${joined}`;

  // Working directory: container WORKDIR = /workspace. step.workingDir is
  // interpreted relative to it; an absolute step.workingDir passes through.
  // Use the first step's workingDir as the container WORKDIR (a Stage's
  // steps typically share a workingDir; v1 enforces no per-step cd).
  const workingDir = resolveWorkingDir(stage);

  emit({
    type: 'stage-started',
    stageId: stage.id,
    at: startedAt.toISOString(),
    image: stage.container.image,
    shellCommand,
  });

  let runOutcome;
  try {
    runOutcome = await runStageInContainer({
      image: stage.container.image,
      shellCommand,
      env,
      workspaceHostPath,
      workingDir,
      signal,
      onOutput: (stream, chunk) =>
        emit({ type: 'stage-output', stageId: stage.id, stream, chunk }),
    });
  } catch (err) {
    const finishedAt = new Date();
    return {
      stageId: stage.id,
      status: 'failed',
      exitCode: -1,
      stdout: '',
      stderr: (err as Error).message,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  }

  const finishedAt = new Date();
  const aborted = runOutcome.aborted;
  const status: StageStatus =
    aborted || runOutcome.exitCode !== 0 ? 'failed' : 'passed';
  return {
    stageId: stage.id,
    status,
    exitCode: runOutcome.exitCode,
    stdout: runOutcome.stdout,
    stderr: runOutcome.stderr,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ...(aborted ? { skipReason: 'aborted' } : {}),
  };
}

function resolveWorkingDir(stage: Stage): string {
  const first = stage.steps[0]?.workingDir ?? '.';
  if (first.startsWith('/')) return first;
  if (first === '.' || first === './') return '/workspace';
  return `/workspace/${first.replace(/^\.\//, '')}`;
}

function buildSkipResult(
  stage: Stage,
  status: StageStatus,
  reason: string,
): StageResult {
  return {
    stageId: stage.id,
    status,
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
    skipReason: reason,
  };
}

function aggregateOf(stages: StageResult[], aborted: boolean): AggregateStatus {
  if (aborted) return 'aborted';
  for (const s of stages) {
    if (s.status === 'failed') return 'failed';
  }
  return 'passed';
}

function finalize(
  startedAt: Date,
  partial: { aggregateStatus: AggregateStatus; reason: string | null; stages: StageResult[] },
): ExecuteResult {
  const finishedAt = new Date();
  return {
    ...partial,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
