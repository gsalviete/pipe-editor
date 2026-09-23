# Pipe Editor — State of the Project

| Field | Value |
|---|---|
| Document type | Descriptive status report (not a spec, not normative) |
| Written on | 2026-09-22 |
| Source of truth | The working tree at commit `fae6a98b` (clean, branch `main`) |
| Verification | `pnpm typecheck`, `pnpm lint` and `pnpm test` were run for this report and all exit 0 |
| Companions | [`docs/reports/system-overview.md`](docs/reports/system-overview.md) (deeper as-built walkthrough), [`docs/reports/adversarial-review.md`](docs/reports/adversarial-review.md) (the critique), [`docs/hardening-report.md`](docs/hardening-report.md) (the critique, executed) |

This report answers one question: **what does this project do today, and how
much of it is actually proven?** It describes the code as it stands, states the
numbers it measured rather than quoting older ones, and ends with what is
knowingly unfinished.

---

## 1. Executive summary

Pipe Editor is a **local-first CI studio for Node.js projects**. Pointed at a
folder inside a configured workspace root, it detects the project from its
manifests, turns it into a provider-neutral **Pipeline IR**, lets the user edit
that pipeline visually, diagnoses it, **runs it locally in Docker**, and
generates portable artifacts — Dockerfile, `.dockerignore`, Docker Compose,
GitHub Actions and GitLab CI. For a folder containing several services it
produces a whole **Workspace Bundle** instead of a single pipeline.

Its state today:

- **Feature-complete against every Accepted spec.** All 11 component specs are
  at status `Implemented`; 18 ADRs are Accepted; the traceability table carries
  190 acceptance-criterion rows with no partial and no uncovered row.
- **Green on every gate.** 528 backend tests across 41 suites, 130 frontend
  tests across 15 files, strict typecheck on both packages, ESLint at
  `--max-warnings 0`. The Docker-backed executor suite really builds images and
  runs containers (~45 s of the run).
- **Hardened.** A 49-finding adversarial review was executed over 32 commits:
  47 findings closed, 1 partial, 1 deferred behind an ADR. Five defects the
  review itself missed were found and fixed in the same pass.
- **Not deployed anywhere, and not meant to be.** Cloud deploy, registries,
  Kubernetes, auth and multi-tenancy are hard non-goals.

The one open architectural item is ARCH-01 (`packages/ir`): the frontend still
consumes the IR module through a Vite source alias rather than a shared
workspace package. That is deliberate and documented in ADR-0018.

---

## 2. What the product does, end to end

### 2.1 Journey A — Edit one app

1. **Choose a folder.** Paste a relative or contained absolute path, browse with
   the contained folder picker, or drag a folder onto the page. A dropped folder
   whose absolute path the browser hides is resolved by name inside the
   workspace; ambiguous names are shown, never guessed.
2. **Detect.** `POST /api/detect` reads the manifest set (`package.json`,
   the three lockfiles, `nest-cli.json`, `tsconfig.json`) and runs 11 detection
   rules (DR-001…DR-011) to produce a `PipelineIR` plus warnings. Nothing is
   inferred from arbitrary source code (ADR-0005).
3. **Or import.** An existing GitHub Actions or GitLab CI file — pasted, or read
   from inside the project — is converted into the same IR, with every inferred
   fact carrying a warning.
4. **Edit.** Toggle, add, delete and rename stages; edit commands, images and
   trigger branches; resolve fields the detector could not determine, inline.
   Undo/redo, autosave and share links are all in place.
5. **Diagnose.** The Pipeline Doctor re-scores on every valid edit (debounced),
   grading A–D against rules for floating image tags, runtime drift, missing
   install/test/lint stages, non-frozen installs, secret-looking env values,
   over-long steps and unresolved fields.
6. **Run it locally.** One Docker container per stage, over a shared temp copy
   of the project, with live logs over SSE, abort, a Gantt-style timeline,
   per-stage regression deltas against the previous run, and a copy-paste
   `docker run …` line to reproduce a failed stage by hand.
