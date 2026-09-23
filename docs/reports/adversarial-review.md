# Pipe Editor — adversarial review, second pass

| Field | Value |
|---|---|
| Date | 2026-09-22 |
| Reviewed revision | `fae6a98b6daaec0fc0112b6979d44dd1ca17ff32` |
| Scope | First-party backend, frontend, generators, imports, execution, persistence, configuration, CI, tests, fixtures, and the claims in `REPORT.md` |
| Deliverable | Review and reproducible evidence; **no application fixes applied** |
| Existing files | The pre-existing, untracked `REPORT.md` and historical reports were preserved |
| Priority | P1: fix before relying on the affected workflow; P2: next hardening iteration; P3: follow-up |

**Verdict: the project has useful foundations, but its current “hardened / all gates green / nothing blocks the product” assessment is too strong.** This pass reproduced an out-of-copy host-file overwrite, a workspace containment bypass, a blocked discovery process, a broken production Docker build, cross-project restoration, stale persistence, and invalid or misleading generated artifacts. Passing the existing examples does not establish safety at these boundaries.

This is a local, single-user tool. Findings involving hostile repositories require the user to select or scan such a repository; execution findings additionally require starting a run. This review does **not** claim an unauthenticated internet-facing host takeover. Arbitrary pipeline commands are an intentional capability; the bugs below concern unintended file access, changes of meaning, misleading success, and missing lifecycle boundaries.

## 1. Verification and coverage

### Measured gates

| Check | Result in this review |
|---|---|
| `pnpm typecheck` | Passed, both packages |
| `pnpm lint` | Passed, both packages |
| `pnpm build` | Passed, both packages |
| `pnpm test`, unrestricted local Docker/socket access | Backend: **527 passed, 1 timed out**, 41 suites; frontend was not reached by the chained command |
| Isolated retry, `pnpm --dir backend exec jest --runInBand execute.pure.spec.ts` | 9 passed; confirms the initial timeout was intermittent, not that the complete gate passed |
| `pnpm --dir frontend test` | **130 passed**, 15 files |
| `docker build -f frontend/Dockerfile .` | **Failed**, missing `frontend/tailwind.config.js` in `COPY` at line 31 |
| Review backend probes | R01–R18 reproduced; Docker calls mocked where explicitly noted |
| Review UI probes | U01–U04: **4 passed**, each assertion confirms a defect, not correct behavior |
| Bounded edge probes | Cyclic YAML caused `RangeError`; FIFO discovery exceeded the 1-second child-process deadline |
| Dependency audit | Registry advisories found; production and development separated below |

Environment: macOS, Node `v24.12.0`, pnpm `9.15.0`. CI and Docker use Node 20, so this is not a Node 20 compatibility certification. The first sandboxed test attempt failed on socket/listen restrictions; those failures are **not** counted as product defects. Docker integration subsequently ran successfully with access to the daemon. No hosted GitHub/GitLab pipeline was dispatched, and no successful full Compose smoke run is claimed.

### What “repo-wide” means here

The review traversed the first-party source/configuration surface, followed data across module boundaries, ran the existing suites, and manually inspected relevant tests and specifications alongside the implementation. CSS, presentation, fixtures and documentation received a lighter review than execution, filesystem, persistence and generation. This is **not a claim of a separately documented manual audit of every line of every test, stylesheet, lockfile or third-party dependency**. Lockfiles were checked through dependency audits; vendored dependencies and generated `dist` output are not first-party review findings. A complete file inventory is included with the evidence so the scope is inspectable.

There is no inference that unmentioned files are defect-free. Runtime evidence, code-path evidence and explicitly deferred hypotheses are distinguished below.

### Reproduce the review evidence

See [`docs/reports/review-evidence/README.md`](docs/reports/review-evidence/README.md), including commands, limitations, machine-readable results, and the UI probes. These are diagnostic reproductions kept outside the normal test suites. They assert the current broken behavior and should be inverted into regression tests during implementation.

