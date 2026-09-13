# Pipeline IR Specification

| Field | Value |
|---|---|
| Component | `IR` |
| Status | Accepted |
| Last updated | 2026-06-15 |
| Linked ADRs | [ADR-0001](../adr/0001-native-container-execution.md), [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md), [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md) |

## Objective

Define the **Pipeline IR** — the neutral, provider-agnostic, serializable model
of a pipeline that every other component in `pipe-editor` produces, consumes,
or edits. The IR is the **single source of truth**
([ADR-0003](../adr/0003-ir-as-single-source-of-truth.md)); this spec is its
contract.

This spec also **settles the three boundary decisions** deferred from
[MVP Scope](../product/02-mvp-scope.md#open-boundary-decisions): detection
depth, behavior under uncertainty, and IR topology. The rationale for each
settlement is in the linked ADRs (0005 / 0006 / 0007).

## Scope

In scope:

- The IR's schema (fields, types, allowed values), expressed concretely enough
  to validate.
- The IR's input/output contract — who produces it, who consumes it, who
  mutates it, and how it is serialized.
- The IR's non-functional constraints (provider-neutrality, serializability,
  versioning, ID stability, determinism).
- The IR's expression of the three settled boundary decisions.

Out of scope:

- The internals of the Detector (covered by `detector-engine.spec.md`).
- The internals of any Generator (each has its own spec).
- The internals of the Executor (covered by `pipeline-executor.spec.md`).
- The catalogue of individual Detection Rules (covered by
  [Detection Rules](../rules/detection-rules.md)).
