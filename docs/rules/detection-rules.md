# Detection Rules

| Field | Value |
|---|---|
| Status | Accepted |
| Last updated | 2026-06-15 |
| Linked specs | [`pipeline-ir.spec.md`](../specs/pipeline-ir.spec.md) (Accepted), [`detector-engine.spec.md`](../specs/detector-engine.spec.md) (Accepted) |
| Linked ADRs | [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md), [ADR-0006](../adr/0006-omit-on-uncertainty-default.md) |

This document is the **DR-NNN catalogue** — the data side of the Detector. The
[Detector Engine Spec](../specs/detector-engine.spec.md) is the interpreter;
this is the program it runs. Rules are the primary SDD showcase of the project:
each is a single auditable, testable assertion about how an observed condition
in the Project translates to a fact in the [Pipeline IR](../specs/pipeline-ir.spec.md).

## Model

The three deferred model parameters are now settled by the IR and Engine
specs:

| Parameter | Settled value | Authority |
|---|---|---|
| **Detection depth** | Manifest **content parsing** of the frozen set — `package.json` (full parse), `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` (presence + lockfile-version header), `nest-cli.json` (full parse), `tsconfig.json` (selected fields), `.nvmrc` / `.node-version` (first meaningful line). No source-code parsing; no other files. | [ADR-0005](../adr/0005-manifest-only-detection-in-mvp.md), [Engine Decision 3](../specs/detector-engine.spec.md#decision-3--manifest-set-hard-frontier) |
| **Global uncertainty default** | `omit`. For **required nullable project fields** (`/project/language`, `/project/runtime/{name,version}`, `/project/packageManager/{name,version}`), `omit` collapses to `needs-user-input` with a synthesized message if the rule supplies none. | [ADR-0006](../adr/0006-omit-on-uncertainty-default.md), [Engine Decision 2](../specs/detector-engine.spec.md#decision-2--ir-fr-009-ownership) |
| **Confidence source** | Statically declared **per case**. A rule is a list of cases evaluated in declared order; the first matching case wins. The Engine never computes confidence from observations. `low` ≡ `medium` for emission purposes in v1; rules MAY declare `low` for documentation but the Engine treats it identically. | [Engine Decision 1](../specs/detector-engine.spec.md#decision-1--confidence-source) |

### Removed: cross-rule `Priority` field

The earlier scaffold template included a `Priority` field for cross-rule
precedence. The Engine spec rejected that model
([OQ-DET-004](../specs/detector-engine.spec.md#open-questions)): v1 **throws**
when two distinct rules emit `Committed` outcomes for the same field path,
naming both rules. Cases are ordered **within** a rule; rules do not have
a priority field. The template below reflects this.

### The required-field collapse — applies to every project-field rule below

Each project-field rule targets a required nullable field. Per
[DET-FR-005](../specs/detector-engine.spec.md#functional-requirements), if
a rule's case fires with `confidence: medium | low` and
`on-uncertainty: omit`, the Engine **replaces** the would-be-`Nothing`
outcome with `Unresolved(field, message)`. The catch-all final case in
each rule below uses `needs-user-input` explicitly so the message is
authored, not synthesized — but the collapse exists regardless.

## Rule template

```markdown
## DR-NNN — <short rule name>

| Field | Value |
|---|---|
| Reads | `package.json`, `tsconfig.json`, … |
| Target | `/project/<field>` (FieldEmission) OR `/stages/+` with `id="<stage-id>"` (StageEmission) |

### Case 1 — <case label>

| Field | Value |
|---|---|
| Condition | <prose predicate on manifests and/or committed IR state> |
| Emission | <concrete value or Stage shape> |
| Confidence | `high` \| `medium` \| `low` |
| On uncertainty | `omit` \| `assume-default` \| `needs-user-input` |
| Default | <required when `assume-default`> |
| Message | <required when `needs-user-input`> |

### Case 2 — …

### Examples

- **Positive:** fixture `<name>/` → matches case <N> → emits …
- **Negative:** fixture `<name>/` → no case matches → emits …
- **Test:** `T-DET-NNN`
```

A rule MAY have a single case (most do) or many (e.g. DR-005 has seven, to
resolve package-manager precedence). Cases are evaluated top-to-bottom;
the first matching case wins (Engine Decision 1).

## Stage rules — common emission shape

Every Stage-emission rule produces the following shape; the rule fills in
only the fields the table shows as configurable. The Engine wires
`dependsOn` in step 6 of the pipeline (canonical order); rules emit
`dependsOn: []` and the Engine rewrites.

```
Stage = {
  id:        <fixed string per rule, from the canonical set>
  name:      <fixed string per rule>
  enabled:   true
  dependsOn: []                       # Engine wires
  container: { image: <derived> }     # see below
  steps:     [ { id, run, workingDir: ".", env: {} } ]
}
```

**`container.image`** for `install`/`lint`/`test`/`build` is
`"node:" + project.runtime.version + "-alpine"` when `runtime.version`
is non-null, and `"node:lts-alpine"` (assume-default) when it is null.
For `docker-build` the image is the literal `"docker:25"`.

**Coherence with `runtime.version` being unresolved.** When
`runtime.version` is `null`, DR-004's catch-all case emits an `unresolved` entry
at `/project/runtime/version` — but stage rules still emit, using
`"node:lts-alpine"` as their assume-default for `container.image`. This
is intentional, not contradictory: `container.image` and
`/project/runtime/version` are **distinct** IR fields. The `unresolved`
entry attaches to `/project/runtime/version` only; `container.image` is
committed as the documented default. A reviewer who sees both the
`"node:lts-alpine"` image and the `unresolved` entry should read it as
"the runtime version is user-decidable, and meanwhile the pipeline runs
on the LTS default" — which is exactly the `assume-default` semantics
of [ADR-0006](../adr/0006-omit-on-uncertainty-default.md). PM-null
(DR-005 case 7) is the case that truly suppresses Stages, via
[DET-FR-018(a)](../specs/detector-engine.spec.md#functional-requirements);
runtime-version-null is not.

**`steps[].workingDir`** is the literal `"."` for every rule in v1.
**`steps[].env`** is the empty object `{}` for every rule in v1.

---

# The catalogue

The 11 rules below cover every field and Stage required by the
node-pnpm-nest-basic fixture, plus the three lockfile-precedence cases
that settle [DET-AC-011](../specs/detector-engine.spec.md#acceptance-criteria).

## Project-field rules

### DR-001 — Project name

| Field | Value |
|---|---|
| Reads | `package.json` |
| Target | `/project/name` (FieldEmission) |

#### Case 1 — From `package.json.name`

| Field | Value |
|---|---|
| Condition | `package.json` is present and `package.json.name` is a non-empty kebab-case string |
| Emission | `/project/name = package.json.name` (verbatim) |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — From `rootPath` basename

| Field | Value |
|---|---|
| Condition | (always — catch-all) |
| Emission | `/project/name = basename(rootPath)` |
| Confidence | `high` |
| On uncertainty | `omit` |

Both cases at `confidence: high` is intentional: case 1 wins by order
when `package.json.name` is present; case 2 is the structural fallback
because `/project/name` is non-nullable in the schema.

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `package.json.name = "node-pnpm-nest-basic"` → case 1 fires → `name: "node-pnpm-nest-basic"`.
- **Negative:** a hypothetical fixture with no `package.json.name` but folder `my-app/` → case 2 fires → `name: "my-app"`.
- **Test:** `T-DET-006` (Stage IDs + project fields match fixture).

---

### DR-002 — Language detection

| Field | Value |
|---|---|
| Reads | `package.json`, `tsconfig.json` |
| Target | `/project/language` (FieldEmission, required nullable) |

#### Case 1 — TypeScript via `tsconfig.json`

| Field | Value |
|---|---|
| Condition | `tsconfig.json` is present and parsable |
| Emission | `/project/language = "typescript"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — JavaScript by inference (assume-default)

| Field | Value |
|---|---|
| Condition | `package.json` is present and `tsconfig.json` is absent |
| Emission | `/project/language = "javascript"` |
| Confidence | `medium` |
| On uncertainty | `assume-default` |
| Default | `"javascript"` |

This is an **inference**, not an observation — TypeScript projects without
`tsconfig.json` exist (rare, but real). `assume-default` commits
`"javascript"` so downstream consumers proceed, but flags the value as
defaulted rather than observed. The Visual Editor surfaces this as a
"detected JS by absence of tsconfig — correct if wrong" affordance per
the `assume-default` semantics in
[ADR-0006](../adr/0006-omit-on-uncertainty-default.md).

#### Case 3 — Catch-all (required-field collapse)

| Field | Value |
|---|---|
| Condition | (always) |
| Emission | `/project/language` (no value — `Unresolved` after collapse) |
| Confidence | `medium` |
| On uncertainty | `needs-user-input` |
| Message | `"Could not determine project language; please specify (e.g. typescript, javascript)."` |

#### Examples

- **Positive (TypeScript):** fixture `node-pnpm-nest-basic` — `tsconfig.json` exists → case 1 → `language: "typescript"`.
- **Positive (JavaScript):** hypothetical fixture `node-pnpm-no-tsconfig/` — `package.json` exists, no `tsconfig.json` → case 2 → `language: "javascript"`.
- **Negative:** hypothetical fixture with only `pnpm-lock.yaml` (no `package.json`, no `tsconfig.json`) → case 3 → `language: null` + `unresolved` entry at `/project/language`.
- **Test:** `T-DET-001`, `T-DET-004` (required-field collapse).

---

### DR-003 — Runtime name

| Field | Value |
|---|---|
| Reads | `package.json` |
| Target | `/project/runtime/name` (FieldEmission, required nullable) |

#### Case 1 — Node from `package.json`

| Field | Value |
|---|---|
| Condition | `package.json` is present and parsable |
| Emission | `/project/runtime/name = "node"` |
| Confidence | `high` |
| On uncertainty | `omit` |

In v1 the supported runtime set is `{ "node" }` (per
[Dockerfile Generator DOCKER-FR-010](../specs/dockerfile-generator.spec.md#functional-requirements)).
Any project with a `package.json` is treated as Node.

#### Case 2 — Catch-all

| Field | Value |
|---|---|
| Condition | (always) |
| Emission | `/project/runtime/name` (no value — `Unresolved` after collapse) |
| Confidence | `medium` |
| On uncertainty | `needs-user-input` |
| Message | `"Could not determine project runtime; please specify (v1 supports: node)."` |

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` → case 1 → `runtime.name: "node"`.
- **Negative:** hypothetical fixture without `package.json` → case 2 → `unresolved` entry.
- **Test:** `T-DET-001`, `T-DET-004`.

---

### DR-004 — Runtime version

| Field | Value |
|---|---|
| Reads | `package.json`, `.nvmrc`, `.node-version` |
| Target | `/project/runtime/version` (FieldEmission, required nullable) |

Evidence order is settled by
[ADR-0011](../adr/0011-runtime-version-evidence-order.md): the declared range
in `engines.node` first, then the workstation pins. The rule is additive —
a project that resolved a version before this rule was widened resolves the
same version now.

#### Case 1 — From `engines.node` (major version)

| Field | Value |
|---|---|
| Condition | `package.json.engines.node` is a non-empty string |
| Emission | `/project/runtime/version = extractMajor(package.json.engines.node)` |
| Confidence | `high` |
| On uncertainty | `omit` |

**`extractMajor`** strips a leading `>=`/`^`/`~`/`v` if present and
returns the major version digits only:
`"20"` → `"20"`; `">=18"` → `"18"`; `"^20.10.0"` → `"20"`; `"20.x"` →
`"20"`. The IR carries major-version only in v1 (see
[OQ for full semver](#open-questions)).

#### Case 2 — From `volta.node`

| Field | Value |
|---|---|
| Condition | `package.json.volta.node` is a non-empty string AND `majorFromVersionText` resolves it |
| Emission | `/project/runtime/version = majorFromVersionText(package.json.volta.node)` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 3 — From `.nvmrc`

| Field | Value |
|---|---|
| Condition | `.nvmrc`'s first meaningful line resolves via `majorFromVersionText` |
| Emission | `/project/runtime/version = majorFromVersionText(.nvmrc)` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 4 — From `.node-version`

| Field | Value |
|---|---|
| Condition | `.node-version`'s first meaningful line resolves via `majorFromVersionText` |
| Emission | `/project/runtime/version = majorFromVersionText(.node-version)` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 5 — Catch-all

| Field | Value |
|---|---|
| Condition | (always) |
| Emission | `/project/runtime/version` (no value — `Unresolved` after collapse) |
| Confidence | `medium` |
| On uncertainty | `needs-user-input` |
| Message | `"Could not determine Node version (no engines.node, volta.node, .nvmrc or .node-version); set it in the Project panel or declare one of them."` |

#### Reading the version files

`.nvmrc` and `.node-version` are single-value text files. The manifest
reader takes the **first line that is neither blank nor a `#` comment** and
trims it.

**`majorFromVersionText`** is stricter than `extractMajor`: it returns the
major digits only when the text *starts* with an optional range operator or
`v` followed by digits, and returns `null` otherwise. So `"v20.11.0"` → `"20"`
and `">=18"` → `"18"`, but the nvm aliases `"lts/hydrogen"`, `"node"` and
`"stable"` resolve to `null` and fall through to the catch-all. Carrying an
alias through would interpolate it straight into `node:<version>-alpine` and
produce an unpullable image tag — see
[ADR-0011](../adr/0011-runtime-version-evidence-order.md).

`.nvmrc` and `.node-version` are in the enumerated manifest set but are listed
in `NON_QUALIFYING_MANIFESTS`: they are evidence for this rule, and they do
**not** satisfy the "at least one manifest present" precondition. A folder
holding only a `.nvmrc` still raises `NoManifestError`.

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `engines.node = "20"` → case 1 → `runtime.version: "20"`.
- **Positive:** fixture `node-npm-no-engines` — no `engines`, `.nvmrc` = `"20.11.0"` → case 3 → `runtime.version: "20"`.
- **Precedence:** `engines.node = "20"` with `.nvmrc` = `"18"` → case 1 wins → `"20"`.
- **Negative:** `package.json` with no `engines`, no `volta`, no version file → case 5 → `unresolved`.
- **Negative:** `.nvmrc` containing `lts/hydrogen` → case 5 → `unresolved`.
- **Test:** `T-DET-001`, `T-DET-004`, `T-DET-020`.

---

### DR-005 — Package manager name (with lockfile precedence)

| Field | Value |
|---|---|
| Reads | `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json` |
| Target | `/project/packageManager/name` (FieldEmission, required nullable) |

Cases are evaluated in declared order; the first match wins. This is how
the [multi-lockfile precedence](../specs/detector-engine.spec.md#edge-cases)
is resolved.

#### Case 1 — Declared via `package.json.packageManager` (pnpm)

| Field | Value |
|---|---|
| Condition | `package.json.packageManager` matches `^pnpm@.+` |
| Emission | `/project/packageManager/name = "pnpm"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — Declared (npm)

| Field | Value |
|---|---|
| Condition | `package.json.packageManager` matches `^npm@.+` |
| Emission | `/project/packageManager/name = "npm"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 3 — Declared (yarn)

| Field | Value |
|---|---|
| Condition | `package.json.packageManager` matches `^yarn@.+` |
| Emission | `/project/packageManager/name = "yarn"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 4 — Lockfile (pnpm)

| Field | Value |
|---|---|
| Condition | `pnpm-lock.yaml` is present |
| Emission | `/project/packageManager/name = "pnpm"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 5 — Lockfile (yarn)

| Field | Value |
|---|---|
| Condition | `yarn.lock` is present |
| Emission | `/project/packageManager/name = "yarn"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 6 — Lockfile (npm)

| Field | Value |
|---|---|
| Condition | `package-lock.json` is present |
| Emission | `/project/packageManager/name = "npm"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 7 — Catch-all

| Field | Value |
|---|---|
| Condition | (always) |
| Emission | `/project/packageManager/name` (no value — `Unresolved` after collapse) |
| Confidence | `medium` |
| On uncertainty | `needs-user-input` |
| Message | `"Could not determine package manager (no lockfile and no packageManager field); please specify (npm | pnpm | yarn)."` |

**Lockfile precedence (cases 4 → 5 → 6).** A project with multiple
lockfiles is in transition; the declarative `packageManager` field (cases
1–3) wins absolutely if present. Otherwise pnpm > yarn > npm — `npm` is
treated as the implicit default and only "wins" when no other manager
left a signal. This is the documented behavior referenced by
[DET-AC-011](../specs/detector-engine.spec.md#acceptance-criteria).

#### Examples

- **Positive (declared):** fixture `node-pnpm-nest-basic` — `package.json.packageManager = "pnpm@9.0.0"` → case 1 → `pnpm`.
- **Positive (lockfile):** hypothetical fixture with only `pnpm-lock.yaml` → case 4 → `pnpm`.
- **Positive (precedence pnpm > npm):** fixture `node-pnpm-both-lockfiles` — `pnpm-lock.yaml` AND `package-lock.json` both present, no `packageManager` field → case 4 wins → `pnpm`.
- **Positive (precedence yarn > npm):** fixture `node-yarn-npm-both-lockfiles` (new — to land with the Detector implementation) — `yarn.lock` AND `package-lock.json` both present, no `packageManager` field → case 5 wins → `yarn`. This explicitly test-locks the yarn > npm ordering; without this fixture the pnpm > npm case alone would leave yarn > npm uncovered.
- **Negative:** hypothetical fixture with only `package.json` (no lockfiles, no field) → case 7 → `unresolved`.
- **Negative (declared overrides lockfile):** hypothetical fixture with `pnpm-lock.yaml` present AND `package.json.packageManager = "npm@10.0.0"` → case 2 fires before case 4 → `npm` (declared field wins absolutely, as designed).
- **Test:** `T-DET-001`, `T-DET-011`.

---

### DR-006 — Package manager version

| Field | Value |
|---|---|
| Reads | `package.json` |
| Target | `/project/packageManager/version` (FieldEmission, required nullable) |

#### Case 1 — From `package.json.packageManager`

| Field | Value |
|---|---|
| Condition | `package.json.packageManager` matches `^(pnpm\|npm\|yarn)@.+` |
| Emission | `/project/packageManager/version = extractMajor(<after-@>)` |
| Confidence | `high` |
| On uncertainty | `omit` |

Same `extractMajor` semantics as DR-004: `"pnpm@9.0.0"` → `"9"`;
`"npm@10.2.4"` → `"10"`; `"yarn@4.1.0"` → `"4"`.

#### Case 2 — Catch-all

| Field | Value |
|---|---|
| Condition | (always) |
| Emission | `/project/packageManager/version` (no value — `Unresolved` after collapse) |
| Confidence | `medium` |
| On uncertainty | `needs-user-input` |
| Message | `"Could not determine package-manager version (packageManager field absent); please specify."` |

This rule deliberately does NOT try to infer a version from lockfile
headers — `pnpm-lock.yaml`'s `lockfileVersion` is the lockfile-format
version, not the pnpm version, and inferring from format to manager
version is brittle. Better to surface `unresolved` honestly.

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `package.json.packageManager = "pnpm@9.0.0"` → case 1 → `"9"`.
- **Negative:** hypothetical fixture without the `packageManager` field → case 2 → `unresolved`.
- **Test:** `T-DET-001`, `T-DET-004`.

---

## Stage-emission rules

Stage rules read both `ctx.manifests` (per their declared `reads`) AND
`ctx.ir.project` (always — the project-fields pass committed it before
the stage pass began). This is the
[`RuleCtx` widened in the 2026-06-15 amendment](../specs/detector-engine.spec.md#rule-contract)
to the Detector Engine spec; pre-amendment rules saw only manifests.
The catalogue below uses `ctx.ir.project.packageManager.name` etc.
freely in case conditions and emissions.

### DR-007 — Install Stage emission

| Field | Value |
|---|---|
| Reads | `package.json` (presence only) plus in-progress IR: `/project/packageManager/name`, `/project/runtime/version` |
| Target | `/stages/+` with `id="install"` (StageEmission) |

**Cross-cuts [DET-FR-018(b)](../specs/detector-engine.spec.md#functional-requirements)** —
this rule is the obligation referenced there: install MUST fire at
`confidence: high` whenever `project.packageManager.name` is non-null.

#### Case 1 — pnpm

| Field | Value |
|---|---|
| Condition | `project.packageManager.name === "pnpm"` |
| Emission | Stage with `id="install"`, `name="Install"`, `steps[0] = { id: "install-deps", run: "corepack enable && pnpm install --frozen-lockfile", workingDir: ".", env: {} }`; `container.image` per the [common shape](#stage-rules--common-emission-shape) |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — npm

| Field | Value |
|---|---|
| Condition | `project.packageManager.name === "npm"` |
| Emission | Stage with `steps[0].run = "npm ci"`, otherwise as case 1 |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 3 — yarn

| Field | Value |
|---|---|
| Condition | `project.packageManager.name === "yarn"` |
| Emission | Stage with `steps[0].run = "corepack enable && yarn install --frozen-lockfile"`, otherwise as case 1 |
| Confidence | `high` |
| On uncertainty | `omit` |

There is no catch-all case. When `packageManager.name` is `null`,
DR-007 simply does not fire — and per
[DET-FR-018(a)](../specs/detector-engine.spec.md#functional-requirements)
the Engine then suppresses **every** canonical Stage. The
`/project/packageManager/name` `unresolved` entry (emitted by DR-005
case 7) is the user-actionable signal.

#### Examples

- **Positive (pnpm):** fixture `node-pnpm-nest-basic` → case 1 → install Stage with `"corepack enable && pnpm install --frozen-lockfile"`.
- **Positive (npm):** fixture `node-npm-nest-basic` → case 2 → install Stage with `"npm ci"`.
- **Negative:** hypothetical fixture with PM unresolved → no case fires → DET-FR-018(a) suppresses everything.
- **Test:** `T-DET-001`, `T-DET-016` (DET-FR-018(a) suppression).

---

### DR-008 — Lint Stage emission

| Field | Value |
|---|---|
| Reads | `package.json` (for `scripts.lint`) plus in-progress IR: `/project/packageManager/name`, `/project/runtime/version` |
| Target | `/stages/+` with `id="lint"` (StageEmission) |

#### Case 1 — pnpm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.lint` is a non-empty string AND `project.packageManager.name === "pnpm"` |
| Emission | Stage with `id="lint"`, `name="Lint"`, `steps[0] = { id: "lint", run: "pnpm lint", workingDir: ".", env: {} }`; `container.image` per common shape |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — npm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.lint` is a non-empty string AND `project.packageManager.name === "npm"` |
| Emission | Stage with `steps[0].run = "npm run lint"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 3 — yarn

| Field | Value |
|---|---|
| Condition | `package.json.scripts.lint` is a non-empty string AND `project.packageManager.name === "yarn"` |
| Emission | Stage with `steps[0].run = "yarn lint"` |
| Confidence | `high` |
| On uncertainty | `omit` |

No catch-all. Absence of `scripts.lint` or absence of PM → no emission
(lint Stage is intrinsically optional per
[Engine Decision 5](../specs/detector-engine.spec.md#decision-5--stage-emission-policy)).

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `scripts.lint = "eslint \"src/**/*.ts\""`, PM = pnpm → case 1 → `"pnpm lint"`.
- **Negative:** hypothetical fixture without `scripts.lint` → no case fires → no lint Stage in IR.
- **Test:** `T-DET-001`, `T-DET-010` (lint present, test absent).

---

### DR-009 — Test Stage emission

| Field | Value |
|---|---|
| Reads | `package.json` (for `scripts.test`) plus in-progress IR: `/project/packageManager/name`, `/project/runtime/version` |
| Target | `/stages/+` with `id="test"` (StageEmission) |

#### Case 1 — pnpm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.test` is a non-empty string AND `project.packageManager.name === "pnpm"` |
| Emission | Stage with `id="test"`, `name="Test"`, `steps[0] = { id: "test", run: "pnpm test", workingDir: ".", env: {} }` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — npm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.test` is a non-empty string AND `project.packageManager.name === "npm"` |
| Emission | Stage with `steps[0].run = "npm test"` |
| Confidence | `high` |
| On uncertainty | `omit` |

`npm test` is npm's special alias for `npm run test`; both `npm test`
and `npm run test` work, but the canonical form is `npm test`.

#### Case 3 — yarn

| Field | Value |
|---|---|
| Condition | `package.json.scripts.test` is a non-empty string AND `project.packageManager.name === "yarn"` |
| Emission | Stage with `steps[0].run = "yarn test"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `scripts.test = "jest"`, PM = pnpm → case 1 → `"pnpm test"`.
- **Negative:** hypothetical fixture `node-pnpm-no-tests/` with no `scripts.test` → no case fires → no test Stage.
- **Test:** `T-DET-001`, `T-DET-010`.

---

### DR-010 — Build Stage emission

| Field | Value |
|---|---|
| Reads | `package.json` (for `scripts.build`) plus in-progress IR: `/project/packageManager/name`, `/project/runtime/version` |
| Target | `/stages/+` with `id="build"` (StageEmission) |

#### Case 1 — pnpm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.build` is a non-empty string AND `project.packageManager.name === "pnpm"` |
| Emission | Stage with `id="build"`, `name="Build"`, `steps[0] = { id: "build", run: "pnpm build", workingDir: ".", env: {} }` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Case 2 — npm

| Field | Value |
|---|---|
| Condition | `package.json.scripts.build` is a non-empty string AND `project.packageManager.name === "npm"` |
| Emission | Stage with `steps[0].run = "npm run build"` |
| Confidence | `high` |
| On uncertainty | `omit` |

npm does **not** alias `npm build`; the canonical form is
`npm run build`.

#### Case 3 — yarn

| Field | Value |
|---|---|
| Condition | `package.json.scripts.build` is a non-empty string AND `project.packageManager.name === "yarn"` |
| Emission | Stage with `steps[0].run = "yarn build"` |
| Confidence | `high` |
| On uncertainty | `omit` |

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` — `scripts.build = "nest build"`, PM = pnpm → case 1 → `"pnpm build"`.
- **Negative:** fixture `node-pnpm-nest-basic-no-build` (no `build` Stage in expected IR) → no case fires → no build Stage.
- **Test:** `T-DET-001`, `T-DOCKER-001` (downstream byte-equality), `T-DOCKER-008` (no-build header variant).

---

### DR-011 — Docker Build Stage emission

| Field | Value |
|---|---|
| Reads | (none from manifests directly) plus in-progress IR: `/project/name`, `/project/packageManager/name`, `/project/runtime/name` |
| Target | `/stages/+` with `id="docker-build"` (StageEmission) |

#### Case 1 — Always when PM and runtime are known

| Field | Value |
|---|---|
| Condition | `project.runtime.name === "node"` AND `project.packageManager.name` is non-null AND `project.name` is non-empty |
| Emission | Stage with `id="docker-build"`, `name="Docker Build"`, `container.image = "docker:25"`, `steps[0] = { id: "docker-build", run: "docker build -t " + project.name + ":ci .", workingDir: ".", env: {} }` |
| Confidence | `high` |
| On uncertainty | `omit` |

**Why PM also.** The docker-build Stage runs `docker build .`, which
consumes the Generator-produced Dockerfile (per
[Engine Decision 5's docker-build note](../specs/detector-engine.spec.md#decision-5--stage-emission-policy)).
The Dockerfile Generator derives its install line from
`project.packageManager.name`
([DOCKER-FR-006](../specs/dockerfile-generator.spec.md#functional-requirements));
without PM, no Dockerfile is producible, so emitting the
`docker-build` Stage would be incoherent. This is the chain
reasoning that made the DET-FR-018(a) total suppression necessary.

No catch-all. Absence of PM or runtime → no emission → DET-FR-018(a)
also suppresses the others, yielding `stages: []`.

#### Examples

- **Positive:** fixture `node-pnpm-nest-basic` → case 1 → `"docker build -t node-pnpm-nest-basic:ci ."`.
- **Negative:** hypothetical fixture with `runtime` unresolved → no case fires → no docker-build Stage; DET-FR-018(a) suppresses the rest too.
- **Test:** `T-DET-001`, `T-DET-016` (DET-FR-018(a)).

---

# Fixture cross-check

The 11 rules above were cross-checked against
`test/fixtures/node-pnpm-nest-basic/expected-ir.json`. One discrepancy
was surfaced and resolved per
[DET-AC-001's regression-lock framing](../specs/detector-engine.spec.md#acceptance-criteria):

- **`triggers` field was a fixture guess.** The hand-written
  `expected-ir.json` carried
  `triggers: [{ kind: "on-push", branches: ["main"] }]`, but **no DR-NNN
  emits triggers**, and per
  [DET-FR-014](../specs/detector-engine.spec.md#functional-requirements)
  the Engine MUST NOT inject a default. The fixture has been revised
  to omit the `triggers` field; the GHA Generator's neutral default
  will supply `on-push/main` at consumption time per IR-FR-012. All
  six existing fixture IRs received the same revision. The IR
  validator (`triggers` optional) and Dockerfile Generator (doesn't
  read `triggers`) remain unaffected.

Every other field in the canonical `node-pnpm-nest-basic` IR matches
exactly one DR-NNN case at `confidence: high` (no `unresolved` entries).
The corresponding fixture project sources (`package.json`,
`pnpm-lock.yaml`, `nest-cli.json`, `tsconfig.json`, source files) land
with the Detector Engine implementation in the follow-up commit.

## Open questions

- **OQ-DR-001.** Should `extractMajor` preserve the full semver
  (`"20.10.0"` instead of `"20"`)? Major-only is simpler and the
  Dockerfile Generator's base image needs only the major; full semver
  would let the Executor pin tighter. Deferred to an IR v0.2 that
  adds a `runtime.versionFull` field.
- **OQ-DR-002.** Should DR-005 admit a lockfile-header heuristic
  (`pnpm-lock.yaml` `lockfileVersion 9.0` → `packageManager.version: "9"`
  at `assume-default` medium confidence)? Currently DR-006 deliberately
  declines. Reconsider once a fixture without the `packageManager`
  field needs the version.

## Changelog

| Date | Change |
|---|---|
| 2026-06-15 | Initial DR-NNN catalogue. 11 rules covering project fields (DR-001…006) and Stage emissions (DR-007…011) for v1 Node + pnpm/npm/yarn. Model parameters filled in (manifest-content / omit-default / static-per-case). Cross-check against `node-pnpm-nest-basic/expected-ir.json` surfaced one fixture revision: the hand-written `triggers` field was removed (no DR emits it; the Engine doesn't inject; Generators supply their neutral default). |
| 2026-06-15 | Pre-Accepted review fixes (still Draft). (1) Catalogue authoring exposed a Rule-contract gap — stage rules read committed `/project/*` state, but the Accepted Engine spec's `Case.condition: (m: Manifests) => boolean` exposed manifests only. Engine spec amended in place (stays Accepted, changelog-recorded): `Case` now takes `RuleCtx = { manifests; ir: Readonly<PartialPipelineIR> }`; DET-FR-015 widened; pass-ordering guarantee promoted to normative; new DET-AC-019. This catalogue's Stage-emission rules section now explicitly references the new ctx contract. (2) DR-002 case 2 flipped from `high`/`omit` to `medium`/`assume-default` with default `"javascript"`; "Node without tsconfig → JavaScript" is an inference, not an observation. OQ-DR-003 resolved and removed. (3) DR-005 Examples gained `node-yarn-npm-both-lockfiles` positive case to test-lock yarn > npm precedence, plus a declared-overrides-lockfile negative. (4) Common Stage shape: added a coherence note explaining that `container.image = "node:lts-alpine"` (assume-default) coexists with `/project/runtime/version: null + unresolved` because they are distinct IR fields. |
| 2026-06-15 | **Accepted** 2026-06-15 after review; four items (Rule contract amendment via engine-spec changelog, DR-002 assume-default, yarn>npm precedence example, container.image / runtime.version coherence note) all folded in. Engine spec's DET-FR-003 also tied off with explicit `emit` purity. Implementation MAY begin. |
| 2026-09-13 | Amendment (stays Accepted), from adversarial review finding **UX-01b**: DR-004 read only `engines.node`, so the very common "Node project pinned with `.nvmrc` or Volta" shape detected to `runtime.version: null` and was permanently ungeneratable and unrunnable — invisible to the suite because all 11 fixtures declared `engines.node`. DR-004 now has five cases: `engines.node`, `volta.node`, `.nvmrc`, `.node-version`, then the catch-all. The manifest set gains `.nvmrc` and `.node-version`, read as plain text (first non-blank, non-`#` line) and listed in `NON_QUALIFYING_MANIFESTS` so they are evidence without qualifying a folder as a project. New helper `majorFromVersionText` is stricter than `extractMajor` and returns `null` for nvm aliases (`lts/hydrogen`, `node`, `stable`), which therefore stay unresolved rather than becoming an unpullable `node:lts/hydrogen-alpine` tag. Evidence order and the alias policy are recorded in [ADR-0011](../adr/0011-runtime-version-evidence-order.md); the change is additive, so no previously detected version changes. Covered by `T-DET-020` (DET-AC-020). |