## 2. Findings to prioritize

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| AR-01 | P1 | Visibility marker follows a copied symlink and overwrites a host file | R01 |
| AR-02 | P1 | Manifest file symlinks escape workspace containment | R02 |
| AR-03 | P1 | A FIFO named `package.json` blocks the API process | L03 |
| AR-04 | P1 | Frontend production image cannot build | Actual Docker build |
| AR-05 | P1 | Saved pipeline from A can be restored into project B | U04 |
| AR-06 | P1 | Rescanning a workspace keeps the previous workspace plan | U01 |
| AR-07 | P2 | Autosave acknowledges a disk write that never happened | R18 |
| AR-08 | P2 | Undo during the first in-flight autosave leaves obsolete saved data | U03 |
| AR-09 | P2 | In-flight generation returns outdated artifacts as current | U02 |
| AR-10 | P1 | Metadata can inject Dockerfile/YAML structure | R03, R10; source |
| AR-11 | P1 | Multi-line build scripts become invalid Dockerfile instructions | R04 |
| AR-12 | P1 | Imported step environment/directory semantics are lost | R06; source |
| AR-13 | P1 | Valid dependency chains execute in the wrong order | R05 |
| AR-14 | P2 | Zero-stage pipeline reports passed after no work | R07 |
| AR-15 | P1 | Valid stage IDs overwrite GitLab configuration keys | R08 |
| AR-16 | P2 | GitLab export ignores selected trigger branches | R16 |
| AR-17 | P2 | GitLab uses a best-effort cache as a required workspace transfer | Source; provider docs |
| AR-18 | P2 | Workspace CI silently drops environment, directories and image choices | Source |
| AR-19 | P2 | Vite Dockerfile still requires a missing lockfile | R11 |
| AR-20 | P2 | Editable Vite container port disagrees with generated nginx | R10 |
| AR-21 | P1 | CI import silently changes conditions/setup semantics | R14; source |
| AR-22 | P2 | Fallback image overrides explicit setup-node evidence | R15 |
| AR-23 | P2 | Persisted state is not shape-validated and has prototype-key collisions | R12; source |
| AR-24 | P2 | YAML alias graphs defeat depth-only validation | L01 |
| AR-25 | P2 | Active runs and live SSE buffering have no global bound | R17; source |
| AR-26 | P2 | Abort/cleanup is best-effort without container termination acknowledgement | Source; race not integration-reproduced |
| AR-27 | P2 | Run UI cannot reliably recover availability or a lost stream | Source |
| AR-28 | P1 | Restored imports lose provenance; review is not tied to document identity | Source |
| AR-29 | P2 | Dependency advisories remain in locked production/dev trees | Registry audit |
| AR-30 | P2 | Validator accepts malformed fields consumed unsafely downstream | R09, R13; source |
| AR-31 | P2 | Existing tests and status documents overstate the proven guarantees | Gate results; inspected tests |
| AR-32 | P2 | Generated “local” Compose services publish on all interfaces | R10; Docker docs |

P1 does not mean every item is a critical security vulnerability. It also covers reproducible data corruption, a blocked product delivery path, and a central correctness promise that currently fails.

## 3. Filesystem and execution boundary

### AR-01 — P1: the visibility marker can overwrite files outside the copy

**Location:** `backend/src/modules/executor/workspace.ts:22`; `workspace-visibility.ts:60–62`.

`cpSync(..., { dereference: false })` preserves symlinks. The fixed `.pipe-editor-visibility-probe` filename is then opened with ordinary `writeFileSync`, which follows a symlink. A project containing that filename as a symlink to a writable host file causes the backend to replace the target's contents with a UUID **before** any stage executes. The probe subsequently failing does not undo the overwrite.

**Confirmed:** R01 uses a disposable project and a sentinel outside it; the sentinel changes even though Docker is mocked to fail. No real user file was touched. This invalidates both “temp-copy protects the working tree” and “nothing writes to the user's project” when the target points there.

**Fix direction:** create an unpredictable marker with exclusive/no-follow creation, verify regular-file identity, and remove only the file created by this operation. Define safe treatment of symlinks during copying. **Acceptance:** internal/external/dangling marker symlinks never modify their targets, on success or failure; an existing regular marker is not destroyed.

### AR-02 — P1: directory containment does not contain manifest reads

**Location:** `backend/src/modules/detector/manifests.ts:37–57`; `editor-api/bounded-read.ts:38`; `editor-api/project-scan.ts:201–214`.

The API resolves the selected directory against the workspace boundary, but individual `package.json`, lockfile, `.nvmrc` and other manifest paths are subsequently read with following `statSync`/`readFileSync`. A contained directory can therefore expose a manifest outside the allowed root through a file symlink. Directory-symlink tests do not cover this case. Discovery also reads through `.github/workflows` directory symlinks when inventorying filenames.

**Confirmed:** R02 returns an outside sentinel's project name from both detect and scan. This proves an out-of-bound read; arbitrary secret exfiltration through every manifest/parser is not claimed.

**Fix direction:** one contained, regular-file read primitive used by every reader, checking the actual file opened and its allowed boundary; address TOCTOU explicitly. **Acceptance:** external manifest/workflow symlinks are rejected or skipped with a useful diagnostic; contained legitimate links have a specified policy.

