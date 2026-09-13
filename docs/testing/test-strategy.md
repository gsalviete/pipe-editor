# Test Strategy

| Field | Value |
|---|---|
| Status | Accepted (living document) |
| Last updated | 2026-09-13 |

## Principle

Every spec ends in tests. Every acceptance criterion (`<COMP>-AC-NNN`) maps to at
least one test case (`T-<COMP>-NNN`). If a criterion has no test, the spec is not
"Done." This mapping is what turns "spec-driven" into "verifiable."

## Test levels

| Level | What it covers | Example |
|---|---|---|
| **Unit** | Isolated logic. | A single Detection Rule fires (and does not fire) correctly; IR serialization round-trips. |
| **Golden file** | Generators: produced artifact vs a checked-in expected file. | The Dockerfile Generator's output for a fixture matches `expected.Dockerfile`. |
| **Integration** | Detector reads a fixture and produces the expected IR. | `node-pnpm-basic/` → expected IR document. |
| **Executor harness** | The Executor runs an IR's Steps in containers and reports the right per-block status. | A fixture with a failing test produces a red Test block. |

## Fixtures

- Location: `test/fixtures/<scenario>/`
- Naming convention: `<language>-<package-manager>-<variation>/`
  (e.g. `node-pnpm-basic/`, `node-npm-no-tests/`).
- Each fixture documents its expected output (expected IR and/or expected
  artifacts) next to it, so the fixture is self-describing.

## Golden files

- Location: alongside the fixture, or under `test/golden/`.
- Update policy: regenerate **deliberately** and review the diff in the pull
  request. Never update golden files blindly — an unexpected diff is a signal, not
  a chore.

## Traceability

A living table maps requirements/criteria to test cases. Gaps in this table are
the project's outstanding work. Each spec maintains its own slice of this table in
its Acceptance Criteria section; this is the consolidated view.