7. **Export.** Dockerfile + `.dockerignore`, a GitHub Actions workflow, a GitLab
   CI config, and the canonical IR as JSON or YAML.

### 2.2 Journey B — Scan all services

1. `POST /api/workspace/inspect` walks the folder, skips fixture-looking paths,
   detects each service, classifies its stack (Vite / NestJS / generic Node),
   assigns non-colliding host ports and a start command, and inventories any
   Compose files that already exist.
2. The user picks which services belong in the bundle, adjusts ports, start
   commands, build and test commands, and chooses a CI provider and one of two
   Compose modes (one root file, or one file per service).
3. `POST /api/workspace/generate` emits per-service Dockerfiles (including a
   bespoke Vite → nginx runtime image with an SPA config and `/health`),
   `.dockerignore` files, the Compose file(s) and one CI file — then
   **re-validates every artifact it just produced** and refuses the whole bundle
   if any check fails.
4. The artifacts are previewed with the full check report and downloaded
   individually or as a single zip with paths intact.

### 2.3 Two promises the product keeps

- **Nothing is written to the user's project.** Every artifact is returned over
  HTTP and downloaded from the browser. Existing Compose files are never
  overwritten: a generated file falls back to `docker-compose.pipe-editor.yml`,
  then `-2`, `-3`.
- **Claims stay honest.** Local validation runs the *same pipeline steps* in
  containers; it does not claim parity with a hosted runner (ADR-0001).

---

## 3. Verified state, measured today

### 3.1 Quality gates

```
pnpm typecheck   backend + frontend, strict         → exit 0
pnpm lint        eslint . --max-warnings 0, both    → exit 0
pnpm test        backend 528 passed / 41 suites     → exit 0
                 frontend 130 passed / 15 files
```

The backend total includes `execute.docker.spec.ts` (45.5 s), which builds a
real image and runs real containers, and `workspace-visibility.spec.ts`, which
proves the daemon can actually see the temp copy before a run is allowed.

### 3.2 Size

| Area | Lines |
|---|---:|
| Backend production TypeScript | 8,301 |
| Backend tests | 6,603 |
| Frontend production TypeScript/TSX | 4,587 |
| Frontend tests | 2,760 |
| Hand-written CSS | 3,468 |
| Documentation (Markdown under `docs/`) | 10,094 |

41 backend spec files against 80 production files; the test-to-production line
ratio is roughly 0.8 on the backend and 0.6 on the frontend.

### 3.3 Spec-driven development scorecard

| Artifact | Count | State |
|---|---:|---|
| Component specs | 11 | All `Implemented` |
| ADRs | 18 | All `Accepted`, none superseded |
| Detection rules (DR-NNN) | 11 | Catalogue and code check each other in a test |
| Acceptance-criterion rows traced | 190 | No `◑`, no `☐`; 1 row `⊘` superseded (EDITOR-AC-022) |
| Distinct test ids (T-…) | 196 | Referenced from the traceability table |

Four of the eleven specs (`CI-EXPORT`, `CI-IMPORT`, `ADVISOR`, `STATE`) are
labelled **Retroactive**: they describe code that shipped before they were
written, which breached the project's own one rule. They are labelled rather
than backdated, and writing them found eleven real defects — that is recorded
in `docs/specs/README.md` rather than smoothed over.

---

## 4. Architecture

### 4.1 Repository

```
pipe-editor/
├── backend/            NestJS 10 API + all domain logic (two pnpm projects,
├── frontend/           React 18 + Vite 5 SPA            not one workspace)
├── docs/               vision, scope, glossary, 18 ADRs, 11 specs, rules, tests
├── test/fixtures/      16 fixture projects + README (3 are runnable demos)
├── .github/workflows/  build → typecheck → lint → test → Compose smoke test
├── docker-compose.yml       editor slice, no Docker socket
└── docker-compose.exec.yml  opt-in override that mounts the socket
```