### AR-03 — P1: the “bounded” reader can block indefinitely

**Location:** `backend/src/modules/editor-api/bounded-read.ts:38–41`; `project-scan.ts:214`; `import.controller.ts:98–101`.

Checking `stat.size` is not a bounded read. A FIFO can have size zero, then block synchronous `readFileSync` waiting for a writer. Discovery calls this reader without a regular-file check; it blocks the Node event loop, including health and abort requests. The import file reader has the same structural weakness. A changing regular file can also grow between stat and read.

**Confirmed:** L03 creates an isolated FIFO named `package.json`; a child running `scanProjects` is killed at its deadline. The live API was not deliberately blocked.

**Fix direction:** refuse special files, impose an actual byte budget while reading, and avoid uninterruptible synchronous scanning. **Acceptance:** FIFO/device/directory inputs return promptly; size growth cannot exceed the budget; healthy sibling projects remain discoverable.

### AR-13 — P1: dependency order and execution order disagree

**Location:** `backend/src/modules/ir/effective-chain.ts:24`; `executor/execute.ts:109`; both CI exporters.

`validate()` accepts a linear graph regardless of array order, and canonicalization knows how to order it. `computeEffectiveChain()` preserves the incoming array order; `execute()` iterates that same array directly. The HTTP execution/export paths validate but do not canonicalize first.

**Confirmed:** `[second dependsOn first, first dependsOn []]` validates, yet the captured executor calls run `echo SECOND` before `echo FIRST` (R05). Exporting canonical JSON can change subsequent behavior by sorting this very same document.

**Fix direction:** normalize order at a shared validated boundary or have all consumers use the canonical effective order. Keep result display ordering separately if necessary. **Acceptance:** every permutation of the same valid graph produces the same execution and generated CI order.

### AR-14 — P2: an empty pipeline gets a green result

**Location:** `backend/src/modules/executor/execute.ts:69`, `aggregateOf`.

The empty-effective-chain refusal is guarded by `opts.ir.stages.length > 0`. A fully resolved IR with `stages: []` goes through Docker availability/copy/probe, runs nothing, then returns `passed`. R07 confirms this with mocked infrastructure. This is distinct from the explicitly documented behavior of an enabled zero-step stage.

**Acceptance:** a zero-stage document returns a clear no-work/unrunnable result without Docker or filesystem work; all-disabled and docker-build-only behavior stays explicit.

### AR-25 — P2: bounds are per stream, not per system

**Location:** `backend/src/modules/editor-api/run-registry.ts:80,177,200`; `execute.controller.ts:186`.

`maxRetainedRuns` only evicts completed runs and only when a new run starts. It is not a concurrency limit. R17 starts eight unresolved runs in a registry configured for two. Finished summaries can remain above the limit until another start triggers eviction. Each active run can copy a project and create containers. Live SSE writes ignore the `res.write()` backpressure signal, so the bounded replay buffer does not bound a slow subscriber's outbound queue.

**Fix direction:** limit active runs, queued runs, total retained output and subscribers; evict on completion; stop/drop slow streams using a documented policy. Add limits for copy bytes/files and scan queues. Resource isolation and stage timeouts are currently declared v1 non-goals/open questions: changing those requires a spec decision, not pretending the old spec already required them.

**Acceptance:** bounded-concurrency and slow-client tests measure retention/memory behavior without an intentional host resource-exhaustion attack.

### AR-26 — P2: abort does not prove cleanup completed

**Location:** `backend/src/modules/executor/docker-client.ts:153–166,203–219`; `executor/workspace.ts:22`; `execute.ts:164–165`.

Abort issues detached `docker stop` when the cidfile is already present, then terminates the CLI. An early abort can miss the cidfile. Cleanup can remove the copy while the container has not acknowledged stopping. The visibility probe does not consume the caller's abort signal, and failure while copying occurs before a cleanup closure is returned. Errors from the detached stop process are not handled by its surrounding synchronous `try/catch`.

These are code-path lifecycle findings, **not a demonstrated container escape or a reproduced orphan-container exploit**.

**Acceptance:** inject abort before creation, during pull/probe, during a stage, and during stop failure; await confirmed removal before workspace cleanup; interrupted copies are removed; no unhandled child-process error survives.

## 4. Build and artifact correctness

### AR-04 — P1: production Docker build is broken

**Location:** `frontend/Dockerfile:31`; `.github/workflows/ci.yml`, Compose smoke step.

The Dockerfile still copies `frontend/postcss.config.js` and `frontend/tailwind.config.js`; both were removed by the Tailwind removal. An actual Docker build fails at that COPY. A successful Vite build does not exercise the Dockerfile. The existing CI smoke step would detect this if reached; it is not evidence that it has passed on this tree.