| Criterion | Test | Status |
|---|---|---|
| IR-AC-001 | T-IR-001 (`validate.spec.ts` — top-level shape) | ✅ |
| IR-AC-002 | T-IR-002 (`roundtrip.spec.ts` — JSON + YAML round-trip) | ✅ |
| IR-AC-003 | T-IR-003 (`validate.spec.ts` — forbidden provider-specific keys) | ✅ |
| IR-AC-004 | T-IR-004 (`canonical.spec.ts` — topological canonical order) | ✅ |
| IR-AC-005 | T-IR-005 (`validate.spec.ts` — detector emits one paired unresolved entry); also T-DET-003 | ✅ |
| IR-AC-006 | T-IR-006 (`validate.spec.ts` — omit commits nothing, no unresolved entry); also T-DET-003 | ✅ |
| IR-AC-007 | T-IR-007 (`validate.spec.ts` — 6 linear-chain clauses + missing-dependsOn) | ✅ |
| IR-AC-008 | T-IR-008 (`canonical.spec.ts` — determinism modulo generatedAt) | ✅ |
| IR-AC-009 | T-IR-009 (`validate.spec.ts` — empty stages array validates) | ✅ |
| IR-AC-010 | T-IR-010 (`canonical.spec.ts` — byte-identical canonical JSON) | ✅ |
| IR-AC-011 | T-IR-011 (`canonical.spec.ts` — `enabled:false` survives canonicalization) + T-EXEC-004/005 (executor reports it `skipped:disabled`) + T-DOCKER-002/011 (Dockerfile takes the "disabled" single-stage variant) + `export.spec.ts` (both CI exporters omit it via the effective chain) + T-EDITOR-014/019 (editor round-trips it) | ✅ |
| IR-AC-012 | T-IR-012 (`validate.spec.ts` — out-of-set read rejected as rule defect); also T-DET-002 | ✅ |
| IR-AC-013 | T-IR-013 (`validate.spec.ts` — medium commits nothing, high commits); also T-DET-003 | ✅ |
| IR-AC-014 | T-IR-014 (`validate.spec.ts` — monorepo rootPath is the pointed-at folder); also T-DET-012 | ✅ |
| IR-AC-015 | T-IR-015 (`effective-chain.spec.ts` — splice + 5 edge cases) | ✅ |
| IR-AC-016 | T-IR-016 (`validate.spec.ts` — all 5 required nullable fields) | ✅ |
| IR-AC-017 | T-IR-017 (`validate.spec.ts` — empty stages vacuously passes chain rule) | ✅ |
| IR-AC-018 | T-IR-018 (`validate.spec.ts` — unresolved coexisting with value fails) | ✅ |
| IR-AC-019 | T-IR-019 (`project-fields.spec.ts` — atomic resolve, invariant holds after each commit, rejection returns the input unchanged) | ✅ |
| IR-AC-020 | T-IR-020 (`security.spec.ts` — 7 valid references accepted, 9 hostile ones rejected including a leading `-`) | ✅ |
| IR-AC-021 | T-IR-021 (`security.spec.ts` — env keys with `:`, leading `-`, leading digit, newline, and non-string values rejected) | ✅ |
| IR-AC-022 | T-IR-022 (`security.spec.ts` — a 200 000-deep document is a validation error, not a stack overflow; canonical helpers bounded too) | ✅ |
| DOCKER-AC-001 | T-DOCKER-001 (`generate.spec.ts` — pnpm multi-stage golden) | ✅ |
| DOCKER-AC-002 | T-DOCKER-002 (`generate.spec.ts` — build disabled → "disabled" single-stage golden) | ✅ |
| DOCKER-AC-003 | T-DOCKER-003 (`generate.spec.ts` — no `:latest` in any fixture) | ✅ |
| DOCKER-AC-004 | T-DOCKER-004 (`generate.spec.ts` — determinism modulo `generatedAt`) | ✅ |
| DOCKER-AC-005 | T-DOCKER-005 (`generate.spec.ts` — unsupported runtime "python" throws with field path + supported set) | ✅ |
| DOCKER-AC-006 | upgraded by T-DET-008 — real `docker build .` against the Detector-produced IR against the NestJS fixture (the loop closes) | ✅ |
| DOCKER-AC-007 | T-DOCKER-007 (`generate.spec.ts` — npm and yarn goldens; `.dockerignore` byte-identical across all three PMs; install-line table verified per PM) | ✅ |
| DOCKER-AC-008 | T-DOCKER-008 (`generate.spec.ts` — no build Stage → "not declared" golden) | ✅ |
| DOCKER-AC-009 | T-DOCKER-009 (`generate.spec.ts` — monorepo-shaped IR behaves as AC-008; caller rejection is out of Generator scope) | ✅ |
| DOCKER-AC-010 | T-DOCKER-010 (`generate.spec.ts` — output not a live IR reference) | ✅ |
| DOCKER-AC-011 | T-DOCKER-011 (`generate.spec.ts` — behavioral toggle test: flipping `build.enabled` between calls flips output) | ✅ |
| DOCKER-AC-012 | T-DOCKER-012 (`generate.spec.ts` — build with zero steps → "zero steps" golden) | ✅ |
| DOCKER-AC-013 | T-DOCKER-013 (`generate.spec.ts` — all stages disabled → variant 1 "disabled" golden; amendment surfaced by EDITOR's `/api/generate`) | ✅ |
| EXEC-AC-001 | T-EXEC-001 (`execute.pure.spec.ts` — invalid IR rejected, no containers started) | ✅ |
| EXEC-AC-002 | T-EXEC-002 (`execute.pure.spec.ts` — PM-null resolves unrunnable with the field cited) | ✅ |
| EXEC-AC-003 | T-EXEC-003 (`execute.pure.spec.ts` — runtime-version-null resolves unrunnable) | ✅ |
| EXEC-AC-004 | T-EXEC-004 (`execute.pure.spec.ts` — all-disabled chain is unrunnable, every stage reported skipped:disabled) | ✅ |
| EXEC-AC-005 | T-EXEC-005 (`execute.pure.spec.ts` — disabled stages always surface; aggregate driven by the rest) | ✅ |
| EXEC-AC-006 | T-EXEC-006 (`execute.docker.spec.ts` — stage runs in a fresh container, /workspace mounted, container removed) | ✅ |
| EXEC-AC-007 | T-EXEC-007 (`execute.docker.spec.ts` — no --network=host, no --privileged, no docker socket) | ✅ |
| EXEC-AC-008 | T-EXEC-008 (`execute.docker.spec.ts` — host env does not leak; constructed base env and step env do appear) | ✅ |
| EXEC-AC-009 | T-EXEC-009 (`execute.docker.spec.ts` — host projectPath byte-identical after the run) | ✅ |
| EXEC-AC-010 | T-EXEC-010 (`execute.docker.spec.ts` — docker-build reported skipped:docker-build-delegated, no container) | ✅ |
| EXEC-AC-011 | T-EXEC-011 (`execute.docker.spec.ts` — headline slice — install/lint/test/build pass in real containers) | ✅ |
| EXEC-AC-012 | T-EXEC-012 (`execute.docker.spec.ts` — failing test stage stops the chain; downstream skipped:dependency-failed) | ✅ |
| EXEC-AC-013 | T-EXEC-013 (`execute.docker.spec.ts` — abort mid-run leaves no containers; aggregate aborted) | ✅ |
| EXEC-AC-014 | T-EXEC-014 (`execute.docker.spec.ts` — unpullable image fails with the docker diagnostic in stderr) | ✅ |
| EXEC-AC-015 | T-EXEC-015 (`execute.pure.spec.ts` — two runs on unchanged input agree on status and exitCode) | ✅ |
| EXEC-AC-016 | T-EXEC-016 (`execute.docker.spec.ts` — exclusions apply once at copy time; build output reaches later stages) | ✅ |
| EXEC-AC-017 | T-EXEC-017 (`execute.docker.spec.ts` — absent upstream fails honestly with the real missing-deps diagnostic) | ✅ |
| DET-AC-001 | T-DET-001 (regression-lock against `expected-ir.json` modulo rootPath + generatedAt) | ✅ |
| DET-AC-002 | T-DET-002 (manifest-set frontier audit at construction) | ✅ |
| DET-AC-003 | T-DET-003 × 4 (all four IR-FR-009 truth-table rows on synthetic rules) | ✅ |
| DET-AC-004 | T-DET-004 (required-field collapse synthesizes non-empty message) | ✅ |
| DET-AC-005 | T-DET-005 (two `detect()` runs deterministic modulo `generatedAt`) | ✅ |
| DET-AC-006 | T-DET-006 (Stage and Step IDs from `detect()` match the fixture) | ✅ |
| DET-AC-007 | T-DET-007 (produced IR has zero ValidationErrors) | ✅ |
| DET-AC-008 | T-DET-008 (real `docker build` against the NestJS fixture succeeds) | ✅ |
| DET-AC-009 | T-DET-009 (no scripts → `install + docker-build` only) | ✅ |
| DET-AC-010 | T-DET-010 (lint present, test absent → `install → lint → build → docker-build`) | ✅ |
| DET-AC-011 | T-DET-011 × 2 (pnpm > npm + yarn > npm precedence) | ✅ |
| DET-AC-012 | T-DET-012 (monorepo: rootPath at top-level only) | ✅ |
| DET-AC-013 | T-DET-013 (case order honored; first match wins) | ✅ |
| DET-AC-014 | T-DET-014 × 2 (non-canonical Stage id rejected + cross-rule conflict thrown) | ✅ |
| DET-AC-015 | T-DET-015 (undeclared manifest read returns `undefined`) | ✅ |
| DET-AC-016 | T-DET-016 (PM-null → `stages: []`, all canonical Stages suppressed) | ✅ |
| DET-AC-017 | T-DET-017 × 2 (`package.json` hard-throw; `tsconfig.json` warn-and-continue) | ✅ |
| DET-AC-018 | T-DET-018 (orphan command-Stage drop, `docker-build` preserved) | ✅ |
| DET-AC-019 | T-DET-019 (stage rule reads `ctx.ir.project.runtime.version` per pass-ordering guarantee) | ✅ |
| DET-AC-020 | T-DET-020 (`dr-004-runtime-version.spec.ts` — engines/volta/.nvmrc/.node-version order, alias rejection, image propagation, lone version file is not a manifest) | ✅ |
| EDITOR-AC-001 | T-EDITOR-001 (`workspace-root.spec.ts` — refusal on unset/invalid `PIPE_EDITOR_WORKSPACE_ROOT`) | ✅ |
| EDITOR-AC-002 | T-EDITOR-002 (`detect.controller.spec.ts` — fixture regression-lock through HTTP) | ✅ |
| EDITOR-AC-003 | T-EDITOR-003 (`path-security.spec.ts` + HTTP: contained/display-root absolute accepted; outside absolute → 403) | ✅ |
| EDITOR-AC-004 | T-EDITOR-004 (`..` escape → 403) | ✅ |
| EDITOR-AC-005 | T-EDITOR-005 (NUL byte → 400 INVALID_PROJECT_PATH) | ✅ |
| EDITOR-AC-006 | T-EDITOR-006 (symlink escape → 403 PATH_OUTSIDE_WORKSPACE) | ✅ |
| EDITOR-AC-007 | T-EDITOR-007 (`bind-address.spec.ts` — listener bound to 127.0.0.1) | ✅ |
| EDITOR-AC-008 | T-EDITOR-008 (empty directory → 422 NO_MANIFEST) | ✅ |
| EDITOR-AC-009 | T-EDITOR-009 (malformed package.json → 422 MALFORMED_PACKAGE_JSON + diagnostic) | ✅ |
| EDITOR-AC-010 | T-EDITOR-010 (malformed tsconfig.json → 200 with warning in response) | ✅ |
| EDITOR-AC-011 | T-EDITOR-011 (two detects → IRs equal modulo `metadata.generatedAt`) | ✅ |
| EDITOR-AC-012 | T-EDITOR-012 (`Editor.spec.tsx` — folder input/browser + distinct app/workspace actions, no chain) | ✅ |
| EDITOR-AC-013 | T-EDITOR-013 (every Stage rendered, regardless of enabled) | ✅ |
| EDITOR-AC-014 | T-EDITOR-014 (toggle flips enabled; `stage-node--disabled` class applied) | ✅ |
| EDITOR-AC-015 | T-EDITOR-015 (effective chain reflects `computeEffectiveChain` after lint toggle) | ✅ |
| EDITOR-AC-016 | T-EDITOR-016 (re-enable restores Stage to effective chain) | ✅ |
| EDITOR-AC-017 | T-EDITOR-017 (every unresolved entry rendered with field + message) | ✅ |
| EDITOR-AC-018 | T-EDITOR-018 (warnings rendered as non-blocking notice; chain still renders) | ✅ |
| EDITOR-AC-019 | T-EDITOR-019 (Export JSON = `serializeCanonical(workingIR)`, differs from loadedIR's) | ✅ |
| EDITOR-AC-020 | T-EDITOR-020 (Export YAML round-trips via `yaml.load()` to `canonicalEquals` IR) | ✅ |
| EDITOR-AC-021 | T-EDITOR-021 (connector active states match `computeEffectiveChain(workingIR)`) | ✅ |
| EDITOR-AC-022 | ~~T-EDITOR-022 (no add/delete/reorder/run-edit affordances present)~~ — **superseded 2026-09-13 by EDITOR-AC-043.** The criterion asserted the opposite of its own test and this row reported it ✅. See the visual-editor spec changelog. | ⊘ |
| EDITOR-AC-043 | T-EDITOR-022 (add/delete/step-edit present, no reorder) + T-EDITOR-043 (`editable-surface.spec.ts` — chain stays linear and ids stay unique across every edit sequence) | ✅ |
| EDITOR-AC-023 | T-EDITOR-023 (empty stages + PM-name unresolved → `unresolved-prompt--primary` on PM-name only) | ✅ |
| EDITOR-AC-024 | T-EDITOR-024 (Loaded IR snapshot unchanged after toggling Stage.enabled) | ✅ |
| EDITOR-AC-025 | T-EDITOR-025 + T-EDITOR-025b (`projectPath` "." resolving to workspace root itself is ALLOWED) | ✅ |
| EDITOR-AC-026 | T-EDITOR-026 (`/api/generate` happy path: byte-equal Dockerfile + dockerignore goldens) | ✅ |
| EDITOR-AC-027 | T-EDITOR-027 (PM-null IR → 422 UNRESOLVED_REQUIRED_FIELD citing `/project/packageManager/name`) | ✅ |
| EDITOR-AC-028 | T-EDITOR-028 (synthetic `stages: []` IR with PM resolved → 200 single-stage "not declared"; v1-unreachable but contract-defined) | ✅ |
| EDITOR-AC-029 | T-EDITOR-029 (all stages disabled → 200 single-stage "disabled"; collapses to variant 1, see DOCKER-AC-013) | ✅ |
| EDITOR-AC-030 | T-EDITOR-030 (`/api/generate` is read-only; no new Dockerfile/dockerignore files appear on disk during a call) | ✅ |
| EDITOR-AC-031 | T-EDITOR-031 + T-EDITOR-031b + T-EDITOR-031c (invalid IR / missing `ir` / extra fields → 400 INVALID_IR) | ✅ |
| EDITOR-AC-032 | T-EDITOR-032 (unsupported runtime "python" → 422 UNSUPPORTED_RUNTIME) | ✅ |
| EDITOR-AC-033 | T-EDITOR-033 (detect→generate split: PM-null IR yields 200 from detect, 422 from generate on same IR) | ✅ |
| EDITOR-AC-034 | T-EDITOR-034 (`validate(ir)` is the gate: structural defect → 400 INVALID_IR) | ✅ |
| EDITOR-AC-035 | T-EDITOR-035 + T-EDITOR-035b (effective-chain caption shows spliced order; toggling lint omits it and pairs install→test; empty-chain placeholder when all disabled) | ✅ |
| EDITOR-AC-036 | T-EDITOR-036 (`working-ir.spec.ts` — editor gate delegates to `findUnrunnableReason`; all five required-nullable fields block, in backend probe order) | ✅ |
| EDITOR-AC-037 | T-EDITOR-037 (`Editor.resolve.spec.tsx` — version text input and package-manager select commit and clear the gate) | ✅ |
| EDITOR-AC-038 | T-EDITOR-038 (`Editor.resolve.spec.tsx` — `lts/hydrogen` refused with role=alert, IR untouched) | ✅ |
| EDITOR-AC-039 | T-EDITOR-039 (`Editor.resolve.spec.tsx` — undo restores the unresolved state) | ✅ |
| EDITOR-AC-040 | T-SEC-010 (`Editor.provenance.spec.tsx` — share link lists its commands, does not load, discards cleanly, refuses an invalid document) | ✅ |
| EDITOR-AC-041 | T-SEC-011 (`Editor.provenance.spec.tsx` — no POST /api/execute before acknowledgement; a detected pipeline shows no review step) | ✅ |
| EDITOR-AC-042 | T-SEC-012 (`Editor.provenance.spec.tsx` — imported label present for a link, absent for a detection) | ✅ |
| FLOW-AC-001 | T-FLOW-001 (`unresolved-flow.spec.ts` — `node-npm-no-engines` detect → refuse → resolve → generate → export) | ✅ |
| FLOW-AC-002 | T-FLOW-002 (`unresolved-flow.spec.ts` — `node-pm-field-no-lockfile` detects as pnpm from the field alone) | ✅ |
| FLOW-AC-003 | T-FLOW-003 (`unresolved-flow.spec.ts` — every fixture golden's install command matches its declared package manager) | ✅ |
| PRODUCT-AC-001 | T-EDITOR-012 (`Editor.spec.tsx` — product promise, guided steps, picker entry point) | ✅ |
| PRODUCT-AC-002 | T-PRODUCT-002 (`product-shell.spec.ts` + `FolderPicker.spec.tsx` — desktop rail, mobile stack, standard select/open behavior); 781 px + 390 × 844 visual QA | ✅ |
| PRODUCT-AC-003 | T-PRODUCT-003 (`product-shell.spec.ts` — focus-visible and reduced-motion contracts) | ✅ |
| PRODUCT-AC-004 | T-PRODUCT-004 (`product-shell.spec.ts` — IPv4 proxy target); T-EDITOR-007 (backend bind) | ✅ |
| PRODUCT-AC-005 | Root `pnpm build` and GitHub Actions build gate | ✅ |
| PRODUCT-AC-006 | Frontend suite (48 tests) | ✅ |
| PRODUCT-AC-007 | `project-scan.spec.ts` — external directory symlink ignored | ✅ |
| PRODUCT-AC-008 | `output-buffer.spec.ts`, `run-registry.spec.ts` and bounded browser log state | ✅ |
| PRODUCT-AC-009 | `health.controller.spec.ts`; Compose health-check configuration validation | ✅ |
| PRODUCT-AC-010 | T-PRODUCT-010 (`product-shell.spec.ts` — local favicon, no remote fonts) | ✅ |
| PRODUCT-AC-011 | `import.controller.spec.ts` — UTF-8 and workspace-file byte bounds | ✅ |
| WORKSPACE-AC-001 | T-WORKSPACE-001 (`workspace-bundle.spec.ts`, `workspace.controller.spec.ts` — contained multi-service inspection) | ✅ |
| WORKSPACE-AC-002 | T-WORKSPACE-002 (`workspace.controller.spec.ts` — symlink escape envelope) | ✅ |
| WORKSPACE-AC-003 | T-WORKSPACE-003 (`workspace-bundle.spec.ts` — Vite/NestJS/generic Node classification) | ✅ |
| WORKSPACE-AC-004 | T-WORKSPACE-004 (`workspace-bundle.spec.ts` + HTTP integration — complete root bundle) | ✅ |
| WORKSPACE-AC-005 | T-WORKSPACE-005 (`workspace-bundle.spec.ts` — nginx and Node runtime Dockerfiles) | ✅ |
| WORKSPACE-AC-006 | T-WORKSPACE-006 (`workspace-bundle.spec.ts` — service contexts and unique ports) | ✅ |
| WORKSPACE-AC-007 | T-WORKSPACE-007 (`workspace-bundle.spec.ts` — standalone Compose mode) | ✅ |
| WORKSPACE-AC-008 | T-WORKSPACE-008 (`workspace-bundle.spec.ts` — selected GitHub/GitLab verification and builds) | ✅ |
| WORKSPACE-AC-009 | T-WORKSPACE-009 (`workspace-bundle.spec.ts` — duplicate/unsafe plan rejection) | ✅ |
| WORKSPACE-AC-010 | Full backend (242 tests) and frontend (48 tests) suites | ✅ |
| WORKSPACE-AC-011 | T-WORKSPACE-011 (`Editor.workspace.spec.tsx`, `WorkspaceStudio.spec.tsx` — inspect/edit/select/preview) | ✅ |
| WORKSPACE-AC-012 | T-WORKSPACE-012 (`workspace-bundle.spec.ts`, `WorkspaceStudio.spec.tsx` — existing Compose tracking, collision-free naming and UI notice) | ✅ |

Legend: ✅ covered by passing tests, ◑ partially covered (Detector/Generator/
Executor halves pending), ☐ pending the dependent spec, ⊘ superseded — the
criterion no longer states a requirement and its replacement carries the
coverage.

**A ✅ next to a criterion means the test asserts what the criterion says.**
The 2026-09-13 review found one row where it did not: `EDITOR-AC-022` said
the editor exposed no add/delete/step-edit controls, its test asserted the
opposite, and this table reported ✅. A passing test certifying a false
statement is worse than a gap, because the gap is visible. When a criterion
and its test disagree, the criterion is amended and the row is corrected in
the same change — never the tick alone.

**Vertical slice closed (2026-06-15).** T-DET-008 closes the loop:
`generate(detect(fixture))` produces a Dockerfile + `.dockerignore` that
`docker build .` accepts and builds an actual NestJS image. The MVP's
"thin vertical slice runs end to end" definition-of-done condition (`docs/product/02-mvp-scope.md`)
is met for the analysis → suggestion → generation → buildable artifact
half of the slice. Local execution (Executor spec) is the remaining half.

## Definition of Done (per spec)

- [ ] Every acceptance criterion has a corresponding, passing test.
- [ ] Edge cases are covered.
- [ ] Relevant ADRs are linked from the spec header.
- [ ] The spec status is updated to `Implemented`.

## Dogfooding: the project's own CI

The tool that builds pipelines **must** have its own pipeline running these
tests. This closes the narrative — the project demonstrates its own thesis by
applying it to itself — and is a deliberate portfolio detail.
