# Dockerfile Generator Specification

| Field | Value |
|---|---|
| Component | `DOCKER` |
| Status | Implemented |
| Last updated | 2026-06-15 |
| Linked ADRs | [ADR-0001](../adr/0001-native-container-execution.md), [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md), [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md) |
| Linked specs | [`pipeline-ir.spec.md`](./pipeline-ir.spec.md) (Accepted) |

## Objective

Define the **Dockerfile Generator** — the first real consumer of the Pipeline
IR. Given a validated IR document, it produces a portable pair of artifacts —
a `Dockerfile` and its companion `.dockerignore` — that together build a
runnable container image for the Project.

Its purpose is twofold:

1. **Useful artifact.** Generate a Dockerfile the user can take and `docker
   build .` outside `pipe-editor`, with no `pipe-editor` runtime required.
2. **Stress the IR contract.** This is the smallest possible *real* consumer,
   chosen precisely to put pressure on the IR before the more expensive
   components (Executor, GHA Generator) are built — see
   [`specs/README.md`](./README.md) and
   [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md). If something in
   the IR contract is wrong or thin, this generator will surface it; we will
   then either supersede the IR spec with a new MINOR or fix the generator.

## Scope

In scope:

- A pure function
  `generate(ir: PipelineIR): { dockerfile: string; dockerignore: string }`
  that returns both textual artifacts, deterministic for a given IR. The
  return shape is fixed: every call yields both fields, including for the
  single-stage variants.