**Acceptance:** remove obsolete inputs, build both production images from a clean checkout, then run the existing health smoke tests. No need to reinstall Tailwind.

### AR-10 — P1: only some interpolated metadata is sanitized

**Location:** `backend/src/modules/dockerfile-generator/generate.ts:106,193,261`; `workspace-bundle/generate.ts:150,274`; `ir/validate.ts:173`.

The single-service generator sanitizes `project.name`, but interpolates runtime/package-manager version strings directly into comments and runtime versions into `FROM`. Validation accepts arbitrary strings there. The Vite template interpolates `service.name` into a comment without sanitizing it. The workspace GitLab header similarly interpolates `plan.name` directly.

**Confirmed:** R03 inserts a new `RUN` line through a version field accepted by `validate`; R10 inserts a new Dockerfile line through a Vite service name while **all bundle checks pass**. These probes establish structural injection/invalid output; they do not establish a successfully built malicious image or host command execution.

**Fix direction:** validate version values before interpolation, sanitize every generated comment consistently, and serialize all generated YAML as data. **Acceptance:** CR/LF/control-character cases across every metadata field either fail validation or remain literal text; no extra directive/job appears.

### AR-11 — P1: multi-line build commands are not Dockerfile-safe

**Location:** `backend/src/modules/dockerfile-generator/generate.ts:339`; `workspace-bundle/generate.ts:146–159`.

A build step containing `echo first\necho second` becomes `RUN echo first` followed by the Dockerfile instruction `echo second`. A trailing shell comment can also swallow the ` && ` join and later steps. R04 reproduces the invalid instruction. `REPORT.md` already acknowledges the join limitation, but understates its impact on imported scripts and deployable artifacts.

**Acceptance:** multi-line comments, conditionals, heredocs and multiple steps survive generation and a real Docker build; execution failure behavior is preserved. Choose an explicit shell-script encoding or supported Dockerfile heredoc syntax, not ad-hoc newline escaping.

### AR-12 — P1: a step's execution context does not survive the pipeline

**Location:** `backend/src/modules/executor/execute.ts:215–249,302`; `ci-export/github-actions.ts:99–102,151`; `ci-export/gitlab-ci.ts:101–109`; Dockerfile generation.

Imported steps preserve separate env maps and `workingDir`, but execution merges all step env maps into one container env and uses only the first step's directory. Single-service exporters omit working directories and merge env across steps. Dockerfile build commands omit both.

**Confirmed:** R06 gives step one `MODE=one`, directory `one`, and step two `MODE=two`, directory `two`; the runner request instead has `MODE=two` globally and `/workspace/one`. The GitHub output contains no directory configuration.

**Contract nuance:** `EXEC-FR-008` explicitly codifies env merging. That is a **design incompatibility with imported per-step semantics**, not simply failure to implement that executor requirement. Either preserve per-step contexts throughout or reject/warn about unsupported differences before execution/export; update conflicting specs together. **Acceptance:** two distinct env/directory steps produce the intended values/locations, with no silent conversion.

### AR-15 — P1: GitLab stage IDs collide with reserved top-level fields

**Location:** `backend/src/modules/ci-export/gitlab-ci.ts:84–109`.

The exporter writes the `stages` array, then assigns jobs to `doc[stage.id]`. A valid IR stage named `stages` replaces the array with a job object. Other provider-reserved names such as `image`, `default`, `variables`, or `cache` can also be interpreted as global configuration. YAML round-trip equality still passes because the wrong source object round-trips perfectly.

**Confirmed:** R08 validates and exports a mapping in `stages:`. **Acceptance:** use a collision-free provider job namespace independent of IR IDs, preserve dependency mappings, and validate provider schema, not just YAML syntax.

### AR-16 — P2: GitLab ignores trigger branches

**Location:** `backend/src/modules/ci-export/gitlab-ci.ts:34–134`; `docs/specs/ci-export.spec.md`, CIEXPORT-FR-015.

R16 changes branches to `release-only`; GitLab export remains byte-identical. The branch editor promises to control exported CI configs, but this provider emits no matching rules/workflow filter. **Acceptance:** branch and pipeline-source behavior is tested for both providers; any intentionally unsupported trigger produces a warning/refusal.

### AR-17 — P2: cache is not a reliable handoff between jobs

**Location:** `backend/src/modules/ci-export/gitlab-ci.ts:84–90`.

