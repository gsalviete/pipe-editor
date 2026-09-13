# Detector Engine Specification

| Field | Value |
|---|---|
| Component | `DET` |
| Status | Implemented |
| Last updated | 2026-06-15 |
| Linked ADRs | [ADR-0001](../adr/0001-native-container-execution.md), [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md), [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [ADR-0007](../adr/0007-linear-pipeline-topology-v1.md) |
| Linked specs | [`pipeline-ir.spec.md`](./pipeline-ir.spec.md) (Accepted), [`dockerfile-generator.spec.md`](./dockerfile-generator.spec.md) (Accepted) |
| Companion document | [`docs/rules/detection-rules.md`](../rules/detection-rules.md) — the DR-NNN registry (separate artifact) |

## Objective

Define the **Detector Engine** — the component that scans a Project (a local
folder), evaluates the registered Detection Rules against the enumerated
manifest set, and produces a validated Pipeline IR. The Engine is the IR's
only producer ([ADR-0003](../adr/0003-ir-as-single-source-of-truth.md));
every downstream component (Generators, Executor, Visual Editor) reads what
the Engine writes.

The Engine and the Detection Rules are **two separate artifacts** by
deliberate design:

- This spec defines the **engine**: how it scans, how it sequences rules,
  how it turns rule emissions into IR fields and Stages, how it enforces
  the manifest-only frontier, and how it implements the IR-FR-009 truth
  table executably.
- `docs/rules/detection-rules.md` defines the **rules** (DR-NNN): each
  rule's condition, target field, confidence, and on-uncertainty
  directive. Rules are data; the Engine is the interpreter.

This separation lets either evolve without disturbing the other and makes
each rule individually auditable and testable. This spec deliberately does
**not** define any DR-NNN; that follow-up arrives once this Engine spec is
Accepted.

## Scope

In scope:

- A pure function `detect(rootPath: string): PipelineIR`.
- The **rule contract**: the shape every Detection Rule must conform to,
  so the Engine can evaluate it without knowing its specifics.
- The **emission semantics**: how `(confidence, on-uncertainty)` becomes
  a committed value, an `unresolved` entry, or nothing — the executable
  form of [IR-FR-009](./pipeline-ir.spec.md#functional-requirements).
- The **manifest-set hard frontier** ([ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md))
  — enforced at the engine level, not left to rule discipline.
- The **stage emission policy** — which canonical Stages may be emitted
  and how each Stage's absence vs. uncertainty is handled.
- The build/lint/test command derivation, as a Rule responsibility tied
  to the Dockerfile Generator's verbatim consumption
  ([DOCKER-FR-007](./dockerfile-generator.spec.md#functional-requirements)).

Out of scope:

- The DR-NNN rule catalogue itself — that is `detection-rules.md`.
- Any runtime other than `node` (per IR + Dockerfile spec scopes).
- Monorepo / workspace traversal (per [IR-AC-014](./pipeline-ir.spec.md#acceptance-criteria)
  and the IR spec's Workspaces / monorepos non-goal).
- Source-code parsing — explicitly forbidden by ADR-0005.
- Rule discovery from a network registry; in v1 the rule set is
  statically registered in the engine.
- Per-run caching (mtime tracking, memoization across calls) —
  [OQ-DET-001](#open-questions).

## Local definitions

Terms from the [Domain Glossary](../product/03-domain-glossary.md),
[Pipeline IR Spec](./pipeline-ir.spec.md), and
[Dockerfile Generator Spec](./dockerfile-generator.spec.md) carry their
established meanings.

Additional terms used in this spec:

- **Project root** — the local-folder path passed to `detect()`. Equal to
  the IR's `project.rootPath`.
- **Manifest** — one of the enumerated files the Engine is allowed to
  read (see the [Manifest set](#manifest-set-hard-frontier-decision-3)).
- **Detection Rule (DR-NNN)** — a unit of detection logic. Has an ID, a
  list of manifests it reads, and one or more **cases**.
- **Case** — a single declarative tuple `(condition, emission,
  confidence, on-uncertainty[, default | message])`. A rule is a list of
  cases evaluated in declared order; the first matching case wins.
- **Emission** — what a matched case produces:
  - **FieldEmission** — set an IR field at a JSON-Pointer path (e.g.
    `/project/language = "typescript"`).
  - **StageEmission** — append a Stage to `/stages` with all of its
    constituent fields (id, name, enabled, dependsOn, container, steps).
- **Engine run** — one invocation of `detect(rootPath)`. Reads manifests,
  evaluates all rules, composes the IR, validates it, and returns it.

## Settled boundary decisions

| # | Decision | Settled value |
|---|---|---|
| 1 | Confidence source | **Statically declared per rule case.** Each case carries a fixed `confidence: high | medium | low` and a fixed `on-uncertainty` directive. The Engine never computes confidence from observations; rules wanting "weaker signal → lower confidence" express that by ordering multiple cases. |
| 2 | IR-FR-009 ownership | **The Engine is the executable home of the IR-FR-009 truth table.** Every case's `(confidence, on-uncertainty)` pair is mapped to exactly one emission outcome — committed value, nothing, or `unresolved` entry — by a single Engine function `emitOutcome(case): Outcome`. This is what unblocks T-IR-013; the IR validator deliberately tested the document invariants but not this mapping. |
| 3 | Manifest set | **Frozen, enumerated set:** `package.json`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `nest-cli.json`, `tsconfig.json`. Reading anything outside this set is invalid; the Engine refuses to register a rule whose declared `reads` includes a non-manifest path. (Note: a pre-existing `Dockerfile` is NOT in the v1 set — see [Decision 3 rationale](#decision-3--manifest-set-hard-frontier).) |
| 4 | Build command derivation | **Rule-driven, not engine-driven.** The rule that emits the `build` Stage names the command verbatim (e.g. `pnpm build`, `npm run build`, `yarn build`) — derived from `scripts.build` in `package.json` and the detected package manager. The Engine emits the rule's chosen string into `steps[0].run` without reinterpretation, which is exactly what [`DOCKER-FR-007`](./dockerfile-generator.spec.md#functional-requirements) consumes verbatim. |
| 5 | Stage emission policy | **A closed set of canonical Stage IDs in v1**, each governed by its own DR-NNN rule: `install`, `lint`, `test`, `build`, `docker-build`. Absence of a Stage signals "the project doesn't declare one" — NOT uncertainty. Uncertainty about a *required field* (language, runtime, packageManager) is what produces `unresolved`; Stages are optional and follow `omit` cleanly. New canonical Stage IDs require a new spec revision. |

### Decision 1 — Confidence source

A rule is **declarative data**: a list of cases, each fully described at
authoring time. The Engine never inspects a rule's body beyond the case
table.

```
rule := { id, reads, cases: [case₁, case₂, …] }
case := { condition, emission, confidence, on-uncertainty[, default, message] }
```

**Why static.** Three reasons:

1. **Auditability.** Every (case, confidence, directive) triple is visible
   in `detection-rules.md` without running the engine. A future reviewer
   can read the rule and predict the IR shape; that is the SDD promise.
2. **Testability.** Each case is a unit; the engine's behavior on it is a
   pure function of its declared fields. T-DET-NNN tests cover the four
   rows of IR-FR-009 by handing the engine synthetic cases (cf. Decision 2).
3. **No hidden coupling.** Computed confidence couples a rule's body to
   its threshold; a downstream change in observations silently changes
   the IR. Static per case keeps the coupling explicit — to downgrade for
   a weaker signal, the author writes a second case in order.

**The "ordered cases" affordance.** A rule that wants
"high if lockfile present, medium otherwise" expresses it as:

```
case₁: { condition: hasLockfile,  emission: pm=detected, confidence: high,   on-uncertainty: omit }
case₂: { condition: hasManifest,  emission: pm=default,  confidence: medium, on-uncertainty: assume-default, default: "npm" }
```

The first matching case wins. This keeps confidence static *per case*
while letting a rule still degrade gracefully.

### Decision 2 — IR-FR-009 ownership

The Engine implements the truth table from
[IR-FR-009](./pipeline-ir.spec.md#functional-requirements) as a single
pure function:

```
emitOutcome(case) : Outcome where
  Outcome ::= Committed(value)
            | Unresolved(field, message)
            | Nothing

  case.confidence === 'high'                                 → Committed(case.emission.value)
  case.confidence ∈ {medium, low}, on-uncertainty = omit               → Nothing
  case.confidence ∈ {medium, low}, on-uncertainty = assume-default     → Committed(case.default)
  case.confidence ∈ {medium, low}, on-uncertainty = needs-user-input   → Unresolved(case.emission.target, case.message)
```

With one **required-field collapse** (per the IR spec's [Required-field
uncertainty resolution](./pipeline-ir.spec.md#required-field-uncertainty-resolution)):

```
  if case.emission targets a required nullable field
     and the Outcome above would be Nothing,
     then the Engine MUST produce Unresolved(field, message) instead,
     where message := case.message if defined and non-empty,
                      else synthesize: "Could not determine value for {field}; please specify."
```

**Synthesized message.** The collapse never emits an empty
`unresolved[].message`. If the case provided a non-empty `message`,
the Engine uses it; otherwise the Engine substitutes the synthesized
form above, using the JSON-Pointer `field` path interpolated as-is
(e.g. *"Could not determine value for /project/runtime/version; please
specify."*). The Visual Editor renders `unresolved[].message`
verbatim, so an empty message would surface to the user as a blank
prompt — the synthesized default is the floor.

The same message synthesis applies to a case whose
`onUncertainty: 'needs-user-input'` directive triggers normally
(non-required-field path) but with no `message` set. The Engine
synthesizes the same form rather than emitting `""`.

### Confidence flattening: `low` ≡ `medium` in v1

The truth table groups `{ medium, low }` because v1 has no rule that
wants `low` to be treated differently from `medium`. The
[Domain Glossary](../product/03-domain-glossary.md#status-and-confidence-vocabulary)
declares the three-value vocabulary; v1 of this Engine flattens `low`
into `medium` for emission purposes (same Outcome for the same
`on-uncertainty` directive). Rules MAY still declare `confidence: low`
for documentation purposes — readers of `detection-rules.md` get a
finer-grained signal of the rule's self-assessed weakness — but the
Engine treats them identically.

**Forward note.** If a future v2 introduces rules that need a third
semantic tier (e.g. *"`low` always emits `needs-user-input` regardless
of the directive"*), it is a non-breaking refinement of `emitOutcome`:
existing rules behave unchanged because none currently distinguish
`low` from `medium`.

`omit` is illegal for non-required fields' Stage emissions in v1 only in
the sense that "Stage absence" is itself the `omit` semantics — the
Engine simply does not append a Stage that has no matched case.

**Why this lives here, not in the IR module.** IR's `validate(ir)` checks
document-level invariants (was the value committed? does an unresolved
entry exist?). Whether a rule's `(confidence, directive)` pair produces
the right *kind* of emission is a producer concern. Without an Engine, no
producer exists to test the table executably; T-IR-013 was left as `.todo`
for exactly this reason. The Engine spec adopts it (DET-AC-003).

### Decision 3 — Manifest set (hard frontier)

The v1 enumerated manifest set is exactly:

| Manifest | Read shape |
|---|---|
| `package.json` | Full parse: `name`, `version`, `scripts`, `dependencies`, `devDependencies`, `engines`, `volta`, `packageManager`, `type`, `workspaces`. |
| `pnpm-lock.yaml` | Presence only + the `lockfileVersion` header field. |
| `package-lock.json` | Presence only + the `lockfileVersion` field. |
| `yarn.lock` | Presence only. (Yarn lockfile is not JSON; the Engine MAY peek at the first line for a version marker, but does not walk the dependency tree.) |
| `nest-cli.json` | Full parse. |
| `tsconfig.json` | Read-only of `compilerOptions.target`, `compilerOptions.module`, `include`, `exclude`. |
| `.nvmrc` | Plain text: the first line that is neither blank nor a `#` comment, trimmed. **Non-qualifying** (see below). |
| `.node-version` | Plain text, same shape as `.nvmrc`. **Non-qualifying** (see below). |

**Qualifying vs non-qualifying manifests.** Presence of *any* manifest in
the set is what distinguishes "a project" from "an arbitrary folder"; with
none present, `detect()` raises `NoManifestError`. Two entries are excluded
from that test and listed in `NON_QUALIFYING_MANIFESTS`: `.nvmrc` and
`.node-version`. They are *evidence* a rule may read (DR-004), not proof a
folder is a Node project — a directory holding only a `.nvmrc` would
otherwise detect to an IR with no package manager and no stages. Added
2026-09-13; see [ADR-0011](../adr/0011-runtime-version-evidence-order.md).

**Pre-existing `Dockerfile` removed from v1.** ADR-0005's draft list
included a pre-existing root `Dockerfile`; v1 of this Engine spec **drops
it** from the manifest set. The Dockerfile Generator's job is to *produce*
a Dockerfile; reading a hand-written one introduces a circular concern
(do we honor it, supersede it, refuse to overwrite?) that the MVP scope
does not need. If a future spec wants "respect a user-written Dockerfile,"
that is an additive change with its own ADR.

**Enforcement.** A Detection Rule declares the set of manifests it reads
in its `reads: []` array. The Engine refuses to register any rule whose
`reads` contains a path not in the table above; refusal happens at engine
construction time, not at `detect()` time, so the failure surfaces during
test-suite startup rather than mid-pipeline. (DET-AC-002.)

A rule MAY declare a subset of the above; the Engine MUST NOT provide
the rule with the content of any manifest the rule did not declare. This
makes the read-surface auditable per rule.

### Decision 4 — Build command derivation

The `build` Stage's `steps[0].run` is the single string the Dockerfile
Generator emits verbatim as `RUN <…>` in the builder layer. Two
candidates for who decides what that string is:

- **Engine-driven.** A central engine function `composeBuildCommand(pm,
  scriptName)` returns the canonical invocation.
- **Rule-driven.** The DR-NNN that emits the build Stage names the
  command in its emission body.

**Settled: rule-driven.** The rule reads `scripts.build` from
`package.json`, observes the detected package manager, and emits the
StageEmission with `steps[0].run` set to (for example) `"pnpm build"`,
`"npm run build"`, or `"yarn build"`. The Engine does not synthesize a
build command; it just forwards what the rule chose into the IR.

**Confidence.** `high`. The two inputs (`scripts.build` is non-empty;
the package manager is known) are both direct observations of the
manifest set. If either is missing, the rule simply does not fire — the
build Stage is omitted (Decision 5).

**Why rule-driven.** It keeps the engine ignorant of package-manager
conventions (those evolve and differ subtly per ecosystem) and aligns
with `DOCKER-FR-007`'s "emit verbatim" mandate. The same pattern applies
to install / lint / test Stage rules — they each name their own
invocation.

### Decision 5 — Stage emission policy

The v1 canonical Stage IDs are a **closed set**:

```
install, lint, test, build, docker-build
```

Each Stage is emitted by its own DR-NNN rule (cataloged in
`detection-rules.md`). Rough roles:

| Stage ID | Emission condition (high-level) | Required field? | Uncertainty behavior |
|---|---|---|---|
| `install` | A package manager is known. | No (Stage is optional in principle, but the canonical pipeline always has one). | If `packageManager.name` is `null`, the rule does not fire — the omission propagates with the existing `/project/packageManager/name` unresolved entry as the user-actionable signal. |
| `lint` | `package.json.scripts.lint` is a non-empty string. | No | Absent script → omit (no Stage, no `unresolved` entry; the lint Stage is intrinsically optional). The Visual Editor surfaces it as an add-able suggestion ([ADR-0006](../adr/0006-omit-on-uncertainty-default.md) cross-spec coupling). |
| `test` | `package.json.scripts.test` is a non-empty string. | No | Same as lint. |
| `build` | `package.json.scripts.build` is a non-empty string. | No | Same as lint. |
| `docker-build` | Project name + runtime are known. | No | The image tag is derived from `project.name`; if runtime is unresolved, the rule does not fire. |

**Required-field uncertainty stays in the project block.** The
`unresolved` array is reserved for required nullable project fields
(`/project/language`, `/project/runtime/*`, `/project/packageManager/*`)
and never for optional Stages. A missing `lint` Stage is "the project
has no lint script," not "we are uncertain about lint" — recording it
as `unresolved` would be noise.

**Closed set rationale.** A new canonical Stage ID (e.g. `format`,
`benchmark`) would propagate across the Generators, the Executor, and
the Visual Editor; each one needs to know how to render and run it. v1
freezes the set at five so each downstream consumer has a finite,
testable surface. Extending the set is an additive change with its own
spec revision.

**Build / install / lint / test commands (non-normative preview).** Per
Decision 4, the rule that emits each Stage names the command. The table
below is a **non-normative** preview of what the rules document will
declare — it is shown here so a reader of this Engine spec can predict
the Engine's output without flipping to `detection-rules.md`. The
**normative source of truth is `detection-rules.md`**; if the two
disagree, that document wins, and this preview is the one that gets
updated.

| pm | `install.steps[0].run` | `lint.steps[0].run` | `test.steps[0].run` | `build.steps[0].run` |
|---|---|---|---|---|
| `npm` | `npm ci` | `npm run lint` | `npm test` | `npm run build` |
| `pnpm` | `corepack enable && pnpm install --frozen-lockfile` | `pnpm lint` | `pnpm test` | `pnpm build` |
| `yarn` | `corepack enable && yarn install --frozen-lockfile` | `yarn lint` | `yarn test` | `yarn build` |

(The install Stage emits the full command including `corepack enable`
because the Executor runs the install Stage standalone in a container;
the Dockerfile Generator handles its own corepack lifecycle and does
not reuse this install command verbatim — it derives its install line
from `packageManager.name` directly. The two consumers diverge cleanly
on that point, which is why the IR carries the install Stage's command
in full and the Dockerfile Generator does not read it.)

`docker-build.steps[0].run` is `docker build -t <project.name>:ci .`.

**The docker-build Stage presupposes a Generator-produced `Dockerfile`,
NOT a project-authored one.** Because Decision 3 dropped `Dockerfile`
from the manifest set, the Engine never verifies that a Dockerfile
exists at the project root. The docker-build Stage assumes the
Dockerfile Generator's artifact will be written to the project root
before this Stage runs — that is the canonical pipeline. A user who
hand-authors a `Dockerfile` and bypasses the Generator is operating
outside the contract; the Engine has no opinion about the file's
contents and the Executor will simply consume whatever is on disk at
run time. If a future spec wants the Engine to honor a user-written
Dockerfile, that is an additive ADR per
[Decision 3](#decision-3--manifest-set-hard-frontier).

## Input/output contract

**Input:** a `rootPath: string` pointing at a Project root (a local
folder). The Engine MUST verify the folder exists and contains at least
one file from the manifest set; otherwise it throws with a specific
error citing the path.

**Output:** a `PipelineIR` document that passes `validate(ir)` from the
IR module (DET-FR-010). Returned by value.

**Side effects:** the Engine reads from disk inside `rootPath` (only
files in the manifest set, by enforcement). It does not write anything,
network, or shell out.

**Errors:** the Engine throws in exactly these cases:

1. `rootPath` does not exist or is not a directory.
2. No manifest from the enumerated set is present at `rootPath`.
3. **`package.json` is present but unparseable** — hard-throw with the
   path and the parser's diagnostic. (DET-FR-019.)
4. A registered rule's `reads` includes a non-manifest path. (Refused at
   construction.)
5. A registered rule emits a Stage with an ID not in the canonical set,
   OR sets a field at a JSON-Pointer path that is not in the IR schema.
   (Surfaced as a rule defect with the offending rule's ID.)
6. Two distinct rules emit `Committed` Outcomes for the same field path,
   OR two distinct rules emit Stages with the same `id`. (Rule-conflict
   defect; both rules named in the error.)
7. The composed IR fails `validate(ir)`. (Internal contract violation;
   surfaced for debugging.)

## Rule contract

The shape every Detection Rule MUST conform to:

```ts
type Rule = {
  id: string                       // "DR-001" etc.
  reads: ManifestPath[]            // declared subset of the manifest set
  cases: Case[]                    // evaluated in declared order
}

type Case = {
  condition: (ctx: RuleCtx) => boolean
  emit:      (ctx: RuleCtx) => FieldEmission | StageEmission
  confidence: 'high' | 'medium' | 'low'
  onUncertainty: 'omit' | 'assume-default' | 'needs-user-input'
  default?: unknown                // required when onUncertainty === 'assume-default'
  message?: string                 // recommended when onUncertainty === 'needs-user-input'
}

// Rule evaluation context. Both `manifests` and `ir` are immutable
// snapshots; rules MUST NOT attempt to mutate either.
type RuleCtx = {
  readonly manifests: Manifests
  readonly ir:        Readonly<PartialPipelineIR>
}

// Partial IR observed by rules. The `project` block is fully committed
// by the time stage rules run (see "Pass-ordering guarantee" below).
// `stages` and `unresolved` are intentionally NOT exposed — rules
// reading them would create cross-rule ordering coupling.
type PartialPipelineIR = {
  readonly version: string
  readonly project: PipelineIR['project']
}

type FieldEmission = { kind: 'field'; target: JsonPointer; value: unknown }
type StageEmission = { kind: 'stage'; stage: Stage }

type Manifests = {
  [path in ManifestPath]?: ParsedManifest  // present iff `path` was both
                                           // declared in `reads` AND found on disk
}
```

Rules are **pure** — given the same `ctx`, a Case's `condition` and
`emit` return the same values. `emit` MUST NOT be called unless
`condition` returned `true`; the Engine enforces this. Rules MUST NOT
perform I/O, read environment variables, call other rules, or maintain
state across runs.

### Pass-ordering guarantee (normative)

The pipeline's step 3 (project-fields pass) MUST run to completion
before step 4 (stage pass) begins. By the time any stage rule
evaluates, `ctx.ir.project` carries the committed result of every
project-field rule. Implementations MUST NOT interleave the two passes.

This ordering is what makes the `ctx.ir` type relationship safe:
stage rules statically know `ctx.ir.project` is settled. A future v2
that adds inter-stage dependencies (where one stage rule reads
another's emission) MUST introduce a third pass and document its own
ordering guarantee; it MUST NOT relax this one.

## Engine pipeline

The `detect(rootPath)` algorithm, in order:

1. **Verify root.** Throw if `rootPath` does not exist, is not a
   directory, or contains zero manifest-set files.
2. **Read manifests.** For each path in the enumerated manifest set
   present on disk, parse it into the per-manifest shape declared in
   [Decision 3](#decision-3--manifest-set-hard-frontier). Parse-error
   handling splits by manifest:
   - **`package.json` is load-bearing.** If `package.json` is present
     but cannot be parsed, the Engine MUST **throw** with a specific
     error citing the path and the parser's diagnostic. Silently
     warning here would let almost every rule see `undefined` and
     produce a "phantom all-unresolved IR" that nonetheless passes
     `validate(ir)` — masking a real defect as user-actionable
     uncertainty. The hard-throw rule defends against that.
   - **All other manifests are optional.** `pnpm-lock.yaml`,
     `package-lock.json`, `yarn.lock`, `nest-cli.json`, and
     `tsconfig.json` failing to parse is warned-and-skipped: the
     manifest is treated as absent from the `Manifests` snapshot,
     rules that declared it in `reads` see `undefined`, and detection
     continues. (The Engine emits a structured warning to its caller;
     emission of warnings is part of the v1 return contract but
     intentionally lightweight — see
     [OQ-DET-002](#open-questions) for the structured `{ ir,
     warnings }` shape question.)
3. **Project-field rules pass.** For each registered rule whose
   emissions target `/project/*` fields, evaluate its cases in declared
   order against the rule's declared subset of manifests. For each
   matched case, produce an `Outcome` via `emitOutcome(case)` and apply
   the [required-field collapse](#decision-2--ir-fr-009-ownership).
   Field emissions resolve onto the in-progress IR; duplicate fields
   (two rules targeting the same path) trigger a rule-conflict error
   identifying both rules.
4. **Stage emission rules pass.** Same algorithm, but the matched
   Outcome appends a Stage to a working stage list. Stage rules
   declared at lower-priority case order do not override earlier
   matches; rules conflict if two distinct rules emit a Stage with the
   same `id` (DET-AC-014).
5. **Install-dependency invariant.** Apply DET-FR-018 in two passes
   against the working IR snapshot:
   - **(a) PM-null suppression.** If `project.packageManager.name` is
     `null`, suppress **all** canonical command Stages from the working
     stage list — `install`, `lint`, `test`, `build`, AND `docker-build`.
     The resulting chain is empty (`stages: []`). Do not add any
     Stage-level `unresolved` entries; the existing `/project/packageManager/name`
     entry is the signal.
   - **(b) Orphaned-command-Stage drop.** Otherwise (PM is known), if
     `install` is absent from the working stage list but any of
     `{ lint, test, build }` is present, drop those orphaned command
     Stages. `docker-build` is preserved — PM is known, so the
     Dockerfile Generator can derive its install line.
6. **Chain composition.** The Engine wires `dependsOn` between the
   surviving emitted Stages in the canonical order
   `install → lint → test → build → docker-build`. Stages that were
   not emitted (or were dropped in step 5) are simply skipped; the
   remaining Stages form a contiguous chain (e.g. install → test →
   docker-build if lint and build were omitted). (Per the IR's
   linear-chain rule.)
7. **Triggers pass-through.** Do NOT inject a default `/triggers` value.
   If no rule emitted one, leave `triggers` absent from the IR;
   Generators apply their own neutral default at consumption time per
   [IR-FR-012](./pipeline-ir.spec.md#functional-requirements). This
   preserves the producer/consumer responsibility split set out in the
   IR spec and keeps the distinction between *"a rule chose on-push"*
   and *"nobody chose anything."* (Resolves the draft-time DET-FR-014
   vs. IR-FR-012 contract conflict.)
8. **Canonicalize.** Run `canonicalize(ir)` from the IR module to put
   Stages in topological order; this guarantees byte-deterministic
   serialization downstream.
9. **Validate.** Run `validate(ir)`. Throw if any error — this catches
   rule defects (e.g. a rule that emitted an invalid Stage shape) at
   the latest possible moment with the IR validator's specific messages.
10. **Return.** Return the validated IR.

The Engine MUST NOT skip step 9; an unvalidated IR is forbidden output
(DET-FR-010 / DET-NFR-003).

## Functional requirements

- **DET-FR-001 — `detect(rootPath): PipelineIR`.** Pure with respect to
  the filesystem state at `rootPath`. No network, no environment vars,
  no shell-out.
- **DET-FR-002 — Manifest-set frontier.** The Engine MUST NOT read any
  file outside the enumerated manifest set
  ([Decision 3](#decision-3--manifest-set-hard-frontier)). Enforcement
  is by rule-declared `reads` arrays plus an engine-level audit on
  registration. (Settles Decision 3; serves IR-FR-010.)
- **DET-FR-003 — Static cases; pure `condition` and `emit`.** Every
  Detection Rule is a list of cases, each declaring `(condition, emit,
  confidence, on-uncertainty[, default, message])` statically.
  `condition` and `emit` MUST both be **pure** functions of the
  `RuleCtx` argument the Engine supplies: same `ctx` in → same output;
  no I/O, no environment-variable reads, no shell-out, no hidden state
  across calls, no calls into other rules. The Engine MUST NOT invoke
  any rule body other than these two; in particular, the value→function
  shape of `emit` (introduced by the 2026-06-15 amendment) MUST NOT be
  read as a license for side effects. The static-case discipline of
  Decision 1 — auditability, testability, no hidden coupling — depends
  on this purity. *(Settles Decision 1; clarifies purity for `emit`.)*
- **DET-FR-004 — Emission truth table.** The Engine MUST implement
  IR-FR-009's truth table via `emitOutcome(case)` as specified in
  [Decision 2](#decision-2--ir-fr-009-ownership). Every case produces
  exactly one of `Committed | Unresolved | Nothing`. (Settles
  Decision 2.)
- **DET-FR-005 — Required-field collapse.** For cases whose emission
  targets one of the IR spec's required nullable fields
  (`/project/language`, `/project/runtime/{name,version}`,
  `/project/packageManager/{name,version}`), an Outcome that would be
  `Nothing` MUST be replaced by `Unresolved(field, …)`. (Refinement of
  DET-FR-004; serves IR-AC-016 from the producer side.)
- **DET-FR-006 — Idempotent rule evaluation.** Each rule's cases run at
  most once per `detect()` call. The Engine MUST NOT re-enter a rule
  during a single run.
- **DET-FR-007 — Rule-driven commands.** The Engine MUST emit the
  StageEmission's `steps[].run` strings verbatim from the rule that
  produced them. The Engine MUST NOT rewrite, format, or interpret the
  command. (Settles Decision 4.)
- **DET-FR-008 — Closed canonical Stage set.** The Engine MUST refuse,
  at rule-registration time, any rule emitting a Stage whose `id` is
  not in `{ install, lint, test, build, docker-build }`. (Settles
  Decision 5.)
- **DET-FR-009 — Stage chain composition.** After collecting Stage
  emissions, the Engine MUST wire `dependsOn` between consecutive
  emitted Stages in the canonical order
  `install → lint → test → build → docker-build`, skipping the ones
  that were not emitted. The resulting chain MUST satisfy the IR
  spec's linear-chain validation rule.
- **DET-FR-010 — Validated output.** The Engine MUST return a
  `PipelineIR` for which `validate(ir)` reports zero errors. If the
  composed IR fails validation, the Engine MUST throw with the
  validator's error list; this is a defect signal, not user-actionable.
- **DET-FR-011 — Determinism.** Two `detect()` calls against the same
  filesystem state MUST return IRs equal modulo `metadata.generatedAt`.
- **DET-FR-012 — Stable IDs.** Stage IDs and Step IDs are determined
  by the rules that emit them; rules MUST use the same IDs across
  runs given the same input. (Trivially true for static rule bodies.)
- **DET-FR-013 — Topological canonicalization.** The returned IR MUST
  be canonical (`canonicalize` applied) so Stages are emitted head →
  tail.
- **DET-FR-014 — No engine-side trigger default.** The Engine MUST NOT
  inject a default `/triggers` value. If no rule emits one, the IR is
  returned with `triggers` absent, preserving the distinction between
  *"a rule chose `on-push`"* and *"nobody specified."* Per
  [IR-FR-012](./pipeline-ir.spec.md#functional-requirements),
  consumers (Generators) apply their own documented neutral default at
  consumption time. *(Resolved a draft-time contract conflict with
  IR-FR-012: an engine-side default would make the generator-default
  clause dead code.)*
- **DET-FR-015 — Defensive read auditing.** The Engine MUST pass each
  rule a `RuleCtx` object with two readonly fields:
  - `ctx.manifests` — the per-rule subset of parsed manifest contents
    declared in `reads`. Manifests the rule did **not** declare in
    `reads` MUST NOT appear in `ctx.manifests`; a rule that reaches
    outside its declared set observes `undefined` for that manifest.
    The Engine MUST NOT silently widen the rule's effective manifest
    read surface.
  - `ctx.ir` — a readonly `PartialPipelineIR` snapshot. Stage rules
    MAY read any `/project/*` field through `ctx.ir.project`,
    regardless of what is in `reads` — the `reads` array bounds
    *manifest* reads, not IR-snapshot reads. The IR snapshot's stages
    and unresolved arrays are deliberately not exposed
    (`PartialPipelineIR` omits them); rules that try to read them get
    a type error at authoring time. The Engine MUST NOT widen
    `PartialPipelineIR` to include stage list or unresolved array
    reads without superseding this spec.
- **DET-FR-016 — Validator reuse.** The Engine MUST call
  `validate(ir)` and `canonicalize(ir)` from the IR module
  (`../ir`). It MUST NOT re-implement schema knowledge. (Serves
  [ADR-0003](../adr/0003-ir-as-single-source-of-truth.md).)
- **DET-FR-017 — Splice reuse (cross-spec consistency).** Where any
  downstream consumer of the Engine's IR needs a spliced chain
  (e.g. the Dockerfile Generator after a user toggles `enabled`),
  it MUST call the IR module's `computeEffectiveChain`. The Engine
  itself does NOT splice; it emits the full chain with every
  Stage's original `dependsOn`. (Restates IR-FR-014 for clarity.)
- **DET-FR-018 — Install-dependency invariant.** Every v1 canonical
  Stage depends, directly or transitively, on a known package
  manager: `install`/`lint`/`test`/`build` invoke `<pm> <script>`
  commands, and `docker-build` relies on the Generated Dockerfile,
  which derives its install line from `project.packageManager.name`
  ([`DOCKER-FR-006`](./dockerfile-generator.spec.md#functional-requirements))
  — the Generator throws when that field is null. The Engine MUST
  therefore enforce this dependency in two cases:

  - **(a) `packageManager.name` is null.** When the final IR's
    `project.packageManager.name` is `null` (paired with the
    required-field `unresolved` entry at
    `/project/packageManager/name`), the Engine MUST emit **zero
    canonical command Stages — `install`, `lint`, `test`, `build`,
    AND `docker-build` all suppressed**. The final chain is empty
    (`stages: []`). The `unresolved` entry at
    `/project/packageManager/name` is the sole user-actionable
    signal explaining the empty pipeline. An honest empty IR beats
    a `docker-build` Stage that the Dockerfile Generator would
    refuse to render at consumption time.
  - **(b) `packageManager.name` is known but `install` is somehow
    absent.** This case should be unreachable in practice: the
    install rule in `detection-rules.md` MUST fire at
    `confidence: high` whenever `project.packageManager.name` is
    non-null (rule-side obligation, cataloged in the rules document,
    not enforced by the engine code). As a defense-in-depth, if the
    working stage list ends up with `install` absent but any of
    `{ lint, test, build }` present, the Engine MUST drop those
    orphaned command Stages. `docker-build` is **preserved** in
    this branch — PM is known, so the Generator can derive its
    install line and the Dockerfile is producible.

  The Engine does NOT add Stage-level `unresolved` entries to
  explain dropped Stages — Stages are intrinsically optional
  (Decision 5), the `/project/packageManager/name` entry already
  carries the user-actionable cause, and adding more would muddy
  the "unresolved is for required project fields" contract.

  *(Closes the structurally-valid-but-non-runnable hole.
  Pre-Accepted review caught that the earlier draft kept
  `docker-build` in case (a), but the Generator would throw at
  generate-time because it cannot derive the install line from a
  null `packageManager.name`. Case (a) now suppresses
  `docker-build` too.)*
- **DET-FR-019 — `package.json` hard-throw on parse failure.** If
  `package.json` is present at the Project root but cannot be
  parsed, the Engine MUST throw with a specific error citing the
  path and the parser's diagnostic. Warn-and-continue applies only
  to genuinely optional manifests (`tsconfig.json`, `nest-cli.json`,
  the lockfiles). Without this rule, a malformed `package.json`
  would silently surface as "phantom all-unresolved IR" — passes
  `validate(ir)`, but every rule downstream saw `undefined` and the
  user would believe the project was merely uncertain when it was
  in fact broken.

## Non-functional requirements / constraints

- **DET-NFR-001 — Manifest-set hard frontier.** Enforced by
  registration-time audit (DET-FR-002). A rule that declares `reads`
  outside the set fails the audit; a rule that tries to widen its read
  surface at evaluation time observes `undefined`. Verified by
  DET-AC-002.
- **DET-NFR-002 — Determinism.** DET-FR-011's structural guarantee.
- **DET-NFR-003 — No re-implementation of IR transforms.** The Engine
  uses `validate` and `canonicalize` from the IR module rather than
  re-implementing schema or topology rules.
- **DET-NFR-004 — Rule isolation.** Rules MUST NOT call each other.
  Rule interactions (one rule's emission affecting another rule's
  condition) are achieved only through the in-progress IR snapshot
  the Engine maintains between passes.
- **DET-NFR-005 — Honest claims (carried through).** The Engine MUST
  NOT emit IR fields that claim "byte-for-byte parity with a remote
  runner" or anything else IR-NFR-006 forbids.

## Edge cases

- **No `package.json`.** Most rules' `condition` predicates return
  false. The language and runtime rules likely opt into
  `needs-user-input` (their cases declare `confidence: medium +
  on-uncertainty: needs-user-input`); the resulting IR has thin
  `project.*` fields with paired `unresolved` entries, and zero
  Stages. Still a valid IR per IR-AC-009.
- **`package.json` with no `scripts`.** No lint / test / build /
  install rules emit Stages (Decision 5). The IR has `install` (if
  a package manager is known) and `docker-build` only — a 2-Stage
  chain.
- **Both `pnpm-lock.yaml` and `package-lock.json` present.** Resolved
  by precedence in `detection-rules.md` (a separate concern). The IR
  MUST commit to exactly one `packageManager.name` (IR-spec edge case).
- **Monorepo / workspaces.** `project.workspaces` field present in
  `package.json`. The Engine reads only the top-level manifests
  ([IR Workspaces non-goal](./pipeline-ir.spec.md#workspaces--monorepos)).
  The resulting IR's `project.rootPath` is the folder passed to
  `detect()`. (DET-AC-012.)
- **Rule emits a value at a path with a conflicting committed value.**
  Two distinct rules each emitting a `Committed` Outcome for
  `/project/language` is a rule-defect; the Engine throws naming both
  rules. (DET-AC-014.)
- **Rule emits both a `Committed` value and an `Unresolved` entry for
  the same path.** Same: rule-defect; refused.
- **Rule with zero matching cases.** Emits nothing. Not an error.

## Acceptance criteria

Each criterion maps to a planned test under
`backend/src/modules/detector/`. Tests are not written yet
(the spec is `Draft`).

| ID | Criterion | Planned test |
|---|---|---|
| **DET-AC-001** | **Regression-lock**, not ground truth. `detect("test/fixtures/node-pnpm-nest-basic")` returns an IR byte-equal (modulo `metadata.generatedAt`) to `test/fixtures/node-pnpm-nest-basic/expected-ir.json`. *Important caveat:* that file was authored before the Detector existed, to exercise the IR validator; it is the author's *guess* at what the canonical IR should look like, not a derived ground truth. **DET-AC-008 (a real `docker build` succeeds) is the actual semantic validation.** If, during implementation, `detect()` reveals the hand-written IR was wrong (e.g. wrong build-command form for pnpm, missing field, etc.), revise the **fixture** — do NOT tune the Detector to reproduce a wrong guess. After any such revision, re-run T-IR-001/T-DOCKER-001 to confirm the IR validator and Dockerfile Generator goldens still hold. | T-DET-001 |
| **DET-AC-002** | Registering a rule whose `reads: [...]` contains a path outside the manifest set (e.g. `src/main.ts`) throws at engine construction with the rule id and the offending path in the message. | T-DET-002 |
| **DET-AC-003** | Given a synthetic rule with one case at each of the four IR-FR-009 rows, the Engine produces the expected Outcomes: `high → Committed`; `medium + omit → Nothing`; `medium + assume-default → Committed(default)`; `medium + needs-user-input → Unresolved`. *(Unblocks T-IR-013 from the producer side.)* | T-DET-003 |
| **DET-AC-004** | When a case targets a required nullable field (e.g. `/project/language`) and would yield `Nothing`, the Engine instead emits `Unresolved` — and the resulting IR passes `validate(ir)` and also passes IR-AC-016 (paired `unresolved` entry exists at that path). | T-DET-004 |
| **DET-AC-005** | Two consecutive `detect()` calls on an unchanged fixture produce IRs equal modulo `metadata.generatedAt`. | T-DET-005 |
| **DET-AC-006** | Stage IDs and Step IDs from `detect(node-pnpm-nest-basic)` match the existing fixture IR exactly (`install`, `lint`, `test`, `build`, `docker-build`). | T-DET-006 |
| **DET-AC-007** | The IR returned by `detect()` passes `validate(ir)` — zero `ValidationError`s. | T-DET-007 |
| **DET-AC-008** | **Semantic ground truth** (paired with DET-AC-001's regression-lock framing). End-to-end: writing both files from `generate(detect("test/fixtures/node-pnpm-nest-basic"))` into the fixture directory and running `docker build .` against the fixture project succeeds. This is the test that actually says "the Detector + Generator produced something correct" — DET-AC-001 only says "the Detector still produces what it produced last time." When the two disagree (build succeeds but byte-equality fails, or vice versa), AC-008 wins and the fixture is revised. *(Closes the loop on T-DOCKER-006: it becomes a real `docker build` against a runnable NestJS source tree.)* | T-DET-008 |
| **DET-AC-009** | A fixture whose `package.json` has no `scripts` at all produces an IR with `install` and `docker-build` Stages only — no `lint`, no `test`, no `build` — and the chain is `install → docker-build`. | T-DET-009 |
| **DET-AC-010** | A fixture with `scripts.lint` set but `scripts.test` missing emits a `lint` Stage but no `test` Stage; the chain wires `install → lint → docker-build`. | T-DET-010 |
| **DET-AC-011** | A fixture with both `pnpm-lock.yaml` and `package-lock.json` resolves the conflict per `detection-rules.md`'s precedence and produces exactly one `packageManager.name`. | T-DET-011 |
| **DET-AC-012** | A monorepo fixture (top-level `package.json` with `workspaces` and child packages `backend/` and `frontend/`) produces an IR whose `project.rootPath` is the folder passed to `detect()`; the Engine does NOT descend into sub-packages. | T-DET-012 |
| **DET-AC-013** | A rule with two cases that could both match returns the first case's emission (rule case order is honored). | T-DET-013 |
| **DET-AC-014** | A test rule emitting a Stage with `id: "wat"` (not in the canonical set) is refused at registration with the rule id and the offending Stage id named. Likewise, two rules emitting the same canonical Stage `id` throw a rule-conflict error naming both rules. | T-DET-014 |
| **DET-AC-015** | A rule that violates DET-FR-015 by trying to read a manifest it did not declare receives `undefined` for that manifest; the rule's `condition` then evaluates against `undefined` and (per the rule's own logic) declines to fire. | T-DET-015 |
| **DET-AC-016** | **Case (a): `packageManager.name` is null.** A fixture whose `package.json` declares `scripts.test` (and/or lint/build) but whose `packageManager.name` ends up `null` (carried by a paired `unresolved` entry at `/project/packageManager/name`) produces a final IR with **`stages: []`** — `install`, `lint`, `test`, `build`, AND `docker-build` are all suppressed (DET-FR-018(a)). The `unresolved` entry at `/project/packageManager/name` is the sole user-actionable signal explaining the empty pipeline. The resulting IR passes `validate(ir)` (empty `stages` is valid per IR-AC-009/017). *(Replaces the pre-Accepted draft which incorrectly kept `docker-build` — the Generator would have thrown at generate time because it cannot derive the install line from a null PM.)* | T-DET-016 |
| **DET-AC-018** | **Case (b): `packageManager.name` known but `install` rule didn't fire (defense-in-depth).** Given a synthetic engine configuration where `packageManager.name` is committed (e.g. `"pnpm"`) but the `install`-emitting rule is omitted from the registry, lint/test/build Stages emitted from `scripts.*` rules are dropped by DET-FR-018(b); `docker-build` is preserved (PM is known, so the Generator's install derivation works). The chain reduces to `docker-build` only. This case should be unreachable in production rule sets because `detection-rules.md` mandates the install rule fire at `confidence: high` whenever PM is non-null — the test exercises the engine's defense-in-depth, not an expected user-facing state. | T-DET-018 |
| **DET-AC-017** | A fixture whose `package.json` is malformed (e.g. truncated JSON, trailing comma) causes `detect()` to throw with the path and a parser-diagnostic substring in the message. The same fixture with a malformed `tsconfig.json` (and a valid `package.json`) does NOT throw — `tsconfig.json` is treated as absent, a warning is surfaced, and detection completes. *(Closes the phantom-all-unresolved hole of DET-FR-019.)* | T-DET-017 |
| **DET-AC-019** | A synthetic stage rule whose `emit(ctx)` reads `ctx.ir.project.runtime.version` and writes it into `container.image` (e.g. `"node:20-alpine"`) observes the value committed by the project-fields pass — confirming the pass-ordering guarantee and the `ctx.ir` surface. The same rule's `condition(ctx)` accessing `ctx.ir.stages` is a TypeScript compile-time error (the `PartialPipelineIR` type omits `stages`); enforcement is type-level rather than runtime. | T-DET-019 |
| **DET-AC-020** | **DR-004 resolves the runtime version from any of its four evidence sources, in order.** A project declaring only `volta.node`, only `.nvmrc`, or only `.node-version` detects to a non-null `/project/runtime/version` with **no** paired `unresolved` entry, and the resolved major propagates into the stage images as `node:<major>-alpine`. Where several sources are present, `engines.node` wins over `volta.node`, which wins over `.nvmrc`, which wins over `.node-version` ([ADR-0011](../adr/0011-runtime-version-evidence-order.md)). A version file naming an nvm **alias** (`lts/hydrogen`, `node`, `stable`) or nothing at all is NOT evidence: the rule falls through to its catch-all and emits `null` plus the paired `unresolved` entry. A folder containing a version file but no qualifying manifest still raises `NoManifestError`. | T-DET-020 |
| **DET-AC-021** | **The rules catalogue is enforced, not merely written.** A test asserts that `ALL_RULES` and `docs/rules/detection-rules.md` describe the same rules: every documented `DR-NNN` heading is a registered rule and vice versa, in the same order, with unique ids sequential from `DR-001`; each rule's documented `Reads` row names exactly the manifests in its `reads` array (the `plus in-progress IR:` half of the row is excluded, since `/project/*` is freely readable by DET-FR-015 and not declared); a backticked file-shaped token in that row that is not in the enumerated manifest set fails the test rather than being ignored; each field rule's documented `Target` is an allowed field target; and every stage rule's heading names the canonical stage id it emits. | T-DET-021 |

## Cross-spec dependencies

- **IR module.** `detect()` calls `validate` and `canonicalize` from
  `../ir`. The Engine MUST NOT re-implement either. (DET-FR-016.)
- **Detection Rules (DR-NNN).** This Engine is the interpreter; the
  rule catalogue lives at `docs/rules/detection-rules.md`. That
  document defines the DR-NNN ids, the cases, and the per-rule
  conditions. The Engine spec freezes the *contract* (`Rule` and
  `Case` shape) so the rules document can be authored independently
  once this spec is Accepted.
- **Dockerfile Generator.** Consumer of the Engine's output. T-DET-008
  closes the loop: `generate(detect(rootPath))` then `docker build .`
  succeeds. This is the cheapest real end-to-end the project has —
  the demonstrable vertical slice the
  [MVP scope](../product/02-mvp-scope.md) calls for.
- **Visual Editor (future).** The editor mutates the IR the Engine
  produced. The editor's "surface omitted canonical Stages" obligation
  ([ADR-0006](../adr/0006-omit-on-uncertainty-default.md) cross-spec
  coupling) applies directly to the Stages the Engine omitted under
  `omit` semantics.

## Fixture plan

Real fixture project sources land alongside this spec's implementation,
under `test/fixtures/`. Each fixture's `expected-ir.json` already
exists or will be added; the Engine's test layer compares
`detect(fixture)` to it.

| Fixture | Purpose | New / extends existing |
|---|---|---|
| `node-pnpm-nest-basic/` | Canonical pnpm fixture used by IR and Dockerfile tests today. Will gain real project sources: `package.json`, `pnpm-lock.yaml`, `nest-cli.json`, `tsconfig.json`, `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`. Engine reads only the manifests; the source files exist solely so `docker build .` (T-DET-008) succeeds. | Extends |
| `node-pnpm-no-tests/` | pnpm fixture with `scripts.test` absent. Validates DET-AC-010. | New |
| `node-pnpm-no-scripts/` | pnpm fixture with empty `scripts`. Validates DET-AC-009. | New |
| `node-npm-nest-basic/` | npm variant used by Dockerfile tests today. Gains real `package.json` + `package-lock.json`. | Extends |
| `node-yarn-nest-basic/` | yarn variant. Gains real `package.json` + `yarn.lock`. | Extends |
| `node-pnpm-both-lockfiles/` | pnpm-lock.yaml AND package-lock.json present. Validates DET-AC-011. | New |
| `monorepo-pnpm/` | Top-level `package.json` with `workspaces`, plus `backend/` and `frontend/` sub-packages with their own manifests. Validates DET-AC-012. | New |

The Engine reads only manifest files inside each fixture; the source
files (`src/main.ts` etc.) exist only so the Dockerfile Generator's
T-DET-008 end-to-end can build a real image.

## Open questions

- **OQ-DET-001.** Should the Engine cache parsed manifests across
  `detect()` calls (mtime-based)? Useful for the future Visual Editor
  hot-reload. Deferred until a measurable need.
- **OQ-DET-002.** Should `detect()` return a `{ ir, warnings }` pair
  to surface non-fatal observations (e.g. "a manifest failed to
  parse")? v1 returns the IR directly and logs warnings; restructuring
  is a future MINOR.
- **OQ-DET-003.** Should the Engine record which rules fired into the
  IR's `metadata` for audit / debug? Useful for the SDD storytelling
  this project values; deferred to v0.2 of this spec.
- **OQ-DET-004.** Should a Detection Rule be able to declare a
  *priority* number to resolve cross-rule conflicts on the same field
  path, rather than throwing? v1 throws; the user's response to a
  conflict is to fix one of the rules.

## Known limitations

- **DET-LIMIT-001.** Source-code parsing is forbidden; rules limited
  to manifest content. Resolution path: a future ADR widens the
  manifest set or admits a narrow source-content rule (see
  [ADR-0005 Consequences](../adr/0005-manifest-only-detection-in-mvp.md)).
- **DET-LIMIT-002.** Monorepo / workspace detection is out of scope;
  the Engine reads only top-level manifests. Resolution path: an
  additive workspace-aware traversal spec post-v1.
- **DET-LIMIT-003.** The canonical Stage set is closed at five IDs;
  new IDs require a new spec revision.

## Changelog

| Date | Change |
|---|---|
| 2026-06-15 | Initial draft. Settles five boundary decisions (confidence source, IR-FR-009 ownership, manifest set, build-command derivation, stage emission policy). FRs DET-FR-001…017. ACs DET-AC-001…015 mapped to T-DET-001…015. The DR-NNN rule catalogue is referenced but defined separately in `detection-rules.md`. Fixture plan lists real project sources to land alongside the implementation so T-DOCKER-006 becomes a real `docker build`. |
| 2026-06-15 | Pre-Accepted review fixes (still Draft). (A) DET-FR-014 inverted: Engine MUST NOT inject default `/triggers`; deferred to generator-side per IR-FR-012; pipeline step 7 follows. (A-followup) Decision 5 expanded: `docker-build` Stage presupposes the Generator's Dockerfile, not a project-authored one, since Decision 3 dropped `Dockerfile` from the manifest set. (B) New DET-FR-018 install-dependency invariant + DET-AC-016 close the structurally-valid-but-non-runnable hole. New pipeline step 5 (invariant pass) inserted before chain composition. (C) Decision 2's required-field collapse now mandates a synthesized non-empty message when none is provided; same synthesis covers `needs-user-input` cases without `message`. New "Confidence flattening" subsection states `low` ≡ `medium` in v1 with a forward note. (D) DET-AC-001 reframed as a regression-lock with DET-AC-008 as the semantic ground truth; the hand-written `expected-ir.json` may be revised if `detect()` reveals it was wrong. (E) New DET-FR-019 hard-throw on unparseable `package.json` + DET-AC-017; pipeline step 2 split by manifest. (Callout 5) Decision 5's command-table preview marked non-normative; `detection-rules.md` is the source of truth. |
| 2026-06-15 | Pre-Accepted review fix to B (still Draft). DET-FR-018 split into two cases: (a) `packageManager.name` null → **all** canonical Stages suppressed including `docker-build` (the prior draft incorrectly preserved it, but the Dockerfile Generator would throw at generate time because it cannot derive its install line from a null PM); (b) PM known but install missing → drop orphaned `{lint,test,build}`, preserve `docker-build`. The "install rule MUST fire when PM is known" obligation is documented as a rule-side responsibility cataloged in `detection-rules.md`. Pipeline step 5 split into two passes (a) and (b). DET-AC-016 corrected to assert `stages: []` for PM-null fixtures; new DET-AC-018 covers case (b) defense-in-depth. |
| 2026-06-15 | **Accepted** 2026-06-15 after review; trigger pass-through, install-dependency invariant split into PM-null total suppression + PM-known orphan drop, `package.json` hard-throw, AC-001/008 regression-vs-ground-truth framing. The DR-NNN rule catalogue authored next in `docs/rules/detection-rules.md`. |
| 2026-06-15 | **Amendment (Accepted-with-changelog, not redrafted).** Authoring the DR-NNN catalogue stressed the Rule contract and exposed a real gap: stage rules (DR-007…011) read committed `/project/*` state, but the original `Case.condition: (m: Manifests) => boolean` signature exposed manifests only. This was a contract bug, not just an underspecification. Widened the contract: `Case.condition` and the renamed `Case.emit` now both take a `RuleCtx = { manifests: Manifests; ir: Readonly<PartialPipelineIR> }`. New `PartialPipelineIR` type deliberately omits `stages` and `unresolved` to prevent rule-ordering coupling. DET-FR-015 revised to describe the split read surface (manifests are bounded by `reads`; `/project/*` is freely readable; `stages`/`unresolved` are not readable). Pass-ordering guarantee (step 3 before step 4) promoted from prose to normative requirement, because the type relationship now relies on it. New DET-AC-019 verifies the contract. This is the **"catalogue stressed the Rule contract"** event — parallel to the Dockerfile Generator stressing the IR contract earlier. Status stays Accepted because the widening is strictly additive (any pre-amendment rule expresses cleanly under the new shape); the changelog is the authoritative record per the specs/README lifecycle policy. |
| 2026-06-15 | Editorial tie-off (Accepted, no contract change). DET-FR-003 rewritten to make `emit` purity explicit alongside `condition`: same ctx in → same output, no I/O / env / shell / hidden state / cross-rule calls. The value→function shape of `emit` introduced in the prior amendment is NOT a license for side effects; the static-case discipline of Decision 1 depends on this purity. |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **UX-01b**. DR-004's evidence set was a single source (`engines.node`), which most real projects do not declare, so the detector routinely produced `runtime.version: null` — a hard block on generate, export and execute. The manifest set gains `.nvmrc` and `.node-version` as plain-text reads, `package.json`'s read shape gains `volta`, and Decision 3 now distinguishes **qualifying** from **non-qualifying** manifests so a version file alone does not make a folder a project. New DET-AC-020 covers the evidence order, the alias-is-not-evidence rule, and the propagation into stage images. The widening is strictly additive — no project that previously resolved a version resolves a different one — so the status stays Accepted per the specs/README lifecycle. Evidence order and alias policy recorded in [ADR-0011](../adr/0011-runtime-version-evidence-order.md). |
| 2026-09-13 | **Status: Accepted → Implemented.** From adversarial review finding **SDD-03**: every acceptance criterion in this spec is covered by a passing test, and has been for some time, but the status was never advanced — the progress board understated the project. Advanced together with IR, DOCKER, DET, EXEC and EDITOR after the traceability table was completed (the 17 missing EXEC-AC rows added, IR-AC-011's three halves reconciled). |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **SDD-05**: `docs/rules/detection-rules.md` described DR-001…011 and nothing asserted that the description matched `ALL_RULES`, so the catalogue was unverified prose free to drift. New **DET-AC-021** makes the document self-enforcing in both directions. It found real drift on its first run: DR-007's `Reads` row still said `package.json` only, after the GEN-04 change taught the rule to consult the three lockfiles. |
