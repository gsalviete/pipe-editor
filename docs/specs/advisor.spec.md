# Pipeline Doctor Specification

| Field | Value |
|---|---|
| Component | `ADVISOR` |
| Status | Implemented |
| Written on | 2026-09-13 |
| Authored | **Retroactively** — see [Provenance](#provenance) |
| Architecture | [`ADR-0015`](../adr/0015-advisor-scoring-model.md) |

## Provenance

This spec is **retroactive**. `backend/src/modules/advisor/` shipped with no
spec, which the adversarial review recorded as **SDD-01**. See
[`ci-export.spec.md`](./ci-export.spec.md#provenance).

The Doctor is the component where a missing spec cost the most, because its
output is a **number the user is invited to trust**. Weights, thresholds and
grade bands were chosen in code with no stated rationale, which
[ADR-0015](../adr/0015-advisor-scoring-model.md) now supplies.

## Objective

Read a Pipeline IR and report, without running anything, the ways it departs
from CI practice that the user can act on — each finding carrying a
severity, an explanation of why it matters, and a concrete fix.

## Local definitions

- **Finding:** `{ id, severity, title, detail, fix }`.
- **Severity:** `critical` (the pipeline is unlikely to do its job),
  `warning` (it works but a real guarantee is missing), `info` (worth
  knowing).
- **Diagnosis:** `{ score, grade, findings }`.

## Functional requirements

- **ADVISOR-FR-001 — Pure and total.** `analyzePipeline(ir)` reads only the
  IR. No filesystem, no network, no Docker, no clock. Any IR that satisfies
  `validate()` produces a Diagnosis rather than an error.

- **ADVISOR-FR-002 — Advisory, never blocking.** Nothing consults the score
  to permit or refuse an operation. A grade of D generates and runs exactly
  as a grade of A does. The Doctor's authority is persuasive only; the gates
  are `validate()` and `findUnrunnableReason`.

- **ADVISOR-FR-003 — Finding ids are unique within a Diagnosis.** An id
  identifies one finding about one subject, so it MUST key every dimension
  the finding varies over — a per-step finding keys the stage AND the step.
  Two findings sharing an id are a defect: they duplicate in any keyed
  rendering and they penalise the score twice for what the UI shows once.

- **ADVISOR-FR-004 — Every finding carries a fix.** A finding the user
  cannot act on is noise. `fix` names the concrete change.

- **ADVISOR-FR-005 — The effective chain drives chain-composition checks.**
  Checks about what the pipeline *does* read `computeEffectiveChain(ir)`;
  checks about what the document *contains* (image hygiene, secrets) read
  `ir.stages`, so a disabled Stage's hardcoded secret is still reported.

- **ADVISOR-FR-006 — Scoring.** `score = max(0, 100 − Σ penalty(severity))`
  with penalties critical 25, warning 10, info 3; grades A ≥ 90, B ≥ 70,
  C ≥ 50, else D. Findings are returned ordered critical → warning → info.
  Rationale in [ADR-0015](../adr/0015-advisor-scoring-model.md).

### The checks

- **ADVISOR-FR-007 — Unpinned images** (`critical`). A stage image tagged
  `:latest` or carrying no tag at all.
- **ADVISOR-FR-008 — Floating tags** (`warning`). A tag that moves under
  the user without being `:latest` — `lts`, `current`, `stable` and their
  suffixed variants such as `node:lts-alpine`. This one exists because
  **pipe-editor's own detector emits `node:lts-alpine`** when the runtime
  version is unknown: the most common floating tag the product produces was
  invisible to the product's own reproducibility check.
- **ADVISOR-FR-009 — Runtime drift** (`warning`). A stage image
  `node:<major>` disagreeing with `project.runtime.version`.
- **ADVISOR-FR-010 — Missing install** (`critical`). Command stages in the
  effective chain with no enabled `install` ahead of them.
- **ADVISOR-FR-011 — Missing or disabled tests** (`warning`).
- **ADVISOR-FR-012 — No lint stage** (`info`).
- **ADVISOR-FR-013 — Non-frozen installs** (`warning`), per step: `npm
  install` without `npm ci`, `pnpm install` without `--frozen-lockfile`,
  `yarn install` without `--frozen-lockfile` or `--immutable`.
- **ADVISOR-FR-014 — Secrets in the definition** (`critical`). An env key
  matching `TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY` with a
  non-empty value, in any stage including disabled ones.
- **ADVISOR-FR-015 — `docker-build` without a build** (`warning`) on a
  TypeScript project.
- **ADVISOR-FR-016 — Mega-steps** (`info`). A step chaining four or more
  commands, since a long chain reports one aggregate exit code.
- **ADVISOR-FR-017 — Build-output assumption** (`info`). Emitted whenever
  an effective build stage exists, because the generated Dockerfile copies
  `/app/dist` and the IR carries no build-output directory
  ([ADR-0012](../adr/0012-build-output-directory-stays-an-assumption.md)).
- **ADVISOR-FR-018 — Unresolved fields** (`info`). Reports the count and
  lists the paths.

## Non-functional requirements

- **ADVISOR-NFR-001 — Honest about its own output.** A rule MUST NOT excuse
  something pipe-editor itself generates. FR-008 exists precisely because
  it does not.
- **ADVISOR-NFR-002 — Deterministic.** Same IR, same Diagnosis, including
  finding order.
- **ADVISOR-NFR-003 — Cheap.** Called on every valid edit behind a 350 ms
  debounce; it must stay a pure in-memory pass.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| **ADVISOR-AC-001** | A clean pipeline scores A with no critical findings; each severity deducts its documented penalty and the grade bands apply. | T-ADVISOR-001 (`analyze.spec.ts`) |
| **ADVISOR-AC-002** | `:latest` and untagged images are `critical`. | T-ADVISOR-002 (`analyze.spec.ts`) |
| **ADVISOR-AC-003** | `node:lts-alpine`, `node:lts`, `node:current-alpine` and `node:stable` are flagged as floating (`warning`); `node:20-alpine`, `node:20.11.0-alpine` and `docker:25` are not; `:latest` remains the more severe finding. | T-ADVISOR-102 (`adversarial.spec.ts`) |
| **ADVISOR-AC-004** | A stage with two non-frozen install steps produces two findings with **distinct** ids, and no two findings in any Diagnosis share an id. | T-ADVISOR-101 (`adversarial.spec.ts`) |
| **ADVISOR-AC-005** | A hardcoded secret-looking env value is `critical`, including in a disabled stage. | T-ADVISOR-005 (`analyze.spec.ts`) |
| **ADVISOR-AC-006** | A disabled `test` stage and a missing `test` stage are both `warning`, distinguishable by id. | T-ADVISOR-006 (`analyze.spec.ts`) |
| **ADVISOR-AC-007** | `docker-build` without an enabled build stage on a TypeScript project is `warning`. | T-ADVISOR-007 (`analyze.spec.ts`) |
| **ADVISOR-AC-008** | Findings are ordered critical → warning → info. | T-ADVISOR-008 (`analyze.spec.ts`) |
| **ADVISOR-AC-009** | The build-output assumption is reported when an effective build stage exists, and not when the build stage is absent or disabled. | T-ADVISOR-103 (`adversarial.spec.ts`) |
| **ADVISOR-AC-010** | Every finding carries a non-empty `fix`. | T-ADVISOR-010 (`analyze.spec.ts`) |

## Testing approach

`advisor/analyze.spec.ts` for the rule set and the scoring model;
`advisor/adversarial.spec.ts` for the three findings the review produced.

## Changelog

| Date | Change |
|---|---|
| 2026-09-13 | Retroactive spec written from the shipped code (adversarial review **SDD-01**). Writing it forced three things the code did not have. **ADVISOR-FR-003** (unique finding ids) states an invariant the code violated: `unfrozen-install:${stage.id}` was built per stage but emitted per step, so a stage with two unfrozen install steps produced two findings sharing one id — duplicate keys in the panel, and the score docked twice for what the UI showed once (**UX-05**). **ADVISOR-FR-008** is a new check: `node:lts-alpine` is what this product's own detector emits when the runtime version is unknown, and neither existing image rule saw it — it is not `:latest`, and the drift rule only matched `node:<digits>` (**UX-06**). **ADVISOR-NFR-001** generalises that into a standing rule. **ADVISOR-FR-017** surfaces the `dist/` assumption the Dockerfile generator makes (**GEN-03**). The scoring model, previously five unexplained constants, is argued in [ADR-0015](../adr/0015-advisor-scoring-model.md). |