Downstream jobs assume `node_modules/` and `dist/` arrive through a cache keyed only by lockfile. There is no install fallback or explicit artifact transfer. Different runners can miss that cache; different pipelines with the same lockfile can reuse it. The header calls it pipeline-scoped, but the key contains no pipeline identity. Arbitrary files created by custom stages are not transferred at all.

This implementation follows CIEXPORT-FR-011; the **spec's design needs correction**. GitLab distinguishes reusable dependency caches from artifacts used for intermediate build results. [GitLab caching documentation](https://docs.gitlab.com/ci/caching/).

**Acceptance:** downstream jobs work with empty caches and across runners; outputs come from the current pipeline through explicit dependencies/artifacts, or commands share one job with a clearly documented image policy.

### AR-18 — P2: workspace CI has a separate, weaker translation path

**Location:** `backend/src/modules/workspace-bundle/generate.ts:229–301`.

The workspace generators copy `step.run`, but neither emits `step.env` nor honors step directories within the service. GitHub executes on the VM using setup-node and ignores stage images; GitLab selects only the first verification image. Unlike single-service export, image divergence is not reported. Bundle validation checks YAML parsing and string presence, not these semantics.

**Acceptance:** compare the same service IR across local execution, single export and workspace export; preserve the supported context or report each difference. Consolidate shared translation rules while keeping genuinely different layouts explicit.

### AR-19 — P2: Vite has not received the no-lockfile fix

**Location:** `backend/src/modules/workspace-bundle/generate.ts:155–156,403–414`.

Detection correctly switches to resolving installation when there is no lockfile. The Vite-specific template still emits mandatory `COPY package.json package-lock.json ./` and `RUN npm ci` (analogously frozen pnpm/yarn). R11 changes the install stage to `npm install`; the Vite artifact still demands the lockfile. The prior GEN-04 closure therefore does not cover this path.

**Acceptance:** a real Vite fixture without a lockfile gets an honest, buildable resolving artifact or an explicit unsupported-state response; common install/render logic cannot diverge silently.

### AR-20 — P2: changing a Vite container port breaks connectivity

**Location:** `frontend/src/editor/WorkspaceStudio.tsx`, container-port field; `backend/src/modules/workspace-bundle/generate.ts:172,206`.

The UI permits any valid container port. Compose uses the edited value, while nginx and the health check remain fixed to port 80. R10 produces `3000:8080` with `listen 80` and all checks green. **Acceptance:** either fix the Vite container port in the UI/schema or render it consistently into nginx, EXPOSE, Compose and health checks; verify HTTP reachability.

### AR-32 — P2: “local orchestration” exposes generated services to the LAN

**Location:** `backend/src/modules/workspace-bundle/generate.ts:206`.

Generated ports use `hostPort:containerPort`, unlike the editor's own Compose file, which explicitly uses `127.0.0.1`. With no host IP Docker publishes on all interfaces. This can expose a development app that has no authentication when the user follows the local-run flow. This is a default/product-policy issue, not a claim that the editor API itself is LAN-exposed. [Docker port publishing](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/).

**Acceptance:** default generated local bundles to loopback, or make broader exposure an explicit reviewed choice and test the resulting mapping.

## 5. Frontend state, persistence and trust

### AR-05 — P1: a delayed restore response crosses project boundaries

**Location:** `frontend/src/editor/Editor.tsx:499–508,759–763`.

After detecting A, `getSavedPipeline(A)` is not cancelled or tied to a request/project generation. Detect B before it resolves: A's response sets `restoreCandidate` in B's editor. Restore applies A's IR without checking `saved.projectPath` against the current project; autosave can then write that IR under B, and a run targets B's files.

**Confirmed:** U04 restores a sentinel pipeline from A while the current path remains B. **Acceptance:** delayed detect/import/restore/bind responses cannot modify a newer document session; restore validates both the IR and its project identity.

### AR-06 — P1: workspace rescans keep the old plan

**Location:** `frontend/src/editor/WorkspaceStudio.tsx:28`; `Editor.tsx:1149`.

`initialPlan` is read only by the `useState` initializer. Scanning another folder while the studio is mounted passes a new prop to the same component, which continues displaying/editing/generating the old plan. U01 reproduces this with a prop change.

**Acceptance:** scanning B after A shows B and generates B's services. Use an explicit document-session reset or keyed remount; do not erase current edits on unrelated re-renders.

### AR-07 — P2: “Saved” can mean memory-only

**Location:** `backend/src/modules/state-store/store.ts:58–68,126–137`; `state.controller.ts:77`; `frontend/src/editor/useAutosave.ts:84–86`.

The store catches all write failures, returns a saved record anyway, and the API responds successfully. The frontend therefore says Saved even when nothing reached disk. R18 points the data directory at a file: save is acknowledged, but a new store cannot restore it.