- The per-stack template for Node/NestJS (the v1 supported runtime).
- Behavior when the `build` Stage is disabled, absent, or present.
- A documented, conventional entrypoint inference (the
  [Entrypoint gap](#design-decision-2--the-entrypoint-gap)).

Out of scope:

- Any runtime other than `node`. v1 accepts `project.runtime.name === "node"`
  only and refuses anything else with a specific error
  ([DOCKER-FR-010](#functional-requirements)).
- Image tagging, registry push, `docker-compose` generation — the artifact is
  a Dockerfile, nothing else.
- BuildKit-specific features (`--mount`, `--secret`, `RUN --network=none`).
  Portability to a plain `docker build` is the contract.
- `HEALTHCHECK`, `USER`, `EXPOSE` — none of these are derivable from the v1
  IR and inventing defaults would be unsafe. See
  [Open questions](#open-questions).
- Monorepo / workspaces — out of scope per the IR spec.

### Non-goal note (clarifying Design Decision 1)

The Dockerfile Generator MUST NOT model itself as a "translator of the whole
pipeline." The `lint`, `test`, `install`, and `docker-build` Stages of the IR
have no representation in a production container image:

- `lint`, `test` — quality gates that run in CI, not in the runtime image.
- `install` — the Generator runs its own install step inside the Dockerfile;
  it does not import the install Stage's command verbatim. The package
  manager is derived from `project.packageManager.name`.
- `docker-build` — the Generator *is* the docker build; reading the
  `docker-build` Stage would be circular.

The Generator therefore consumes a deliberately narrow slice of the IR (see
[Input / output contract](#inputoutput-contract)). Future contributors who
"helpfully" wire the lint or test Stage into the Dockerfile are misreading
the scope; the boundary above is normative.

## Local definitions

Terms from the [Domain Glossary](../product/03-domain-glossary.md) and the
[Pipeline IR Spec](./pipeline-ir.spec.md) (`Generator`, `Stage`, `effective
chain`, `container.image`, `project.runtime`, etc.) carry their established
meanings.

Additional terms used in this spec:

- **Generated artifact pair** — the two strings produced by
  `generate(ir)`: `dockerfile` (the `Dockerfile` body) and `dockerignore`
  (the `.dockerignore` body). Both end in a single trailing newline.
  When this spec refers to "the Generated Dockerfile," it means the
  `dockerfile` field; when it refers to "the companion `.dockerignore`,"
  it means the `dockerignore` field.
- **Per-stack template** — the family of Dockerfile shapes the Generator
  emits for a given `project.runtime.name`. v1 ships exactly one: `node`.
- **Effective build presence** — whether the `build` Stage is in the
  effective chain returned by `computeEffectiveChain(ir)`. A boolean.
- **Conventional entrypoint** — the per-stack default `CMD` the Generator
  emits when the IR does not (and cannot, in v0.1.0) carry an explicit start
  command. For Node/NestJS: `CMD ["node", "dist/main.js"]`.

## Settled design decisions

This spec settles the five decisions called out at draft time. The rationale
for each lives below the table.

| # | Decision | Settled value |
|---|---|---|
| 1 | What the Generator consumes | `project.runtime`, `project.packageManager`, `project.language`, `project.name`, and the `build` Stage's `steps[].run` (looked up by id). Not the lint / test / install / docker-build Stages. Not `triggers`. |
| 2 | The entrypoint gap | A documented per-stack convention. For Node/NestJS: `CMD ["node", "dist/main.js"]`. Recorded as `DOCKER-LIMIT-001`. Forward note: future IR `v0.2.0` adds `project.startCommand`. The IR is **not** changed now. |
| 3 | Multi-stage | Required when the `build` Stage is in the effective chain: a `builder` stage that installs dependencies and runs build, a `runtime` stage that copies build artifacts and installs production-only dependencies. Pinned base image (no `:latest`). |
| 4 | Determinism + portability | Output is byte-identical for the same IR; `docker build .` works with no `pipe-editor` tooling present. Verified by golden-file tests. |
| 5 | Disabled or absent `build` Stage | Generator emits a **single-stage** Dockerfile with a documented warning header. No multi-stage builder; the image assumes pre-built artifacts are present in the source. The user opted out of build explicitly (disabled) or the project has no buildable script (absent); the artifact reflects that honestly. |

### Design Decision 1 — What it consumes

The Generator reads, by name, the following slice of the IR:

- `project.name` — used in comments only (e.g. the header line). The
  `WORKDIR` is a fixed `/app` regardless of project name. (Decision 1 fix:
  earlier prose conflated comment use with directory naming.)
- `project.runtime.name`, `project.runtime.version` — base image.
- `project.packageManager.name`, `project.packageManager.version` — install
  command + corepack pin.
- `project.language` — informs the per-stack template (Node + TypeScript →
  expect `dist/` build output).
- The Stage with `id === "build"`, if present in the effective chain — its
  `steps[].run` is concatenated and emitted verbatim in the builder stage.
  No other field of that Stage is read; in particular, the Stage's
  `container.image` is not used (the Generator picks the base image from
  `project.runtime`).

**Why so narrow.** The IR is the source of truth, but every consumer reads
only the slice it needs. A production container image has no place for lint
or test (those are CI quality gates, not runtime concerns); reading them
would couple the Generator to a contract it does not need and would invite
the bug "I disabled `lint` and the Dockerfile silently changed." The
boundary above eliminates that class of bug by construction.

### Design Decision 2 — The entrypoint gap

The Pipeline IR v0.1.0 has no `project.startCommand`. A runnable image
needs an `ENTRYPOINT` or `CMD`. We resolve the gap for v1 with a documented
per-stack convention:

| `project.runtime.name` + `project.language` | Conventional CMD |
|---|---|
| `node` + `typescript` | `CMD ["node", "dist/main.js"]` |
| `node` + (other / null) | `CMD ["node", "index.js"]` |

This is recorded as **DOCKER-LIMIT-001** — a *known* limitation, not a bug.
A reader of the artifact must understand the CMD is convention, not
detection.

**Why not change the IR now.** Changing the IR for this gap would:

- couple a Generator concern to the central contract,
- block the Dockerfile Generator on a fresh IR review cycle,
- and pre-empt the cleaner design — a `project.startCommand` detected from
  `package.json`'s `scripts.start`.

**Forward note.** A future Pipeline IR `v0.2.0` SHOULD add
`project.startCommand: string | null` (nullable, paired with `unresolved`
per the Required-field uncertainty rule). The Detection Rule will read
`scripts.start` from `package.json` at `confidence: high`. The Generator
will then prefer `project.startCommand` over the convention; the
convention remains a fallback for IRs without the field. This change is
additive (MINOR bump), not breaking — consumers ignoring the new field
still work.

### Design Decision 3 — Multi-stage

The Generated Dockerfile, when `build` is in the effective chain, MUST
contain two stages: a `builder` and a `runtime`. The runtime stage MUST
NOT inherit from the builder; it MUST FROM the same pinned base image.
Build artifacts are copied with `COPY --from=builder`.

**Why required.** Single-stage images for Node bake the entire `node_modules`
tree and source code into the runtime layer, which is the canonical example
of "what not to do" in Docker for Node. The educational and portfolio goal
of this project ([ADR-0001](../adr/0001-native-container-execution.md))
warrants doing it right. Multi-stage also makes the `--prod` runtime install
honest: the runtime image carries only production dependencies.

**No `:latest`.** The base image MUST be pinned to at least
`<image>:<major-version>-<distro>` (e.g. `node:20-alpine`). The Generator
MUST refuse to emit a tag containing `:latest`. Pinning to a digest is
deferred to a future ADR.

### Design Decision 4 — Determinism + portability

- **Determinism.** `generate(ir1)` and `generate(ir2)` produce
  byte-identical artifacts whenever `ir1` and `ir2` are canonically equal
  (`canonicalEquals` from the IR module). The Generator MUST NOT use the
  current time, a random source, or any non-IR input. Verified by
  golden-file tests: every fixture has checked-in `expected.Dockerfile`
  AND `expected.dockerignore` files, both compared byte-exactly.
- **Portability.** The Generated artifact is self-contained. `docker
  build .` MUST succeed against a fixture project with no `pipe-editor`
  binary or library on `PATH`. To make portability honest, the Generator
  emits a **`.dockerignore` alongside every Dockerfile** (un-defers
  OQ-DOCKER-004); without it, `COPY . .` would slurp host `node_modules`,
  `.git/`, `.env`, etc., either breaking the build (host
  `node_modules` overwriting a builder install) or leaking secrets into
  the image. The `.dockerignore` contents differ by template — see the
  [.dockerignore template](#dockerignore-template) section. No `RUN curl
  ... | sh` of external scripts the IR did not declare; no proprietary
  build args.

### Design Decision 5 — Disabled, empty, or absent `build` Stage

The Generator MUST call `computeEffectiveChain(ir)` (from the IR module,
not re-implement) to determine whether the `build` Stage is in the
effective chain. The decision has four branches; the last three share a
body and differ only in their header comment:

- **`build` is in the effective chain AND has at least one Step.**
  Multi-stage Dockerfile per Decision 3.
- **`build` is in the effective chain but has zero Steps.** Single-stage
  Dockerfile with header variant **"zero steps"**: *"the `build` Stage
  is declared in the IR but contains no Steps; nothing was built."* An
  enabled-but-empty stage is honest about being a no-op — calling it
  "disabled" (as the prior draft did) would be false.
- **`build` is in the IR but `enabled: false`.** Single-stage Dockerfile
  with header variant **"disabled"**: *"the `build` Stage was disabled
  in the Pipeline IR; the image assumes pre-built artifacts exist in the
  source."*
- **`build` is absent from the IR entirely.** Single-stage Dockerfile
  with header variant **"not declared"**: *"the source IR did not
  declare a `build` Stage; the image assumes pre-built artifacts exist
  in the source."*

The three single-stage variants share the same body — only the header
comment differs. This honesty — the artifact tells the user what was and
was not detected — is the same principle as `omit` in
[ADR-0006](../adr/0006-omit-on-uncertainty-default.md).

## Input/output contract

**Input:** a `PipelineIR` document that has passed `validate(ir)` (zero
`ValidationError`s).

**Output:** an object `{ dockerfile: string, dockerignore: string }`.
Both fields are UTF-8 strings ending in a single trailing newline (`\n`).
No file is written by the Generator itself; emission to the filesystem is
the caller's responsibility.

**Errors:** the Generator MAY refuse with a thrown error in exactly one
case in v1: `project.runtime.name` is not in the supported set. The error
MUST cite the field path and the supported set
([DOCKER-AC-005](#acceptance-criteria)).

**Effective chain:** the Generator MUST obtain its view of the pipeline by
calling `computeEffectiveChain(ir)` from `@modules/ir`. It MUST NOT
re-implement splicing or inspect `stages[].enabled` directly. This is the
[IR-FR-014](./pipeline-ir.spec.md#functional-requirements) "single shared
algorithm" mandate, applied to this consumer.

## Per-stack template (v1: `node`)

The Generator chooses the template by `project.runtime.name`:

- `"node"` → see [Multi-stage template](#multi-stage-template-build-in-chain)
  and [Single-stage template](#single-stage-template-build-disabledabsent).
- anything else → refuse with the v1-unsupported error
  ([DOCKER-FR-010](#functional-requirements)).

### Install command, by package manager

Derived from `project.packageManager.name`. The table lists the contents
of the `RUN <install>` line for each manager:

| `packageManager.name` | Install (builder, full) | Install (runtime, prod-only) |
|---|---|---|
| `npm` | `npm ci` | `npm ci --omit=dev` |
| `pnpm` | `pnpm install --frozen-lockfile` | `pnpm install --frozen-lockfile --prod` |
| `yarn` | `yarn install --frozen-lockfile` | `yarn install --frozen-lockfile --production` |

For `pnpm` and `yarn`, the Generator additionally emits a standalone
`RUN corepack enable` line **once per stage that installs**, placed
before the first `COPY package.json …` of that stage. `npm` ships with
Node so no corepack step is needed; for `npm`, no corepack `RUN` is
emitted. The standalone form is chosen over inline `corepack enable && …`
so each layer carries one intent and remains independently cacheable.

### Lockfile, by package manager

The `COPY package.json <lockfile> ./` line copies the lockfile that
matches the detected package manager: `pnpm-lock.yaml`, `package-lock.json`,
or `yarn.lock`.

## Multi-stage template (`build` in chain)

The expected Dockerfile for the canonical `node-pnpm-nest-basic` fixture
(per the IR spec's example IR). This is the **golden file** for
`T-DOCKER-001`. It is reproduced here so the spec's reviewer can sign off
on the artifact's shape, not just the rules that produce it. The
companion golden `.dockerignore` is in
[.dockerignore template](#dockerignore-template).

```dockerfile
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Source: project "node-pnpm-nest-basic" — runtime: node 20 — packageManager: pnpm 9.
# This Dockerfile is portable: `docker build .` works with no pipe-editor
# tooling present. A companion `.dockerignore` is generated alongside.

# ─── Builder stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack so the pinned pnpm version is available.
RUN corepack enable

# Copy manifest and lockfile first so dependency installation caches
# independently of source changes.
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev) for the build.
RUN pnpm install --frozen-lockfile

# Copy the rest of the project source. The companion .dockerignore excludes
# node_modules, dist, .git, .env, etc., so this COPY is safe.
COPY . .

# Build command from the IR's `build` Stage.
RUN pnpm build

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable

# Install production-only dependencies. We re-install from the lockfile here
# rather than `COPY --from=builder node_modules` and prune: a fresh install
# is deterministic in one command, while prune semantics differ subtly
# across package managers and versions.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy build artifacts from the builder stage.
COPY --from=builder /app/dist ./dist

# CMD inferred from the Node/NestJS convention (DOCKER-LIMIT-001).
CMD ["node", "dist/main.js"]
```

## Single-stage template (`build` disabled / zero-steps / absent)

When the effective chain does not contain a buildable `build` Stage, the
Generator emits a single-stage Dockerfile. Three **header variants** are
defined; the body bytes are identical across all three.

### Header variant 1 — `build` disabled (`T-DOCKER-002` golden)

```
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Source: project "node-pnpm-nest-basic" — runtime: node 20 — packageManager: pnpm 9.
#
# NOTE: the `build` Stage was disabled in the Pipeline IR; the image
# assumes pre-built artifacts (e.g. `dist/`) exist in the source. If they
# do not, the resulting image will not be runnable. To restore a build
# step, re-enable the `build` Stage in the Visual Editor. The companion
# .dockerignore intentionally does NOT exclude `dist/`.
```

### Header variant 2 — `build` has zero Steps (`T-DOCKER-012` golden)

```
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Source: project "node-pnpm-nest-basic" — runtime: node 20 — packageManager: pnpm 9.
#
# NOTE: the `build` Stage is declared in the IR but contains no Steps;
# nothing was built. The image assumes pre-built artifacts (e.g.
# `dist/`) exist in the source. If they do not, the resulting image
# will not be runnable. The companion .dockerignore intentionally does
# NOT exclude `dist/`.
```

### Header variant 3 — `build` not declared in IR (`T-DOCKER-008` golden)

```
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Source: project "node-pnpm-nest-basic" — runtime: node 20 — packageManager: pnpm 9.
#
# NOTE: the source IR did not declare a `build` Stage; nothing was built.
# The image assumes pre-built artifacts (e.g. `dist/`) exist in the
# source. If they do not, the resulting image will not be runnable. The
# companion .dockerignore intentionally does NOT exclude `dist/`.
```

### Shared body (all three variants)

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN corepack enable

# Install production-only dependencies.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy the project source. The companion .dockerignore excludes
# node_modules, .git, .env, etc., but intentionally keeps `dist/` so
# pre-built artifacts reach the image.
COPY . .

# CMD inferred from the Node/NestJS convention (DOCKER-LIMIT-001).
CMD ["node", "dist/main.js"]
```

## .dockerignore template

The Generator emits one of two `.dockerignore` variants alongside every
Dockerfile (Decision 4). The choice mirrors the Dockerfile choice:

### Multi-stage variant (paired with the multi-stage Dockerfile)

`dist/` is excluded — the builder rebuilds it from source.

```
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Excludes host files that should not enter the container image. `dist/`
# is excluded because the builder stage rebuilds it from source.

.git
.gitignore
.dockerignore
Dockerfile
node_modules
dist
.env
.env.*
*.log
coverage
```

### Single-stage variant (paired with any of the three single-stage headers)

`dist/` is **not** excluded — the image relies on pre-built artifacts.

```
# Generated by pipe-editor v0.1.0 from a Pipeline IR.
# Excludes host files that should not enter the container image. `dist/`
# is NOT excluded — the single-stage image relies on pre-built artifacts
# from the source.

.git
.gitignore
.dockerignore
Dockerfile
node_modules
.env
.env.*
*.log
coverage
```

## Functional requirements

Each requirement is a verifiable assertion. Implementations MUST satisfy each.

- **DOCKER-FR-001 — Consumed slice.** The Generator MUST read only
  `project.name`, `project.language`, `project.runtime.{name,version}`,
  `project.packageManager.{name,version}`, and the Stage whose `id ===
  "build"` (if it appears in the effective chain). The Generator MUST NOT
  read any other Stage, any field of the `triggers` array, or the
  `unresolved` array. *(Settles Design Decision 1.)*
- **DOCKER-FR-002 — Shared splice mandate.** The Generator MUST obtain its
  view of the chain by calling
  [`computeEffectiveChain`](./pipeline-ir.spec.md#functional-requirements)
  from the IR module. It MUST NOT inspect `stages[].enabled` directly and
  MUST NOT re-implement splicing. *(IR-FR-014; serves
  [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md).)*
- **DOCKER-FR-003 — Multi-stage when `build` present.** When the `build`
  Stage is in the effective chain, the Generated Dockerfile MUST contain
  two stages, named `builder` and `runtime`, both `FROM` the same pinned
  base image, with build artifacts copied via `COPY --from=builder`.
  *(Settles Design Decision 3.)*
- **DOCKER-FR-004 — Single-stage when `build` absent.** When the `build`
  Stage is not in the effective chain (disabled or absent), the Generated
  Dockerfile MUST be single-stage, with a header comment naming the
  reason (`disabled` vs `not declared`). *(Settles Design Decision 5.)*
- **DOCKER-FR-005 — Base image pinned.** The Generated Dockerfile MUST
  reference at least a `<image>:<major>-<distro>` tag (e.g.
  `node:20-alpine`). The string `:latest` MUST NOT appear in the output.
- **DOCKER-FR-006 — Install command from packageManager.** The install
  commands emitted in the Generated Dockerfile MUST be derived from
  `project.packageManager.name` per the [Install command,
  by package manager](#install-command-by-package-manager) table.
- **DOCKER-FR-007 — Build command from the IR's `build` Stage.** When
  multi-stage, the `RUN <build>` line MUST be the verbatim
  `steps[].run` string(s) of the `build` Stage, concatenated with `&&` in
  declared order. The Generator MUST NOT reinterpret the command. *(The
  rule that emitted the build Stage already decided what `pnpm build`
  means.)*
- **DOCKER-FR-008 — Conventional CMD.** In the absence of an explicit
  start command in the IR v0.1.0, the Generated Dockerfile's terminating
  `CMD` MUST be the convention from [Design Decision 2 — The entrypoint
  gap](#design-decision-2--the-entrypoint-gap). The Generator MUST emit
  **exactly one** comment line immediately above the `CMD` citing
  `DOCKER-LIMIT-001` — verbatim: `# CMD inferred from the Node/NestJS
  convention (DOCKER-LIMIT-001).`
- **DOCKER-FR-009 — Deterministic output.** `generate(ir)` MUST be a pure
  function of the IR. Two calls with the same IR (modulo
  `metadata.generatedAt`) MUST produce byte-identical strings.
- **DOCKER-FR-010 — Supported runtime.** The Generator MUST refuse with a
  specific error citing the field path and the supported set when
  `project.runtime.name` is not in `{ "node" }`. *(v1.)*
- **DOCKER-FR-011 — Portable artifact.** The Generated Dockerfile MUST be
  runnable by a stock `docker build .` against the corresponding fixture,
  with no `pipe-editor` binary or library present on the host, **with
  the companion `.dockerignore` placed next to it**. The two files form
  one artifact for portability purposes. For the multi-stage template
  the build MUST succeed. For the three single-stage variants the build
  MUST succeed when pre-built artifacts exist in the source (matching
  the artifact's own header NOTE); when they do not, the build MUST
  fail at `COPY` time rather than silently producing a broken image.
  *(Tested by `T-DOCKER-006`.)*
- **DOCKER-FR-012 — No external network in the Dockerfile.** The
  Generated Dockerfile MUST NOT contain any `RUN` line that fetches a
  script from the network and pipes it to a shell (`curl ... | sh`,
  `wget ... | bash`, etc.). All commands MUST be statically derivable
  from the IR.
- **DOCKER-FR-013 — Single trailing newline.** Both fields of the
  Generator's output (`dockerfile`, `dockerignore`) MUST end with
  exactly one `\n`.
- **DOCKER-FR-014 — `.dockerignore` emission.** The Generator MUST emit
  a `.dockerignore` alongside every Dockerfile as part of its output
  object. The variant MUST match the Dockerfile template: the
  multi-stage variant of `.dockerignore` accompanies the multi-stage
  Dockerfile, the single-stage variant accompanies any of the three
  single-stage headers. Contents are byte-equal to the goldens in
  [.dockerignore template](#dockerignore-template). *(Settles
  OQ-DOCKER-004; serves Decision 4.)*
- **DOCKER-FR-015 — Single-source-of-truth precheck.** `generate()`
  MUST call `findUnrunnableReason(ir)` from `@modules/ir` before any
  template rendering. If the reason has
  `kind === 'unresolved-required-field'`, `generate()` throws
  `UnresolvedRequiredFieldError` whose `path` equals the offending
  field. `kind === 'empty-effective-chain'` MUST NOT cause a throw —
  the documented single-stage "disabled" / "not declared" / "zero
  steps" variants ([Design Decision 5](#design-decision-5--disabled-empty-or-absent-build-stage))
  are the runnable, contractually-defined behavior for that shape.
  Added by the EXEC spec's Decision D (2026-06-22) to retire the
  per-caller `== null` precheck that had drifted between the Editor's
  controller and the Generator's spec.

## Non-functional requirements / constraints

- **DOCKER-NFR-001 — Portability.** Self-contained; `docker build .`
  succeeds outside `pipe-editor`. *(Refines DOCKER-FR-011.)*
- **DOCKER-NFR-002 — Determinism.** Verified by golden-file tests
  ([DOCKER-AC-001], [DOCKER-AC-004]).
- **DOCKER-NFR-003 — Provider neutrality preserved.** The Generator's
  output is a Dockerfile — a CI-provider-neutral artifact by construction.
  This is the IR's
  [IR-NFR-001](./pipeline-ir.spec.md#non-functional-requirements--constraints)
  reaching its first downstream consumer without leak.
- **DOCKER-NFR-004 — No re-implementation of IR transforms.** Beyond
  splicing (DOCKER-FR-002), the Generator MUST NOT re-implement any other
  IR transform (e.g. linear-chain validation; the caller MUST have
  validated the IR first). *(Serves [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md).)*
- **DOCKER-NFR-005 — No BuildKit-specific syntax.** The Generated
  Dockerfile MUST be valid under both classic Docker builder and BuildKit.
  No `--mount`, `--secret`, `--network=none`, or `# syntax=` directives.

## Edge cases

- **`build` Stage with multiple Steps.** The Steps' `run` commands are
  emitted in declared array order, joined by ` && \\\n    `. This keeps
  the Dockerfile readable and preserves shell short-circuit semantics
  (any failing step aborts the layer).
- **`build` Stage with zero Steps.** The Generator emits the single-stage
  Dockerfile with [header variant 2 ("zero steps")](#header-variant-2--build-has-zero-steps-t-docker-012-golden) —
  NOT the "disabled" variant. An enabled-but-empty stage is honestly a
  no-op; labeling it "disabled" would be false.
- **`docker-build` Stage present in the IR.** Ignored. The Generator IS
  the docker build; reading the `docker-build` Stage would be circular.
- **`triggers` present in the IR.** Ignored. Triggers are a CI provider
  concern, not a container image concern.
- **`unresolved` array non-empty.** Ignored at generation time. The
  Generator generates from what is committed; the Visual Editor surfaces
  what is unresolved.
- **`project.packageManager.name` is `null`.** The IR validator already
  required a paired `unresolved` entry; the caller MUST resolve before
  calling `generate`. The Generator does NOT attempt to default to `npm`
  silently — that would invite the silent-fabrication failure mode
  [ADR-0006](../adr/0006-omit-on-uncertainty-default.md) exists to avoid.
  If `packageManager.name` is `null` at `generate` time, the Generator
  throws.
- **`project.runtime.version` is `null`.** Same rule: caller must resolve
  first; the Generator does not silently default.

## Acceptance criteria

Each criterion maps to a planned golden-file test under
`backend/src/modules/dockerfile-generator/` and a fixture under
`test/fixtures/`. Tests are not written yet (the spec is `Draft`).

| ID | Criterion | Planned test |
|---|---|---|
| **DOCKER-AC-001** | The `node-pnpm-nest-basic` fixture generates both the Dockerfile (byte-equal to [Multi-stage template](#multi-stage-template-build-in-chain)) and the `.dockerignore` (byte-equal to the [multi-stage variant](#multi-stage-variant-paired-with-the-multi-stage-dockerfile)). | T-DOCKER-001 |
| **DOCKER-AC-002** | Given the `node-pnpm-nest-basic` fixture with the `build` Stage's `enabled` flag set to `false`, the Generator — acting on the effective presence of `build` via `computeEffectiveChain` (NOT a direct read of `stages[].enabled`) — emits both the single-stage Dockerfile with [header variant 1 ("disabled")](#header-variant-1--build-disabled-t-docker-002-golden) and the [single-stage `.dockerignore` variant](#single-stage-variant-paired-with-any-of-the-three-single-stage-headers), byte-equal to the goldens. | T-DOCKER-002 |
| **DOCKER-AC-003** | Neither file emitted by the Generator MAY contain the substring `:latest`, for any fixture. | T-DOCKER-003 |
| **DOCKER-AC-004** | Two consecutive calls to `generate(ir)` on the same fixture produce byte-identical `dockerfile` AND `dockerignore` strings, regardless of `metadata.generatedAt`. | T-DOCKER-004 |
| **DOCKER-AC-005** | An IR with `project.runtime.name === "python"` causes `generate` to throw with a message citing both the field path (`/project/runtime/name`) and the supported set (`{ "node" }`). | T-DOCKER-005 |
| **DOCKER-AC-006** | For the `node-pnpm-nest-basic` fixture, writing both emitted files (`Dockerfile` and `.dockerignore`) into the fixture directory, then running `docker build .` against it, succeeds. *(Smoke test; runs only when Docker is available — skipped with a clear message otherwise.)* | T-DOCKER-006 |
| **DOCKER-AC-007** | Variants of the fixture with `packageManager.name = "npm" \| "yarn"` produce Dockerfiles whose install lines match the [package-manager table](#install-command-by-package-manager) (and whose `COPY <lockfile>` line matches the package manager's lockfile name). The companion `.dockerignore`, however, MUST be byte-identical across all three package managers — it has no dependency on package manager or lockfile name. The npm and yarn Dockerfiles are byte-equal to their respective goldens. | T-DOCKER-007 |
| **DOCKER-AC-008** | A fixture whose IR has no `build` Stage at all (Detector omitted it) produces the single-stage Dockerfile with [header variant 3 ("not declared")](#header-variant-3--build-not-declared-in-ir-t-docker-008-golden) and the single-stage `.dockerignore` variant, byte-equal to the goldens. | T-DOCKER-008 |
| **DOCKER-AC-009** | A fixture whose IR is a monorepo root (project.name "monorepo", no scripts at the top level) is out of scope for this Generator: the test asserts that the *caller* (a future Detector or CLI layer) rejects the input before it reaches `generate`; the Generator itself behaves as DOCKER-AC-008. *(IR-level non-goal carries through.)* | T-DOCKER-009 |
| **DOCKER-AC-010** | Mutating the input IR after `generate` returns has no effect on the returned `dockerfile` or `dockerignore` strings (defensive: confirms output is not a live reference). | T-DOCKER-010 |
| **DOCKER-AC-011** | The Generator's branch between multi-stage and single-stage is driven by `computeEffectiveChain`, NOT by a direct read of `stages[].enabled`. Verified behaviorally: given an IR where `build.enabled === true`, call `generate` and obtain a multi-stage output; then flip `build.enabled` to `false` on the SAME IR object and call `generate` again — the second call MUST return the single-stage "disabled" variant. (Drops the prior grep check in favor of behavior only.) | T-DOCKER-011 |
| **DOCKER-AC-012** | A fixture whose IR has the `build` Stage with `enabled: true` and `steps: []` produces the single-stage Dockerfile with [header variant 2 ("zero steps")](#header-variant-2--build-has-zero-steps-t-docker-012-golden) and the single-stage `.dockerignore` variant, byte-equal to the goldens. | T-DOCKER-012 |
| **DOCKER-AC-013** | An IR derived from the `node-pnpm-nest-basic` fixture in which **every** Stage has `enabled: false` (install, lint, test, build, docker-build all disabled — i.e. `computeEffectiveChain(ir)` returns `[]`) produces the single-stage Dockerfile with [header variant 1 ("disabled")](#header-variant-1--build-disabled-t-docker-002-golden) AND the single-stage `.dockerignore` variant, byte-equal to the DOCKER-AC-002 goldens. Rationale: the Generator branches solely on `build`'s effective presence (DOCKER-FR-005); install is template-driven from `project.packageManager.name` (DOCKER-FR-006), and lint/test/docker-build are not consumed by this Generator at all — so disabling stages OTHER than `build` MUST NOT alter the artifact compared to disabling `build` alone. (Surfaced by the Visual Editor's `/api/generate` empty-chain analysis; the path was uncovered by DOCKER-AC-002 / DOCKER-AC-011 which both flipped only `build`.) | T-DOCKER-013 |
| **DOCKER-AC-014** | Calling `generate(ir)` on an IR where `project.packageManager.name === null` (paired-unresolved entry present; `validate(ir)` returns zero errors) throws `UnresolvedRequiredFieldError` (from `@modules/ir`) whose `path === '/project/packageManager/name'`. No Dockerfile string is returned. Locks DOCKER-FR-015's behavior and closes the gap where the Editor controller pre-checked but the Generator did not. | T-DOCKER-014 |

## Cross-spec dependencies

- **IR module.** The Generator MUST import the IR module's
  `computeEffectiveChain` and `PipelineIR` type. It MUST NOT vendor the
  splice algorithm. *(IR-FR-014.)*
- **Detector spec (future).** Once the Detector spec is Accepted and
  emits IRs with `confidence`/`on-uncertainty` semantics, this Generator
  will benefit automatically — it reads the committed fields and does not
  re-derive them.
- **Visual Editor spec (future).** The Editor surfaces a "disabled" toggle
  on the build Stage; the Generator's single-stage / multi-stage branch
  is the downstream consequence. The editor's "omitted Stage" surfacing
  ([ADR-0006](../adr/0006-omit-on-uncertainty-default.md) cross-spec
  coupling) applies to `build` like any other Stage.

## Open questions

- **OQ-DOCKER-001.** Should the Generated Dockerfile include a
  `HEALTHCHECK`? Different per application; no IR field carries it.
  Deferred until a `project.healthcheck` is proposed.
- **OQ-DOCKER-002.** Should the Generated Dockerfile set `USER node`
  (non-root) by default? Security-positive but can break naive setups
  that write to `/app` at runtime. Deferred.
- **OQ-DOCKER-003.** Should the base image be pinned to a digest
  (`node:20-alpine@sha256:...`)? Higher fidelity, but requires
  digest lookup at generation time and ties the Dockerfile to a moment.
  Deferred to a dedicated ADR.
- ~~**OQ-DOCKER-004.**~~ **Settled** during review (2026-06-15): the
  Generator emits a `.dockerignore` alongside every Dockerfile. See
  [Design Decision 4](#design-decision-4--determinism--portability) and
  [DOCKER-FR-014](#functional-requirements).

## Known limitations

- **DOCKER-LIMIT-001.** Entrypoint is inferred from a per-stack
  convention because the IR v0.1.0 carries no `project.startCommand`.
  Resolution path: IR v0.2.0 adds the field; the Generator prefers it
  over the convention. See [Design Decision 2](#design-decision-2--the-entrypoint-gap).
- **DOCKER-LIMIT-002.** When the `build` Stage has multiple Steps, the
  Generator joins their `run` commands into a single `RUN` layer with
  `&&`. Per-Step pass/fail status is therefore NOT visible in the
  `docker build` output — only the overall success or failure of that
  RUN layer. Per-block status is the Executor's responsibility
  ([ADR-0001](../adr/0001-native-container-execution.md)), not the
  Dockerfile's; readers MUST NOT expect step granularity from the
  generated image.

## Changelog

| Date | Change |
|---|---|
| 2026-06-15 | Initial draft. Settles five design decisions (consumed slice, entrypoint gap, multi-stage, determinism + portability, disabled `build` behavior). FRs DOCKER-FR-001…013. ACs DOCKER-AC-001…011 mapped to T-DOCKER-001…011. Golden Dockerfiles included inline for both templates. |
| 2026-06-15 | Pre-Accepted review fixes (still Draft). (A) `.dockerignore` un-deferred from OQ-DOCKER-004; the Generator now emits two files. Two `.dockerignore` variants added (multi-stage excludes `dist/`, single-stage keeps it). FR-014 added; FR-011/013 broadened to cover both files; Decision 4 updated. (B) New DOCKER-LIMIT-002 noting per-Step status lives in the Executor, not the Dockerfile. (C) Multi-stage Dockerfile golden gained a rationale line explaining the dual install (re-install vs prune). (D) Decision 1 prose corrected: `project.name` is for comments only; `WORKDIR` is fixed `/app`. (E) DOCKER-AC-002 rewritten to assert the Generator branches on `computeEffectiveChain`, not a direct `enabled` read. (3-followup) Single-stage now has THREE header variants — disabled / zero-steps / not-declared — with separate goldens; new DOCKER-AC-012 covers the zero-steps variant. DOCKER-FR-008 tightened to require ONE-line CMD comment with exact wording. DOCKER-AC-011 grep dropped; the behavioral toggle test now stands alone. |
| 2026-06-15 | **Accepted** 2026-06-15 after review; A resolved via per-template `.dockerignore` + fail-fast FR-011; return shape, limitations, header variants finalized. Two consistency fixes folded in: Objective + Scope + Local Definitions now state the `{ dockerfile, dockerignore }` return shape; DOCKER-AC-007 confirms the `.dockerignore` is byte-identical across npm / pnpm / yarn (only the Dockerfile's install + lockfile-COPY lines vary). Implementation MAY begin. |
| 2026-06-15 | Editorial (Accepted, no contract change). Implementation surfaced that the install-command table listed `corepack enable && pnpm install …` while the multi-stage golden uses a standalone `RUN corepack enable` followed by a plain `RUN pnpm install …`. The golden is the authoritative artifact shape; the table now lists the install RUN's contents only, with a note explaining the standalone corepack RUN. No change to any golden Dockerfile or `.dockerignore`. |
| 2026-06-21 | Amendment (stays Accepted): added DOCKER-AC-013 covering the all-disabled effective chain. Existing DOCKER-AC-002 / DOCKER-AC-011 flipped only `build.enabled`; the all-disabled path (every Stage `enabled: false`) was never behaviorally exercised. Surfaced by the Visual Editor's `/api/generate` empty-chain analysis (EDITOR-AC-029 routes through this exact shape) — the Generator's contract collapses all-disabled to variant 1 because branching depends only on `build`'s effective presence, but the path needed an AC of its own. No template or contract change; this AC documents and tests an existing behavior. |
| 2026-06-22 | Amendment (stays Accepted): single-source-of-truth precheck via `findUnrunnableReason`. New DOCKER-FR-015 mandates `generate()` call the helper before rendering and throw `UnresolvedRequiredFieldError` on `unresolved-required-field`; new DOCKER-AC-014 locks the throw on PM-null. Closes the gap surfaced by the EDITOR spec where the controller pre-checked but the Generator's edge-case rule had no AC and the implementation cast `null as PackageManagerName`, producing a malformed Dockerfile when called directly. No change to any GENERATED artifact for runnable IRs (the precheck only changes behavior on non-runnable IRs, which previously yielded malformed output). Filed as part of the Pipeline Executor spec's three-amendment package (IR adds `findUnrunnableReason`; DOCKER throws via it; EDITOR controller refactored to call it — see `pipeline-executor.spec.md` Decision D). |
| 2026-09-13 | **Status: Accepted → Implemented.** From adversarial review finding **SDD-03**: every acceptance criterion in this spec is covered by a passing test, and has been for some time, but the status was never advanced — the progress board understated the project. Advanced together with IR, DOCKER, DET, EXEC and EDITOR after the traceability table was completed (the 17 missing EXEC-AC rows added, IR-AC-011's three halves reconciled). |
