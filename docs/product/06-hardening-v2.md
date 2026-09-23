# Hardening v2

| Field | Value |
|---|---|
| Status | Draft |
| Date | 2026-09-22 |
| Sources | [`docs/reports/adversarial-review.md`](../reports/adversarial-review.md) (AR-01 to AR-32, §8 order and closure bar), [`REPORT.md`](../../REPORT.md), [`docs/reports/review-evidence/`](../reports/review-evidence/README.md) |
| Reviewed revision | `fae6a98b` |

## Problem

`REPORT.md` says the project is "hardened", "green on every gate", and that "nothing above blocks the product". The second-pass adversarial review shows those claims are too strong. At the reviewed revision:

- **The filesystem boundary leaks.** A symlinked visibility marker overwrites a host file outside the copy (AR-01). A file symlink exposes a manifest outside the workspace root (AR-02). A FIFO named `package.json` blocks the API process (AR-03).
- **The product can't be delivered.** The frontend production image fails to build (AR-04).
- **Work lands in the wrong project, or on stale state.** A saved pipeline from project A can be restored into project B (AR-05). Rescanning keeps the previous workspace plan (AR-06). "Saved" is shown for writes that never reached disk (AR-07). Undo races autosave (AR-08). Outdated artifacts come back as current (AR-09). Persisted state is trusted without validation (AR-23). Restored imports lose provenance and skip the command review (AR-28).
- **Validation and execution disagree.** Metadata can inject Dockerfile or YAML structure (AR-10). Multi-line scripts become invalid Dockerfile instructions (AR-11). Per-step env and directories are merged away (AR-12). Valid dependency graphs run in the wrong order (AR-13). An empty pipeline reports "passed" (AR-14). YAML alias graphs crash validation (AR-24). Some consumed fields are never validated (AR-30).
- **Exported artifacts are not reliably operational.** Stage IDs overwrite GitLab keywords (AR-15). GitLab ignores trigger branches (AR-16) and relies on a best-effort cache to hand work between jobs (AR-17). Workspace CI drops env, directories and images (AR-18). The Vite Dockerfile demands a lockfile that doesn't exist (AR-19). The Vite port disagrees with nginx (AR-20). CI import silently changes conditions and setup semantics (AR-21) and lets an invented fallback image override explicit evidence (AR-22). Generated services publish on all interfaces (AR-32).
- **Execution has no global bounds or reliable recovery.** Active runs and SSE buffering are unbounded system-wide (AR-25). Abort doesn't confirm container cleanup (AR-26). The run UI can't recover Docker availability or a lost stream (AR-27).
- **The evidence overstates the guarantees.** Registry advisories remain untriaged (AR-29), and tests and status documents are being read as proof of properties they don't exercise (AR-31).

The reproducers in `docs/reports/review-evidence/` show each defect happening today.

## Who it's for

- **The local single user** of Pipe Editor, who points it at their own projects, including cloned or third-party repositories they haven't fully audited. They need three things: the tool never touches files outside its boundary; what they save, restore, run and export is the pipeline they're actually looking at; and the artifacts they take away work outside the tool.
- **The project owner**, as a portfolio reader and reviewer, who needs the project's status claims to be backed by gates that were actually re-run, not by historical green runs.

## Success criteria

1. **All 32 findings (AR-01 to AR-32) are closed under the closure bar** in review §8. For each finding:
   - its reproducer (R/L/U probe or described scenario) no longer shows the failure;
   - a permanent test at the boundary that failed covers the intended behavior and is linked to an acceptance-criterion ID;
   - the affected specs and claims agree with that behavior;
   - the relevant real build or runtime gate passes.
2. **The full gate passes** from a clean checkout on the CI toolchain (Node 20): `pnpm check`, `docker build -f backend/Dockerfile .`, `docker build -f frontend/Dockerfile .`, and the Compose health smoke test.
3. **Generated CI configs pass offline provider-schema validation** (GitHub Actions and GitLab CI). The generated commands run in containers, and the generated Dockerfile and Compose outputs build and serve over HTTP for representative fixtures.
4. **Every review probe is inverted.** Each diagnostic reproducer that asserted broken behavior now asserts the correct behavior, or is superseded by a regression test that does.
5. **`REPORT.md` is rewritten from freshly measured gates** and no longer makes an unqualified "hardened", "green on every gate" or "nothing blocks the product" claim. The adversarial review and `docs/hardening-report.md` stay unchanged as history.

## Scope

### In

Work proceeds in the review's §8 phase order, with a **strict gate**: a phase's cards become ready only after every finding in the previous phase is closed. Spec amendments for later phases may be drafted early but not implemented.

