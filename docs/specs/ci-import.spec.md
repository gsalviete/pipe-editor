# CI Import Specification

| Field | Value |
|---|---|
| Component | `CI-IMPORT` |
| Status | Implemented |
| Written on | 2026-09-13 |
| Authored | **Retroactively** — see [Provenance](#provenance) |
| Architecture | [`ADR-0003`](../adr/0003-ir-as-single-source-of-truth.md), [`ADR-0014`](../adr/0014-imported-run-blocks-stay-scripts.md) |

## Provenance

This spec is **retroactive**. `backend/src/modules/ci-import/` — two
importers plus shared inference — shipped with no spec at all, which the
adversarial review recorded as **SDD-01**. See the corresponding section of
[`ci-export.spec.md`](./ci-export.spec.md#provenance) for why that matters
and what writing the spec afterwards does and does not buy.

## Objective

Turn an existing GitHub Actions workflow or GitLab CI configuration into a
Pipeline IR that **validates**, **preserves the meaning of the commands it
found**, and **says clearly what it could not preserve**.

The importer's product promise is "turn your existing CI file into an
editable pipeline". A silent mistranslation is therefore worse here than a
refusal: the user believes they are looking at their pipeline.

## Local definitions

- **Evidence:** everything the config leaks about the project — command
  text, container images, `setup-node` version hints, the workflow name.
- **Inference:** reconstructing the IR's `project` block from evidence,
  since a CI file states almost nothing about the project directly.
- **Provenance warning:** a warning saying a fact was *inferred* rather
  than read.

## Functional requirements

- **CIIMPORT-FR-001 — Entry point.** `importCiConfig(content, provider)`
  with `provider` in `{ 'github-actions', 'gitlab-ci', 'auto' }` returns
  `{ ir, warnings, provider }`. The IR MUST satisfy `validate()`.

- **CIIMPORT-FR-002 — Detection is structural.** For `auto`, the provider
  MUST be decided on the **parsed document**, not by matching regexes
  against the raw text. The importer parses anyway, so this costs nothing
  and lets the check ask questions that actually distinguish the formats:
  a `jobs` mapping whose values carry `runs-on`/`steps`/`uses`/`container`
  is GitHub Actions; a top-level `stages` array or any top-level mapping
  carrying `script`/`before_script`/`extends` is GitLab. A document
  carrying `apiVersion`/`kind` (Kubernetes), `pool`/`trigger`/`pr` (Azure
  Pipelines), or Compose-shaped `services` MUST be refused outright rather
  than fed to a converter that fails later with a message about the wrong
  thing.

- **CIIMPORT-FR-003 — A `run:` block is a script, not a command list.** A
  multi-line `run` MUST be imported as ONE step preserving its newlines.
  It MUST NOT be flattened by joining lines with ` && ` — see
  [ADR-0014](../adr/0014-imported-run-blocks-stay-scripts.md).

- **CIIMPORT-FR-004 — Scripts are flagged.** When an imported multi-line
  block contains shell comments or control flow (`if`, `for`, `while`,
  `case`, `until`, `function`, a heredoc), the importer MUST warn that the
  step is a script preserved verbatim and should be edited as a whole.

- **CIIMPORT-FR-005 — Job order.** GitHub jobs are ordered topologically by
  `needs` (a cycle is an error); the importer warns when the graph is not
  linear, because the IR is linear in v1
  ([ADR-0007](../adr/0007-linear-pipeline-topology-v1.md)). GitLab jobs are
  ordered by the `stages:` list then declaration order, with a warning when
  several jobs share one GitLab stage, since linearizing them changes the
  pipeline's concurrency.

- **CIIMPORT-FR-006 — Actions with no local equivalent.** `actions/checkout`
  is dropped silently (it is implied locally). `actions/setup-node` is
  dropped but its `node-version` becomes runtime evidence. Every other
  `uses:` is skipped **with a warning naming it**. `strategy`/matrix is
  warned about and ignored.

- **CIIMPORT-FR-007 — Env cascades, and every step owns its object.**
  Workflow-level, job-level and step-level `env`/`variables` merge in that
  order of increasing precedence. Each step MUST receive its **own** object:
  sharing one reference across a job's steps means a later per-step edit
  silently changes all of them.

- **CIIMPORT-FR-008 — Package-manager inference prefers the install
  command.** Inference MUST first look for an actual install invocation
  (`npm|pnpm|yarn` followed by `ci|install|i|add`, anchored at the start of
  a command or after a shell separator). Only when that is absent or
  ambiguous may it fall back to scanning all command text, and that
  fallback MUST be flagged as a guess. The package manager drives the
  install command, the lockfile the Dockerfile copies and the corepack
  prefix, so a wrong answer propagates a long way.

- **CIIMPORT-FR-009 — Inferred facts are reported.** Every reconstructed
  `project` field MUST produce a warning saying it was inferred and from
  what. A CI file states very little about a project directly; presenting
  reconstruction as observation is the dishonesty this requirement exists
  to prevent.

- **CIIMPORT-FR-010 — What cannot be inferred becomes unresolved.** Any
  required-nullable field the evidence does not settle MUST be emitted as
  `null` with a paired `unresolved` entry, so the imported IR always
  validates and the editor can resolve it (EDITOR-UI-FR-018).

- **CIIMPORT-FR-011 — Jobs without an image.** A job that names no container
  image gets `node:20-alpine` **with a warning**, because a VM runner has no
  equivalent locally.

- **CIIMPORT-FR-012 — Bounded input.** Imported text is bounded at 512 KiB,
  byte-accurate.

- **CIIMPORT-FR-013 — Merging with detected facts.**
  `mergeDetectedProjectFacts()` lets the detector fill gaps a CI file could
  not express, and rebuilds the `unresolved` list accordingly, so a CI file
  imported from inside a workspace project is immediately runnable. It is
  used only by `/api/import/from-project`.

## Non-functional requirements

- **CIIMPORT-NFR-001 — An imported IR is untrusted.** Nothing here vouches
  for what the commands do. `validate()` certifies shape only; the trust
  boundary is EDITOR-UI-FR-019's command review.
- **CIIMPORT-NFR-002 — Pure.** Parsing and conversion touch no filesystem
  and no network. Reading the file is the controller's job.
- **CIIMPORT-NFR-003 — Lossy, and loud about it.** The IR is deliberately
  narrower than either provider's format. Everything dropped produces a
  warning; nothing is dropped silently.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| **CIIMPORT-AC-001** | A representative GitHub Actions workflow imports to a valid IR with one Stage per job in `needs` order and one Step per `run`. | T-CIIMPORT-001 (`import.spec.ts`) |
| **CIIMPORT-AC-002** | A representative GitLab CI config imports to a valid IR with one Stage per job in `stages:` order, merging `default.before_script`, job `before_script` and `script`. | T-CIIMPORT-002 (`import.spec.ts`) |
| **CIIMPORT-AC-003** | A multi-line `run: \|` block containing `# install dependencies`, `npm ci` and `npm run build` imports as ONE step whose text is those three lines separated by newlines. It contains no ` && `. | T-IMP-101 (`adversarial.spec.ts`) |
| **CIIMPORT-AC-004** | A block containing comments or control flow produces a warning naming what it contains; an ordinary single-line command produces none. | T-IMP-101 (`adversarial.spec.ts`) |
| **CIIMPORT-AC-005** | Each step of a GitLab job receives its own `env` object: mutating one does not affect its sibling. | T-IMP-102 (`adversarial.spec.ts`) |
| **CIIMPORT-AC-006** | A workflow that installs with `npm ci` but mentions pnpm elsewhere is classified **npm**, with a warning saying it was read from the install command. A workflow with no install command is classified from loose text with a warning saying it was **guessed**. Two conflicting install commands yield no answer. | T-IMP-103 (`adversarial.spec.ts`) |
| **CIIMPORT-AC-007** | A Kubernetes manifest, an Azure Pipelines file, a Compose file and non-mapping text are each refused by `sniffProvider` and by `importCiConfig(…, 'auto')` with a "could not recognize" error — not converted. Real GitHub and GitLab files, including a GitLab file with no top-level `stages`, are still recognized. | T-IMP-104 (`adversarial.spec.ts`) |
| **CIIMPORT-AC-008** | An action with no local equivalent is skipped with a warning naming it; `actions/checkout` is dropped silently; `actions/setup-node`'s `node-version` reaches runtime inference. | T-CIIMPORT-008 (`import.spec.ts`) |
| **CIIMPORT-AC-009** | A field the evidence cannot settle is `null` with a paired `unresolved` entry, and the resulting IR passes `validate()`. | T-CIIMPORT-009 (`import.spec.ts`) |
| **CIIMPORT-AC-010** | Import over 512 KiB is refused, measured in bytes. | T-CIIMPORT-010 (`import.controller.spec.ts`) |

## Testing approach

`ci-import/import.spec.ts` covers the happy paths and the lossy-but-loud
behaviours; `ci-import/adversarial.spec.ts` covers the four defects the
adversarial review found; `editor-api/import.controller.spec.ts` covers the
wire contract and the size bound.

## Changelog

| Date | Change |
|---|---|
| 2026-09-13 | Retroactive spec written from the shipped code (adversarial review **SDD-01**). Authoring it turned four loose behaviours into stated contracts, each fixed in the same session: **IMP-01** — multi-line `run` blocks were flattened with ` && `, which commented out the whole block whenever a line started with `#`, and could not express a loop at all (now FR-003/FR-004 and [ADR-0014](../adr/0014-imported-run-blocks-stay-scripts.md)); **IMP-02** — one `env` object was shared across a job's steps (now FR-007); **IMP-03** — the package manager was taken from the first mention of `pnpm`/`yarn`/`npm` anywhere in the text, so a workflow running `npm ci` that mentioned pnpm in a cache key was classified pnpm (now FR-008), and no inferred fact was reported as inferred at all (now FR-009); **IMP-04** — provider detection matched regexes against raw text and would hand a Kubernetes manifest to a converter (now FR-002). |
