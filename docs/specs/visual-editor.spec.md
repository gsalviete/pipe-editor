# Visual Editor Specification

| Field | Value |
|---|---|
| Component | `EDITOR` |
| Status | Accepted |
| Last updated | 2026-06-21 |
| Linked ADRs | [ADR-0001](../adr/0001-native-container-execution.md), [ADR-0002](../adr/0002-local-folder-over-remote-repos.md), [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md), [**ADR-0008**](../adr/0008-workspace-root-containment-for-detect-endpoint.md) (security) |
| Linked specs | [`pipeline-ir.spec.md`](./pipeline-ir.spec.md) (Accepted), [`detector-engine.spec.md`](./detector-engine.spec.md) (Accepted), [`dockerfile-generator.spec.md`](./dockerfile-generator.spec.md) (Accepted) |

> 🔒 **SECURITY CALLOUT** — this spec wires the Detector to the NestJS
> HTTP layer, which means user-supplied paths reach the server's
> filesystem. The security model is settled by
> [ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md)
> and turned into testable ACs in [Security](#security-model) below.
> Review that section first.

## Objective

Define the **Visual Editor** — the user-facing surface that lets a
human run `detect()` against a project, review the produced IR, toggle
canonical Stages on or off, and export the resulting IR. This is also
the **first backend code that touches the NestJS HTTP layer**: every
prior component has been a pure module. The spec therefore covers
both:

- The **API contract** — the NestJS route `POST /api/detect` (and a
  thin error model), wrapping the Accepted Detector module.
- The **UI contract** — the React + Vite frontend that calls the
  API and renders the IR.

Both contracts share the `PipelineIR` type **directly** (imported from
`@modules/ir`); they cannot drift because the type is the same symbol.
That sharing is the reason this is one spec rather than two.

## Scope

In scope:

- A backend route `POST /api/detect`, returning `{ ir, warnings }`.
- A backend route `POST /api/generate`, accepting a (possibly edited)
  `PipelineIR` and returning `{ dockerfile, dockerignore }` strings.
  Read-only: the server writes nothing to disk; the client receives
  the artifact contents and decides whether/where to save them. This
  closes the demo loop ("point at a folder → see it → act on it")
  without forcing the user to leave the browser. Settled in
  [Decision F](#decision-f--inline-generate-endpoint-for-the-demo-loop).
- The full security model from
  [ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md):
  workspace-root containment, realpath resolution, localhost-only
  binding.
- A frontend Editor that loads an IR from the API, renders the
  linear chain, allows toggling `Stage.enabled`, surfaces every
  `unresolved` entry as a prompt, and exports the (possibly edited) IR
  as JSON or YAML.
- Resolution of [OQ-DET-002](./detector-engine.spec.md#open-questions):
  warnings reach the user via the HTTP response, not just server
  logs.

Out of scope:

- Authentication, multi-user, billing, persistence. Per
  [MVP non-goals](../product/02-mvp-scope.md#non-goals-hard-boundaries).
- Project upload from client to server. The detector reads the
  **server's** filesystem; on a local dev machine the server and
  client are the same host, so the demo works. Per
  [ADR-0002](../adr/0002-local-folder-over-remote-repos.md).
- Free-text editing of Stage commands, arbitrary Stage creation,
  Stage reordering. These are **non-goals for v1** of the editor
  (see [UI editable surface](#editable-surface-v1)).
- Server-side disk writes for generated artifacts. `POST /api/generate`
  returns the strings; if the user wants files, the client (or a
  separate CLI invocation) writes them. Per
  [Decision F](#decision-f--inline-generate-endpoint-for-the-demo-loop).
- A `POST /api/generate-gha` (GitHub Actions) endpoint. v1 wires the
  Dockerfile Generator only; the GHA Generator gets the same
  treatment once its spec is Accepted.
- WebSocket / SSE live updates. v1 is request/response only.
- A graph rendering library (e.g. React Flow) is **not mandated**.
  The v1 linear chain is simple enough that a stacked React
  component with connector pseudo-elements satisfies the UI
  contract.

## Local definitions

Terms from the [Domain Glossary](../product/03-domain-glossary.md),
[Pipeline IR Spec](./pipeline-ir.spec.md), and
[Detector Engine Spec](./detector-engine.spec.md) carry their
established meanings.

Additional terms used here:

- **Workspace root** — an absolute directory configured via
  `PIPE_EDITOR_WORKSPACE_ROOT`; relative requests are interpreted under it and
  contained absolute requests are mapped to it. See ADR-0008.
- **Effective chain** — the result of `computeEffectiveChain(ir)`
  from `@modules/ir`. The chain that would actually run; reflects
  Stage `enabled` toggles via the
  [splicing rule](./pipeline-ir.spec.md#functional-requirements)
  (IR-FR-014).
- **Loaded IR** — the IR returned by the most recent successful
  `POST /api/detect`, kept as an **immutable reference snapshot**.
  The editor MUST NOT mutate it in place; it exists so behavioral
  tests can compare "what came in from detect" against "what the
  editor would export" and so the user can (in a future v0.2) "reset
  to detected".
- **Working IR** — the editor's current, possibly-edited state.
  Initial value `=== loadedIR` on load. Every toggle interaction
  produces a **new** Working IR (functional update; the Loaded IR is
  untouched). Export serializes the Working IR.
  This parallels the IR contract's non-destructive splice
  ([IR-FR-014](./pipeline-ir.spec.md#functional-requirements)): the
  editor does not mutate the document it received; it derives a new
  one.

## Settled design decisions

| # | Decision | Settled value |
|---|---|---|
| A | Path traversal / arbitrary-file-read | **Workspace-root containment** ([ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md)): `PIPE_EDITOR_WORKSPACE_ROOT` configured; client sends a relative or contained absolute path; backend maps, resolves and realpath-checks containment; localhost-only binding. |
| B | Client vs server filesystem | The detector reads the **server's** filesystem. No upload. Per [ADR-0002](../adr/0002-local-folder-over-remote-repos.md). On a local dev machine the two are the same host, so the demo works. |
| C | Detector warnings on HTTP | Warnings are surfaced in the **HTTP response** alongside the IR (resolves [OQ-DET-002](./detector-engine.spec.md#open-questions)). The detector's `detect()` already returns `{ ir, warnings }`; the controller passes the same shape through verbatim. The detector's pure signature is unchanged. |
| D | Editable surface in v1 | **Closed.** Two interactions: toggle `Stage.enabled` and acknowledge / write into `unresolved` prompts. No free-text command editing, no arbitrary Stage creation, no reordering. |
| E | Rendering of disabled Stages | Disabled Stages **stay visible**, visually distinct (greyed). The effective chain (which would actually run) is what splicing yields, also rendered. Per [ADR-0006](../adr/0006-omit-on-uncertainty-default.md)'s cross-spec coupling and [IR-FR-014](./pipeline-ir.spec.md#functional-requirements)'s mandate to call the shared `computeEffectiveChain`. |
| F | Inline generate endpoint | **`POST /api/generate`** is in v1. It accepts a (possibly edited) `PipelineIR` and returns `{ dockerfile, dockerignore }` strings produced by the existing `@modules/dockerfile-generator`. Read-only (no server-side disk writes). Closes the demo loop without forcing manual export+CLI. |

### Decision A — Security model (the prominent one)

See [Security model](#security-model) below for the full normative
rules. Summary:

- `PIPE_EDITOR_WORKSPACE_ROOT` env var, absolute, MUST be set.
- Backend binds `127.0.0.1` only (defense-in-depth).
- Client sends a relative path or an absolute path contained by the configured
  host-facing root. NUL bytes are rejected with `400 INVALID_PROJECT_PATH`;
  paths outside the root are rejected with `403 PATH_OUTSIDE_WORKSPACE`.
- Resolved path's **realpath** must lie under the workspace root's
  realpath; symlink escapes are closed. Anything outside →
  `403 PATH_OUTSIDE_WORKSPACE`.

I pushed back on a sketchier alternative during review: extending the
plain `path.resolve` containment check with `realpath` on BOTH sides
of the comparison closes a symlink-escape hole that resolve-only
would leave open. The cost is one extra `fs.realpath` call per
request — negligible.

### Decision C — Where the `{ ir, warnings }` shape lives

The Detector already returns `{ ir, warnings }` (since the package.json
hard-throw vs. tsconfig warn-and-skip split). v1 of this Editor spec
**preserves the detector's existing signature** and lets the NestJS
controller pass the shape straight through to the HTTP response.

The alternative — promote `warnings` to a top-level concept inside
the IR — is rejected for v1: warnings are *production-side*
observations, not part of the IR contract. The HTTP layer is the
natural place for them.

### Decision D — Closed editable surface (v1)

Two operations only:

1. **Toggle `Stage.enabled`.** Single boolean per canonical Stage.
2. **Surface `unresolved` entries** as user-facing prompts. The user
   *reads* the message; v1 does not yet write user input back into
   the IR (that becomes useful when the Dockerfile/GHA generators
   gate on resolved values, which is a v0.2 concern; see
   [OQ-EDITOR-003](#open-questions)).

Out for v1: free-text edits to `steps[].run`, creating new Stages,
reordering. The rationale: every other component (Generators,
Executor, Visual Editor) currently relies on a fixed five-Stage
canonical set ([Engine Decision 5](./detector-engine.spec.md#decision-5--stage-emission-policy)).
Letting the user invent Stages in v1 reopens that contract before
any downstream is ready.

### Decision E — Disabled Stages visible

A disabled Stage **does not vanish** from the rendered chain. It is
shown greyed (a stable CSS class — exact naming below — so tests can
key off it) with its toggle in the off position. Re-enabling
restores it to the effective chain. This is the
[ADR-0006 cross-spec coupling](../adr/0006-omit-on-uncertainty-default.md)
applied to disabled rather than omitted Stages: omitting from the
view (the cheap option) would be a silent UX failure.

The editor MUST obtain the *effective* chain by calling
`computeEffectiveChain` from `@modules/ir`. It MUST NOT re-implement
the splice — per IR-FR-014's "single shared algorithm" mandate.

### Decision F — Inline generate endpoint for the demo loop

The driving reason for choosing the HTTP-endpoint scope (over a
purely client-side editor) is the demo arc: *point at a folder → see
the IR → edit it → act on it.* Forcing the user to export JSON and
shell out to a CLI in order to obtain a Dockerfile breaks that arc
right at the payoff. v1 therefore exposes
**`POST /api/generate`** that takes the (possibly edited) IR and
returns `{ dockerfile, dockerignore }` from the already-Accepted,
already-tested `@modules/dockerfile-generator`. The endpoint is a
thin controller over existing code; it is **read-only** (no
server-side disk writes) — the strings travel back to the client,
which decides whether to download them, copy them, or hand them to
`docker build` via the user.

Why this is not scope creep:

- The generator already exists, is tested, and is callable as a pure
  function (`generate(ir)`). The endpoint adds no domain logic.
- Keeping it read-only means no new filesystem-write surface, so the
  threat surface is unchanged from `POST /api/detect`'s perspective
  (the IR comes from the client; no path joining happens).
- A future `POST /api/generate-gha` slots in symmetrically once the
  GHA Generator spec is Accepted — same shape, different output.

What this does **NOT** mean:

- The editor still does not persist anything server-side.
- The editor still does not call the generator from the client
  directly; the generator is a backend module
  (`@modules/dockerfile-generator`) and the spec keeps it that way
  so swap-out of the generator (template revisions, future
  languages) does not require a frontend release.

## Security model

[ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md)
is the authority; this section restates the rules in normative form
so the spec's acceptance criteria can test them directly.

**Rules (every detect request, in order):**

1. The backend reads `PIPE_EDITOR_WORKSPACE_ROOT` at startup. If it
   is unset, empty, or not an existing absolute directory, the
   backend MUST refuse to start with a clear startup error.
2. The workspace root's realpath is cached at startup
   (`wsRoot = realpath(env)`).
3. On each request:
   - Reject if `request.projectPath` is missing, empty, or contains a
     NUL byte: `400 INVALID_PROJECT_PATH`.
   - For a relative path, compute `candidate = path.resolve(wsRoot,
     request.projectPath)`. For an absolute path under the optional
     `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT`, map its relative suffix onto
     `wsRoot`. An absolute path outside both roots returns
     `403 PATH_OUTSIDE_WORKSPACE`.
   - Reject a lexical candidate outside `wsRoot` before filesystem access.
   - Compute `realCandidate = realpath(candidate)`. If `candidate`
     does not exist on disk, return `404 PATH_NOT_FOUND` (the
     containment check has nothing to verify against — but absence
     leaks no path info beyond what the user supplied).
   - **The containment check operates on `realCandidate` — i.e.
     AFTER symlinks anywhere along the path have been resolved — not
     on `candidate`.** A symlink created mid-path between request
     time and check time (or pre-existing) cannot escape because the
     filesystem call that resolves the path is the one whose output
     is checked. Verify
     `realCandidate === wsRoot` OR
     `realCandidate.startsWith(wsRoot + path.sep)`. If not:
     `403 PATH_OUTSIDE_WORKSPACE`.
   - **A path that resolves to the workspace root itself
     (`realCandidate === wsRoot`) is explicitly ALLOWED**, not
     rejected. Rationale: a user pointing the workspace root at the
     project they want to detect is a legitimate setup; the
     containment rule is "do not escape," not "do not equal." This
     matches the [ADR-0008 pseudocode](../adr/0008-workspace-root-containment-for-detect-endpoint.md#decision)
     (the `resolved !== wsRoot` disjunct in the rejection guard) and
     the Edge case for `projectPath: "."`.
   - Run `detect(realCandidate)`.

**Bind to localhost only.** The NestJS server MUST listen on
`127.0.0.1` only, never `0.0.0.0`. The docker-compose stack maps
the container port to `127.0.0.1:3000` for the same reason.

**CORS for the dev server.** The frontend at `http://localhost:5173`
calls the backend at `http://localhost:3000`. CORS MUST allow exactly
`http://localhost:5173` in development. Wildcard CORS is forbidden.

These rules turn directly into acceptance criteria
([EDITOR-AC-001…007](#acceptance-criteria)).

## API contract

### Route: `POST /api/detect`

**Request body** (`application/json`):

```ts
{
  projectPath: string   // relative, or an absolute path contained by the workspace root
}
```

**Success response** (`200 OK`, `application/json`):

```ts
{
  ir: PipelineIR        // imported from @modules/ir; passes validate()
  warnings: Warning[]   // from detect(); see Warning shape below
}

type Warning = {
  manifest: string      // e.g. "tsconfig.json"
  message: string       // parser diagnostic
}
```

**Error response** (`4xx` / `5xx`, `application/json`):

```ts
{
  error: {
    code: ErrorCode     // enum below
    message: string     // human-readable explanation
    detail?: unknown    // optional, code-specific (e.g. parser diagnostic)
  }
}

type ErrorCode =
  | 'INVALID_PROJECT_PATH'       // 400
  | 'PATH_OUTSIDE_WORKSPACE'     // 403
  | 'PATH_NOT_FOUND'             // 404
  | 'NO_MANIFEST'                // 422
  | 'MALFORMED_PACKAGE_JSON'     // 422
  | 'INTERNAL_IR_DEFECT'         // 500
```

### Error mapping (normative)

Every detector throw maps to exactly one error code:

| Detector throw | HTTP | Code | Notes |
|---|---|---|---|
| (security pre-checks fail) | 400 | `INVALID_PROJECT_PATH` | Absolute path, NUL byte, missing field. |
| (security pre-checks fail) | 403 | `PATH_OUTSIDE_WORKSPACE` | Realpath escape. |
| `NoRootDirError` | 404 | `PATH_NOT_FOUND` | Resolved path doesn't exist or isn't a directory. |
| `NoManifestError` | 422 | `NO_MANIFEST` | Directory exists but has zero manifest-set files. |
| `MalformedPackageJsonError` | 422 | `MALFORMED_PACKAGE_JSON` | `detail` carries the parser diagnostic. |
| `RuleRegistrationError` | 500 | `INTERNAL_IR_DEFECT` | Registration is at startup, not per request — this is a defect signal if it ever reaches the wire. |
| `RuleConflictError` | 500 | `INTERNAL_IR_DEFECT` | Two rules emitting at the same target — defect. |
| `RuleDefectError` | 500 | `INTERNAL_IR_DEFECT` | Non-canonical Stage id, unknown field target — defect. |
| `InvalidProducedIRError` | 500 | `INTERNAL_IR_DEFECT` | Composed IR failed `validate()` — defect. |

The 4xx errors are **user-actionable**: the user did something wrong
(typo, escape attempt, malformed project). The 5xx errors are
**defect signals**: the system did something wrong and the user
cannot fix it from the UI.

### API functional requirements

- **EDITOR-API-FR-001 — Route.** The backend exposes exactly the route
  `POST /api/detect`. No other detect routes in v1.
- **EDITOR-API-FR-002 — Request shape.** The body MUST be a JSON
  object with exactly one field, `projectPath: string`. Extra fields
  MUST be ignored or MUST cause `400 INVALID_PROJECT_PATH`;
  implementations choose, but the choice MUST be stable
  (recommendation: reject extras to keep the contract tight).
- **EDITOR-API-FR-003 — Workspace root required.** At startup the
  backend MUST refuse to listen if `PIPE_EDITOR_WORKSPACE_ROOT`
  is unset, empty, not absolute, or does not point at an existing
  directory.
- **EDITOR-API-FR-004 — Path security checks** in the order specified
  in [Security model](#security-model). Each rule failure
  produces the documented HTTP status and code.
- **EDITOR-API-FR-005 — Realpath containment (post-resolution).**
  After relative-path resolution or contained display-root mapping, the
  containment check MUST be performed on the result of
  `realpath(candidate)` — i.e. the FINAL
  resolved path with symlinks along its entirety resolved — against
  `realpath(wsRoot)` (cached at startup). Comparing the pre-realpath
  `candidate` is forbidden: a symlink within the workspace that
  points outside the workspace would pass a string-prefix check on
  the pre-realpath candidate but is exactly what realpath-on-the-
  resolved-path closes. A path whose realpath EQUALS `wsRoot` is
  allowed; a path whose realpath is strictly outside `wsRoot` is
  rejected with `403 PATH_OUTSIDE_WORKSPACE`.
- **EDITOR-API-FR-006 — Successful response shape.** On success the
  controller returns `{ ir, warnings }` verbatim from the detector's
  return value, with HTTP `200 OK`.
- **EDITOR-API-FR-007 — Error wrapping.** The controller catches the
  detector's named errors and maps them per the table above. The
  controller MUST NOT swallow errors or return generic 500s for
  cases that have a specific 4xx mapping.
- **EDITOR-API-FR-008 — Detector signature preserved.** The
  controller calls `detect(rootPath)` with the realpath-resolved
  absolute path. The detector module's public signature is
  unchanged by this spec.
- **EDITOR-API-FR-009 — Idempotent.** Two requests with the same
  `projectPath` against an unchanged filesystem MUST yield IRs
  equal modulo `metadata.generatedAt`. (Inherits the detector's
  DET-FR-011.)
- **EDITOR-API-FR-010 — `warnings` faithfulness.** The `warnings`
  array in the success response MUST equal the detector's
  `warnings` array byte-for-byte. No filtering, no deduplication,
  no reordering.

### Route: `POST /api/generate`

**Purpose.** Take a (possibly edited) `PipelineIR` from the client
and return the generated Dockerfile + `.dockerignore` strings. The
endpoint is a thin controller over `@modules/dockerfile-generator`'s
`generate(ir)`. It writes nothing to disk. Per
[Decision F](#decision-f--inline-generate-endpoint-for-the-demo-loop).

**Request body** (`application/json`):

```ts
{
  ir: PipelineIR    // imported from @modules/ir; MUST pass validate()
}
```

**Success response** (`200 OK`, `application/json`):

```ts
{
  dockerfile: string     // UTF-8, trailing \n; identical to generate(ir).dockerfile
  dockerignore: string   // UTF-8, trailing \n; identical to generate(ir).dockerignore
}
```

**Error response** (`4xx` / `5xx`, `application/json`), using the
same envelope shape as `/api/detect`:

```ts
{
  error: {
    code: GenerateErrorCode
    message: string
    detail?: unknown
  }
}

type GenerateErrorCode =
  | 'INVALID_IR'                  // 400 — body missing/non-object/fails validate()
  | 'UNRESOLVED_REQUIRED_FIELD'   // 422 — packageManager.name or runtime.version is null
  | 'UNSUPPORTED_RUNTIME'         // 422 — project.runtime.name not in v1 supported set
  | 'INTERNAL_GENERATOR_DEFECT'   // 500 — generator threw something unmapped
```

### Generate error mapping (normative)

| Generator throw / pre-check | HTTP | Code | Notes |
|---|---|---|---|
| Body has no `ir` field, `ir` is not an object, or `validate(ir)` returns ValidationErrors | 400 | `INVALID_IR` | `detail` carries the validator errors (each with field path). |
| Generator throws because `project.packageManager.name === null` or `project.runtime.version === null` | 422 | `UNRESOLVED_REQUIRED_FIELD` | `detail` carries the field path. The user MUST resolve the corresponding `unresolved` entry before retrying. |
| Generator throws because `project.runtime.name` is not in the v1 supported set (`DOCKER-AC-005`) | 422 | `UNSUPPORTED_RUNTIME` | `detail` carries the field path and the supported set. |
| Any other thrown error | 500 | `INTERNAL_GENERATOR_DEFECT` | Defect signal — should not reach the wire under a valid IR. |

### Trust boundary — what `/api/generate` accepts

`/api/generate` is the **first endpoint that accepts a `PipelineIR`
from the client.** Unlike `/api/detect`, whose only input is a
relative path, this endpoint's payload is the document itself. The
trust boundary is therefore explicit:

- The endpoint trusts **schema validity**, not reachability. Any IR
  that passes `validate(ir)` (zero `ValidationError`s) is an
  acceptable input, regardless of whether the v1 detector or v1
  editor could have produced it. The endpoint MUST NOT rely on a
  "this came from our detect()" assumption — hand-edited exports,
  IRs from a future v0.2 editor with in-UI resolution, and IRs
  produced by third-party tools that target the same schema are
  all on the table.
- `validate(ir)` is the **mandatory gate**. The controller MUST
  call it before invoking `generate()`. A failing `validate`
  produces `400 INVALID_IR` (see EDITOR-API-FR-012). No
  generation logic runs on an unvalidated client IR.
- A schema-valid IR that is not reachable from v1 detect()+editor
  combined (see [reachability column](#empty-effective-chain--generate-behavior-settled)
  below) is still in the contract — the endpoint defines what it
  does. This is forward-compatibility: when v0.2 adds in-UI
  resolution or IR import, formerly-unreachable shapes become
  reachable without re-specifying the endpoint.

**Detect vs. generate split on the same IR shape.** The two
endpoints treat uncertain IRs **differently on purpose**:
`/api/detect` returns the IR-with-unresolved-entries at `200 OK`
(its job is to *report* the uncertain state — see DET-FR-018(a));
`/api/generate` returns `422 UNRESOLVED_REQUIRED_FIELD` on the same
IR (its job is to *act*, and acting requires resolution). The split
is intentional, not a contradiction: detect describes, generate
commits. A user who runs detect then generate without intervening
edits SHOULD see the 422 — that is the system signalling "you saw
the prompt, you need to address it before I'll build."

### Empty effective chain — generate behavior (settled)

[Callout C](#changelog) — settled: the Dockerfile Generator's
existing semantics already cover every empty-chain shape an
**accepted** (schema-valid) IR can produce, so **no
`NOTHING_TO_GENERATE` error exists**.

The table below is **enumerative over the IR shape space**, not
just over "shapes the editor can produce today". The Reachability
column flags v1 unreachability where it applies.

| # | IR shape | Effective chain | Generator branch | HTTP | Reachable in v1 from detect+editor? |
|---|---|---|---|---|---|
| 1 | Stages present, normal case (`build` enabled with `≥ 1` step) | `build` in chain | Multi-stage Dockerfile per [DOCKER Decision 3](./dockerfile-generator.spec.md#design-decision-3--multi-stage). | 200 | Yes — happy path. |
| 2 | Stages present, all with `enabled: false` (user toggled everything off) | empty | Single-stage Dockerfile, [header variant 1 ("disabled")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage) — `build` is in IR but disabled. The Dockerfile generator branches only on `build`'s effective presence (DOCKER-FR-005 + DOCKER-AC-011); install is template-driven from `project.packageManager.name` (DOCKER-FR-006), and lint/test/docker-build are not consumed by the generator at all. So "all disabled" collapses to the same variant 1 as "only `build` disabled". | 200 | Yes — editor's toggle-only surface can reach all-disabled. **See [Outstanding DOCKER-side gap](#outstanding-cross-spec-gap-all-disabled-coverage) below.** |
| 3 | Stages present, `build` has `steps: []` (zero-step build) | depends on enabled flags; `build` present with zero steps | Single-stage Dockerfile, [header variant 2 ("zero steps")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage). | 200 | Yes — the detector emits an enabled-empty `build` Stage under DET-FR-009 when a non-conventional build script is present but unresolved. |
| 4 | `stages: []` AND `project.packageManager.name === null` | n/a | Generator throws on PM-null check before any chain branching. | **422 `UNRESOLVED_REQUIRED_FIELD`** | Yes — this IS the PM-null shape from DET-FR-018(a). |
| 5 | `stages: []` AND PM + runtime fully resolved | empty | Single-stage Dockerfile, [header variant 3 ("not declared")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage) — `build` is absent from IR. | 200 | **No (v1 unreachable).** Per [DET-FR-018(a)](./detector-engine.spec.md), `stages: []` happens ONLY in the PM-null total-suppression case; the editor's toggle-only surface (EDITOR-UI-FR-013) cannot delete Stages, so it cannot drive a non-empty `stages` to `[]`; the editor's v1 closed surface (Decision D) cannot resolve PM-null inline. So the only path to this row is a hand-edited IR re-imported into a future v0.2, or an external producer. **The row stays in the contract** for forward-compatibility, but is marked unreachable in v1. |
| 6 | `project.packageManager.name === null` OR `project.runtime.version === null` (any `stages`) | n/a | Generator throws (per [DOCKER edge cases](./dockerfile-generator.spec.md#edge-cases)). | **422 `UNRESOLVED_REQUIRED_FIELD`** | Partial — PM-null is reachable from detect (DET-FR-018(a)); runtime-version-null is currently unreachable but follows the same rule. |

The honest-header convention from
[DOCKER Decision 5](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage)
gives empty-chain calls a self-documenting artifact: the user sees
in the Dockerfile header why it is single-stage. A 422
"NOTHING_TO_GENERATE" would be worse UX because it would refuse to
emit anything when the user's intent ("give me an image that
assumes pre-built artifacts") is in fact perfectly expressible.

#### Outstanding cross-spec gap: all-disabled coverage

[DOCKER-AC-002](./dockerfile-generator.spec.md#acceptance-criteria)
and [DOCKER-AC-011](./dockerfile-generator.spec.md#acceptance-criteria)
both test the case "**only `build` is disabled**." Neither walks
"**all Stages disabled (including install, lint, test, docker-build)**,"
which is the path row 2 above traverses. The generator's
template, by inspection, produces the SAME variant 1 single-stage
output for both — `build`'s effective presence is the sole
branching input, and install is template-driven independently of
the install Stage's `enabled` flag. But the path is not behaviorally
locked by an existing DOCKER AC. **Proposed action:** add a new
**DOCKER-AC-013** (suggested wording: *"An IR where every Stage has
`enabled: false` produces the single-stage Dockerfile with header
variant 1 (`disabled`), byte-equal to the DOCKER-AC-002 golden."*),
filed against `dockerfile-generator.spec.md` before EDITOR is moved
to Accepted. If you'd like me to apply that DOCKER-spec edit, say
so explicitly — I have not touched DOCKER in this revision because
its status is Accepted and changes go through its own changelog.

### Generate functional requirements

- **EDITOR-API-FR-011 — Route.** The backend exposes the route
  `POST /api/generate`. v1 returns Dockerfile + `.dockerignore`; a
  future symmetric `POST /api/generate-gha` is out of scope here.
- **EDITOR-API-FR-012 — Request shape and mandatory validation.**
  The body MUST be a JSON object with exactly one field,
  `ir: PipelineIR`. The controller MUST run `validate(ir)` before
  passing the IR to `generate` — **`validate` is the trust gate
  for client-supplied IRs**, see
  [Trust boundary](#trust-boundary--what-apigenerate-accepts).
  A failing `validate` produces `400 INVALID_IR` with the validator
  diagnostics in `detail`. The controller MUST NOT shortcut this
  check on the assumption that the IR "came from" a prior
  `/api/detect` call: requests are independent, the client could
  have edited the IR between the two, and the controller has no
  cheap way to verify provenance. Validating every request is
  trivial (it's a pure call on `@modules/ir`) and is the right
  default.
- **EDITOR-API-FR-013 — Read-only.** The controller MUST NOT write
  any file to the server's filesystem. The Dockerfile and
  `.dockerignore` contents are returned as strings in the response
  body. (Matches [EDITOR-API-NFR-003](#api-non-functional-requirements).)
- **EDITOR-API-FR-014 — No re-implementation of generator logic.**
  The controller MUST import and call `generate` from
  `@modules/dockerfile-generator`. It MUST NOT re-derive any
  template logic or splicing behavior.
- **EDITOR-API-FR-015 — Determinism passthrough.** Two requests
  with `canonicalEquals`-equal IRs MUST yield byte-equal
  `dockerfile` and `dockerignore` strings. (Inherits
  [DOCKER-AC-004](./dockerfile-generator.spec.md#acceptance-criteria).)
- **EDITOR-API-FR-016 — Error mapping.** The controller MUST map
  generator throws per the [Generate error mapping](#generate-error-mapping-normative)
  table. Generic 500s for cases with a specific 4xx mapping are
  forbidden.
- **EDITOR-API-FR-017 — No path on the wire.** The `/api/generate`
  request body MUST NOT carry a filesystem path. The IR has no
  field that, if echoed back by the client, would trigger any
  server-side filesystem read. (Cross-check: the security model of
  ADR-0008 applies to `/api/detect` only because `/api/generate`
  has no `projectPath`-shaped input.)

### API non-functional requirements

- **EDITOR-API-NFR-001 — Localhost binding.** The NestJS server MUST
  bind `127.0.0.1` only. (Defense-in-depth.)
- **EDITOR-API-NFR-002 — CORS narrow.** CORS MUST allow exactly the
  dev frontend origin (`http://localhost:5173`) in development,
  and the same-host production origin otherwise. Wildcard CORS
  (`*`) is forbidden.
- **EDITOR-API-NFR-003 — No persistence.** The controller MUST NOT
  write detected IRs anywhere on disk or in a database. v1 is
  request/response only.
- **EDITOR-API-NFR-004 — No re-implementation of detector logic.**
  The controller MUST import and call `Detector` from
  `@modules/detector`. It MUST NOT re-derive any detector behavior.

## UI contract

### Editable surface (v1)

The editor exposes exactly two user interactions:

1. **Toggle `Stage.enabled`** per canonical Stage.
2. **Read `unresolved` entries.** Each entry is rendered with its
   `field` path and `message`. v1 does NOT write user replies back
   into the IR (deferred — see [OQ-EDITOR-003](#open-questions)).

Anything else — editing `steps[].run`, adding a new Stage,
reordering Stages — is **explicitly out of scope** for v1. The UI
MUST NOT expose affordances for these operations.

### Rendering

- The Editor renders the IR's `stages` array as a vertical (or
  horizontal — implementation choice) sequence of **Stage nodes**.
- Each Stage node carries: its `id`, its `name`, its
  `container.image`, the `run` command of its first Step (read-only
  display in v1), and an enabled/disabled toggle.
- **Disabled Stages MUST remain visible** but visually distinct.
  The component MUST attach a stable CSS class
  `stage-node--disabled` to disabled Stage nodes (so component
  tests can assert this without depending on visual styling).
- The **effective chain** — the chain that would actually run — is
  obtained by calling `computeEffectiveChain(ir)` from
  `@modules/ir`. The effective chain MUST be indicated visually
  (e.g. solid connector lines through enabled Stages; greyed or
  dashed through disabled ones). The exact visual choice is the
  implementation's; what matters is that a user can tell at a
  glance which Stages will run.
- Each `unresolved` entry MUST be rendered as a user-facing prompt
  with both the `field` path and the `message` visible.

### UI functional requirements

- **EDITOR-UI-FR-001 — Initial state.** Before an IR is loaded, the
  editor presents a responsive project-folder field, a contained folder
  browser, drag-and-drop, and two explicit actions: "Edit one app" and
  "Scan all services". No chain is rendered.
- **EDITOR-UI-FR-002 — Load via API.** Clicking "Edit one app" issues
  `POST /api/detect`; on success the editor stores the response IR
  as the **Loaded IR** (immutable reference) and initializes the
  **Working IR** to the same value, then renders the chain.
- **EDITOR-UI-FR-003 — Render all Stages.** Every Stage in the
  Working IR's `stages` array MUST be rendered, regardless of
  `enabled` value. (Disabled stays visible — Decision E.)
- **EDITOR-UI-FR-004 — Toggle Stage.enabled (non-destructive).**
  Each Stage node MUST provide a control that flips its `enabled`
  boolean. Toggling produces a **new Working IR** in which exactly
  one Stage's `enabled` value differs from the prior Working IR; all
  other Stage fields and the rest of the document are structurally
  unchanged (deep-equal). The Loaded IR MUST NOT be mutated by any
  toggle interaction. The editor re-renders from the new Working IR.
  This parallels the non-destructive splice mandate of
  [IR-FR-014](./pipeline-ir.spec.md#functional-requirements).
- **EDITOR-UI-FR-005 — Disabled Stages distinguishable.** The
  rendered DOM for a disabled Stage MUST carry the CSS class
  `stage-node--disabled`.
- **EDITOR-UI-FR-006 — Effective chain rendered.** Connector lines
  (or equivalent) MUST reflect the chain returned by
  `computeEffectiveChain(workingIR)`. The editor MUST NOT
  re-implement the splice — per IR-FR-014. In v1 the visual signal
  has two layers (see EDITOR-UI-FR-016):
  1. Connectors flanking a disabled Stage are styled as
     **inactive** (a class `chain-connector--inactive` distinct
     from the active `chain-connector--active`).
  2. An explicit text caption above (or otherwise adjacent to) the
     chain rendering lists the effective-chain Stage IDs in order,
     read directly from the same `computeEffectiveChain(workingIR)`
     result the connectors use.
  A literal *bypass connector* (a drawn line that routes around
  disabled Stages, visually re-linking `install` to `test` when
  `lint` is disabled) is **explicitly deferred** to v0.2 —
  see [OQ-EDITOR-005](#open-questions). The two-layer v1 signal
  satisfies the "test's effective predecessor visually becomes
  install" reading of EDITOR-AC-015 via the caption's positive
  assertion of adjacency, plus the inactive-connector signal of
  "the line through lint is broken."
- **EDITOR-UI-FR-007 — Unresolved prompts.** Every entry in
  `workingIR.unresolved` MUST be rendered as a visible prompt with
  the entry's `field` path and `message` both displayed.
- **EDITOR-UI-FR-008 — Warnings rendered.** Warnings returned in the
  API response MUST be rendered as a separate (non-blocking)
  notice area: the user should see them, but they do not gate
  rendering or interaction.
- **EDITOR-UI-FR-009 — Export JSON.** An "Export JSON" action MUST
  serialize the current **Working IR** using `serializeCanonical`
  from `@modules/ir` (canonical-form, byte-deterministic given the
  same IR). Toggling Stage `enabled` BEFORE export MUST be visible
  in the exported bytes; the Loaded IR is never the export source.
- **EDITOR-UI-FR-010 — Export YAML.** An "Export YAML" action MUST
  serialize the current **Working IR** as YAML such that
  `yaml.load(exported)` parses back to a `canonicalEquals`-equal
  IR (round-trip).
- **EDITOR-UI-FR-011 — Re-enable restores chain.** Flipping a
  disabled Stage back to `enabled: true` MUST restore it to the
  effective chain on the next render. (Tested by re-running
  `computeEffectiveChain` against the new Working IR after the
  toggle.)
- **EDITOR-UI-FR-012 — Loaded IR immutability.** No toggle, render,
  or export interaction MUST mutate the Loaded IR. Concretely: a
  snapshot of `loadedIR` taken immediately after the API response
  MUST remain `canonicalEquals`-equal to `loadedIR` after any
  sequence of toggle and export interactions.
- **EDITOR-UI-FR-013 — Out-of-scope affordances absent.** The
  editor MUST NOT expose UI controls for editing `steps[].run`,
  adding a Stage, deleting a Stage, or reordering Stages. (v1
  non-goal — Decision D.)
- **EDITOR-UI-FR-014 — PM-null prompt emphasized when chain is
  empty.** When `workingIR.stages.length === 0` AND the Working IR
  contains an `unresolved` entry with `field === "/project/packageManager/name"`,
  the editor MUST render THAT prompt with visible prominence above
  (or otherwise visually dominating) the empty chain area — not as
  one item in a generic list. Rationale: in the PM-null case
  ([DET-FR-018(a)](./detector-engine.spec.md)) it is the **sole
  signal** explaining why the pipeline is empty; burying it would
  leave the user staring at an empty canvas with no actionable
  hint. Other `unresolved` entries continue to be rendered per
  EDITOR-UI-FR-007 but need not share that emphasis.
- **EDITOR-UI-FR-015 — Generate Dockerfile action.** The editor MUST
  expose a "Generate Dockerfile" action that issues
  `POST /api/generate` with `{ ir: workingIR }` and, on success,
  presents the returned `dockerfile` and `dockerignore` strings to
  the user (download links, copy-to-clipboard, or rendered code
  blocks; implementation choice). On a 4xx response the editor MUST
  surface `error.message` and `error.detail` such that the user can
  identify which `unresolved` entry to resolve. The action MUST be
  disabled (or visibly warn) when the Working IR has unresolved
  required fields, as determined by **`findUnrunnableReason(ir)`
  imported from `@modules/ir`** (EDITOR-UI-FR-017) — pre-empting the
  422 round-trip is a courtesy, not a substitute for server-side
  validation.
- **EDITOR-UI-FR-016 — Effective-chain caption.** The editor MUST
  render an **explicit text caption** that names the Stages in
  `computeEffectiveChain(workingIR)` in their effective order,
  joined by a visible separator (`→` recommended). The caption
  MUST:
  1. Read from the **same** `computeEffectiveChain(workingIR)`
     result the chain rendering uses — not re-derive it (one read,
     two consumers).
  2. Update on every Working IR change, so toggling a Stage
     re-renders the caption with the spliced order.
  3. Carry a stable test hook (`data-testid="effective-chain-caption"`)
     so component tests can assert the caption's text.
  4. Be visually distinct from the Stage cards themselves
     (typography, position, or both) so the user reads it as a
     *summary*, not as another Stage entry.
  When the effective chain is empty (every Stage disabled, or
  `stages: []`), the caption MUST either hide itself or display an
  explicit "empty" placeholder; implementations choose, but the
  choice MUST be stable so a test can rely on it. The PM-null
  emphasis from EDITOR-UI-FR-014 supersedes the caption visually
  in that case.
- **EDITOR-UI-FR-017 — Shared runnability gate.** Any editor
  affordance that is enabled or disabled on the basis of "does this
  IR have unresolved required fields?" — the Generate action
  (EDITOR-UI-FR-015), the Run action, and the accompanying hint
  text — MUST derive that answer from **`findUnrunnableReason(ir)`
  imported from `@modules/ir`**, the same symbol
  `/api/generate`, `/api/export/:provider` and the Executor
  consult. The editor MUST NOT maintain its own list of
  required-nullable fields. Rationale: the set of required-nullable
  fields is an IR-spec concept (five fields, per
  `REQUIRED_NULLABLE_FIELDS`); a second copy in the frontend is
  precisely the drift the shared-symbol design exists to prevent,
  and when it drifts the user sees an enabled button fail with a
  422 citing a field the interface never named.

- **EDITOR-UI-FR-018 — Resolving an unresolved field in place.** Every
  `unresolved` entry whose `field` is one of the five required-nullable
  `/project/*` fields MUST render, alongside its `field` and `message`
  (EDITOR-UI-FR-007), a control that commits a value for that field:
  1. A **`<select>`** where the value set is closed —
     `/project/packageManager/name` (`npm` | `pnpm` | `yarn`),
     `/project/runtime/name` (`node`), `/project/language`
     (`typescript` | `javascript`). Choosing an option commits it.
  2. A **text input plus a commit button** where it is not —
     `/project/runtime/version`, `/project/packageManager/version`.
     Enter commits as well as the button.
  Each control MUST carry an accessible label naming the field in the
  user's vocabulary ("Node version", "Package manager"), not the JSON
  pointer.

  **The commit is atomic.** It MUST go through `resolveProjectField`
  from `@modules/ir`, which sets the value and removes the paired
  `unresolved` entry in one new IR, so the document never passes through
  a state that violates null ⟺ unresolved (IR-AC-016 / IR-AC-018). The
  editor MUST NOT set the field and drop the entry as two edits.

  **A value that does not normalize is refused, not written.** The
  editor MUST run `normalizeProjectFieldValue` (the IR's own rule, not a
  local copy) and, when it yields `null`, keep the prompt, leave the IR
  untouched, and show the reason in an element with `role="alert"`.
  `20`, `v20.11.0` and `>=20` all commit as `20`; `lts/hydrogen` is
  refused.

  **Resolution is an ordinary edit.** It produces a new Working IR, is
  pushed onto the undo history, leaves the Loaded IR untouched
  (EDITOR-UI-FR-012), and triggers autosave and re-validation like any
  other edit.

  **Stage images are not rewritten.** Committing
  `/project/runtime/version` does NOT retag the stages that carry
  `node:lts-alpine`. Those are a distinct IR field the user may have set
  deliberately (see the coherence note in the detection-rules
  catalogue); the Pipeline Doctor's floating-tag and runtime-drift
  findings are what surface the mismatch, and the per-stage image
  control is what fixes it.

- **EDITOR-UI-FR-019 — Provenance and the command-review gate.** The
  editor MUST track where the current Pipeline IR came from, as one of
  `detected | imported | shared`, and MUST treat the two non-detected
  provenances as untrusted input.

  `detected` is the only provenance whose commands the user implicitly
  authored: they were derived from that user's own manifests by the
  Detection Rules in this repository. An `imported` or `shared` document
  arrived from a file, a clipboard or a URL, and `validate()` is a
  **schema** gate — it certifies the document's shape and says nothing
  about what its commands do. Running one is running someone else's shell
  script in a container with a copy of the user's project mounted
  read-write and network access.

  1. **A share link never loads on its own.** A `#ir=` fragment MUST be
     decoded and validated but NOT loaded into the editor. The editor MUST
     first render every `run` string the document contains — the actual
     text, not a count — and load only on an explicit action. The fragment
     is stripped from the URL either way. A link is the least deliberate of
     the three paths: it can be sent to someone and opened without any act
     of importing.
  2. **The first run of a non-detected pipeline is confirmed.** Before the
     first `POST /api/execute` for an `imported` or `shared` document, the
     editor MUST list every command and require an explicit acknowledgement.
     Once acknowledged, that document stays acknowledged; loading a
     different document MUST reset the acknowledgement.
  3. **Disabled stages are listed too.** The review shows the whole
     document, marking which commands are outside the effective chain. A
     disabled stage is one click from running.
  4. **Provenance is visible.** A non-detected document MUST be labelled as
     such wherever the pipeline is identified, and the run affordance MUST
     say a review is outstanding.

### UI non-functional requirements

- **EDITOR-UI-NFR-001 — Library-agnostic rendering.** The spec
  does NOT mandate React Flow or any other library. Any rendering
  that satisfies the FRs above is acceptable; the v1 linear chain
  can be rendered with vanilla React + CSS.
- **EDITOR-UI-NFR-002 — No splice re-implementation.** Toggling
  state MUST trigger a fresh `computeEffectiveChain` call; the
  editor does not cache spliced results in a way that would
  diverge from the shared algorithm.
- **EDITOR-UI-NFR-003 — Validation on export.** Before producing an
  export (JSON or YAML), the editor SHOULD run `validate(ir)` and
  surface any errors. Toggling `enabled` cannot make an IR
  invalid (it's a boolean flip), so this is defense-in-depth
  against future v0.2 edits.

## Cross-spec dependencies

- **IR module.** Both API and UI import `PipelineIR`, `validate`,
  `serializeCanonical`, `canonicalEquals`, and
  `computeEffectiveChain` from `@modules/ir`. The two contracts
  share the same `PipelineIR` symbol, which is how this single spec
  prevents drift.
- **Detector module.** The API controller imports `Detector` and
  `ALL_RULES` from `@modules/detector` and calls
  `new Detector({ rules: ALL_RULES }).detect(rootPath)`. No
  detector internals are re-implemented.
- **Dockerfile Generator.** v1 of the editor calls
  `@modules/dockerfile-generator`'s `generate(ir)` from the
  `POST /api/generate` controller. The endpoint is read-only — no
  server-side disk writes; the strings are returned to the client.
  The controller MUST NOT re-implement template logic, splicing, or
  any of the [DOCKER edge-case branches](./dockerfile-generator.spec.md#edge-cases).
  Generator-thrown errors map per the
  [Generate error mapping](#generate-error-mapping-normative) table.
- **ADR-0008.** The security model is reified here as
  EDITOR-API-FR-004/005 and tested in EDITOR-AC-001…007.

## Edge cases

- **Empty `projectPath`.** Rejected — `400 INVALID_PROJECT_PATH`.
- **Contained absolute `projectPath`.** Accepted. In Docker, a path below
  `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` maps to the matching location under the
  `/workspace` mount. An outside absolute path is rejected with 403.
- **`projectPath` is `.` or `./`.** Resolves to the workspace root
  itself; **explicitly permitted** by [EDITOR-API-FR-005](#api-functional-requirements)
  and the [Security model](#security-model) rule 3. If the workspace
  root does not contain a manifest the call returns
  `422 NO_MANIFEST` from the detector — but the path check itself
  is satisfied.
- **`projectPath` resolves to the workspace root via a symlink chain.**
  Same outcome as above: the realpath equals `wsRoot`, so the
  containment check passes (the `realCandidate === wsRoot` disjunct).
- **Symlink at the boundary.** If
  `<workspace>/<projectPath>` IS a symlink whose realpath escapes
  the workspace, the realpath check rejects it
  (`403 PATH_OUTSIDE_WORKSPACE`). A symlink that resolves to
  another path *inside* the workspace is permitted. The check
  examines `realpath(candidate)`, so a symlink created mid-path
  between request time and check time cannot escape — see
  EDITOR-API-FR-005.
- **Detector returns `stages: []`.** Editor renders an empty chain
  area. If the IR's `unresolved` contains
  `/project/packageManager/name` (the PM-null case,
  [DET-FR-018(a)](./detector-engine.spec.md)), that prompt is
  rendered with visual prominence per EDITOR-UI-FR-014; the user
  sees, in one glance, *why* the pipeline is empty. Other
  `unresolved` prompts render normally.
- **Detector returns warnings only (no IR change).** `warnings`
  area populates; chain renders normally.
- **User toggles every Stage off.** Effective chain is empty;
  editor renders all Stages greyed with no active connectors.
  The exported Working IR still contains all Stages with their
  original `dependsOn`. **Calling `POST /api/generate` on this
  Working IR returns 200** with a single-stage Dockerfile carrying
  [header variant 1 ("disabled")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage)
  — see [Empty effective chain — generate behavior](#empty-effective-chain--generate-behavior-settled).
- **`POST /api/generate` on a `stages: []` IR with PM resolved.**
  **v1-unreachable from detect()+editor combined** (see [empty-chain
  table row 5](#empty-effective-chain--generate-behavior-settled)
  and the [Trust boundary](#trust-boundary--what-apigenerate-accepts)
  section): the detector never emits `stages: []` with PM resolved
  per DET-FR-018(a), the editor's toggle-only surface cannot delete
  Stages, and v1 has no in-UI PM resolution (deferred — OQ-EDITOR-003).
  The endpoint's behavior is nonetheless defined for
  forward-compatibility (v0.2 import / in-UI resolution): returns
  200 with a single-stage Dockerfile carrying
  [header variant 3 ("not declared")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage).
  No `NOTHING_TO_GENERATE` error.
- **`POST /api/generate` on an IR with `packageManager.name === null`
  (PM still unresolved).** The generator throws; the controller
  maps it to `422 UNRESOLVED_REQUIRED_FIELD` with the field path in
  `detail`. The UI surfaces this so the user knows which
  `unresolved` entry blocks generation.
- **`InvalidProducedIRError`.** This SHOULD be unreachable in
  production (the detector validates internally), but if it
  happens the API returns 500 `INTERNAL_IR_DEFECT`. The UI shows
  a generic "internal error" notice with a link to the server
  log.

## Acceptance criteria

Each AC maps to a planned test. The API ACs are backend Jest tests
(NestJS supertest); the UI ACs are frontend component tests (React
Testing Library + Vitest). See
[Testing approach](#testing-approach) for the split.

| ID | Criterion | Planned test |
|---|---|---|
| **EDITOR-AC-001** | Backend started without `PIPE_EDITOR_WORKSPACE_ROOT` (or with an invalid value) refuses to listen and exits with a clear startup error. | T-EDITOR-001 |
| **EDITOR-AC-002** | `POST /api/detect` with `projectPath: "test/fixtures/node-pnpm-nest-basic"` (relative; workspace root = repo root) returns 200 with `{ ir, warnings: [] }` and the IR matches the regression-lock fixture modulo `rootPath` + `generatedAt`. | T-EDITOR-002 |
| **EDITOR-AC-003** | An absolute `projectPath` inside the configured display root is accepted; an outside absolute path (e.g. `"/etc"`) returns 403 `PATH_OUTSIDE_WORKSPACE`. | T-EDITOR-003 |
| **EDITOR-AC-004** | `projectPath` containing `..` segments that resolve outside the workspace (e.g. `"../../../etc"`) returns 403 `PATH_OUTSIDE_WORKSPACE`. | T-EDITOR-004 |
| **EDITOR-AC-005** | `projectPath` containing a NUL byte returns 400 `INVALID_PROJECT_PATH`. | T-EDITOR-005 |
| **EDITOR-AC-006** | A symlink inside the workspace whose realpath is outside the workspace is rejected with 403 `PATH_OUTSIDE_WORKSPACE`. | T-EDITOR-006 |
| **EDITOR-AC-007** | Backend binds `127.0.0.1` only — a connection attempt to the same port via the host's external IP fails to connect (or the listener is verifiable from inside the process to be bound to loopback). | T-EDITOR-007 |
| **EDITOR-AC-008** | `projectPath` pointing at an existing directory with no manifest returns 422 `NO_MANIFEST`. | T-EDITOR-008 |
| **EDITOR-AC-009** | `projectPath` pointing at a directory with a malformed `package.json` returns 422 `MALFORMED_PACKAGE_JSON` and the parser diagnostic appears in `detail`. | T-EDITOR-009 |
| **EDITOR-AC-010** | `projectPath` with malformed `tsconfig.json` (valid `package.json`) returns 200 and the warning appears verbatim in the response `warnings` array. | T-EDITOR-010 |
| **EDITOR-AC-011** | Two consecutive successful detect requests against unchanged filesystem produce IRs equal modulo `metadata.generatedAt`. | T-EDITOR-011 |
| **EDITOR-AC-012** | The Editor's initial render shows the project folder field plus "Edit one app", "Scan all services", and "Browse folders" actions; no chain is rendered. | T-EDITOR-012 |
| **EDITOR-AC-013** | After a successful Detect, every Stage in the IR is present in the DOM, regardless of `enabled`. | T-EDITOR-013 |
| **EDITOR-AC-014** | Toggling a Stage's enabled control flips `enabled` in the Working IR (producing a new Working IR; Loaded IR untouched) and re-renders. Disabled Stages carry the CSS class `stage-node--disabled`. | T-EDITOR-014 |
| **EDITOR-AC-015** | The rendered chain reflects `computeEffectiveChain(workingIR)`. **In v1 this is asserted at two layers** (per EDITOR-UI-FR-006): (a) the connectors flanking a disabled Stage carry `chain-connector--inactive` (already exercised behaviorally in EDITOR-AC-021), AND (b) the **effective-chain caption** (EDITOR-UI-FR-016) lists the effective-chain Stage IDs in spliced order — so disabling `lint` MUST make the caption show `install → test → build → docker-build` (lint absent, install adjacent to test). The "test's effective predecessor visually becomes install" claim from IR-AC-015 is satisfied **positively** by the caption text; the broken-connector styling is the visual reinforcement. A drawn bypass connector that physically re-routes the line around disabled Stages is deferred to v0.2 — see [OQ-EDITOR-005](#open-questions). | T-EDITOR-015 |
| **EDITOR-AC-016** | Re-enabling a previously disabled Stage restores it to the effective chain (verified by re-querying `computeEffectiveChain` after the toggle). | T-EDITOR-016 |
| **EDITOR-AC-017** | Every entry in `workingIR.unresolved` is rendered as a prompt with both `field` and `message` visible. (Note: `unresolved` is not changed by *toggle* interactions, so `loadedIR.unresolved` and `workingIR.unresolved` stay byte-equal under toggling. In-UI resolution — deferred as EDITOR-OQ-003 when this criterion was written — now exists and does change `workingIR.unresolved`; see EDITOR-UI-FR-018 and EDITOR-AC-037…039.) | T-EDITOR-017 |
| **EDITOR-AC-018** | Warnings from the API response are rendered as a non-blocking notice. | T-EDITOR-018 |
| **EDITOR-AC-019** | "Export JSON" produces a string identical to `serializeCanonical(workingIR)`, where `workingIR` reflects all toggle changes since the last "Detect". Specifically: load fixture → toggle `lint.enabled = false` → "Export JSON" → assert the exported string equals `serializeCanonical(workingIR)` AND differs from `serializeCanonical(loadedIR)` at exactly the `lint.enabled` byte region. | T-EDITOR-019 |
| **EDITOR-AC-020** | "Export YAML" produces a string whose `yaml.load()` parses back to a `canonicalEquals`-equal IR (round-trip against the Working IR, not the Loaded IR). | T-EDITOR-020 |
| **EDITOR-AC-021** | The Editor's effective chain rendering reflects `computeEffectiveChain` on the Working IR exactly. Together with EDITOR-AC-015/016, this confirms no editor-side splice re-implementation. | T-EDITOR-021 |
| **EDITOR-AC-022** | The Editor exposes no UI control for editing `steps[].run`, adding a Stage, deleting a Stage, or reordering Stages (negative test by absence: queries for these affordances return no DOM elements). | T-EDITOR-022 |
| **EDITOR-AC-023** | An empty `stages: []` IR with an `unresolved` entry at `/project/packageManager/name` (PM-null fixture) renders an empty chain area, AND the PM-name prompt is rendered with visual emphasis (a stable DOM hook the test can key off, e.g. CSS class `unresolved-prompt--primary` on the PM-name prompt only). All other `unresolved` entries are still rendered (per EDITOR-AC-017) but do NOT carry the emphasis hook. | T-EDITOR-023 |
| **EDITOR-AC-024** | The Editor MUST NOT mutate any Stage field other than `enabled` in response to a toggle, AND MUST NOT mutate the Loaded IR at all. (Behavioral: snapshot `loadedIR` pre-toggle via `serializeCanonical`, toggle, snapshot `loadedIR` post-toggle via `serializeCanonical`, assert byte-equal. Toggling produces a NEW Working IR whose `serializeCanonical` differs from the Loaded IR's at exactly the toggled Stage's `enabled` field.) | T-EDITOR-024 |
| **EDITOR-AC-025** | `projectPath` resolving to the workspace root itself (e.g. `"."` or `"./"` when `wsRoot` IS a project directory) is ALLOWED by the containment check: `realCandidate === wsRoot` returns 200 (with the IR, or with `422 NO_MANIFEST` if the workspace root has no manifest). It MUST NOT be rejected with 403. | T-EDITOR-025 |
| **EDITOR-AC-026** | `POST /api/generate` with a known-good IR (the `node-pnpm-nest-basic` IR) returns 200 with `{ dockerfile, dockerignore }` strings byte-equal to the [DOCKER-AC-001](./dockerfile-generator.spec.md#acceptance-criteria) goldens. | T-EDITOR-026 |
| **EDITOR-AC-027** | `POST /api/generate` with body `{ ir: { …, project: { packageManager: { name: null, … }, … } } }` (PM-name unresolved) returns `422 UNRESOLVED_REQUIRED_FIELD` and `detail` cites `/project/packageManager/name`. | T-EDITOR-027 |
| **EDITOR-AC-028** | `POST /api/generate` with a **synthetic** `stages: []` IR (PM resolved) — v1-unreachable from detect()+editor but constructed in-test for forward-compatibility — returns 200 with a single-stage Dockerfile carrying [header variant 3 ("not declared")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage). NO `NOTHING_TO_GENERATE` error is emitted. The test fixture is a hand-built IR; the test asserts that the endpoint's contract holds regardless of whether the IR is reachable through v1 production paths. | T-EDITOR-028 |
| **EDITOR-AC-029** | `POST /api/generate` with an IR where all Stages have `enabled: false` returns 200 with a single-stage Dockerfile carrying [header variant 1 ("disabled")](./dockerfile-generator.spec.md#design-decision-5--disabled-empty-or-absent-build-stage). | T-EDITOR-029 |
| **EDITOR-AC-030** | `POST /api/generate` is read-only: a call MUST NOT create any file on the server's filesystem. (Behavioral: snapshot the workspace root + `os.tmpdir()` directory listing before and after a generate call; assert equality.) | T-EDITOR-030 |
| **EDITOR-AC-031** | `POST /api/generate` with a body that is missing `ir`, has `ir: null`, or has an `ir` that fails `validate()` returns `400 INVALID_IR`; `detail` carries the validator diagnostics. | T-EDITOR-031 |
| **EDITOR-AC-032** | `POST /api/generate` with `project.runtime.name === "python"` returns `422 UNSUPPORTED_RUNTIME`; `detail` cites `/project/runtime/name` and the v1 supported set `{ "node" }`. | T-EDITOR-032 |
| **EDITOR-AC-033** | Detect-vs-generate split on the same PM-null IR: against a PM-null fixture, `POST /api/detect` returns `200 OK` with the IR (including the `/project/packageManager/name` `unresolved` entry); a subsequent `POST /api/generate` with the IR from the prior response returns `422 UNRESOLVED_REQUIRED_FIELD`. The two responses are intentionally asymmetric: detect reports, generate refuses. | T-EDITOR-033 |
| **EDITOR-AC-034** | `POST /api/generate` validates every incoming IR via `validate(ir)` before invoking the generator: an IR with structural defects (e.g. duplicate Stage `id`, dangling `dependsOn`) returns `400 INVALID_IR` even if the IR superficially looks like one a prior detect() could have produced. The controller MUST NOT skip validation on the basis of any header, cookie, or session signal claiming the IR is "trusted." | T-EDITOR-034 |
| **EDITOR-AC-035** | **Effective-chain caption tracks the splice.** After a successful Detect on the canonical fixture, the caption (queryable via `data-testid="effective-chain-caption"`) MUST contain the string `install → lint → test → build → docker-build` (separator and exact order). Toggling `lint.enabled` to `false` MUST update the caption to `install → test → build → docker-build` — lint is absent AND `install` is immediately followed by `test` in the rendered text. Toggling lint back on MUST restore the original text. The caption MUST derive from the same `computeEffectiveChain(workingIR)` call site the connectors use (single read, two consumers — EDITOR-UI-FR-016). | T-EDITOR-035 |
| **EDITOR-AC-036** | **The editor's runnability gate equals the backend's.** For an IR whose only null required field is one of the three the editor historically ignored (`/project/packageManager/version`, `/project/runtime/name`, `/project/language`), the editor's gate MUST report that field as blocking — i.e. `hasUnresolvedRequiredField(ir)` returns the same field `findUnrunnableReason(ir)` names, for each of the five required-nullable fields, in the same probe order. Generate and Run MUST be disabled in that state. | T-EDITOR-036 |
| **EDITOR-AC-037** | **An unresolved required field can be resolved in the UI.** For an IR whose only unresolved entry is `/project/runtime/version`, the editor renders a control labelled "Node version"; entering `20` and committing MUST (a) remove that prompt, (b) show `node 20` in the project badges, and (c) clear the Generate/Run gate hint. For an IR whose only unresolved entry is `/project/packageManager/name`, the editor renders a `<select>` labelled "Package manager" offering exactly `npm`, `pnpm`, `yarn`; choosing one commits it and removes the prompt. A full semver (`v20.11.0`) commits as the major (`20`). | T-EDITOR-037 |
| **EDITOR-AC-038** | **A value that does not normalize is refused, not written.** Committing `lts/hydrogen` into `/project/runtime/version` MUST leave the IR unchanged: the prompt stays, the gate stays on, and an element with `role="alert"` names the rejected input. | T-EDITOR-038 |
| **EDITOR-AC-039** | **Resolution is undoable.** After resolving a field, Undo MUST restore the unresolved state — the prompt returns and the Generate/Run gate is on again — confirming resolution went through the same history as every other edit. | T-EDITOR-039 |
| **EDITOR-AC-040** | **A share link is reviewed, not loaded.** Mounting with a `#ir=` fragment MUST render a review (`data-testid="share-link-review"`) containing the verbatim text of every `run` in the document, and MUST NOT render the stage chain. The URL fragment is cleared regardless. Choosing to load renders the chain and labels the document as imported; discarding leaves the editor empty. A fragment that does not decode to a `validate()`-clean IR renders an error and no review. | T-SEC-010 |
| **EDITOR-AC-041** | **The first run of a non-detected pipeline is confirmed.** For an `imported` or `shared` document, activating Run MUST render a confirmation listing every command instead of issuing `POST /api/execute`; the request is issued only after the acknowledgement. A `detected` document MUST NOT show the step. Loading a different document resets the acknowledgement. | T-SEC-011 |
| **EDITOR-AC-042** | **Provenance is visible.** A document loaded from a link or a file carries a visible "imported from …" label; a detected one carries none. | T-SEC-012 |

## Testing approach

Per the [Test Strategy](../testing/test-strategy.md), every AC maps
to at least one test. For the Editor the tests split into three
test families:

- **Backend integration tests** (Jest + NestJS supertest).
  EDITOR-AC-002…011, EDITOR-AC-025 (root-itself path),
  EDITOR-AC-026…032 (the `/api/generate` route family),
  EDITOR-AC-033 (detect→generate split), and EDITOR-AC-034
  (mandatory validate on every generate). These spin up the NestJS
  app with a known `PIPE_EDITOR_WORKSPACE_ROOT` (`test/fixtures/`)
  and exercise the HTTP routes. EDITOR-AC-028 uses a hand-built
  synthetic IR (not the output of any detect() call) to exercise
  the v1-unreachable but contract-defined `stages: []`-with-PM-
  resolved branch.
- **Backend startup tests** (Jest). EDITOR-AC-001 + EDITOR-AC-007.
  These test the `PIPE_EDITOR_WORKSPACE_ROOT` refusal and the
  `127.0.0.1` binding (the latter by inspecting the listener address
  rather than attempting an LAN connection from the test process).
- **Frontend component tests** (Vitest + React Testing Library).
  EDITOR-AC-012…024. These render the Editor component with a
  pre-loaded IR (no HTTP call); the API is mocked at the fetch
  boundary for the Detect-flow and Generate-flow tests.

What is **explicitly NOT testable automatically** and falls to
manual / visual QA:

- Specific colors, font choices, spacing of the Stage nodes.
- Whether the "greyed" treatment is *aesthetically* clear enough
  for a sighted user (the stable CSS class `stage-node--disabled`
  is the testable handle; the visual treatment is implementation
  choice).
- Connector line styling.
- Animation polish.

This split is deliberate: the contract is what we test, the visual
craft is what we judge by eye.

## Open questions

- **OQ-EDITOR-001.** ~~Should the Editor offer a folder picker?~~ **Settled
  2026-09-12.** The app uses its own backend-contained browser so it works in
  every supported browser and keeps server-side validation. Single-click
  selects; double-click or "Open" navigates; confirmation chooses the folder.
  Folder drag-and-drop is also supported. When browser privacy hides the host
  path, the backend resolves a unique directory name within the contained
  workspace and asks the user to browse when the name is ambiguous.
- **OQ-EDITOR-002.** ~~Should the Editor add a `POST /api/generate`
  endpoint and an in-UI "Download Dockerfile" button?~~ **Settled
  2026-06-21 in favor of v1.** See
  [Decision F](#decision-f--inline-generate-endpoint-for-the-demo-loop)
  and EDITOR-API-FR-011…017. A symmetric `POST /api/generate-gha`
  remains deferred until the GHA Generator spec is Accepted.
- **OQ-EDITOR-003.** Should the Editor allow the user to **resolve**
  unresolved entries in-UI (write back into `/project/*` and clear
  the `unresolved`)? Natural next step once the generators surface
  errors for missing PM etc. Deferred.
- **OQ-EDITOR-004.** Should the Editor persist its in-memory edited
  IR across reloads (e.g. into `localStorage`)? Useful, deferred.
- **OQ-EDITOR-005.** Should the Editor draw a **bypass connector**
  that physically routes the live chain around disabled Stages —
  i.e. when `lint` is disabled, a literal line goes from
  `install`'s bottom edge to `test`'s top edge, skipping the
  greyed `lint` card geometrically? v1 conveys the splice via two
  layers (inactive-connector styling on the connectors flanking
  the disabled Stage + the EDITOR-UI-FR-016 text caption), which
  satisfies EDITOR-AC-015 positively but does not give a literal
  bypass line. A bypass line would be visually unambiguous at the
  cost of layout-engine work (the chain is currently a vertical
  flexbox; a bypass requires absolute positioning or SVG). Rationale
  for deferring: the caption removes the ambiguity in text without
  the layout cost; the bypass line is a UX polish item worth
  doing once the rest of the v1 surface is stable. Recorded as a
  v0.2 candidate.

## Known limitations

- **EDITOR-LIMIT-001.** v1 is request/response only — no live
  re-detect on filesystem changes. A user editing source files
  between detects must click "Detect" again.
- **EDITOR-LIMIT-002.** The closed editable surface (toggle +
  unresolved-display) means a user with a slightly wrong detected
  IR cannot fix it in-UI. They must export, edit the JSON/YAML by
  hand, and re-import (or run the generator on the exported file
  directly).

## Changelog

| Date | Change |
|---|---|
| 2026-09-12 | Added responsive project opening, contained folder browsing, folder drag-and-drop, clear single-app vs multi-service actions, and safe contained absolute paths including Docker host-path mapping. |
| 2026-06-15 | Initial draft. Settles five design decisions: (A) security via workspace-root containment + realpath + localhost binding (new ADR-0008), (B) server-filesystem detect with explicit non-goal note for client upload, (C) `{ ir, warnings }` shape lives in the controller for v1 (resolves OQ-DET-002), (D) closed editable surface in v1 (toggle + unresolved prompts only), (E) disabled Stages stay visible with stable `stage-node--disabled` class and effective chain rendered via `computeEffectiveChain`. FRs split into EDITOR-API-FR-001…010 + EDITOR-API-NFR-001…004 (backend) and EDITOR-UI-FR-001…013 + EDITOR-UI-NFR-001…003 (frontend). 24 acceptance criteria mapped to T-EDITOR-001…024 across backend integration tests, backend startup tests, and frontend component tests. Library-agnostic rendering (no React Flow mandate). |
| 2026-06-21 | Pre-Accepted revisions (still Draft) from review callouts: (1) **Decision F added** — `POST /api/generate` is in v1 (resolves OQ-EDITOR-002 in favor of inclusion); new EDITOR-API-FR-011…017 + EDITOR-AC-026…032; controller wraps `@modules/dockerfile-generator`'s `generate(ir)`; read-only (no server-side disk writes). Empty-chain generate behavior settled: `stages: []` with PM resolved → 200 single-stage "not declared"; all-disabled → 200 single-stage "disabled"; PM-null → 422 `UNRESOLVED_REQUIRED_FIELD`; no `NOTHING_TO_GENERATE`. (2) **Post-resolution realpath check made explicit** in EDITOR-API-FR-005 and the Security model: the containment check operates on `realpath(path.resolve(wsRoot, projectPath))`, not on the pre-realpath candidate. (3) **Root-itself path locked** as ALLOWED — new EDITOR-AC-025 nails the `realCandidate === wsRoot` branch. (4) **Loaded IR vs Working IR distinction** introduced. Toggling is non-destructive (a new Working IR is produced; Loaded IR is never mutated). EDITOR-UI-FR-002/003/004/006/007/009/010/012 reworded to reference the Working IR. EDITOR-AC-019 reworded: export = `serializeCanonical(workingIR)`. EDITOR-AC-024 strengthened: behavioral assertion that the Loaded IR is byte-equal pre- and post-toggle. (5) **PM-null prompt emphasis** when chain is empty — new EDITOR-UI-FR-014 and reworded EDITOR-AC-023 (stable hook `unresolved-prompt--primary` on the PM-name entry only). Total ACs: 32 (was 24). |
| 2026-06-21 | Second-pass review fixes (still Draft). (a) **Trust boundary made explicit** for `/api/generate`: a new section names `validate(ir)` as the mandatory gate for every client-supplied IR; the endpoint trusts schema validity, not provenance. EDITOR-API-FR-012 strengthened accordingly; new EDITOR-AC-034 locks the behavior. (b) **Empty-chain table reworked** into an enumerative table with a Reachability column. Row 5 (`stages: []` with PM resolved) is marked **v1-unreachable from detect+editor** (detector emits `stages: []` only in PM-null per DET-FR-018(a); editor's toggle-only surface cannot delete Stages; v1 has no in-UI PM resolution); the row remains in the contract for forward-compatibility with v0.2 import / in-UI resolution. EDITOR-AC-028 updated to clarify the test uses a synthetic hand-built IR. (c) **Detect-vs-generate intentional split** documented: detect reports the uncertain state at 200; generate refuses at 422. New EDITOR-AC-033 nails the split. (d) **Outstanding cross-spec gap identified**: DOCKER-AC-002 / DOCKER-AC-011 cover "only `build` disabled" but not "all Stages disabled". Proposed DOCKER-AC-013 wording given inline; flagged as a DOCKER-spec edit pending the user's confirmation (not auto-applied because DOCKER is Accepted and changes go through its own changelog). Total ACs: 34 (was 32). |
| 2026-06-21 | **Accepted** 2026-06-21 after review. Implementation MAY begin. ADR-0008 promoted to Accepted on the same day. The DOCKER-AC-013 amendment (all-disabled effective chain, surfaced by this spec's empty-chain analysis) is filed in `dockerfile-generator.spec.md`'s changelog; DOCKER stays Accepted (amendment is additive). |
| 2026-06-22 | Amendment (stays Accepted): EDITOR-AC-015's "test's effective predecessor visually becomes install" was satisfied only under a **loose reading** by the prior implementation — the inactive-connector styling encoded the splice but did not assert it positively (a naïve viewer could still read a line threading through the disabled Stage). Triage during the toggle-effect bug found this gap. Resolution: (a) new **EDITOR-UI-FR-016** mandates an explicit text caption listing the effective-chain Stage IDs in order, derived from the same `computeEffectiveChain(workingIR)` call the connectors use (one read, two consumers). (b) EDITOR-UI-FR-006 reworded to spell out the two-layer v1 signal (inactive connectors + caption). (c) EDITOR-AC-015 reworded to assert the splice POSITIVELY via the caption text — disabling lint MUST make the caption show `install → test → …`. (d) New EDITOR-AC-035 locks the caption's behavior across toggle/un-toggle. (e) A literal bypass connector that physically re-routes the line around disabled Stages is **explicitly deferred** to v0.2, recorded as OQ-EDITOR-005 with the rationale (the caption removes ambiguity in text without the layout-engine cost; the bypass line is UX polish). Total ACs: 35 (was 34). Contract is not reversing — the v1 guarantee is now stated unambiguously where it had been loosely interpretable. |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **UX-02**: the editor's Generate/Run gate was a hand-written two-field check (`packageManager.name`, `runtime.version`) while the backend blocked on **five** fields, so an IR missing `/project/packageManager/version`, `/project/runtime/name` or `/project/language` showed enabled buttons that failed with a 422 naming a field the UI never mentioned. Resolution: (a) new **EDITOR-UI-FR-017** requires every runnability-dependent affordance to derive its answer from `findUnrunnableReason` imported from `@modules/ir`, and forbids a frontend-local copy of the required-nullable field list. (b) EDITOR-UI-FR-015's parenthetical, which had hard-coded the two-field formulation and was the origin of the drift, now defers to FR-017. (c) New EDITOR-AC-036 locks the equality across all five fields. Total ACs: 36 (was 35). |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **UX-01a** — the most severe finding in the report. The editor rendered `unresolved` entries as read-only text (EDITOR-UI-FR-007) and offered no way to set the fields they named. Combined with a detector that could only resolve the Node version from `engines.node`, an ordinary Node project detected into a pipeline whose Generate and Run actions were permanently disabled, with a prompt instructing the user to do something the interface did not permit; the only escapes were editing the target project's `package.json` or hand-editing an exported IR. Decision D's "closed editable surface" is hereby opened by exactly one affordance. New **EDITOR-UI-FR-018** specifies the in-place resolution control: a `<select>` for the three closed-value fields, a text input plus commit button for the two version fields, the commit routed through `resolveProjectField` so the value lands and the paired `unresolved` entry is dropped in a single new IR (never two edits, so null ⟺ unresolved never breaks mid-edit), rejection via the IR's own `normalizeProjectFieldValue` rather than a frontend copy, and resolution treated as an ordinary undoable edit. Stage images are explicitly NOT retagged on resolution — the Doctor reports the drift and the per-stage image control fixes it. EDITOR-AC-017's parenthetical, which recorded in-UI resolution as deferred (EDITOR-OQ-003), is updated to point at this amendment; OQ-EDITOR-003 is thereby resolved. New EDITOR-AC-037…039. Total ACs: 39 (was 36). Supporting IR change: `resolveProjectField` / `normalizeProjectFieldValue` / `majorFromVersionText` live in `@modules/ir` (IR-AC-026) so the detector and the editor share one rule. |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **SEC-02**. Three paths load an IR the user did not author — a `#ir=` share link, a dropped or imported file, and CI text — and after loading, one click on ▶ Run posted that document to `/api/execute`, which runs its steps in a container with a copy of the project mounted read-write and network access. `validate()` was the only gate, and it is a schema gate: it certifies shape, not intent. Nothing marked an imported pipeline as untrusted, and the Run button was exactly as prominent as for a detected one; a share link loaded on mount without the user seeing anything first. New **EDITOR-UI-FR-019** introduces provenance (`detected | imported | shared`) and the command-review gate: a share link is decoded, validated and held while every `run` string is displayed verbatim, loading only on an explicit act; the first execution of any non-detected document requires an acknowledgement listing every command, reset whenever a different document is loaded; disabled stages are listed too, marked as outside the effective chain, because a disabled stage is one click from running. New EDITOR-AC-040…042. The pre-existing test that asserted a share link "loads the pipeline on mount" is superseded — that behaviour was the finding. Total ACs: 42 (was 39). |
