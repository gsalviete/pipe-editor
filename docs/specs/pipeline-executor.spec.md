# Pipeline Executor Specification

| Field | Value |
|---|---|
| Component | `EXEC` |
| Status | Implemented |
| Last updated | 2026-06-22 |
| Linked ADRs | [ADR-0001](../adr/0001-native-container-execution.md) (the reason this component exists), [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md) |
| Linked specs | [`pipeline-ir.spec.md`](./pipeline-ir.spec.md) (Accepted), [`detector-engine.spec.md`](./detector-engine.spec.md) (Accepted), [`dockerfile-generator.spec.md`](./dockerfile-generator.spec.md) (Accepted), [`visual-editor.spec.md`](./visual-editor.spec.md) (Accepted) |

> 🟢 **LIVE-CONTAINER CALLOUT** — this is the first component that
> runs **user-supplied commands** (`steps[].run`) from the IR inside
> real Docker containers on the user's machine. Sandboxing rests on
> the spec-as-written: a temp-copy bind mount (never the user's
> working tree directly), no `/var/run/docker.sock` mount, no host-
> network mode, no `--privileged`. Read [Container security model](#container-security-model)
> before reading the rest of the spec.

## Objective

Define the **Pipeline Executor** (`EXEC`) — the component that takes
an Accepted `PipelineIR` and runs the effective chain locally in
Docker containers, reporting **per-block** pass/fail/skip status to
the caller before any push. This is the half of the thesis
([ADR-0001](../adr/0001-native-container-execution.md)) the rest of
the project exists to make possible: detect a project, suggest a
pipeline, edit it, generate portable artifacts — and **prove the
pipeline runs** without touching a remote runner.

The Executor MUST:

- Consume an Accepted `PipelineIR` and the effective chain produced by
  `computeEffectiveChain` from `@modules/ir`. It MUST NOT re-implement
  splicing (IR-FR-014).
- Orchestrate one container per non-skipped Stage from the Stage's
  `container.image`, running `steps[].run` in declared order.
- Pass install's artifacts (`node_modules`, etc.) forward to
  downstream Stages via a **shared workspace mount** (Decision A).
- Stop at the first failing Stage; mark subsequent Stages
  `skipped:dependency-failed`.
- Refuse to run an **unrunnable pipeline** (PM-null, runtime-version-
  null, or an empty effective chain) with a deterministic
  `unrunnable` ExecuteResult — never silently succeed (Decision D).

The Executor MUST NOT (v1):

- Run `docker build` itself for the `docker-build` Stage — see
  Decision B. v1 reports `docker-build` as
  `skipped:docker-build-delegated` and points the caller at the
  Dockerfile artifact from
  [`generate(ir)`](./dockerfile-generator.spec.md). Closing this gap
  is OQ-EXEC-002.
- Mount `/var/run/docker.sock` into any Stage container.
- Use `--network=host` or `--privileged`.
- Mutate the user's working tree on disk (the workspace mount is to a
  temp **copy**).

## Scope

In scope:

- A pure backend module `@modules/executor` exporting an `execute()`
  function (signature in [Input/output contract](#inputoutput-contract)).
- Real `docker run` per non-skipped Stage, with `steps[].run` joined
  by ` && ` into the container's command in declared array order
  (`sh -c` short-circuit semantics — same as
  [DOCKER's multi-step join](./dockerfile-generator.spec.md)).
- A single **temp-copy workspace** bind-mounted at `/workspace` into
  every Stage's container. The temp copy is created from the host
  `projectPath` before the first Stage and removed after the last
  Stage. node_modules / build output written by Stages live in the
  temp copy, not the host tree.
- Per-Stage `StageResult` capture (status, exitCode, stdout, stderr,
  startedAt, finishedAt, durationMs) and an aggregate `ExecuteResult`.
- A shared **runnability precheck** (Decision D) consumed by EXEC,
  by `/api/generate`, and — after the proposed DOCKER amendment — by
  the Dockerfile Generator itself.
- A skip discipline that distinguishes:
  - `skipped:disabled` — Stage's `enabled === false`.
  - `skipped:dependency-failed` — a preceding Stage in the effective
    chain failed; this one was never started.
  - `skipped:docker-build-delegated` — v1 doesn't run `docker build`.

Out of scope:

- A `POST /api/execute` HTTP route. v1 is a pure module; a future
  v0.2 spec may add a streaming endpoint with SSE for per-Stage
  block status. Recorded as [OQ-EXEC-001](#open-questions).
- Docker-in-Docker (DinD). v1 explicitly does not nest docker;
  Decision B explains.
- Parallel Stage execution. The v1 chain is linear
  ([ADR-0007](../adr/0007-linear-pipeline-topology-v1.md)) and the
  Executor matches it.
- Caching across runs (warm `node_modules` between executions, layer
  caching of pulled images). v1 relies on Docker's own image cache;
  workspace state does not persist across executions.
- Multi-host execution.
- Network sandboxing per Stage (locked-down per-Stage egress).
  Documented in Decision E and recorded as
  [OQ-EXEC-003](#open-questions).
- Log streaming (live tail). v1 is "run-to-completion, then return."
  Streaming is OQ-EXEC-001's territory.
- Per-Stage timeouts. The whole `execute()` is cancellable via the
  caller's `AbortSignal`; per-Stage budgets are an OQ-EXEC-004.

## Local definitions

Terms from the
[Domain Glossary](../product/03-domain-glossary.md),
[Pipeline IR Spec](./pipeline-ir.spec.md), and the
[Detector](./detector-engine.spec.md) /
[Dockerfile Generator](./dockerfile-generator.spec.md) /
[Visual Editor](./visual-editor.spec.md) specs carry their
established meanings.

Additional terms used here:

- **Block** — a single Stage's per-run outcome (`StageResult`). The
  thesis ("per-block status") refers to this granularity. One Stage
  → one block.
- **Effective chain** — the result of `computeEffectiveChain(ir)`;
  the Stages that would actually run. Disabled Stages are not in
  the effective chain.
- **Workspace copy** — a temp directory created from `projectPath` at
  `execute()` invocation time and bind-mounted at `/workspace` into
  every Stage container.
- **Aggregate status** — the rollup of all StageResults:
  - `passed` — every Stage in the effective chain finished with
    `passed` (skipped Stages are `skipped:*` but do not invalidate
    the rollup).
  - `failed` — at least one Stage `failed`; remaining Stages were
    `skipped:dependency-failed`.
  - `aborted` — the caller's `AbortSignal` fired before completion;
    Stages observed up to that point are reported with their actual
    status, remaining Stages are `skipped:dependency-failed` with
    `skipReason: "aborted"`.
  - `unrunnable` — the runnability precheck refused to start; no
    Stage was attempted; `stages` is `[]`.
- **Runnability precheck** — `findUnrunnableReason(ir)`, a pure
  function exported from `@modules/ir` (proposed; Decision D). Returns
  a structured reason or `null`.

## Settled design decisions

| # | Decision | Settled value |
|---|---|---|
| **A** | Per-Stage isolation model **(prominent)** | **Shared workspace copy.** A temp copy of the host `projectPath` is bind-mounted at `/workspace` into EVERY Stage's container. `install` populates `node_modules` in the temp copy; `lint` / `test` / `build` read from the same temp copy. The host working tree is never mutated. Working directory inside containers is `/workspace`; `step.workingDir` is interpreted relative to it. See [Decision A](#decision-a--per-stage-isolation-via-a-shared-temp-copy-workspace). |
| **B** | Effective chain reuse + `docker-build` delegation **(prominent)** | The Executor calls `computeEffectiveChain` (IR-FR-014); disabled Stages are `skipped:disabled`. The `docker-build` Stage is **delegated**, NOT run by EXEC in v1: it is reported `skipped:docker-build-delegated` with a reason pointing at the Dockerfile generator's smoke path (DET-AC-008 / DOCKER-AC-006). Running `docker build` inside EXEC would require Docker-in-Docker; v1 refuses that complexity. See [Decision B](#decision-b--effective-chain-reuse-and-docker-build-delegation-v1). |
| **C** | Per-block status model | Stop-at-first-failure across the effective chain. Each Stage produces a `StageResult { status, exitCode, stdout, stderr, startedAt, finishedAt, durationMs }`. On failure, downstream Stages are `skipped:dependency-failed` with empty output. Aggregate status follows the rules in [Local definitions](#local-definitions). |
| **D** | PM-null / unrunnable — single source of truth **(prominent)** | A new pure helper `findUnrunnableReason(ir)` is exported from `@modules/ir`. All consumers ('/api/generate' controller, EXEC, the Dockerfile Generator itself once the proposed DOCKER amendment is applied) call this single helper. The helper returns `null` for a runnable IR or `{ kind: 'unresolved-required-field', field: '/project/packageManager/name' \| '/project/runtime/version' }` (extensible). See [Decision D](#decision-d--single-source-of-truth-for-unrunnable). |
| **E** | Environment, working directory, and network | `steps[].env` merged on top of a minimal base (`PATH` from the image's default, `LANG=C.UTF-8`); the host process's env is NOT inherited. `workingDir` is `/workspace` + `step.workingDir` (relative). Network: v1 grants the default `bridge` network to every Stage (install needs registry egress; locking lint/test down is a hardening candidate — [OQ-EXEC-003](#open-questions)). |

### Decision A — Per-Stage isolation via a shared temp-copy workspace

Three options were on the table for "how does install's output reach
lint / test / build":

- **(a) Shared workspace bind mount (chosen).** A single temp
  directory, populated as a copy of the host `projectPath` before
  execution, is bind-mounted at `/workspace` into every Stage's
  container. `install` runs first and writes `node_modules` (and any
  artifacts) into the temp copy; downstream Stages read it from the
  same mount.
  - *Pros:* matches how a real CI runner caches a workspace between
    steps; makes the `install` Stage's existence meaningful; one
    line of `--mount type=bind,...` per `docker run`; deterministic.
  - *Cons:* node_modules / build output cross Stage boundaries, so
    Stages are not hermetically isolated from each other; a
    misbehaving Stage could pollute the workspace for the next.
    Mitigated by the temp-copy boundary (no host-tree pollution
    is possible).
- **(b) Each Stage re-installs.** Cleaner isolation; matches naïve
  Dockerfile builds.
  - *Why NOT:* contradicts having a separate `install` Stage in the
    first place — if every Stage re-installs, the install Stage is
    dead weight. Massively slower (3–4× wall-clock on a real
    project). Also undermines the thesis: a "real CI runner"
    cache-equivalent is exactly what makes local validation worth
    doing.
- **(c) A single container reused across Stages.** One `docker
  start` and a sequence of `docker exec`s.
  - *Why NOT:* sacrifices per-Stage `container.image` (each Stage's
    image is part of the IR's contract); breaks the "block" model
    (different images per Stage carry different toolchains); fights
    the linear-chain abstraction.

The **host working tree is never mounted directly**. The Executor
copies `projectPath` into a fresh temp directory (e.g. via
`fs.cpSync` with `recursive: true`) before the first Stage and
removes it after the last. Stages mutate the copy, never the host.
This addresses the "I ran the linter and now my git tree is full of
junk" objection at the bind-mount layer.

**Working directory semantics:**

- Container `WORKDIR` is set to `/workspace`.
- The host's `projectPath` is copied to `<tempdir>/workspace` and
  bind-mounted to `/workspace` inside the container.
- A Step's `workingDir` is interpreted **relative to `/workspace`**;
  the fixtures' canonical value `"."` resolves to `/workspace`. An
  absolute `step.workingDir` (e.g. `"/app"`) is allowed — it is
  passed verbatim to the container — but is a non-default for v1.

**`node_modules` exclusion from the copy.** The Executor MUST exclude
any pre-existing host `node_modules` (and analogous directories —
`.git`, `dist`, `coverage`, `node_modules/.cache`) when materializing
the workspace copy, on grounds matching the
[multi-stage `.dockerignore`](./dockerfile-generator.spec.md). The
exclusion list lives next to the Executor (not in the Dockerfile
generator's `.dockerignore` template — different audience) and is a
small, normative constant ([EXEC-FR-007](#functional-requirements)).

**Workspace lifecycle — one-shot exclusions, mutable thereafter.**
The exclusion list applies at **host → temp copy time only**, ONCE,
before the first Stage starts. After that point, `/workspace` is
**mutable for the duration of the run**: anything a Stage writes
(`install`'s `node_modules`, `build`'s `dist/`, a `lint` cache, etc.)
persists into `/workspace` and is visible to every subsequent Stage
in the same `execute()` call. This is the entire point of the
shared mount — if `dist/` were re-excluded between Stages, `build`
would have nowhere to deposit its output for downstream consumers.
The temp copy is removed when `execute()` resolves (unless
`EXEC_KEEP_WORKSPACE` is set for debugging). See [EXEC-FR-007](#functional-requirements)
and [EXEC-AC-016](#acceptance-criteria).

**Honest failure when an upstream Stage is absent.** EXEC accepts
arbitrary Accepted IRs (the same trust boundary `/api/generate` has
— EDITOR's "Trust boundary" section), including IRs where, say,
`install` is disabled or absent but `lint` / `test` / `build`
remain. Per [DET-FR-018](./detector-engine.spec.md) the detector
will not emit such an IR, but a hand-edited or imported IR can. The
Executor does **not** add a precheck that second-guesses the chain
(e.g. "you have `test` but no `install`, refuse"). It simply runs
the effective chain in order; when `lint` finds no `node_modules`,
its command (`pnpm lint`, `npm run lint`, etc.) exits non-zero with
its own stderr describing the situation. That stderr lands verbatim
in `StageResult.stderr` and the Stage is `'failed'`. A precheck
here would duplicate knowledge the runtime already has and would
hide the real error message behind a synthetic one — the opposite of
the [DOCKER honest-header convention](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage).
See [EXEC-AC-017](#acceptance-criteria).

### Decision B — Effective chain reuse and `docker-build` delegation (v1)

**Effective chain reuse.** Per IR-FR-014's single-shared-algorithm
mandate, the Executor obtains its chain by calling
`computeEffectiveChain(ir)` from `@modules/ir`. It MUST NOT re-derive
the splice. This is the same rule applied to DOCKER and EDITOR; the
Executor is the third (final) consumer of the shared algorithm.

**`docker-build` delegation.** Three credible v1 options for the
`docker-build` Stage:

- **(i) Run `docker build` via DinD.** Mount `/var/run/docker.sock`
  or run dockerd inside the EXEC container.
  - *Why NOT:* socket mounting is effectively root-on-host (any
    container can spawn privileged containers); DinD is a known
    complexity cliff (storage-driver mismatches, dind-rootless
    quirks); the safe variant is also the slow variant. The
    LIVE-CONTAINER callout names this as out of scope.
- **(ii) Run `docker build` as a host-side spawn.** The Executor
  runs on the host (a NestJS module), so it could `child_process.spawn('docker', ['build', '.'], …)` against a generated Dockerfile.
  - *Pros:* no DinD, faithful behavior.
  - *Cons:* couples EXEC to the Dockerfile generator (EXEC must
    invoke `generate(ir)` to obtain the Dockerfile, materialize it
    in the workspace copy, then build). Image goes into the host
    Docker. v1 has no story for the resulting image (cleanup, tag
    namespace). Reasonable for v0.2 once those questions get an
    answer.
- **(iii) Delegate: report `skipped:docker-build-delegated`
  (chosen for v1).** The `docker-build` Stage is reported as
  skipped with a clear `skipReason` identifying the delegation
  target ("Run `docker build .` against the Dockerfile from
  `/api/generate` to validate this Stage; v1 does not nest
  Docker."). The existing **DET-AC-008** / **DOCKER-AC-006** smoke
  test already covers the fact that `docker build` succeeds
  against the produced Dockerfile, so the integration is not
  *unvalidated* — only *uncovered* by EXEC itself.
  - *Pros:* zero DinD risk; honest about the gap; v1 EXEC works
    end-to-end on install / lint / test / build (the educationally
    interesting parts).
  - *Cons:* an end-to-end "would my pipeline pass?" answer covers
    4/5 Stages, not 5/5. The skip status is loud, so a user reading
    the result will see the delegation explicitly.

The choice is **(iii)**, with **(ii)** named in
[OQ-EXEC-002](#open-questions) as the v0.2 candidate. Either
upgrade is purely additive — `docker-build` moves from
`skipped:docker-build-delegated` to `passed` / `failed` — and does
not require an EXEC contract change beyond extending the status
enum's reachable values.

### Decision D — Single source of truth for "unrunnable"

The Editor's `/api/generate` controller already pre-checks
`packageManager.name == null || runtime.version == null` and returns
`422 UNRESOLVED_REQUIRED_FIELD`. The Dockerfile Generator's edge-case
section ([DOCKER edge cases](./dockerfile-generator.spec.md#edge-cases))
says `generate()` "throws" on PM-null but the implementation does
not yet, and `runtime.version == null` is not currently encoded as a
throw. The Executor is the third consumer in line. Three options:

- **(a) Each consumer carries its own copy of the check.**
  *Why NOT:* three copies of one rule will drift. ADR-0003's lesson.
- **(b) Each consumer pre-checks; the Generator does not throw.**
  *Why NOT:* leaves the Generator's spec edge case half-implemented
  and means an external caller (e.g. a future CLI) could feed
  `generate()` a PM-null IR and get a malformed Dockerfile rather
  than an error.
- **(c) Shared helper in `@modules/ir`; every consumer calls it;
  Generator also throws via the helper (chosen).**

**Concrete proposal — IR module addition (new export):**

```ts
// @modules/ir
export type UnrunnableReason =
  | { kind: 'unresolved-required-field'; field: string }
  | { kind: 'empty-effective-chain'; explanation: string };

export function findUnrunnableReason(ir: PipelineIR): UnrunnableReason | null;
```

The function checks the **required-nullable** fields enumerated by
`REQUIRED_NULLABLE_FIELDS` (already exported from `@modules/ir` per
the detector's contract) and returns the first one that is `null`.
The `empty-effective-chain` reason is **reserved**: EXEC uses it
when `computeEffectiveChain(ir).filter(s => s.id !== 'docker-build')`
is empty (no real work to do); other consumers MAY treat that as a
runnable case (the Dockerfile Generator still emits a single-stage
"disabled" / "not declared" artifact — see EDITOR's empty-chain
table). The kind exists so EXEC has a clean way to refuse.

**Proposed DOCKER amendment (this spec proposes; the actual edit
follows the EXEC implementation in lockstep):**

- Add **DOCKER-FR-NNN**: "`generate()` MUST call
  `findUnrunnableReason` from `@modules/ir`. If the reason has
  `kind === 'unresolved-required-field'`, `generate()` throws an
  `UnresolvedRequiredFieldError` whose `path` equals the offending
  field. If the reason is `empty-effective-chain`, `generate()`
  proceeds — single-stage "not declared" / "disabled" variants are
  the documented behavior."
- Add **DOCKER-AC-014**: "Calling `generate()` on an IR with
  `project.packageManager.name === null` (paired-unresolved entry
  present, so `validate(ir)` returns zero errors) throws
  `UnresolvedRequiredFieldError` with `path ===
  '/project/packageManager/name'`."
- Add a changelog amendment line dated 2026-06-22 noting:
  "amendment — single-source-of-truth precheck via
  `findUnrunnableReason`. Closes the implementation gap surfaced by
  the EDITOR (where the precheck was per-caller). No change to
  generated artifacts."

EXEC's contract uses the same helper; see
[EXEC-FR-002](#functional-requirements). The Editor's controller is
refactored (separate task) to call the shared helper rather than
inline `== null` checks.

## Container security model

EXEC is the first component that runs **user-supplied commands**
inside containers on the user's machine. The sandbox is the spec
itself; there is no auth layer. The following rules are normative:

- The Stage container is created with `docker create` (or `docker
  run -d` followed by `docker wait`), then started, then awaited.
  The Executor MUST NOT use `eval`, `sh -c` of host commands beyond
  the docker CLI invocation, or anything similar.
- `--network` is the Docker default (`bridge`). `--network=host` is
  forbidden in v1 ([EXEC-NFR-001](#non-functional-requirements)).
- `--privileged` is forbidden ([EXEC-NFR-002](#non-functional-requirements)).
- `/var/run/docker.sock` MUST NOT be mounted into any Stage
  container ([EXEC-NFR-003](#non-functional-requirements)).
- The workspace mount is `type=bind,source=<temp-copy>,target=/workspace`.
  No other host directories are mounted ([EXEC-NFR-004](#non-functional-requirements)).
- The container env is **constructed**, not inherited: a minimal base
  (`PATH` is left to the image's default, `LANG=C.UTF-8`, `CI=true`)
  is merged with `steps[].env` (Step env wins on key conflict). The
  host process's `process.env` does NOT leak in. The Executor MUST
  NOT pass `--env-file`, `--env-host`, or similar ([EXEC-FR-008](#functional-requirements)).
- Container resource limits are out of scope for v1 (no `--memory`,
  no `--cpus`), but if a future v0.2 adds them, the v1 default
  becomes documented behavior, not a contract change.
- Per-Stage images come from `Stage.container.image`. The Executor
  does NOT validate the image tag against `:latest`
  (DOCKER-AC-003 is the generator's contract; EXEC trusts the IR
  the same way the Detector does — Stage.container.image is part of
  the IR contract).

These rules turn into [acceptance criteria](#acceptance-criteria)
EXEC-AC-006…010.

## Input/output contract

The Executor is a pure backend module exporting `execute()`:

```ts
// @modules/executor

export type StageStatus =
  | 'passed'
  | 'failed'
  | 'skipped:disabled'
  | 'skipped:dependency-failed'
  | 'skipped:docker-build-delegated';

export interface StageResult {
  stageId: string;
  status: StageStatus;
  exitCode: number | null;        // null for skipped / not-started
  stdout: string;                 // empty for skipped
  stderr: string;                 // empty for skipped
  startedAt: string | null;       // ISO-8601; null for not-started
  finishedAt: string | null;
  durationMs: number;             // 0 for not-started
  skipReason?: string;            // present iff status starts with `skipped:`
}

export type AggregateStatus = 'passed' | 'failed' | 'aborted' | 'unrunnable';

export interface ExecuteResult {
  aggregateStatus: AggregateStatus;
  reason: string | null;           // present iff aggregateStatus is 'unrunnable' | 'aborted'
  stages: StageResult[];           // empty iff aggregateStatus === 'unrunnable'
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface ExecuteOptions {
  ir: PipelineIR;
  /**
   * Host-side absolute path to the project root. The Executor copies
   * this into a temp directory before mounting it; the host tree is
   * NOT mutated. See Decision A.
   */
  projectPath: string;
  signal?: AbortSignal;
  /**
   * Optional override for the temp-copy strategy. v1 only supports
   * 'temp-copy'; the field exists so v0.2 can add 'overlay' or
   * 'in-place-readonly' without a breaking API change.
   */
  workspaceStrategy?: 'temp-copy';
}

export function execute(opts: ExecuteOptions): Promise<ExecuteResult>;
```

**Errors:** `execute()` does NOT throw on Stage failure — that is
reported via `StageResult.status === 'failed'`. It throws (rejects)
only on **programmer errors** (e.g. `projectPath` is not a string,
`ir` failed `validate()`, host Docker is unavailable). These are
named errors:

```ts
export class InvalidExecuteOptionsError extends Error { /* validate fail or arg shape */ }
export class DockerUnavailableError extends Error { /* `docker --version` fails */ }
```

`DockerUnavailableError` is the only "infrastructure" rejection;
callers wishing to skip when Docker is absent should catch this
explicitly (the EXEC test suite gates Docker-requiring ACs on the
same probe — see [Testing approach](#testing-approach)).

## Functional requirements

- **EXEC-FR-001 — Validate input IR.** `execute()` MUST call
  `validate(ir)` from `@modules/ir` before doing anything else. If
  `validate` returns any `ValidationError`s, `execute()` throws
  `InvalidExecuteOptionsError` carrying the validator diagnostics.
- **EXEC-FR-002 — Refuse to run unrunnable pipelines.** After
  validation, `execute()` MUST call `findUnrunnableReason(ir)` (from
  `@modules/ir` — Decision D). If non-null, `execute()` resolves
  with `aggregateStatus: 'unrunnable'`, `reason: <message>`, and
  `stages: []`. The result is deterministic; the only side-effect
  permitted is reading the IR.
- **EXEC-FR-003 — Effective chain from `computeEffectiveChain`.** The
  Stages the Executor runs are exactly
  `computeEffectiveChain(ir)`. The Executor MUST NOT re-derive the
  splice — per [IR-FR-014](./pipeline-ir.spec.md#functional-requirements).
- **EXEC-FR-004 — Per-Stage container.** Each non-skipped Stage runs
  in a fresh container created from `Stage.container.image`. The
  container is created, started, awaited, and removed; one container
  per Stage; no container reuse across Stages.
- **EXEC-FR-005 — `docker-build` delegation (v1).** When a Stage's
  `id === 'docker-build'` appears in the effective chain, the
  Executor MUST emit `StageResult.status = 'skipped:docker-build-delegated'`
  WITHOUT starting a container, with a `skipReason` that names the
  delegation target (e.g. `"Run \`docker build .\` against the
  Dockerfile produced by generate(ir) — EXEC v1 does not nest
  Docker."`).
- **EXEC-FR-006 — Disabled-Stage skip.** A Stage in
  `ir.stages` with `enabled === false` is NOT in the effective chain
  by IR-FR-014; the Executor MUST still emit a `StageResult` for it
  with `status = 'skipped:disabled'` and `skipReason: 'Stage disabled in IR'`,
  so the user sees every Stage they have an opinion about.
- **EXEC-FR-007 — Workspace-copy exclusions (one-shot).** When
  materializing the temp-copy workspace, the Executor MUST exclude
  the following top-level entries from the host `projectPath`
  (matching the spirit of [DOCKER `.dockerignore`](./dockerfile-generator.spec.md)):
  `node_modules`, `.git`, `dist`, `coverage`, `.cache`, `.pnpm-store`.
  The exclusion list is normative and lives next to the Executor.
  **The exclusions apply ONCE, at host → temp copy time, before the
  first Stage starts.** Once Stages begin running, `/workspace` is
  fully mutable for the run's duration; any directory a Stage writes
  (including any of the excluded names) persists across Stages
  within the same `execute()` call. The temp copy is removed when
  `execute()` resolves unless `EXEC_KEEP_WORKSPACE` is set.
- **EXEC-FR-007b — No upstream-Stage precheck.** EXEC MUST NOT add
  a "you have `lint`/`test`/`build` but not `install`" precheck or
  any analogous chain-shape validator. If a Stage's command requires
  state a prior Stage would have produced and that state is absent,
  the Stage fails honestly via its own non-zero exit and its own
  stderr is captured verbatim in `StageResult.stderr`.
- **EXEC-FR-008 — Constructed env, no host inheritance.** Each Stage
  container is started with an env constructed as `{ LANG:
  'C.UTF-8', CI: 'true', ...stepEnv }`. `stepEnv` is the per-Step
  `env` object (later Steps in a Stage merge over earlier Steps;
  Step env wins on key collision with the base). `process.env` is
  NOT inherited.
- **EXEC-FR-009 — Working directory.** The container `WORKDIR` is
  `/workspace`. `step.workingDir` is interpreted relative to
  `/workspace`. Absolute `step.workingDir` values are passed
  through unchanged (no rewriting).
- **EXEC-FR-010 — Step join.** A Stage's `steps[].run` are joined
  by ` && ` in declared array order, and the container runs `sh -c
  '<joined>'`. (Matches the
  [DOCKER multi-step join semantics](./dockerfile-generator.spec.md)
  so EXEC failure modes align with what `docker build`'s `RUN`
  layer would have shown.)
- **EXEC-FR-010b — Package-manager shim for pnpm/yarn.** When
  `project.packageManager.name` is `pnpm` or `yarn`, EXEC MUST
  prepend `corepack enable && ` to the joined shell command for
  EVERY non-skipped Stage and set `COREPACK_HOME=/workspace/.corepack`
  in the container's constructed env. Rationale: each Stage runs
  in a fresh container, so the corepack-managed `pnpm`/`yarn`
  shim from `install`'s container is not available to downstream
  Stages by default. The standalone `corepack enable` mirrors
  exactly the convention the [Dockerfile generator already follows](./dockerfile-generator.spec.md)
  (a standalone `RUN corepack enable` per Dockerfile stage). The
  `COREPACK_HOME` redirection persists the binary cache into the
  shared `/workspace` mount so the corepack download happens once
  per run (in `install`), not once per Stage. For `npm`, no shim
  is needed (npm ships with the node base image), so EXEC adds
  nothing. Surfaced and codified during EXEC implementation
  against the `node-pnpm-nest-basic` fixture (2026-06-22). The
  prepend is at the Executor layer; the IR's `steps[].run` is
  unchanged on the wire.
- **EXEC-FR-011 — Stop at first failure.** When a Stage's
  container exits with a non-zero exit code, its `StageResult.status`
  is `'failed'`. Subsequent Stages in the effective chain (other
  than `docker-build`, which retains its delegated status) are
  emitted with `status = 'skipped:dependency-failed'` and the
  failing Stage's id in `skipReason`.
- **EXEC-FR-012 — Abort propagation.** When `opts.signal` aborts,
  the in-flight Stage's container MUST be stopped (`docker stop` with
  a 5-second grace, then `docker kill`), the StageResult is finalized
  with whatever exit code Docker reports, `aggregateStatus` becomes
  `'aborted'`, and remaining Stages are
  `'skipped:dependency-failed'` with `skipReason: 'aborted'`.
- **EXEC-FR-013 — StageResult fields.** Every `StageResult` MUST
  include `stageId, status, exitCode, stdout, stderr, startedAt,
  finishedAt, durationMs`. `exitCode` is `null` only for never-
  started Stages; `stdout`/`stderr` are `''` for never-started.
  `startedAt`/`finishedAt` are ISO-8601 UTC timestamps; `durationMs`
  is a non-negative integer.
- **EXEC-FR-014 — ExecuteResult ordering.** `stages` in the
  `ExecuteResult` MUST be in the same order as
  `computeEffectiveChain(ir)` after first prepending any
  Stages with `enabled: false` in their original IR position
  (so the consumer sees every Stage the IR declared, in IR order;
  the effective chain is a sub-sequence, but the report covers all
  five canonical Stages whenever they appear).
- **EXEC-FR-015 — Cleanup.** Every container created by the Executor
  MUST be removed (`docker rm`) by the time `execute()` resolves,
  whether the run finished, failed, or aborted. The workspace temp
  copy MUST be removed unless `process.env.EXEC_KEEP_WORKSPACE`
  is set (debug aid, not part of the production contract).

## Non-functional requirements

- **EXEC-NFR-001 — No host network.** Stages MUST NOT use
  `--network=host`. The default `bridge` network is used.
- **EXEC-NFR-002 — No privileged.** Stages MUST NOT be started
  with `--privileged`.
- **EXEC-NFR-003 — No docker socket.** No Stage container is started
  with `/var/run/docker.sock` (or any other docker control plane)
  mounted. This is what makes `docker-build` delegation
  (EXEC-FR-005) non-negotiable in v1.
- **EXEC-NFR-004 — Single bind mount.** Only the temp-copy workspace
  is bind-mounted into Stage containers, at `/workspace`. No other
  host paths are mounted.
- **EXEC-NFR-005 — Determinism on identical input.** Two consecutive
  `execute()` calls with `canonicalEquals`-equal IRs and an
  unchanged `projectPath` MUST produce the same per-Stage
  `status`/`exitCode` (timestamps and `durationMs` MAY differ).
  Determinism beyond status/exitCode is a non-goal (Docker pull
  latency, kernel scheduling, etc. make stdout byte-identity
  unrealistic).
- **EXEC-NFR-006 — No re-implementation of shared algorithms.** The
  Executor MUST call `computeEffectiveChain`, `validate`, and
  `findUnrunnableReason` from `@modules/ir`. It MUST NOT re-derive
  any of them.
- **EXEC-NFR-007 — Pure module.** v1 does not expose an HTTP route,
  does not write logs to disk by default, and does not depend on
  NestJS providers. `execute()` is a free function. A future v0.2
  may wrap it in a controller — see
  [OQ-EXEC-001](#open-questions).

## Cross-spec dependencies

- **IR module.** EXEC imports `PipelineIR`, `validate`,
  `computeEffectiveChain`, and (proposed) `findUnrunnableReason`
  from `@modules/ir`. Adding `findUnrunnableReason` is a new export
  introduced by this spec — its addition belongs to the IR module
  but is motivated by EXEC + DOCKER + EDITOR's converging need
  (Decision D).
- **Detector module.** Not imported. The Executor consumes an IR
  but does not produce one.
- **Dockerfile Generator.** Not imported in v1
  (`docker-build` is delegated, so no `generate(ir)` call). A v0.2
  that runs `docker build` will import it.
- **Visual Editor.** Not imported. The Editor's `/api/generate`
  controller is refactored to call `findUnrunnableReason` once the
  IR module export exists, eliminating its inline `== null`
  precheck — that refactor is an EDITOR-spec amendment, not part of
  this spec.
- **ADR-0001.** This component is the operationalization of
  ADR-0001: native container execution of the IR's commands.

## Edge cases

- **`projectPath` does not exist.** `execute()` throws
  `InvalidExecuteOptionsError`. (Same boundary discipline as the
  Editor's path security: refuse rather than silently empty-copy.)
- **`projectPath` is not absolute.** Throws
  `InvalidExecuteOptionsError`. The Editor's containment was about
  user-supplied paths over HTTP; here the caller is in-process and
  trusted, but absolute-only keeps the contract narrow.
- **`ir` fails `validate()`.** Throws `InvalidExecuteOptionsError`
  carrying the diagnostics — even if the caller has already
  validated. EXEC-FR-001 makes the check unconditional.
- **`ir` fails `findUnrunnableReason()`.** Resolves with
  `aggregateStatus: 'unrunnable'`, `reason: <human-readable>`,
  `stages: []`. NEVER raises.
- **Docker not installed / not running.** `execute()` rejects with
  `DockerUnavailableError`. The check (`docker --version`) happens
  AFTER `findUnrunnableReason` so an unrunnable IR doesn't
  spuriously require Docker.
- **Empty effective chain (all stages disabled).** Treated as
  `unrunnable` with `reason: 'empty-effective-chain — every Stage
  is disabled'`. Distinct from "unrunnable due to PM-null" so the
  caller can distinguish them.
- **Effective chain contains only `docker-build`.** Delegated
  Stage produces its `skipped:docker-build-delegated` result; the
  aggregate status follows: if `docker-build` is the only Stage in
  the IR AND it's the only thing in the effective chain, the
  aggregate is `'passed'` (no non-skipped Stage failed). A caller
  who wants stricter semantics can inspect `stages[]` and react.
- **`Stage.steps.length === 0` (enabled, zero-step).** The container
  starts and immediately exits 0 (the joined command is `sh -c
  ''` — an empty input, exit 0). The Stage is `'passed'` with empty
  stdout/stderr. Matches the
  [DOCKER zero-steps variant](./dockerfile-generator.spec.md): an
  enabled-empty Stage is honestly a no-op, not a failure.
- **A Step's `run` contains shell metacharacters.** They are passed
  to `sh -c` and interpreted as usual. The Executor does no extra
  quoting — `steps[].run` is, by IR contract, a complete shell
  command. The container itself is the sandbox.
- **A Stage's image cannot be pulled.** Docker reports a pull
  failure; the Executor surfaces that as the Stage's stderr +
  non-zero exit code → `status: 'failed'`. Downstream Stages
  follow the stop-at-first-failure rule.
- **An `unresolved` array entry exists but its field is non-null.**
  IR validation already rejects this case (IR-AC-018), so EXEC
  never sees it; if it ever did (programmer error producing a
  custom IR), EXEC-FR-001 catches it via `validate()`.

## Acceptance criteria

Each AC maps to a planned test. The split:

- **Pure-logic ACs** (no Docker): EXEC-AC-001…005, 015. Cover
  precheck, validation refusal, chain selection, skip discipline,
  result shape.
- **Docker-requiring ACs**: EXEC-AC-006…014. Gated on
  `docker --version` succeeding, skipped with a clear message
  otherwise (mirrors DET-AC-008 / DOCKER-AC-006).
- **End-to-end AC**: EXEC-AC-011 is the headline — run the
  `node-pnpm-nest-basic` fixture's effective chain in real
  containers and assert per-Stage statuses.

| ID | Criterion | Planned test |
|---|---|---|
| **EXEC-AC-001** | `execute()` with an IR that fails `validate()` rejects with `InvalidExecuteOptionsError` whose message includes the validator diagnostics. No containers are started. | T-EXEC-001 |
| **EXEC-AC-002** | `execute()` with an IR where `project.packageManager.name === null` (paired-unresolved entry present, `validate(ir)` passes) resolves with `aggregateStatus: 'unrunnable'`, `reason` mentioning `/project/packageManager/name`, `stages: []`. No containers are started. | T-EXEC-002 |
| **EXEC-AC-003** | `execute()` with an IR where `project.runtime.version === null` (paired-unresolved) resolves with `aggregateStatus: 'unrunnable'`, `reason` citing `/project/runtime/version`. | T-EXEC-003 |
| **EXEC-AC-004** | `execute()` with an IR whose every Stage has `enabled: false` resolves with `aggregateStatus: 'unrunnable'`, `reason` matching `empty-effective-chain`. Each disabled Stage appears in `stages` with `status: 'skipped:disabled'` and `skipReason` set. (Edge case: this contrasts with the Dockerfile generator's behavior for the same input — DOCKER emits a variant-1 single-stage Dockerfile; EXEC refuses to "run nothing.") | T-EXEC-004 |
| **EXEC-AC-005** | `execute()` reports each disabled Stage with `status: 'skipped:disabled'` in the result, regardless of whether the effective chain is empty (so a partially-disabled chain still surfaces every Stage). The aggregate status is driven by the non-skipped Stages only. | T-EXEC-005 |
| **EXEC-AC-006** *(Docker)* | `execute()` runs a Stage in a fresh container created from `Stage.container.image`, with `WORKDIR=/workspace` and a bind mount of the temp-copy workspace to `/workspace`. After execution, the container is removed (`docker ps -a` shows no container with the Executor's label). | T-EXEC-006 |
| **EXEC-AC-007** *(Docker)* | Stage containers are started WITHOUT `--network=host`, WITHOUT `--privileged`, and WITHOUT a `/var/run/docker.sock` mount. (Verified by inspecting the docker command line the Executor used.) | T-EXEC-007 |
| **EXEC-AC-008** *(Docker)* | `process.env.NODE_HOST_LEAK_PROBE='leak'` set on the host BEFORE calling `execute()` does NOT appear inside the Stage's container env (verified by injecting a Step that prints `env` and asserting the probe variable is absent). The constructed base env (`LANG=C.UTF-8`, `CI=true`) DOES appear. Step-supplied env DOES appear. | T-EXEC-008 |
| **EXEC-AC-009** *(Docker)* | The host's `projectPath` is unchanged after `execute()` resolves: file count, top-level entry list, and the byte content of `package.json` are identical pre- vs post-execution. (Stages that wrote node_modules wrote it to the temp copy.) | T-EXEC-009 |
| **EXEC-AC-010** *(Docker)* | The `docker-build` Stage in the effective chain produces `StageResult.status === 'skipped:docker-build-delegated'` with a non-empty `skipReason` referencing `docker build` or `generate(ir)`. No container is created for it. | T-EXEC-010 |
| **EXEC-AC-011** *(Docker, headline)* | `execute()` against the `node-pnpm-nest-basic` fixture's IR runs install → lint → test → build in real containers; each non-skipped Stage's `status` is `'passed'`; `docker-build` is `'skipped:docker-build-delegated'`; aggregate is `'passed'`. The slice is the live proof of ADR-0001. | T-EXEC-011 |
| **EXEC-AC-012** *(Docker)* | An IR derived from `node-pnpm-nest-basic` where the `test` Stage's `steps[0].run` is rewritten to `exit 7` produces: `install: passed`, `lint: passed`, `test: failed` with `exitCode: 7`, `build: skipped:dependency-failed`, `docker-build: skipped:docker-build-delegated`, aggregate `'failed'`. (Stop-at-first-failure, with downstream Stages skipped but reported.) | T-EXEC-012 |
| **EXEC-AC-013** *(Docker)* | Aborting via `opts.signal` mid-run leaves the in-flight Stage marked appropriately (failed/passed depending on when Docker observed the stop), remaining Stages marked `skipped:dependency-failed` with `skipReason: 'aborted'`, aggregate `'aborted'`. No containers remain (verified via `docker ps -a` after the call). | T-EXEC-013 |
| **EXEC-AC-014** *(Docker)* | A Stage whose `container.image` cannot be pulled (e.g. a non-existent registry tag) reports `status: 'failed'` with stderr containing the docker pull diagnostic and a non-zero `exitCode`. Subsequent Stages are `skipped:dependency-failed`. | T-EXEC-014 |
| **EXEC-AC-015** | Two consecutive `execute()` calls on the same IR and unchanged `projectPath` produce equal per-Stage `status` and `exitCode` (timestamps differ). This is the "determinism on identical input" rule from EXEC-NFR-005. Tested with `docker` available; skipped otherwise. | T-EXEC-015 |
| **EXEC-AC-016** *(Docker)* | **Workspace lifecycle.** Exclusions are applied ONCE at copy time, then `/workspace` is mutable across Stages. Verified behaviorally: run install → build on the canonical fixture, then assert that `dist/` (which the host tree does NOT contain — it was excluded on copy) exists inside the same temp-copy workspace after the build Stage finishes. This is the assertion that build's output reaches downstream Stages within the run; subsequent Stages can read it. | T-EXEC-016 |
| **EXEC-AC-017** *(Docker)* | **Honest failure on absent upstream.** An IR derived from `node-pnpm-nest-basic` with the `install` Stage's `enabled` flag set to `false` and the rest of the chain enabled produces: `install: skipped:disabled`, then `lint: failed` (its command cannot find `node_modules` and exits non-zero), `test: skipped:dependency-failed`, `build: skipped:dependency-failed`, `docker-build: skipped:docker-build-delegated`, aggregate `failed`. `lint`'s `StageResult.stderr` MUST contain the package manager's actual missing-deps diagnostic (substring match on `node_modules` is sufficient). EXEC MUST NOT inject a synthetic message; the failure surfaces verbatim from the container. | T-EXEC-017 |

## Testing approach

Per the [Test Strategy](../testing/test-strategy.md), every AC maps
to at least one test. EXEC's tests split three ways:

- **Pure-logic tests** (Jest, no Docker): EXEC-AC-001…005, 015's
  logic side. Use a stubbed Docker client (`spawn` replaced with a
  `vi.fn` / Jest mock that records calls and returns a configurable
  exit / stdout / stderr) so the Executor's contract can be
  exercised without containers.
- **Docker-integration tests** (Jest, gated): EXEC-AC-006…014.
  Skipped when `docker --version` fails (use the same probe as
  `DET-AC-008` / `DOCKER-AC-006`). Each test runs against
  `test/fixtures/node-pnpm-nest-basic` or a small variant.
- **End-to-end** (EXEC-AC-011): the live slice — run the full
  effective chain against the canonical fixture and assert all five
  Stage statuses. This is the **headline test** that closes
  ADR-0001's loop.

What is **explicitly NOT testable automatically**:

- Wall-clock time of a Stage (varies by host and image cache state).
- Network egress quality (depends on the host's network).
- Whether the user *experiences* the "fast feedback" promise — that's
  a UX judgment, not a contract.

## Open questions

- **OQ-EXEC-001.** Should EXEC expose `POST /api/execute` with SSE
  streaming for live per-Stage block status? Strong v0.2 candidate;
  the existing `/api/detect` + `/api/generate` envelope cleanly
  extends to a third route. Held out of v1 because streaming adds a
  protocol surface that v1 does not need to prove ADR-0001.
- **OQ-EXEC-002.** Should EXEC v0.2 run `docker-build` itself via a
  host-side `docker build` spawn (Decision B option (ii))? The
  resulting image's lifecycle (tag namespace, cleanup) is the open
  question; the DinD-free engineering is straightforward once that
  is decided.
- **OQ-EXEC-003.** Should EXEC offer per-Stage network sandboxing
  (e.g. `--network=none` for lint/test by default, default `bridge`
  only for install)? Hardening candidate; deferred.
- **OQ-EXEC-004.** Should EXEC honor a per-Stage timeout (e.g. an
  IR-side `timeoutMs`)? The IR carries no such field today. If a
  Step hangs, the caller's `AbortSignal` is the only escape in v1.
- **OQ-EXEC-005.** Should EXEC log every container's full stdout +
  stderr to disk (under an `EXEC_LOG_DIR` env var), and what is the
  retention policy? v1 returns logs in memory; for large test
  suites that risks heap pressure. Hardening candidate.

## Known limitations

- **EXEC-LIMIT-001.** v1 does not run `docker build` for the
  `docker-build` Stage. The delegated status is loud; the live
  Dockerfile smoke is covered by DET-AC-008 / DOCKER-AC-006.
- **EXEC-LIMIT-002.** v1 reports stdout/stderr only after Stage
  completion; no live streaming. A user watching the run sees no
  feedback until each Stage finishes.
- **EXEC-LIMIT-003.** v1 keeps the entire per-Stage stdout/stderr in
  memory and returns it in the result. Pathological output sizes
  could pressure the Node heap. OQ-EXEC-005 has the resolution
  path.
- **EXEC-LIMIT-004.** Image pulls happen lazily on first
  `docker run`; a slow pull dominates wall-clock for the first run.
  v1 does not pre-pull. (Pre-pull is the cheapest of the v0.2
  optimisations.)
- **EXEC-LIMIT-005.** v1 does not preserve per-Step granularity
  in the result — Stage-level only. Each Stage's joined-by-`&&`
  command is one `RUN` for the same reason
  [DOCKER-LIMIT-002](./dockerfile-generator.spec.md) gives.

## Cross-cutting amendments proposed by this spec

This spec proposes two amendments to ALREADY-ACCEPTED specs. Each
is described inline here; the actual edit lands in the affected
spec's changelog when implementation begins, NOT before this spec
is Accepted.

1. **IR module — new export `findUnrunnableReason(ir)`.**
   Decision D. Adds a single shared helper for "is this IR
   runnable?" — the Editor controller, the Dockerfile Generator,
   and EXEC all call it. The IR spec already lists `REQUIRED_NULLABLE_FIELDS`;
   this helper formalizes the "any required field still null →
   not runnable" rule into one function. Anticipated IR-side spec
   note: a new clause under "Required-field uncertainty resolution"
   referencing the helper, no new ACs (the helper is a derivation
   of existing facts).

2. **Dockerfile Generator — `generate()` throws via the shared
   helper.** Decision D. Adds **DOCKER-FR-NNN** ("`generate()` MUST
   call `findUnrunnableReason`; on a non-null reason of
   `unresolved-required-field` it throws
   `UnresolvedRequiredFieldError`") and **DOCKER-AC-014** locking
   the throw. Changelog amendment: "amendment — single-source-of-
   truth precheck via `findUnrunnableReason`. Closes the gap where
   the Editor's controller pre-checked but the generator did not.
   No change to any generated artifact." Status stays Accepted
   (additive).

3. **Visual Editor — controller refactored to use the shared
   helper.** EDITOR-side note only (no AC change): once
   `findUnrunnableReason` exists, the `/api/generate` controller's
   inline `== null` precheck is replaced with a call to the helper.
   The HTTP behavior — 422 `UNRESOLVED_REQUIRED_FIELD` with the
   offending field path — is unchanged. EDITOR's existing
   ACs (notably EDITOR-AC-027 / 033 / 034) cover the
   behavior; this is an implementation-only change.

These three amendments are a **package**: they land together with
the EXEC implementation, or not at all. Until they do, EXEC v1 still
works (it can keep an internal copy of the helper); the amendments
are the cleanup that makes the rule single-sourced.

## Changelog

| Date | Change |
|---|---|
| 2026-06-22 | Initial draft. Settles five design decisions: (A) per-Stage isolation via a shared temp-copy workspace bind-mounted at `/workspace`, with `install` populating node_modules for downstream Stages and the host tree never mutated; (B) effective-chain reuse via `computeEffectiveChain` AND **`docker-build` delegated in v1** (no DinD, no socket mount, no host spawn) with the delegation status explicitly loud — closing the gap is OQ-EXEC-002; (C) stop-at-first-failure with per-Stage StageResult capture and `skipped:dependency-failed` downstream; (D) **single-source-of-truth for "unrunnable"** via a new `findUnrunnableReason` export from `@modules/ir`, with proposed DOCKER amendment (DOCKER-AC-014 + changelog) and EDITOR controller refactor; (E) constructed env (no host inheritance), `WORKDIR=/workspace`, default bridge network. 15 acceptance criteria mapped to T-EXEC-001…015 across pure-logic tests, Docker-gated integration tests, and one headline end-to-end test (EXEC-AC-011) that runs install/lint/test/build in real containers against `node-pnpm-nest-basic` — the live proof of ADR-0001. The container security model is reified as EXEC-NFR-001…004 (no host network, no privileged, no socket, single bind mount). Cross-cutting amendments to IR + DOCKER + EDITOR proposed as a package landing with EXEC implementation. |
| 2026-06-22 | Pre-Accepted tightenings (still Draft at moment of edit). (1) **Workspace lifecycle clarified**: exclusions in EXEC-FR-007 apply ONCE at host→temp-copy time; thereafter `/workspace` is mutable across Stages within the run (build's `dist/` persists into the same mount for downstream Stages). New EXEC-AC-016 covers this behaviorally. (2) **No upstream-Stage precheck** added as EXEC-FR-007b: when install is disabled/absent and a downstream command Stage runs, EXEC does NOT inject a synthetic refusal; the Stage fails honestly with its own stderr captured. New EXEC-AC-017 locks the behavior (install disabled + lint/test/build enabled → lint fails verbatim, downstream `skipped:dependency-failed`). Aligns with the EDITOR Trust boundary — EXEC trusts schema validity, not chain shape. Total ACs: 17 (was 15). |
| 2026-06-22 | **Accepted** 2026-06-22 after review. Implementation MAY begin. The three-amendment package (new `findUnrunnableReason` in `@modules/ir`; DOCKER `generate()` throws via the helper + DOCKER-AC-014 + changelog; EDITOR controller refactored to call the helper) lands together with the EXEC implementation, per the user's instruction. |
| 2026-06-22 | Spec correction (stays Accepted) — added EXEC-FR-010b. Implementation against the `node-pnpm-nest-basic` fixture surfaced that per-Stage fresh containers cannot share the corepack-managed pnpm/yarn shim that `install` sets up — each downstream Stage's container has no shim and `pnpm: not found` aborts the chain. EXEC now prepends `corepack enable && ` to every Stage's shell command when PM is `pnpm`/`yarn`, and sets `COREPACK_HOME=/workspace/.corepack` so the binary download persists across Stages via the shared workspace mount. Mirrors the standalone `RUN corepack enable` the Dockerfile generator already emits per stage. `npm` Stages are unaffected (npm ships with node base images). |
| 2026-09-13 | **Status: Accepted → Implemented.** From adversarial review finding **SDD-03**: every acceptance criterion in this spec is covered by a passing test, and has been for some time, but the status was never advanced — the progress board understated the project. Advanced together with IR, DOCKER, DET, EXEC and EDITOR after the traceability table was completed (the 17 missing EXEC-AC rows added, IR-AC-011's three halves reconciled). |