- Anything in the [MVP hard non-goals](../product/02-mvp-scope.md#non-goals-hard-boundaries) —
  notably a second CI provider and multi-language detection.
- **Monorepo workspace detection.** See "Workspaces / monorepos" below.

### Workspaces / monorepos

This is an explicit MVP **non-goal**. A Project is a single folder; the
Detector reads manifests at that folder's root only. If a user points
`pipe-editor` at a monorepo root (containing, say, a top-level `package.json`
plus `backend/` and `frontend/` sub-packages with their own `package.json`),
the Detector treats only the top-level manifests as authoritative and does
not descend into sub-packages.

Users with a workspace layout MUST point the tool at a single app folder
(e.g. `./backend`) for the MVP. This applies to `pipe-editor`'s own
dogfooded pipeline: each workspace is analyzed and built separately. A
later spec may add workspace-aware traversal as an additive concern; v1 does
not pre-empt that design.

## Local definitions

Terms from the [Domain Glossary](../product/03-domain-glossary.md) (Project,
Detector, Pipeline, Stage, Step, Trigger, Generator, Executor, Visual Editor,
Generated Artifact, Provider-neutral, Confidence, Behavior under uncertainty)
are used as defined there.

Additional terms used in this spec:

- **IR document** — a single serialized instance of the Pipeline IR, in JSON
  or YAML, validating against the schema in this spec.
- **Manifest file** — one of a finite, enumerated set of structured,
  declarative files the Detector is allowed to observe (see
  [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md)).
- **Unresolved fact** — a fact a Detection Rule deferred to the user via
  `needs-user-input`; surfaced as an entry in the IR's `unresolved` array.

## Settled boundary decisions

This spec resolves the three deferred boundary decisions. Rationale lives in
the linked ADRs.

| # | Decision | Settled value | ADR |
|---|---|---|---|
| 1 | Detection depth | **Manifest files only.** A closed, enumerated set. No arbitrary source-file parsing in v1. | [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md) |
| 2 | Behavior under uncertainty | **`omit` is the global default.** Rules MAY override to `needs-user-input` (surfaced in `unresolved`) or to `assume-default` (only with a named, justified default). | [ADR-0006](../adr/0006-omit-on-uncertainty-default.md) |
| 3 | IR topology | **Explicit `dependsOn` edges in the schema; v1 validates that the edges form a single linear chain.** A future v2 relaxes the validator to accept any DAG without changing the schema. | [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md) |

These three decisions are normative parts of this spec. Any consumer or
producer of the IR must respect them.

## Input/output contract

The IR is a single document. Its lifecycle in the system:

```
                produces                              consumes (read-only)
+----------+ ---------------> +------------+ ---------------------------> +--------------+
| Detector |                  | Pipeline   |                              | Dockerfile   |
| (DET)    |                  |    IR      |                              |  Generator   |
+----------+                  |  document  | ---------------------------> | GHA Generator|
                              +------------+                              | Executor     |
                                   ^                                      +--------------+
                                   |
                                   | mutates (read-write, same schema)
                                   |
                              +-----------+
                              |  Visual   |
                              |  Editor   |
                              +-----------+
```

- **Producer:** the Detector. Input: a Project (a local folder path). Output:
  an IR document. The Detector is the only component that creates an IR from
  scratch.
- **Consumers (read-only):** the Dockerfile Generator, the GitHub Actions
  Generator, and the Executor. None mutate the IR.
- **Mutator:** the Visual Editor. Input: an IR document; output: a modified IR
  document that validates against the same schema. The Editor MUST NOT
  introduce new fields outside the schema; it edits values.

**Serialization.** The IR is serializable to both JSON and YAML. JSON is the
canonical wire form; YAML is a human-friendly equivalent. Both forms
round-trip without loss of structure or ordering.

**Versioning.** Every IR document declares a semver `version` field at its
root (the IR schema's version, **not** the Project's version). Additive
backwards-compatible changes increment MINOR. Removals or semantic changes
increment MAJOR. The current schema version is `0.1.0`.

## Schema (v0.1.0)

The schema is presented here as commented YAML for readability. A JSON Schema
file will accompany the Accepted spec at
`docs/specs/schemas/pipeline-ir.v0.1.0.schema.json`.

```yaml
version: "0.1.0"                # semver of the IR schema, NOT of the Project

project:
  name: string                  # kebab-case; always derivable from rootPath / package.json.name
  rootPath: string              # absolute path on the host; consumed only by the Executor
  language: string | null       # e.g. "typescript"; null ⇒ paired `unresolved` entry required
  runtime:
    name: string | null         # e.g. "node"; null ⇒ paired `unresolved` entry required
    version: string | null      # e.g. "20"; null ⇒ paired `unresolved` entry required
  packageManager:
    name: "npm" | "pnpm" | "yarn" | null   # null ⇒ paired `unresolved` entry required
    version: string | null                  # null ⇒ paired `unresolved` entry required

triggers:                       # provider-neutral; Generators map to provider syntax
  - kind: "on-push"             # v0.1.0 enumeration: { "on-push" }
    branches: [string]          # e.g. ["main"]

stages:                         # Set of Stages. Order is given by dependsOn edges,
                                # not by array position. Canonical serialization
                                # emits the array in topological order (head → tail)
                                # for human readability and deterministic diffs.
  - id: string                  # kebab-case, stable across runs (see IR-FR-011)
    name: string                # display label for the Visual Editor
    enabled: boolean            # toggled by the Visual Editor; default true
    dependsOn: [string]         # IDs of Stages this Stage depends on. v1: 0 or 1
                                # entries (linear chain). Empty array = pipeline head.
    container:                  # how the Executor runs this stage
      image: string             # e.g. "node:20-alpine". NON-nullable in v1; see
                                # "container.image and reachability" below.
    steps:                      # ORDERED within the stage (Steps inside a Stage
                                # ARE position-ordered; they are not graph nodes)
      - id: string              # kebab-case, unique within the stage
        run: string             # the command to execute
        workingDir: string      # default "."
        env: { string: string } # key/value; default {}

unresolved:                     # facts deferred via `needs-user-input`; default []
  - field: string               # JSON-pointer-style path, e.g. "/project/packageManager"
    reason: "needs-user-input"
    message: string             # human-readable; rendered by the Visual Editor

metadata:
  generatedAt: string           # RFC 3339 timestamp; excluded from determinism checks
  detectorVersion: string       # semver of the Detector that produced this IR
```

### Forbidden fields (enforced by IR-NFR-001)

The schema validator rejects any IR document containing the following keys
anywhere in the tree. These are CI-provider-specific terms; their presence in
an IR document is, by definition, a provider-neutrality violation. The list is
non-exhaustive but normative:

`jobs`, `uses`, `needs`, `runs-on`, `with`, `permissions`, `include`,
`workflow_dispatch`, `dependencies` (as a Stage or Step field).

Note: `dependsOn` is **not** forbidden — it is the IR's own generic edge
vocabulary (see [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md)).
`needs` *is* forbidden because it is GitHub Actions's word for the same
concept; the GHA Generator translates `dependsOn` → `needs:` at render time.

### Linear-chain validation rule (v1, settles topology)

**Scope of this rule.** It applies *only* to IR documents with a non-empty
`stages` array. An IR document with `stages: []` trivially satisfies this
rule (vacuously — there are no edges to constrain). See IR-FR-003.

When `stages` is non-empty, a v1 IR document MUST satisfy all of the
following over the `stages[].dependsOn` edge set:

1. **Acyclic.** No cycle exists in the directed graph.
2. **Single chain.** Every Stage has in-degree ≤ 1 and out-degree ≤ 1.
3. **Single head.** Exactly one Stage has `dependsOn: []`.
4. **Single tail.** Exactly one Stage has out-degree 0.
5. **Connected.** Every Stage is reachable from the head following
   `dependsOn` in reverse.
6. **Well-formed references.** Every ID in any `dependsOn` array resolves to
   a Stage defined in the same document.

A document with a non-empty `stages` array that violates any of (1)–(6)
fails validation in v1 with a specific error citing the offending Stage and
clause. v2 is expected to relax clauses (2)–(4); the schema itself does not
change.

### Required-field uncertainty resolution

The schema's `omit` default ([ADR-0006](../adr/0006-omit-on-uncertainty-default.md))
only works for optional fields. A required field cannot be silently dropped —
omitting it would yield a schema-invalid IR, and there is no escape hatch in
the `omit` directive itself. This subsection defines how required fields are
resolved when no Detection Rule reaches `confidence: high` for them.

**Classification.** Every required IR field is one of:

- **Always-resolvable.** Derived structurally from inputs the Detector always
  has (e.g. `project.name`, `project.rootPath`). Cannot be uncertain.
- **Nullable required.** Declared in the schema as `T | null`. Carries an
  explicit "unresolved" state.

The v0.1.0 schema's required nullable fields are:

| Field path | Type | Notes |
|---|---|---|
| `project.language` | `string \| null` | |
| `project.runtime.name` | `string \| null` | |
| `project.runtime.version` | `string \| null` | |
| `project.packageManager.name` | enum-or-null | |
| `project.packageManager.version` | `string \| null` | |

#### `container.image` and reachability

`stages[].container.image` is **non-nullable** in v1, deliberately. A
Stage-emitting Detection Rule resolves the image at Stage-emission time,
through exactly one of two paths:

1. **Runtime-derived.** The image is computed from `project.runtime`
   (e.g. `"node:" + runtime.version + "-alpine"`). If the runtime is itself
   unresolved, the same emitting rule applies its own `assume-default`
   (e.g. `"node:lts-alpine"`) — the rule documents the default per IR-FR-009.
2. **Constant.** The Stage's image is a fixed string for that Stage kind
   (e.g. `"docker:25"` for a `docker-build` Stage). Never uncertain.

If neither path resolves an image, the emitting rule does **not** emit
the Stage. There is no third path in which a Stage is emitted with an
unresolvable image. Consequently `container.image: null` is structurally
unreachable from any v1 Detection Rule, and the schema can keep it
non-nullable without losing expressive power. A future v2 that admits
"image truly TBD" Stages can widen the type to `string | null`
additively.

This is the only required field that opts out of the uniform null-pairing
rule of #1–6 above; the opt-out is justified by structural unreachability,
not by a separate uncertainty path.

**The required-field uncertainty rule (normative).**

For every required nullable field `F`:

1. If at least one Detection Rule emits a committed value for `F` per
   IR-FR-009 (either at `confidence: high`, or at lower confidence with
   `assume-default`), the field carries that value. No `unresolved` entry.
2. Otherwise — no rule produced a value — the Detector MUST emit `null` for
   `F` AND a paired `unresolved` entry at `F`'s field path. The `omit`
   directive does NOT apply to required fields; `omit` collapses into
   `needs-user-input` when the field is required.
3. A required nullable field set to `null` without a paired `unresolved`
   entry is a validation error (IR-AC-016).
4. The `assume-default` directive is the only way to avoid surfacing an
   `unresolved` entry for a required field that no rule could prove at
   `high` confidence. The rule that opts into `assume-default` MUST document
   the default value and its rationale.

**Resolving the asymmetry called out in review.** Under the previous draft,
`language: null` required an `unresolved` entry but `runtime.version: null`
did not, and `container.image` was non-nullable with no escape. The rule
above eliminates the asymmetry: every nullable required field, regardless of
which one, follows the same `null` ⇒ `unresolved` pairing. A Stage whose
runtime cannot be resolved similarly carries `container.image: null` +
`unresolved` rather than fabricating a default — unless a Detection Rule
explicitly elects `assume-default` (e.g. "use `node:lts-alpine` when the Node
version is unknown") and documents the default.

## Example IR document (Node/NestJS)

The Detector is run against a fixture `node-pnpm-nest-basic/` containing:

```
package.json          # NestJS app; engines.node = "20"; scripts: build, lint, test
pnpm-lock.yaml
nest-cli.json
tsconfig.json
```

It produces the following IR (YAML shown for readability; canonical JSON is
structurally identical):

```yaml
version: "0.1.0"

project:
  name: "node-pnpm-nest-basic"
  rootPath: "/abs/path/to/node-pnpm-nest-basic"
  language: "typescript"
  runtime:
    name: "node"
    version: "20"
  packageManager:
    name: "pnpm"
    version: "9"

triggers:
  - kind: "on-push"
    branches: ["main"]

stages:
  - id: "install"
    name: "Install"
    enabled: true
    dependsOn: []
    container:
      image: "node:20-alpine"
    steps:
      - id: "install-deps"
        run: "corepack enable && pnpm install --frozen-lockfile"
        workingDir: "."
        env: {}

  - id: "lint"
    name: "Lint"
    enabled: true
    dependsOn: ["install"]
    container:
      image: "node:20-alpine"
    steps:
      - id: "lint"
        run: "pnpm lint"
        workingDir: "."
        env: {}

  - id: "test"
    name: "Test"
    enabled: true
    dependsOn: ["lint"]
    container:
      image: "node:20-alpine"
    steps:
      - id: "test"
        run: "pnpm test"
        workingDir: "."
        env: {}

  - id: "build"
    name: "Build"
    enabled: true
    dependsOn: ["test"]
    container:
      image: "node:20-alpine"
    steps:
      - id: "build"
        run: "pnpm build"
        workingDir: "."
        env: {}

  - id: "docker-build"
    name: "Docker Build"
    enabled: true
    dependsOn: ["build"]
    container:
      image: "docker:25"
    steps:
      - id: "docker-build"
        run: "docker build -t node-pnpm-nest-basic:ci ."
        workingDir: "."
        env: {}

unresolved: []

metadata:
  generatedAt: "2026-06-15T10:00:00Z"
  detectorVersion: "0.1.0"
```

A second example — a Project where the `test` script is missing from
`package.json` (default `omit` behavior) and where the language is genuinely
ambiguous (rule overrides to `needs-user-input`):

```yaml
version: "0.1.0"

project:
  name: "ambiguous-fixture"
  rootPath: "/abs/path/to/ambiguous-fixture"
  language: null
  runtime:
    name: "node"
    version: null
  packageManager:
    name: "npm"
    version: null

triggers:
  - kind: "on-push"
    branches: ["main"]

stages:
  - id: "install"
    name: "Install"
    enabled: true
    dependsOn: []
    container: { image: "node:lts-alpine" }      # assume-default rule kicked in
    steps:
      - { id: "install-deps", run: "npm ci", workingDir: ".", env: {} }
  - id: "build"
    name: "Build"
    enabled: true
    dependsOn: ["install"]
    container: { image: "node:lts-alpine" }
    steps:
      - { id: "build", run: "npm run build", workingDir: ".", env: {} }
  # Note: no `lint` or `test` stage. The corresponding scripts were absent
  # AND no rule reached `confidence: high` to emit them; default `omit`
  # applies — the stages simply do not appear. The Visual Editor surfaces
  # them as "add this" suggestions (see Cross-spec dependencies).

# Every nullable required field set to null is paired with an unresolved entry
# (Required-field uncertainty resolution). `packageManager.name: "npm"` was
# emitted via an `assume-default` rule ("default to npm when package.json
# exists but no lockfile is present"); no unresolved entry is required for it.
unresolved:
  - field: "/project/language"
    reason: "needs-user-input"
    message: "Language could not be determined from manifests. Confirm the project language."
  - field: "/project/runtime/name"
    reason: "needs-user-input"
    message: "Runtime could not be determined from manifests."
  - field: "/project/runtime/version"
    reason: "needs-user-input"
    message: "Runtime version could not be determined from manifests."
  - field: "/project/packageManager/version"
    reason: "needs-user-input"
    message: "Package-manager version could not be determined from manifests or lockfile header."

metadata:
  generatedAt: "2026-06-15T10:05:00Z"
  detectorVersion: "0.1.0"
```

## Functional requirements

Each requirement is a verifiable assertion. Implementations MUST satisfy each.

- **IR-FR-001.** An IR document MUST declare a top-level `version` field whose
  value is a valid semver string. A document missing `version` is invalid.
- **IR-FR-002.** An IR document MUST contain exactly one top-level `project`
  object with the fields specified in [Schema](#schema-v010).
- **IR-FR-003.** An IR document MUST contain a top-level `stages` array.
  The array MAY be empty — an empty pipeline (`stages: []`) is a **valid
  IR**; consumers handle it per [Edge cases](#edge-cases) (Generators emit
  a minimal artifact; the Executor reports trivial success). The
  [Linear-chain validation rule](#linear-chain-validation-rule-v1-settles-topology)
  applies only when `stages` is non-empty. When `stages` is non-empty,
  Stage ordering semantics are given by the `dependsOn` edges (IR-FR-006),
  not by array position; canonical serialization emits the array in
  topological order from head to tail for readability and deterministic
  diffs.
- **IR-FR-004.** Each Stage MUST carry a unique `id` (kebab-case), a `name`,
  an `enabled` boolean, a `dependsOn` array of Stage IDs, a `container.image`,
  and an ordered `steps` array of zero or more Steps.
- **IR-FR-005.** Each Step MUST carry an `id` unique within its Stage and a
  `run` command string. `workingDir` defaults to `"."`; `env` defaults to `{}`.
- **IR-FR-006.** Stage ordering MUST be encoded as `dependsOn: [stageId, ...]`
  edges on each Stage. The complete edge set MUST satisfy the [Linear-chain
  validation rule](#linear-chain-validation-rule-v1-settles-topology): a
  single acyclic chain with one head (`dependsOn: []`) and one tail. A Stage
  MUST NOT contain `needs`, `runs-on`, or any other provider-specific
  ordering field. *(Settles topology — [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md).)*
- **IR-FR-007.** An IR document MUST NOT contain any field whose name or
  semantics is specific to a single CI provider (see [Forbidden
  fields](#forbidden-fields-enforced-by-ir-nfr-001)). Verified by IR-NFR-001.
- **IR-FR-008.** An IR document MAY contain a top-level `unresolved` array.
  Each entry MUST have `field`, `reason: "needs-user-input"`, and `message`.
  The presence of an `unresolved` entry implies the absence of a committed
  value at that `field` path.
- **IR-FR-009.** A Detection Rule's emission is determined by the pair
  (effective `confidence`, `on-uncertainty` directive). The complete truth
  table is:

  | `confidence` | `on-uncertainty` | Emission |
  |---|---|---|
  | `high` | (any; ignored) | exactly one committed value at the field |
  | `medium` or `low` | `omit` (the default) | nothing |
  | `medium` or `low` | `assume-default` | exactly one committed value at the field, equal to the rule's documented default |
  | `medium` or `low` | `needs-user-input` | exactly one `unresolved` entry at the field; no committed value at the same field |

  For any given field, a rule MUST NOT emit both a committed value and an
  `unresolved` entry. The four rows above are exhaustive and mutually
  exclusive; the Detector's behavior is a pure function of those two inputs.
  *(Settles uncertainty behavior —
  [ADR-0006](../adr/0006-omit-on-uncertainty-default.md). Required fields add
  an extra constraint; see [Required-field uncertainty
  resolution](#required-field-uncertainty-resolution).)*
- **IR-FR-010.** A Detection Rule MUST observe only the enumerated manifest
  file set in [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md). A
  Detection Rule that observes any other file is invalid. *(Settles detection
  depth.)*
- **IR-FR-011.** Stage IDs and Step IDs produced by the Detector MUST be
  stable across runs given the same Project state. Stability is verified by
  re-running the Detector and comparing IR documents.
- **IR-FR-012.** A `triggers` block, if present, MUST contain only neutral
  `kind` values from the IR's enumeration. The v0.1.0 enumeration is
  `{ "on-push" }`. If `triggers` is absent, Generators MUST apply their own
  documented neutral default.
- **IR-FR-013.** An IR document is consumable read-only by Generators and the
  Executor and is mutable by the Visual Editor. The shape produced by the
  Visual Editor MUST validate against the same schema as the shape produced
  by the Detector.
- **IR-FR-014.** A Stage with `enabled: false` MUST be preserved in the IR
  document so the Visual Editor can toggle it back on. Disabled Stages MUST
  NOT appear in Generated Artifacts and MUST be skipped by the Executor.

  Consumers that render or execute the pipeline MUST apply the
  **disabled-stage splicing rule** to compute the effective chain:

  1. **Splice out.** For each Stage `R` with `enabled: false`, remove `R`
     from the effective chain.
  2. **Re-link.** Every Stage `S` whose `dependsOn` references `R` inherits
     `R`'s `dependsOn`: `S.dependsOn` becomes `R.dependsOn` (set-wise; in
     v1 there is at most one entry). Apply transitively for any run of
     consecutive disabled Stages. If the disabled Stage is the head
     (`dependsOn: []`), its dependents become new heads
     (`dependsOn: []`); if it is the tail, its predecessor becomes the
     new tail.
  3. **Validate.** The effective chain MUST itself satisfy the
     [Linear-chain validation rule](#linear-chain-validation-rule-v1-settles-topology).
     In v1 this is automatic — splicing a node out of a linear chain and
     re-linking its successor preserves linearity.
  4. **Executor semantics.** The Executor skips disabled Stages and runs
     the dependents according to the spliced chain — it does NOT cascade
     "skip" to dependents.

  **Single shared algorithm.** The four clauses above define exactly one
  algorithm. Every consumer (Dockerfile Generator, GitHub Actions
  Generator, Executor) MUST invoke a **single shared implementation** of
  it — not re-derive a copy. This is a direct application of
  [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md): the IR is the
  source of truth, and a transform every consumer depends on must itself
  be shared, or three independent copies will drift and reintroduce
  exactly the local-vs-CI fidelity risk [ADR-0001](../adr/0001-native-container-execution.md)
  exists to remove. Implementations of this spec MUST expose the
  effective-chain computation as one function; conforming consumers MUST
  call it rather than re-implement it. Cross-consumer conformance is
  tested by feeding the same IR through every consumer's splice path and
  asserting identical effective chains.

  The original IR document is **not** mutated by the splicing transform.
  Splicing is a render-time / scheduling-time computation; the document
  the Visual Editor edits still shows the disabled Stage with its
  original `dependsOn` so the user can toggle it back on without losing
  context.

## Non-functional requirements / constraints

- **IR-NFR-001 — Provider neutrality.** The IR document MUST NOT contain any
  field whose key or value semantics is bound to a specific CI provider. The
  schema's forbidden-fields list is enforced by a linter test. *(Required by
  [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md).)*
- **IR-NFR-002 — Serializability.** The IR is fully serializable to JSON and
  to YAML. Round-tripping (`load → dump → load`) MUST yield a structurally
  equal document in both formats, preserving array order.
- **IR-NFR-003 — Versioning.** The IR's top-level `version` field uses semver.
  Additive backwards-compatible changes increment MINOR; breaking changes
  increment MAJOR. Consumers MUST refuse documents whose MAJOR version they
  do not support.
- **IR-NFR-004 — Determinism / ID stability.** Given the same Project state
  and Detector code version, two Detector runs MUST produce IR documents that
  are structurally equal modulo `metadata.generatedAt` (same field values,
  same array orderings, same IDs).
- **IR-NFR-005 — Self-containment.** Consuming an IR document MUST NOT
  require reading any file from the Project except via the explicit
  `project.rootPath`, which the Executor uses to mount the working directory.
- **IR-NFR-006 — Honest claims.** The IR MUST NOT carry any field that asserts
  "byte-for-byte parity with a remote runner." The Executor's claim is
  "same pipeline steps," not "same runtime environment"
  ([ADR-0001](../adr/0001-native-container-execution.md)).

## Cross-spec dependencies

These are obligations the IR contract places on other specs. They are
normative when the named spec is drafted and Accepted.

- **Visual Editor — surface omitted canonical Stages.** Because the global
  default on uncertainty is `omit`
  ([ADR-0006](../adr/0006-omit-on-uncertainty-default.md)), the Visual Editor
  MUST render canonical Stages that are absent from the current IR as
  add-able suggestions, with a short reason ("we did not detect a lint
  script"). Without this, `omit` becomes a silent failure mode. To be
  reified in `visual-editor.spec.md`.
- **GitHub Actions Generator — `dependsOn` → `needs:` translation.** The
  Generator MUST translate Stage `dependsOn` edges to GitHub Actions
  `needs:` declarations when a future v2 IR is non-linear. In v1 (linear),
  it MAY collapse all Stages into a single job's sequential steps. To be
  reified in `github-actions-generator.spec.md`.
- **Detector Engine — manifest-set enforcement.** The Detector MUST reject
  any Detection Rule whose condition reads a file outside the enumerated
  manifest set
  ([ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md)). To be
  reified in `detector-engine.spec.md`.

## Edge cases

- **No `package.json` at all.** `project.language` is `null`; `unresolved`
  contains an entry for `/project/language` (because the language-detection
  rule opts into `needs-user-input`). `stages` may be empty.
- **Monorepo / workspaces.** A folder containing a top-level `package.json`
  with `workspaces` and child packages: the Detector reads only the
  top-level manifests and does not descend into child packages. If
  `workspaces` is the only signal and no buildable scripts are declared at
  the top level, the IR is correspondingly thin and `unresolved` MAY
  contain a `/project` entry asking the user to point at a single app
  folder. See [Workspaces / monorepos](#workspaces--monorepos).
- **`package.json` without `build` / `lint` / `test` scripts.** Those Stages
  are omitted under default `on-uncertainty: omit`. The IR validates with the
  remaining Stages.
- **`package.json` with `scripts.test: ""` (empty string).** Treated as
  absent. Same outcome as no `test` script.
- **Both `package-lock.json` and `pnpm-lock.yaml` present.** A Detection Rule
  conflict, resolved by the precedence model in
  [Detection Rules](../rules/detection-rules.md); the IR MUST commit to
  exactly one `packageManager`.
- **Empty `stages` array.** Valid. Generators MUST handle it by producing a
  minimal valid artifact (a Dockerfile with only a base image; a GitHub
  Actions workflow with a single no-op job). The Executor reports success
  trivially.
- **Empty effective pipeline (all Stages disabled).** When every Stage in a
  non-empty `stages` array has `enabled: false`, the splicing transform
  (IR-FR-014) yields an empty effective chain — semantically equivalent to
  `stages: []` for every consumer. The IR document itself remains valid;
  the obligation falls on the Generators. **Forward note for
  `github-actions-generator.spec.md`:** GitHub Actions rejects workflows
  with zero jobs, so the GHA Generator MUST emit at least one no-op job
  (or refuse and surface the situation to the user) when the effective
  chain is empty. To be reified in that spec.
- **Stage with `enabled: false`.** Persisted in the IR; skipped by the
  Executor; omitted from Generated Artifacts. (IR-FR-014.)
- **A Detection Rule attempts to write a field outside the schema.** The
  Detector MUST refuse and surface the rule as a defect; the IR remains
  schema-conformant.

## Acceptance criteria

Each criterion maps to at least one planned test case. Tests are not written
yet (the spec is `Draft`); the `T-IR-NNN` IDs are reserved here so that
implementation can begin against them once the spec is `Accepted`.

| ID | Criterion | Planned test |
|---|---|---|
| **IR-AC-001** | A document containing only valid `version`, `project`, and `stages: []` validates. A document missing any of these three fails validation with a specific error citing the missing field. | T-IR-001 |
| **IR-AC-002** | The example IR for `node-pnpm-nest-basic` round-trips through JSON and YAML with structural equality preserved (same field values, same array orderings). | T-IR-002 |
| **IR-AC-003** | A document containing any of the forbidden provider-specific keys (`jobs`, `uses`, `needs`, `runs-on`, `with`, `permissions`, `include`, `workflow_dispatch`) fails the provider-neutrality linter, regardless of nesting depth. (`dependsOn` is part of the IR schema and is NOT forbidden — see [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md).) | T-IR-003 |
| **IR-AC-004** | The Detector emits Stages in topological order from head to tail (canonical serialization); the parsed array order equals the topological order of the `dependsOn` chain. Shuffling the document's array order does NOT change the pipeline's semantic order — only the chain does. | T-IR-004 |
| **IR-AC-005** | A Detection Rule emitting `on-uncertainty: needs-user-input` produces exactly one matching `unresolved` entry and no committed value at that field path. | T-IR-005 |
| **IR-AC-006** | A Detection Rule emitting `on-uncertainty: omit` (or no directive — the default) produces no `unresolved` entry and no committed value for that field. | T-IR-006 |
| **IR-AC-007** | An IR document whose `dependsOn` edges violate any clause of the [linear-chain validation rule](#linear-chain-validation-rule-v1-settles-topology) — a cycle, a Stage with two predecessors, two heads, a disconnected Stage, or a dangling reference — fails validation with a specific error citing the offending Stage and clause. A Stage missing the `dependsOn` field also fails validation. | T-IR-007 |
| **IR-AC-008** | Two consecutive Detector runs on the unchanged `node-pnpm-nest-basic` fixture produce IR documents that are structurally equal modulo `metadata.generatedAt`. | T-IR-008 |
| **IR-AC-009** | An IR document with `stages: []` validates and is consumed by both the Dockerfile Generator and the GitHub Actions Generator without error, each producing a minimal valid artifact. | T-IR-009 |
| **IR-AC-010** | An IR document that exercises every required field serializes deterministically: the same Project state through the same Detector code version produces byte-identical canonical JSON (ignoring `metadata.generatedAt`). | T-IR-010 |
| **IR-AC-011** | A Stage with `enabled: false` is round-tripped intact by the Visual Editor, skipped by the Executor, and omitted from both Generated Artifacts. | T-IR-011 |
| **IR-AC-012** | A Detection Rule that attempts to observe a file outside the enumerated manifest set ([ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md)) is rejected by the Detector and surfaced as a rule defect; the IR remains schema-conformant. | T-IR-012 |
| **IR-AC-013** | A Detection Rule declared with `confidence: medium` (or `low`) and no `on-uncertainty` directive produces no committed value and no `unresolved` entry. The same rule re-declared as `confidence: high` produces the committed value. *(Pins the confidence threshold of IR-FR-009.)* | T-IR-013 |
| **IR-AC-014** | A Detector run on a folder containing a top-level `package.json` with a `workspaces` array (and child packages with their own `package.json`) reads only the top-level manifests and produces an IR with `project.rootPath` equal to the folder the user pointed at — never a child workspace path. | T-IR-014 |
| **IR-AC-015** | Given an IR with chain Install → Lint → Test → Build → Docker, setting `lint.enabled = false` produces, in every consumer (Dockerfile Generator, GHA Generator, Executor), an effective chain Install → Test → Build → Docker in which Test's effective `dependsOn` is `["install"]`. The original IR document is unchanged — Lint is still present with `enabled: false` and `dependsOn: ["install"]`. The effective chain satisfies the linear-chain validation rule. *(Tests the [disabled-stage splicing rule](#functional-requirements) of IR-FR-014.)* | T-IR-015 |
| **IR-AC-016** | A required nullable field (`project.language`, `project.runtime.name`, `project.runtime.version`, `project.packageManager.name`, or `project.packageManager.version`) set to `null` without a paired `unresolved` entry at the field's path fails validation with a specific error citing the offending field. *(Tests [Required-field uncertainty resolution](#required-field-uncertainty-resolution). `container.image` is excluded — it is non-nullable in v1; see [`container.image` and reachability](#containerimage-and-reachability).)* | T-IR-016 |
| **IR-AC-017** | An IR document with `stages: []` passes the linear-chain validation rule (vacuously). An IR document with `stages: []` AND any malformed `dependsOn` content elsewhere is impossible by construction — there are no Stages to host such a field. *(Reconciles IR-FR-003 with the linear-chain rule.)* | T-IR-017 |
| **IR-AC-018** | An IR document containing an `unresolved` entry whose `field` path resolves to a present, non-null committed value elsewhere in the document fails validation with a specific error citing the conflicting field path. *(Mirror of IR-AC-016; together they enforce IR-FR-008's bidirectional implication — at every nullable required field, an `unresolved` entry exists if and only if the field is `null`.)* | T-IR-018 |
| **IR-AC-019** | **Committing a value to a required-nullable field is atomic.** `resolveProjectField(ir, field, value)` returns a NEW IR in which the field carries the normalized value AND the paired `unresolved` entry is gone — never one without the other, so no intermediate document violates IR-AC-016 or IR-AC-018. The input IR is not mutated. When every entry is resolved the `unresolved` key is absent rather than an empty array. A `field` outside the five required-nullable paths, or a `value` that `normalizeProjectFieldValue` maps to `null` (an nvm alias, an unsupported package manager, empty text), returns the input IR **unchanged** — the caller reports the refusal instead of writing a bad value. `normalizeProjectFieldValue` is the single shared rule for what a well-formed value is: the Detector uses it to judge evidence (DR-004) and the Visual Editor uses it to judge typed input (EDITOR-UI-FR-018). | T-IR-019 |

## Open questions

These are intentionally left open. They do not block accepting the spec, but
they should be re-examined when the indicated downstream spec is drafted.

- **OQ-IR-001.** Does the IR need a `cache` directive (e.g. for the pnpm
  store)? Deferred to `pipeline-executor.spec.md` — the first Executor
  implementation will surface a real requirement or not.
- **OQ-IR-002.** Does `triggers` need an `on-pull-request` kind in v0.1?
  Deferred to `github-actions-generator.spec.md`.
- **OQ-IR-003.** How are secrets referenced (an empty `secrets` registry,
  per-Step `env` keys with a `{secret: ...}` form, etc.)? Deferred until the
  GitHub Actions Generator surfaces a concrete need.
- **OQ-IR-004.** Per-Step parallelism within a Stage (a future-compatible
  `parallel: true` flag) — deferred until a fixture genuinely needs it.

## Changelog

| Date | Change |
|---|---|
| 2026-06-15 | Initial draft. Settles boundary decisions via ADR-0005, ADR-0006, ADR-0007. |
| 2026-06-15 | Topology revision (still Draft): switched from position-ordered array to explicit `dependsOn` edges + a linear-chain validation rule in v1, so a future DAG is additive (not a breaking change). Tightened detection depth to explicit content parsing of manifests. Pinned confidence threshold to `high` in IR-FR-009. Added Workspaces non-goal. Added Cross-spec dependencies section. New ACs IR-AC-013, IR-AC-014. |
| 2026-06-15 | Contradictions fix (still Draft). (1) Rewrote IR-FR-009 as a (confidence, on-uncertainty) truth table; `assume-default` no longer contradicts the confidence threshold. (2) Added Required-field uncertainty resolution: `packageManager.name`, `runtime.name`, `container.image` made nullable; uniform null⇒unresolved pairing fixes the prior asymmetry. (3) IR-FR-014 now includes a normative disabled-stage splicing rule (transitive re-linking; render-time only) so disabled middle Stages don't break the chain in artifacts. (4) Reconciled IR-FR-003 and the linear-chain validation rule: empty `stages` is explicitly valid; the rule applies only when non-empty. New ACs IR-AC-015, IR-AC-016, IR-AC-017. ADR-0006 updated to match the new IR-FR-009 logic. |
| 2026-06-15 | Pre-Accepted polish (still Draft). IR-FR-014: added a "single shared algorithm" clause — the splicing transform is one shared function every consumer calls, not three copies (ADR-0003). Reverted `container.image` to non-nullable; documented its structural unreachability via Stage-emission coupling. New IR-AC-018 mirroring IR-AC-016 (unresolved-with-committed-value also fails validation). New Edge-case entry: empty effective pipeline (all Stages disabled) is IR-valid; GHA Generator must emit at least one no-op job (forward note). |
| 2026-06-15 | **Accepted** after review; four contradictions resolved, shared splice transform mandated, `container.image` kept non-nullable. Implementation MAY begin against this spec. |
| 2026-09-13 | Amendment (stays Accepted), supporting adversarial review findings **UX-01a/UX-01b**. The null ⟺ unresolved design (IR-FR-008) specified how uncertainty is *recorded* but never how it is *retired*, so in practice it had no exit: the detector wrote `unresolved` entries and nothing in the system could clear one. New `project-fields.ts` adds the missing half as IR-owned operations — `majorFromVersionText` (what counts as a version), `normalizeProjectFieldValue` (what a well-formed value for each required-nullable field is) and `resolveProjectField` (commit a value and drop the paired entry in one step). These are IR concerns because they describe the value shapes of IR fields; putting them here gives the Detector and the Visual Editor one implementation instead of two (ADR-0003). New IR-AC-019. Total ACs: 19 (was 18). |