**Phase 1 — Contain filesystem effects and restore the build** (AR-01, AR-02, AR-03, AR-04)
- The visibility marker can never write through a symlink or destroy an existing file, on success or failure.
- Every manifest, lockfile and workflow read is a contained, regular-file, byte-bounded read. External symlinks are rejected or skipped with a diagnostic, and contained links follow a stated policy.
- FIFOs, devices and directories named like manifests return promptly and never block the process. Healthy sibling projects stay discoverable.
- Both production images build from a clean checkout, and the build is a standing gate.

**Phase 2 — Prevent wrong-project and stale-state operations** (AR-05, AR-06, AR-07, AR-08, AR-09, AR-23, AR-28)
- A **document-session identity** exists. Delayed detect, import, restore, bind and generate responses can't change a newer session.
- Restore checks both the saved IR and its project identity.
- A workspace rescan shows and generates the newly scanned plan without wiping edits on unrelated re-renders.
- Saves are ordered and versioned per project. After all requests settle, persisted state equals the latest intended state. "Saved" appears only after a durable acknowledgement. A failed write leaves editing usable and shows a retryable failure.
- Generated artifacts are tied to the plan, provider and mode revision they came from. Stale responses are ignored or visibly marked stale.
- Persisted state is validated against a schema. Project keys such as `__proto__` and `constructor` are safe. Malformed records are recovered without losing healthy ones.
- **Provenance is persisted** with the saved pipeline and restored with it. The untrusted-command acknowledgement is tied to the document identity and its execution context (commands, image, env, directories). Pipelines saved before this change have no provenance, so they're treated as untrusted.

**Phase 3 — Make validation and execution agree** (AR-10, AR-11, AR-12, AR-13, AR-14, AR-24, AR-30)
- Every metadata and version field that reaches a generated artifact is validated or rendered as literal text. No CR, LF or control character can add a directive, instruction or job.
- Multi-line scripts, comments, conditionals and heredocs survive into generated Dockerfiles and build for real, using an explicit encoding.
- **Per-step context is preserved everywhere.** Each step keeps its own env and working directory in local execution, the Dockerfile, single-service GitHub Actions and GitLab exports, and workspace exports. The executor requirement that merges env (EXEC-FR-008) is superseded.
- Every permutation of the same valid dependency graph produces the same execution order and generated CI order.
- A zero-stage pipeline gets a clear no-work result without any Docker or filesystem work.
- Validation bounds total nodes, errors, string sizes and input bytes, and rejects or safely handles cycles and aliases. Bad input yields a recoverable error.
- Every field a consumer reads has runtime validation, including triggers, metadata shape and supported versions. Error envelopes are stable at the HTTP, import and state boundaries.

**Phase 4 — Make exported artifacts operational** (AR-15, AR-16, AR-17, AR-18, AR-19, AR-20, AR-21, AR-22, AR-32)
- GitLab job names use a namespace that can't collide with provider keywords, whatever the stage IDs are.
- Trigger branches and pipeline-source behavior are honored by both providers. Anything that can't be expressed produces a warning or refusal.
- **GitLab hands outputs between jobs through artifacts and `needs` from the current pipeline.** The cache only speeds up dependencies, and every job works from an empty cache on any runner. CIEXPORT-FR-011 is amended.
- Workspace exports keep the same step context as single-service exports, or report each difference. The shared translation rules are consolidated.
- A Vite service without a lockfile gets a buildable artifact that resolves dependencies, or an explicit unsupported response.
- **The edited Vite container port is rendered consistently** into the web server config, the exposed port, Compose and the health check, and is verified over HTTP.
- **CI import never silently turns conditional work into executable work.** Conditional or manual jobs and steps import as disabled, each with a specific warning, and the user can re-enable them. Working-directory and shell settings map to the IR where it can represent them, and warn otherwise. GitLab `before_script` precedence matches the provider for the supported subset, and the spec criterion that expected concatenation is corrected.
- Observed images are distinguished from fallback choices. Explicit runtime evidence such as setup-node wins over an invented fallback, and conflicts are reported.
- **Generated Compose services bind to loopback only** (`127.0.0.1`), with a comment explaining how to widen exposure by hand. No new control.

**Phase 5 — Bound and recover execution** (AR-25, AR-26, AR-27)
- System-wide caps on active runs, queued runs, retained output and subscribers. Finished runs are evicted when they complete. Slow SSE clients are dropped by a documented policy. Copies have byte and file budgets.
- Abort at any point (before container creation, during pull or probe, during a stage, during a failing stop) waits for confirmed container removal before workspace cleanup. Interrupted copies are removed. No unhandled child-process error survives.
- Docker readiness can be re-checked and verifies the daemon, not just the CLI. A lost stream reconnects without duplicated output and reconciles against the run summary. Eviction and backend restart are handled explicitly. An active run stays observable and abortable while the user views history.