Persistence may remain non-fatal without lying about durability. **Acceptance:** failed writes leave editing usable but return/report a retryable persistence failure; the Saved indicator appears only after durable acknowledgement. Include disk-full/permission errors and restart verification.

### AR-08 — P2: undo races the first autosave acknowledgement

**Location:** `frontend/src/editor/useAutosave.ts:76–91`.

Once the debounce fires, requests have no revision identity. Undo to the baseline while the first PUT is pending: `savedThisSession` is still false, so no DELETE is scheduled. The old PUT then resolves, sets Saved, and leaves the edit on the server even though the UI is pristine. U03 confirms exactly this. Switching documents also lets old completions alter the shared saved flag.

**Acceptance:** serialize/version save operations per project; after all requests settle, persisted state equals the latest intended state. Test edit→undo before acknowledgement, reverse completion order, project switch and navigation during the debounce. Flush or explicitly surface unsaved work before leaving.

### AR-09 — P2: an old bundle becomes current after an edit

**Location:** `frontend/src/editor/WorkspaceStudio.tsx:43–55,81–89`.

An edit clears the previous bundle, but a pending generation response unconditionally reinstalls its obsolete artifacts. There is no request digest or outdated badge. U02 edits the start command during generation, then observes OLD ARTIFACT displayed beside the new command.

**Acceptance:** bind artifacts to plan/provider/mode revision and ignore or visibly mark stale responses; cover edits, provider changes and workspace changes while generating.

### AR-23 — P2: persisted JSON is trusted as typed state

**Location:** `backend/src/modules/state-store/store.ts:54,102–123`; `frontend/src/editor/Editor.tsx:502–505,759`.

Parsing JSON does not validate its shape. `pipelines.json` containing `[]`, `42` or `{ "app": null }` can produce silent non-persistence or crashes outside the parsing catch. Saved IRs are restored without `validate()`. Plain-object dictionaries additionally treat project names such as `__proto__`, `constructor` and `toString` as inherited/prototype properties. R12 shows a save for `__proto__` disappearing from the persisted/indexed keys.

**Acceptance:** validate disk schemas and saved IRs, use own-property checks/null-prototype maps, recover malformed records without losing healthy ones, and test legal directories named `__proto__` and `constructor` across restart.

### AR-27 — P2: execution recovery is incomplete

**Location:** `frontend/src/editor/RunPanel.tsx:212–227,247–258`; `api.ts:370–395`; `backend/src/modules/executor/docker-client.ts:53–57`.

Availability is fetched once when the panel mounts; a false result disables Run with “start Docker”, but starting it provides no refresh mechanism. Conversely the backend uses `docker --version`, which proves the CLI exists, not that the daemon works. SSE relies on EventSource reconnecting and reports loss only at CLOSED; there is no implemented summary-polling fallback, event ID/deduplication, or handling of the backend's `stream-closed` event. Reconnects replay logs, and unavailable/evicted runs can remain visually running. Viewing history while a run is active closes its stream and drops the current run's controls.

**Acceptance:** refresh/retry daemon readiness, reconnect without duplicated output, reconcile against the summary endpoint, handle eviction/restart explicitly, and retain a way to observe/abort an active run while viewing history.

### AR-28 — P1: provenance does not survive restoration

**Location:** `frontend/src/editor/Editor.tsx:494,759–763`; `RunPanel.tsx:206–210`; `backend/src/modules/state-store/store.ts`, SavedPipeline.

The store persists IR but no provenance. Detect marks the session `detected`; restoring saved imported/shared commands does not change that provenance, so the next run skips the untrusted-command review. RunPanel's acknowledgement also resets only when the provenance enum/label changes, not when a different document with the same source label is loaded. The review dialog lists command text but not the image/env/directory context that affects execution.

**Acceptance:** persist provenance or conservatively treat restored edits as untrusted; tie acknowledgement to document/session identity and relevant execution context. Test imported→save→reload→detect→restore→Run, plus two different imports bearing the same filename.

## 6. Import, validation and assurance

### AR-21 — P1: unsupported CI semantics are silently discarded or added

**Location:** `backend/src/modules/ci-import/github-actions.ts:98–145`; `gitlab-ci.ts:82–100`.

GitHub job/step `if`, `shell`, `defaults.run.working-directory`, service configuration and related execution controls are not preserved and generally receive no corresponding warning. A step with `if: false` can become enabled local shell work. This violates CIIMPORT-NFR-003's “lossy, and loud” contract, even though full CI simulation is out of scope.