Node ≥ 20, pnpm 9.15.0 pinned via `packageManager`. Root scripts drive both
packages: `install:all`, `dev:backend`, `dev:frontend`, `build`, `typecheck`,
`lint`, `test`, and `check` (= typecheck + lint + build + test).

The frontend imports the backend's IR module directly through the Vite alias
`@modules/ir → ../backend/src/modules/ir`, so `validate`,
`computeEffectiveChain`, `findUnrunnableReason` and the canonical serializer are
literally the same symbols on both sides of the wire.

### 4.2 Backend modules

| Module | Responsibility |
|---|---|
| `ir` | The contract: types, `validate()`, canonicalization/digests, `computeEffectiveChain`, `findUnrunnableReason`, field-resolution helpers |
| `detector` | 10-step detect pipeline + the 11 DR rules + the uncertainty truth table |
| `dockerfile-generator` | Multi-stage or single-stage Dockerfile and two `.dockerignore` variants |
| `ci-export` | GitHub Actions and GitLab CI documents, serialized with js-yaml and parsed back before return |
| `ci-import` | GHA/GitLab parsing, topological ordering, project-fact inference with provenance warnings |
| `advisor` | The Pipeline Doctor: pure scoring, weights and grade bands per ADR-0015 |
| `executor` | Temp-copy materialization, per-stage containers, bounded output, abort, cleanup |
| `workspace-bundle` | Multi-service inspection, plan validation, bundle generation and re-validation |
| `state-store` | Autosave and bounded run history under `~/.pipe-editor`, namespaced per workspace |
| `docker-naming` | The one shared tag-slug and comment-sanitizing rule |
| `editor-api` | Ten controllers, the path-security boundary, the host guard, bounded reads, the run registry |

### 4.3 HTTP surface

Twenty-two routes across ten controllers, all under `/api`:

| Area | Routes |
|---|---|
| Health | `GET /api/health` |
| Detect | `POST /api/detect` |
| Generate | `POST /api/generate` |
| Advise | `POST /api/advise` |
| Export | `POST /api/export/:provider` |
| Import | `POST /api/import`, `POST /api/import/from-project` |
| Discovery | `GET /api/projects`, `GET /api/directories`, `GET /api/directories/resolve` |
| State | `GET /api/state/pipelines`, `GET` + `PUT` + `DELETE /api/state/pipeline` |
| Execute | `GET /api/execute/availability`, `POST /api/execute`, `GET /api/execute`, `GET /api/execute/:runId`, `GET /api/execute/:runId/events` (SSE), `POST /api/execute/:runId/abort` |
| Workspace | `POST /api/workspace/inspect`, `POST /api/workspace/generate` |

Every error shares one envelope, `{ error: { code, message, detail? } }`, over a
closed set of codes. Swagger UI is served at `/api/docs`.

### 4.4 The two contracts

**`PipelineIR` (v0.1.0)** — project facts (name, root, language, runtime,
package manager), optional push triggers, a linear chain of stages, each with a
container image and ordered steps, plus an `unresolved` list and metadata.
`validate()` enforces provider neutrality by rejecting `jobs`, `uses`, `needs`,
`runs-on`, `with`, `permissions`, `include` and `workflow_dispatch` anywhere in
the document, checks the linear-chain invariants, validates image references and
env keys, bounds nesting depth, and enforces the null ⟺ unresolved pairing.

**`WorkspacePlan` (v0.1.0)** — the post-MVP aggregate above per-service IRs
(ADR-0010): services with id, path, stack, kind, ports, start command and a full
`PipelineIR` each, plus the inventory of existing Compose files and warnings.

---

## 5. Security posture

The product executes commands that come from a user's project, an imported CI
file, or a share link, so the boundary is explicit:

- **Loopback by default.** `BIND_ADDRESS` defaults to `127.0.0.1`; the Compose
  stack binds `0.0.0.0` inside the container but publishes only on
  `127.0.0.1:3000`.