**Phase 6 — Close the evidence gap** (AR-29, AR-31)
- Dependency advisories are triaged by installed version, dependency path and reachable feature. Compatible parent and toolchain upgrades ship as their own change. Remaining exceptions are recorded with a justification.
- Pure tests fully replace their infrastructure. Docker suites probe for real daemon readiness. Generator tests check build and provider validity, not just strings. Provenance tests exercise acknowledgement and restore. Shuffled-order tests run through execution and export. Test files are typechecked for real. The golden IR fixtures can actually run.
- `REPORT.md` is rewritten from freshly measured gates, per success criterion 5.

**Minimum UI that correctness needs.** Frontend behavior fixes are in scope, including the smallest new visible states they require: a stale-artifact marker, a save-failure / retry state, a Docker readiness re-check, and restored-provenance review.

### Out

- **UI improvements**: visual redesign, layout, styling, spacing and color work, and aligning existing UI with the Frontend section of `GUIDELINES.md`. Only the minimum states listed above are added.
- **Review §7 follow-ups without an AR ID**, recorded for a later product:
  - excluding `.env` / `.npmrc` from run copies
  - reworking the reproduction command
  - a multi-line script editor (textarea)
  - per-document identity for RunPanel and Doctor results (beyond what AR-28 and AR-09 require)
  - moving synchronous filesystem work off the event loop (beyond what AR-03 requires)
  - warnings for shared-workspace layouts
  - dialog focus trapping and restoration
  - replacing heuristic checks
  - the shared IR package (ADR-0018)

  Where fixing an AR finding naturally overlaps one of these, the overlap is done only as far as that AR's acceptance needs.
- **Stage timeouts and container CPU/memory limits**: they stay executor non-goals. AR-25 bounds the registry and streams only.
- **Hosted CI runs as a closure requirement**: pushing to GitHub or GitLab and dispatching real pipelines is optional and manual, never a gate.
- **An opt-in LAN exposure control** for generated services.
- **All existing hard non-goals** (`docs/product/05-local-workspace-scope.md`): OAuth and remote connectors, multi-language detection, cloud deploy, image publishing, `act`-style runtime simulation, auth, multi-user and billing.
- **Forced major upgrades** used as a blanket fix for advisories.

## Acceptance criteria

Each finding keeps the acceptance stated for it in review §§3–6. The product-level criteria are:

- **AC-1 (containment).** Given a project containing internal, external or dangling symlinks, FIFOs, devices or directories in manifest, workflow or marker positions, when it is scanned, detected, imported or run, then no file outside the copy or the workspace root is read or modified, the API stays responsive, and every rejected or skipped entry has a useful diagnostic.
- **AC-2 (build).** Given a clean checkout, when both production images are built and the Compose stack is started, then both health endpoints respond successfully.
- **AC-3 (session identity).** Given two projects A and B, when any delayed detect, import, restore, bind or generate response for A arrives after B becomes current, then B's editor state, saved state and runs are unaffected.
- **AC-4 (durable save).** Given a failing data directory (a file in its place, no permission, disk full), when the user edits, then the editor stays usable, a retryable save failure is visible, and "Saved" is never shown. Given any interleaving of edit, undo, project switch and out-of-order save completions, when all requests settle, then disk state equals the latest intended state and survives a restart.
- **AC-5 (provenance).** Given an imported pipeline that was saved, reloaded and restored, when the user clicks Run, then the untrusted-command review is required. Given two different imports with the same file name, then acknowledging one doesn't acknowledge the other. Given a legacy save with no provenance, then it's treated as untrusted.
- **AC-6 (literal metadata).** Given CR, LF or control characters in any metadata, name or version field, when artifacts are generated, then validation rejects the value or it appears as literal text, and no extra directive, instruction or job appears.
- **AC-7 (step context).** Given a stage with two steps that have different env values and working directories, when it runs locally or is exported to Dockerfile, GitHub Actions, GitLab CI or a workspace bundle, then each step sees its own env and runs in its own directory.
- **AC-8 (order).** Given every permutation of the same valid dependency graph, when it is executed or exported, then the execution order and the generated CI order are identical.
- **AC-9 (no-work).** Given a zero-stage pipeline, when a run is requested, then a clear no-work result comes back and no Docker or filesystem work happens.
- **AC-10 (bounded validation).** Given cyclic or aliased YAML, oversized input, or malformed values in any field a consumer reads, when the input is validated at the HTTP, import or state boundary, then a stable, recoverable error envelope comes back with bounded work.
- **AC-11 (operational exports).** Given representative fixtures, including stage IDs that match provider keywords, non-default trigger branches, a Vite service with no lockfile and a non-default Vite port, when artifacts are generated, then the CI configs pass offline provider-schema validation, the Dockerfile and Compose build, the services answer over HTTP on loopback only, and GitLab downstream jobs succeed with an empty cache.
- **AC-12 (loud import).** Given imported CI with `if:` conditions, `when: manual`, `shell:`, `defaults.run.working-directory`, services, GitLab default and job `before_script`, or setup-node evidence that conflicts with the fallback image, when it is imported, then no conditional work becomes enabled, each unsupported construct has a specific warning, `before_script` precedence matches the provider, and explicit runtime evidence wins.
- **AC-13 (bounded execution).** Given more run requests than the configured caps, or a slow subscriber, then active runs, retained output and subscriber buffers stay within documented limits. Given an abort at any lifecycle point, then container removal is confirmed before cleanup and no child-process error goes unhandled.
- **AC-14 (recovery).** Given Docker starting after the panel loaded, a dropped stream, an evicted run or a backend restart, then the user can re-check readiness, sees non-duplicated output reconciled with the summary, and can still observe and abort an active run while viewing history.
- **AC-15 (evidence).** Given the finished product, when the full gate from a clean checkout is re-run, then it passes. Every AR finding maps to at least one passing boundary test linked to an acceptance-criterion ID. Advisories are triaged with recorded exceptions. `REPORT.md` reflects the measured results.