GitLab additionally concatenates default and job `before_script`; GitLab job configuration overrides that default instead. A top-level `before_script` is ignored. R14 confirms both behaviors. The existing acceptance criterion explicitly expects concatenation: fix the spec and test, not just code. [GitLab YAML reference](https://docs.gitlab.com/ci/yaml/#default).

**Acceptance:** representative unsupported keys produce specific warnings or safe refusal; known false/manual conditions do not silently turn into executable stages; setup precedence matches the provider for the supported subset.

### AR-22 — P2: an invented fallback becomes stronger than explicit evidence

**Location:** `backend/src/modules/ci-import/github-actions.ts:180–200`; `ci-import/infer.ts:49–64`.

A job with setup-node 22 and no container is assigned fallback `node:20-alpine`; inference then reads 20 from that invented image before considering setup-node's 22. R15 returns runtime 20 and image 20. A generic fallback warning does not explain that explicit runtime evidence was discarded.

**Acceptance:** distinguish observed images from fallback choices; carry setup-node evidence through inference and choose/report a compatible image, including conflicts and multiple hints.

### AR-24 — P2: a depth cap does not handle YAML object graphs

**Location:** `backend/src/modules/ir/validate.ts:69–103`; `frontend/src/editor/Editor.tsx:574–610`.

`js-yaml` can produce cycles/shared aliases. The recursive forbidden-key walk revisits them, accumulates many duplicate errors and spreads large arrays. L01 feeds `metadata: &x [*x, *x]` and gets `RangeError: Maximum call stack size exceeded`, despite the depth cap. The browser YAML-import validation occurs outside the parsing catch; adding the same metadata to an otherwise valid IR reaches this path. File import also reads arbitrary-sized files in full before validation.

**Acceptance:** reject cycles or safely track visited objects; bound total nodes, errors, strings and input bytes, not just depth. Invalid YAML/IR produces a recoverable error rather than an unhandled rejection or excessive work. L02's 1,000/3,000/5,000-stage JSON cases passed here; a graph-stack-overflow claim for those inputs is **not** made.

### AR-30 — P2: the runtime schema is incomplete

**Location:** `backend/src/modules/ir/validate.ts:110–211`; `editor-api/project-scan.ts:214–230`; `ci-import/github-actions.ts:38–52`.

`triggers` is not validated at all; metadata requires only a non-null object; version syntax is accepted without a supported-version policy. R09 supplies `branches: "main"`, gets no validation errors, and exports the wrong branch-list shape. `package.json` equal to JSON `null` parses successfully but crashes scan property access (R13). GitHub `jobs: null` or null job/step entries similarly bypass loose checks and become internal errors rather than actionable invalid-input responses.

**Acceptance:** complete runtime validation for every consumed field, supported versions and object shapes; table-driven malformed input at HTTP/import/state boundaries; stable error envelopes for bad JSON, oversized bodies, unknown routes and domain validation errors. Do not rely on TypeScript casts or a ValidationPipe whose payloads have no concrete DTO schema.

### AR-29 — P2: dependency hardening is incomplete

`pnpm audit --json` and `--prod` were run without installing/upgrading packages. Results are preserved in [`dependency-audit.json`](docs/reports/review-evidence/dependency-audit.json).

| Tree | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|
| Backend, all | 0 | 31 | 16 | 6 |
| Backend, production only | 0 | 10 | 12 | 2 |
| Frontend, all | 1 | 9 | 10 | 1 |
| Frontend, production only | 0 | 0 | 0 | 0 |

These are registry-reported advisory counts, **not independently proven exploitable vulnerabilities in this app**. The critical frontend advisory concerns Vitest's listening UI server, not the shipped static SPA: [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp). Backend production reports include Nest, multer and transitive libraries; this code does not expose an upload route, so an installed multer advisory alone does not prove a reachable upload DoS. Direct js-yaml 4.3.2 and older transitive js-yaml instances must not be conflated.

**Acceptance:** triage by installed version, dependency path and reachable feature; upgrade compatible parents/toolchain in a separate change; retain justified exceptions and run frozen installs plus build/tests/Docker checks. Do not use indiscriminate forced major upgrades as the fix.

### AR-31 — P2: test coverage and status labels are being mistaken for proof

**Locations:** `backend/src/modules/executor/execute.pure.spec.ts:13`; `workspace-bundle/workspace-bundle.spec.ts`; `frontend/src/editor/Editor.provenance.spec.tsx`; `frontend/tsconfig.json`; `REPORT.md` §§1,3,9.

Concrete gaps:

- “Pure” executor tests mock docker-client but not workspace-visibility, so they still launch a real Docker probe. The full run timed out; the isolated warmed retry passed. Pure tests need complete infrastructure substitution, and Docker suites need an actual daemon readiness probe.
- Generator tests often assert strings and YAML round-trips, not Docker/provider validity. Workspace fixtures write `{}` as lockfiles; a green test says nothing about an actual installation/build.
- The provenance suite contains tests named as execution-gate verification that only assert an unbound pipeline has no RunPanel, or detect a pipeline and assert no review banner. These do not exercise acknowledgement or restore provenance.
- Canonical-order tests exist, but their shuffled documents are not driven through execution/export boundaries.
- The CI step says “Typecheck source and tests”, while frontend tsconfig explicitly excludes spec files. Vitest transpilation is not equivalent to a full test typecheck.
- The npm golden IR still contains pnpm lint/test commands; golden comparisons are not proof that all named package-manager fixtures are runnable.
- `REPORT.md`'s “Green on every gate”, “Hardened”, “one open architectural item”, and “Nothing above blocks the product” should be qualified against the failing Docker build and findings here. Historical successful test runs need not be false to be insufficient.

**Acceptance:** close findings with negative tests at the boundary that failed, link those tests to acceptance criteria, and update current status only after rerunning the actual gates. Keep the historical review/hardening record intact rather than silently rewriting past claims.

## 7. Further hardening and explicit limits

These are follow-ups or design decisions, not additional proven high-severity exploits:

- **Synchronous filesystem work:** scanning, materializing copies and JSON persistence block the API event loop. Nested node_modules are intentionally copied by the current spec. Establish cancellation and byte/file/time budgets before adding concurrency.
- **Secrets:** the current executor exclusion list does not exclude `.env`/`.npmrc`; network-enabled user commands can read copied credentials. This is not host-env inheritance or a container escape. Decide whether files are opt-in and show that policy before execution.
- **Reproduction command:** RunPanel mounts the user's real `$PWD` read-write, omits the actual env/working directory and prior stage outputs, and calls it a reproduction. It does not reproduce the original isolated context. Prefer a retained, isolated workspace and an explicit full invocation.
- **Multi-line editing:** imported scripts are displayed but edited through single-line HTML inputs (`StageChain.tsx` / WorkspaceStudio); edits can remove line boundaries. Use a textarea/script editor and test comments/heredocs through edit→export→run.
- **Per-document UI identity:** RunPanel results and Doctor diagnoses can remain visible after the document changes. Associate them with a digest/session and mark them stale. Do not present an old passing run as proof of edited commands.
- **Workspace completeness:** workspace-protocol dependencies and root lockfiles are not equivalent to independent services. Detection should warn about unsupported shared-workspace layouts instead of promising self-contained contexts.
- **Accessibility:** folder/review dialogs use dialog roles but lack complete focus trapping/restoration; full browser, keyboard and screen-reader verification was not performed.
- **Honest checks:** regex scanning for cloud command names is a scope heuristic, not a shell security policy; substring checks for FROM/CMD are not Dockerfile validation.
- **Deferred architecture:** extracting a shared IR package (ADR-0018) remains reasonable, but is lower priority than the broken boundary behavior. Duplication of workspace types/emission rules is already causing divergence without requiring a sweeping rewrite first.

## 8. Proposed implementation order

1. **Contain filesystem effects and restore the build:** AR-01/02/03/04. Add symlink/special-file regression tests and a clean Docker build gate.
2. **Prevent wrong-project and stale-state operations:** AR-05/06/07/08/09/23/28. Introduce a document-session identity and per-project persistence ordering; surface durability failures.
3. **Make validation and execution agree:** AR-10/11/12/13/14/24/30. Specify context semantics and canonical execution order, then share the transformation.
4. **Make exported artifacts operational:** AR-15/16/17/18/19/20/21/22/32. Validate provider structure, build representative outputs, and exercise a real generated service over HTTP.
5. **Bound and recover execution:** AR-25/26/27. Test cancellation races, retention and reconnection without host exhaustion.
6. **Close the evidence gap:** AR-29/31. Triage dependencies, fix the test boundaries, and revise `REPORT.md` with the actual resulting gate status.

Each change should identify its existing requirement or draft the needed amendment before implementation. In particular, per-step context, GitLab cache transfer and before_script precedence expose problems in the current specification itself. Tests that faithfully encode an incorrect contract still need to change.

### Closure bar

A finding is closed only when its reproducer no longer exhibits the failure, a permanent test covers the intended behavior, affected spec/claims agree with that behavior, and the relevant real build/runtime gate passes. “The YAML parses”, “the component renders”, “the existing suite is green”, and “we added a warning elsewhere” are insufficient by themselves.