- **Host guard first.** Requests whose `Host` does not name this machine are
  rejected before any controller or filesystem access (DNS rebinding), as are
  cross-site state-changing requests. `PIPE_EDITOR_ALLOWED_HOSTS` widens it
  deliberately.
- **One containment check.** `checkProjectPath()` rejects NUL bytes, performs a
  lexical containment check *before* touching the filesystem (so an outside path
  is 403, not 404), then `realpath`s the whole path and re-checks against the
  cached workspace realpath. Every path-taking route goes through it.
- **Bounded reads and scans.** Manifests are capped at 8 MiB; discovery never
  follows directory symlinks and is bounded by depth, project count and
  directories visited; captured container output is tail-bounded at 256 KiB with
  a visible truncation marker; SSE replay is bounded too.
- **Narrow container execution.** No `--privileged`, no `--network host`, no
  Docker socket mount, environment constructed rather than inherited, and a
  pre-flight probe that refuses to run when the daemon cannot see the temp copy.
- **Provenance before execution.** A pipeline carries `detected | imported |
  shared`. A share link is displayed for review and never auto-loaded, and the
  first run of any pipeline the user did not detect themselves requires
  acknowledging the commands.
- **CORS is a single origin**, with no credentials; security headers and a CSP
  are set on every response (the latter by the frontend's nginx).

---

## 6. Infrastructure and dogfooding

- **`backend/Dockerfile`** — multi-stage Node 20 Alpine, corepack-pinned pnpm,
  prod-only install in the runner.
- **`frontend/Dockerfile`** — builder over the repository root (so the IR alias
  resolves), runtime `nginx:alpine` with security headers, a CSP, `/health`, an
  SSE-friendly `/api/` reverse proxy and SPA fallback.
- **`docker-compose.yml`** — the editor slice: workspace bind-mounted read-only,
  health checks on both services, frontend gated on backend health, no Docker
  socket, so local execution is off by design (ADR-0009).
- **`docker-compose.exec.yml`** — opt-in override that mounts the socket and
  makes the workspace writable, with its own header documenting the trade-off.
- **`.github/workflows/ci.yml`** — the project runs its own product's gates on
  itself: install frozen → `pnpm build` → `pnpm typecheck` → `pnpm lint` →
  `pnpm test` → `docker compose up --build --wait` plus a curl of both health
  endpoints, with a teardown trap. The lint step exists because the product
  penalises other projects for having no lint stage.

`test/fixtures/` holds 16 fixture projects: three runnable demos (`demo-api`,
`demo-failing-tests`, `demo-no-tests`) with real scripts and lockfiles, and
thirteen detector fixtures covering npm/pnpm/yarn, both-lockfile precedence,
no-scripts, no-tests, build-disabled, build-zero-steps, a pnpm monorepo, a
project that declares its Node version nowhere, and one that names a package
manager with no lockfile to back it.

---

## 7. Supported today

| Area | Supported |
|---|---|
| Runtime | Node.js |
| Languages | JavaScript, TypeScript |
| Package managers | npm, pnpm, Yarn |
| Classified stacks | Vite, NestJS, generic Node.js |
| CI input | GitHub Actions, GitLab CI |
| CI output | GitHub Actions, GitLab CI |
| Containers | Dockerfile, `.dockerignore`, Docker Compose (root or per service) |
| Topology | Linear stage chains (ADR-0007) |

### Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PIPE_EDITOR_WORKSPACE_ROOT` | yes | — | Highest inspectable directory; the process refuses to start without it |
| `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` | no | root realpath | Host-facing alias when Docker mounts the folder elsewhere |
| `PIPE_EDITOR_ALLOWED_HOSTS` | no | loopback names | Extra hostnames the host guard accepts |
| `PORT` / `BIND_ADDRESS` / `FRONTEND_URL` | no | `3000` / `127.0.0.1` / `http://localhost:5173` | Listener and CORS origin |
| `PIPE_EDITOR_DATA_DIR` | no | `~/.pipe-editor` | Autosaves and run history |
| `EXEC_KEEP_WORKSPACE` | no | unset | Keeps the executor's temp copy for debugging |
| `WORKSPACE_HOST_PATH` | Compose only | `./test/fixtures` | Host folder mounted read-only at `/workspace` |

---

## 8. Honest limits and hard non-goals

Stated by the product, not discovered here:

- Detection is **manifest-based**. The tool does not read arbitrary source code
  to guess (ADR-0005), and a fact it cannot establish becomes an `unresolved`
  entry rather than a confident default (ADR-0006).
- Local execution runs the **same commands** in containers; it is not a
  byte-for-byte simulation of a hosted runner (ADR-0001), and `docker-build` is
  skipped locally rather than run in Docker-in-Docker.
- Compose does not infer databases or cross-service dependencies yet.
- The build output directory (`dist/`) stays a **declared assumption**, surfaced
  in the artifact and as a Doctor finding, rather than a fabricated IR field
  (ADR-0012).
- Out of scope by decision: cloud deploy, image publishing, registries, SSH,
  Kubernetes, secrets management, infrastructure provisioning, OAuth and remote
  repository connectors, multi-language detection, full GitHub Actions runtime
  simulation, auth, multi-user behaviour and billing.
- This is a **local single-user developer tool**, not a hosted service.

---

## 9. What is knowingly unfinished

| Item | State | Record |
|---|---|---|
| **ARCH-01 — `packages/ir`** | Deferred. The frontend consumes the IR through a Vite source alias; extracting a shared package requires creating a pnpm workspace first, which touches both lockfiles, 37 imports, both Dockerfiles, the CI install steps and jest's `rootDir`. | [ADR-0018](docs/adr/0018-ir-stays-a-source-alias-for-now.md) tabulates the whole migration surface |
| **FE-05 — `useDetectFlow`** | Partial. `StageChain.tsx` and `useAutosave.ts` are extracted and `Editor.tsx` is down to 1,373 lines, but `onDetect` still touches twelve setters; the real fix is a reducer, which a `Low`-severity finding did not warrant. | `docs/hardening-report.md` §6 |
| **Doctor's `mega-step` rule** | Counts `&&` occurrences, so it does not see a newline-separated multi-line script. | [ADR-0014](docs/adr/0014-imported-run-blocks-stay-scripts.md) |
| **Multi-line build commands in Dockerfiles** | Still joined with ` && ` into a single `RUN`; every other emitter preserves newlines. | `docs/hardening-report.md` §6 |
| **`PIPE_EDITOR_DATA_DIR`, `EXEC_KEEP_WORKSPACE`** | Read by the code but absent from both `.env.example` files and the README configuration table. | This report |
| **Empty scaffolding** | `frontend/src/features/auth/` and `frontend/src/features/pipeline/` are empty directories left from an early layout. | This report |
| **`docs/reports/system-overview.md`** | Accurate in substance but stale in its figures (242/48 tests, 7 specs, 10 ADRs, statuses `Accepted`) — it predates the hardening pass. | This report supersedes its numbers |

Nothing above blocks the product from doing what section 2 describes.

---

## 10. Where to read next

1. [Product vision](docs/product/01-vision.md) — what and why.
2. [Local workspace scope](docs/product/05-local-workspace-scope.md) — the
   current product boundary.
3. [ADR-0010](docs/adr/0010-workspace-plan-above-service-pipelines.md) — why a
   Workspace Plan sits above service pipelines.
4. [Pipeline IR spec](docs/specs/pipeline-ir.spec.md) — the central contract.
5. [Spec index](docs/specs/README.md) — the status board and the retroactive-spec
   argument.
6. [Test strategy](docs/testing/test-strategy.md) — criteria-to-test
   traceability.
7. [System overview](docs/reports/system-overview.md) — the deeper as-built
   walkthrough.