## Constraints & dependencies

- **Spec-first (`CLAUDE.md`).** No implementation before an Accepted spec covers it. Several findings expose defects in the specs themselves, and those amendments must be drafted and accepted before implementation:
  - EXEC-FR-008 (env merging) is superseded by per-step context;
  - CIEXPORT-FR-011 (cache as the job handoff) is amended to use artifacts and `needs`;
  - CIEXPORT-FR-015 needs GitLab trigger coverage;
  - the CI-import criterion expecting `before_script` concatenation is corrected;
  - CIIMPORT-NFR-003 ("lossy, and loud") gets concrete per-construct behavior;
  - state and editor specs gain document-session identity, durable-save semantics and persisted provenance;
  - the IR spec gains complete runtime validation and total-size bounds.

  Tests that faithfully encode an incorrect contract change together with the spec. Supersede, never delete.
- **ADRs** for the non-obvious decisions: per-step context model, GitLab artifact handoff, loopback-only publishing, provenance persistence and legacy-save policy, run-registry limits and slow-client policy, and symlink policy for contained links.
- **Existing ADRs hold**: IR provider-neutral (ADR-0003), omit on uncertainty (ADR-0006), linear topology v1 (ADR-0007), workspace-root containment (ADR-0008), native container execution with honest parity claims (ADR-0001), no CSS framework (ADR-0017).
- **Strict phase gate** (see Scope · In).
- **Workflow**: agents implement and hand off. The owner reviews the working tree and commits. No agent commits, pushes or opens PRs. Each card stays within the 500-changed-production-line budget.
- **Toolchain**: gates are measured on Node 20 (the CI version). Offline provider-schema validation needs new dev tooling, which is a dependency addition and needs approval with name and version.
- **Evidence**: the reproducers in `docs/reports/review-evidence/` are the starting point for each regression test. No real user data; fixtures are synthetic.
- **Honest claims**: local validation runs the same pipeline steps in containers. No claim of byte-for-byte parity with hosted runners.

## Open questions

| Question | Owner | Status |
|---|---|---|
| Policy for *contained* symlinks (manifests and copied files pointing inside the workspace): follow, skip or reject? | Project owner (spec review, Phase 1) | Open |
| Multi-line script encoding in Dockerfiles: Dockerfile heredoc syntax (needs BuildKit / a minimum Docker version) or a generated script file? | Project owner (DOCKER spec amendment, Phase 3) | Open |
| Supported version policy for runtime and package-manager versions: accepted syntax and supported range | Project owner (IR spec amendment, Phase 3) | Open |
| Concrete budget values: max input bytes, node count, error count, string length; run-registry caps; SSE slow-client threshold; copy byte and file limits | Project owner (IR and EXEC spec amendments, Phases 3 and 5) | Open |
| GitHub Actions trigger or pipeline-source features that can't be expressed in GitLab: warn or refuse? | Project owner (CIEXPORT spec amendment, Phase 4) | Open |
| Which offline tools to use for provider-schema validation, and their versions (new dev dependencies) | Project owner (dependency approval, Phase 4) | Open |
| Which advisories are accepted exceptions after triage, and which parent upgrades to take | Project owner (Phase 6 triage) | Open |
| When to schedule the §7 follow-ups (secrets exclusion, reproduction command, multi-line editor, sync filesystem work, focus trapping, ADR-0018 …) as their own product | Project owner | Open, after Hardening v2 |
