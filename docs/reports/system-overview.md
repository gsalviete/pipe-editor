# Pipe Editor — System Overview (as built)

| Field | Value |
|---|---|
| Document type | Descriptive report (not a spec, not normative) |
| Written on | 2026-09-13 |
| Source of truth | The working tree at commit `e3a9b42e` plus uncommitted changes |
| Verification | `pnpm test` → backend 242 passed, frontend 48 passed (Docker-backed executor tests included) |

This document describes **what the code actually does today**, end to end. It is
deliberately descriptive: no recommendations, no judgement. The companion
document [`adversarial-review.md`](./adversarial-review.md) contains the critique.

---

## 1. What the product is

Pipe Editor is a **local-first CI studio** for Node.js projects. The user points
it at a folder inside a configured workspace root and the product:

1. **detects** the project from its manifests and produces a provider-neutral
   `PipelineIR`;
2. **imports** an existing GitHub Actions or GitLab CI file into the same IR;
3. lets the user **edit** the pipeline visually (toggle/add/delete stages, edit
   commands, images and trigger branches) with undo/redo and autosave;
4. **diagnoses** the pipeline with a rule-based "Pipeline Doctor";
5. **runs** the pipeline locally, one Docker container per stage, streaming logs
   over SSE;
6. **generates** portable artifacts — Dockerfile, `.dockerignore`, GitHub Actions
   workflow, GitLab CI config;
7. for multi-service folders, produces a **Workspace Bundle**: one Dockerfile per
   service, nginx config for Vite frontends, Docker Compose (root or per-service)
   and one CI file, with a validation report.

Nothing is ever written to the user's project: every artifact is returned over
HTTP and downloaded from the browser.

---

## 2. Repository map and size

```
pipe-editor/
├── backend/      NestJS API + all domain logic       7 019 LOC prod, 4 394 LOC tests
├── frontend/     React 18 + Vite SPA                 3 766 LOC prod, 1 531 LOC tests, 3 322 LOC CSS
├── docs/         product scope, ADRs, specs, tests    6 592 LOC of Markdown
├── test/fixtures/ 11 fixture projects (3 are runnable demos)
├── .github/workflows/ci.yml   build + typecheck + test + Compose smoke test
├── docker-compose.yml         editor slice (no Docker socket)
└── docker-compose.exec.yml    opt-in override that mounts the Docker socket
```

Two independent pnpm workspaces (`backend/`, `frontend/`) driven by root scripts
(`pnpm install:all`, `dev:backend`, `dev:frontend`, `build`, `typecheck`, `test`,
`check`). Node ≥ 20, pnpm 9.15.0 pinned via `packageManager`.

The frontend imports the backend's IR module **directly** through the Vite alias
`@modules/ir → ../backend/src/modules/ir`, so `PipelineIR`, `validate`,
`computeEffectiveChain`, `serializeCanonical` and `canonicalEquals` are literally
the same symbols on both sides of the wire. The frontend Docker build therefore
uses the repository root as its build context.

---

## 3. The domain model

### 3.1 Pipeline IR (`backend/src/modules/ir`)

The central contract, version `0.1.0`. Shape (`ir/types.ts`):

```ts
PipelineIR {
  version: string                    // semver
  project: {
    name: string
    rootPath: string
    language: string | null
    runtime:        { name: string | null; version: string | null }
    packageManager: { name: 'npm'|'pnpm'|'yarn' | null; version: string | null }
  }
  triggers?: [{ kind: 'on-push'; branches: string[] }]
  stages: Stage[]
  unresolved?: [{ field: string; reason: 'needs-user-input'; message: string }]
  metadata: { generatedAt: string; detectorVersion: string }
}

Stage { id, name, enabled, dependsOn: string[], container: { image }, steps: Step[] }
Step  { id, run, workingDir, env: Record<string,string> }
```

Invariants enforced by `validate()` (`ir/validate.ts`, ~515 LOC, every check
tagged with its `IR-AC-NNN`):

| Rule | Meaning |
|---|---|
| Forbidden keys | A recursive tree walk rejects `jobs`, `uses`, `needs`, `runs-on`, `with`, `permissions`, `include`, `workflow_dispatch` anywhere in the document (provider neutrality, IR-NFR-001). |
| Shape | semver `version`, `project`, `stages` array (may be empty), `metadata`; kebab-case stage/step ids; `container.image` non-nullable. |
| Linear chain | Six clauses: acyclic, in/out-degree ≤ 1, exactly one head, exactly one tail, every stage reachable from the head, all `dependsOn` references resolve. |
| Null ⟺ unresolved | Each of the five required-nullable fields set to `null` must have a paired `unresolved` entry — and an `unresolved` entry must not coexist with a present value. |

Supporting helpers:

- `canonicalize()` / `serializeCanonical()` / `canonicalDigest()` /
  `canonicalEquals()` — topological stage ordering plus recursive alphabetical
  key sorting; `metadata.generatedAt` is excluded from digests so "same input →
  byte-identical output" holds.
- `computeEffectiveChain(ir)` — the single shared disabled-stage splice: disabled
  stages are removed and their dependents re-linked past them. The Dockerfile
  generator, both CI exporters, the executor and the advisor all call it; none
  re-implements splicing.
- `findUnrunnableReason(ir)` — the single-source "is this runnable?" probe. It
  returns `{ kind: 'unresolved-required-field', field }` for the first of the
  five required fields that is `null`. Consumed by `/api/generate`,
  `/api/export/:provider`, the Dockerfile generator, the executor and the
  Workspace Plan validator.

### 3.2 Workspace Plan (`backend/src/modules/workspace-bundle/types.ts`)

The post-MVP aggregate that sits *above* per-service IRs (ADR-0010):

```ts
WorkspacePlan {
  version: '0.1.0'
  name, workspacePath
  services: [{ id, name, path, enabled, stack, kind, containerPort, hostPort, startCommand, ir }]
  existingComposeFiles: string[]
  warnings: [{ path, message }]
}
```

`stack ∈ {vite, nestjs, node-generic}`, `kind ∈ {frontend, backend, service}`.
Each service carries a full `PipelineIR` of its own.

---

## 4. Backend

NestJS 10 on Express, TypeScript strict, Jest + ts-jest. Entry point
`backend/src/main.ts`:

- binds `BIND_ADDRESS` (default `127.0.0.1`) on `PORT` (default `3000`);
- body parsing is disabled at factory level and re-added as `json({limit:'1mb'})`
  so the documented 512 KiB import limit is reachable;
- sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` on every response;
- CORS restricted to `FRONTEND_URL` (default `http://localhost:5173`);
- a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`);
- Swagger UI at `/api/docs`;
- if `PIPE_EDITOR_WORKSPACE_ROOT` is missing or invalid, module construction
  throws and `bootstrap()` prints the reason and exits 1 (the process never
  listens).

`AppModule` loads `@nestjs/config` globally and the single `EditorApiModule`,
which registers ten controllers and three providers: the workspace-root token
(resolved once at startup), a `StateStore` namespaced by a SHA-1 of the workspace
realpath, and a `RunRegistry` retaining 20 runs.

### 4.1 HTTP surface

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness: `{status, service, version}`. No filesystem or Docker access. |
| `POST` | `/api/detect` | `{projectPath}` → `{ir, warnings}`. |
| `POST` | `/api/generate` | `{ir}` → `{dockerfile, dockerignore}`. |
| `POST` | `/api/advise` | `{ir}` → `{score, grade, findings}`. |
| `POST` | `/api/export/:provider` | `provider ∈ {github-actions, gitlab-ci}` → `{provider, filename, content}`. |
| `POST` | `/api/import` | `{content, provider?}` → `{ir, warnings, provider}` (provider auto-sniffed). |
| `POST` | `/api/import/from-project` | `{projectPath, file}` → same, read from inside a workspace project and merged with detector facts. |
| `GET` | `/api/projects` | Workspace discovery for the picker. |
| `GET` | `/api/directories?path=` | Contained directory browser. |
| `GET` | `/api/directories/resolve?name=` | Resolves a browser-dropped folder *name* to contained paths. |
| `GET` | `/api/state/pipelines` | `{path: {savedAt}}` index for "edited" badges. |
| `GET` | `/api/state/pipeline?projectPath=` | The autosaved working IR, if any. |
| `PUT` | `/api/state/pipeline` | Autosave `{projectPath, ir}`. |
| `DELETE` | `/api/state/pipeline` | Discard the autosave. |
| `GET` | `/api/execute/availability` | `{available}` — `docker --version` probe, cached 15 s. |
| `POST` | `/api/execute` | `{projectPath, ir}` → `202 {runId}`. |
| `GET` | `/api/execute` | Run history (live + persisted, newest first). |
| `GET` | `/api/execute/:runId` | Run summary. |
| `GET` | `/api/execute/:runId/events` | SSE stream with buffered replay and 15 s heartbeats. |
| `POST` | `/api/execute/:runId/abort` | `202` best-effort cancel. |
| `POST` | `/api/workspace/inspect` | `{projectPath}` → `WorkspacePlan`. |
| `POST` | `/api/workspace/generate` | `{plan, provider, composeMode}` → `WorkspaceBundle`. |

All 4xx/5xx responses share one envelope: `{ error: { code, message, detail? } }`
with codes `INVALID_PROJECT_PATH`, `PATH_OUTSIDE_WORKSPACE`, `PATH_NOT_FOUND`,
`NO_MANIFEST`, `MALFORMED_PACKAGE_JSON`, `INTERNAL_IR_DEFECT`, `INVALID_IR`,
`UNRESOLVED_REQUIRED_FIELD`, `UNSUPPORTED_RUNTIME`, `INTERNAL_GENERATOR_DEFECT`,
`DOCKER_UNAVAILABLE`, `RUN_NOT_FOUND`, `UNSUPPORTED_CI_CONFIG`,
`INVALID_WORKSPACE_PLAN`.

Every controller hand-validates its body (object shape + an allow-list of field
names) rather than using DTO classes.

### 4.2 The filesystem boundary

Two files implement it:

**`workspace-root.ts`** — at startup `PIPE_EDITOR_WORKSPACE_ROOT` must be set,
absolute, existing and a directory; its `realpath` is cached. An optional
`PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` carries the *host* path when Docker mounts
the folder elsewhere (Compose sets it), so pasted Finder paths still work.

**`path-security.ts` → `checkProjectPath()`** returns one of
`ok | invalid | not-found | outside`:

1. rejects non-strings, empty strings and NUL bytes;
2. an absolute path that is under `displayRoot` is rewritten to the equivalent
   path under the real root; otherwise it is used as-is;
3. a **lexical** containment check runs *before* touching the filesystem (so an
   outside path returns 403, not 404);
4. `realpathSync()` resolves symlinks along the whole path, then containment is
   re-checked against the cached root realpath;
5. the workspace root itself is explicitly allowed.

`/api/detect`, `/api/execute`, `/api/state/*`, `/api/import/from-project`,
`/api/directories*` and `/api/workspace/inspect` all go through this same check.
`import/from-project` additionally re-resolves the CI file inside the project and
constrains the filename with `^(\.gitlab-ci\.ya?ml|\.github/workflows/[^/]+\.ya?ml)$`.

Discovery (`project-scan.ts`) never follows directory symlinks (`lstatSync`
check), skips `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`,
`.cache`, `.pnpm-store`, `.next`, `.turbo`, `.vite` and all dotfiles, and is
bounded: depth 3, 200 projects, 5 000 directories visited, 8 scripts listed per
project, 6 CI configs, 20 name matches.

### 4.3 Detector (`modules/detector`)

`detect(rootPath)` is a strict 10-step pipeline (`engine.ts`):

1. verify the root is a directory (`NoRootDirError`);
2. read the enumerated manifest set — `package.json`, `pnpm-lock.yaml`,
   `package-lock.json`, `yarn.lock`, `nest-cli.json`, `tsconfig.json`. A broken
   `package.json` hard-throws; any other broken manifest becomes a warning.
   `tsconfig.json` is passed through a hand-written JSONC comment stripper. If no
   manifest at all exists → `NoManifestError` (HTTP 422);
3. **project-field pass** — only `kind: 'field'` rules run; each rule's first
   matching case wins; emissions are checked against an allow-list of six JSON
   pointers and a per-target conflict map;
4. **stage pass** — only `kind: 'stage'` rules run; stage ids are checked against
   the closed canonical set `install, lint, test, build, docker-build`;
5. **install-dependency invariant** — if the package manager is `null`, *all*
   stages are dropped; if `install` is absent, `lint`/`test`/`build` are dropped;
6. chain composition in canonical order, `dependsOn` re-linked linearly;
7. triggers are passed through (never injected);
8-10. canonicalize → `validate()` → return `{ir, warnings}`. A failing validation
   is an internal defect (`INTERNAL_IR_DEFECT`, HTTP 500), not a user error.

Uncertainty handling lives in `emit-outcome.ts`, an executable version of the
IR-FR-009 truth table: `confidence: 'high'` commits; otherwise `onUncertainty`
decides between `omit`, `assume-default` and `needs-user-input`. A "required-field
collapse" converts an `omit`/nothing outcome on one of the five required fields
into an `unresolved` entry with a synthesized message.

The eleven rules:

| Rule | Target | Behaviour |
|---|---|---|
| DR-001 | `/project/name` | `package.json.name`, else the folder basename. |
| DR-002 | `/project/language` | `tsconfig.json` present → `typescript`; else `package.json` present → `javascript` (assume-default); else unresolved. |
| DR-003 | `/project/runtime/name` | `package.json` present → `node`; else unresolved. |
| DR-004 | `/project/runtime/version` | `engines.node`, first digit run only (`>=20.11` → `20`); else unresolved. |
| DR-005 | `/project/packageManager/name` | `packageManager` field first (`pnpm@`/`npm@`/`yarn@`), then lockfile precedence pnpm → yarn → npm; else unresolved. |
| DR-006 | `/project/packageManager/version` | Major from the `packageManager` field; else unresolved. |
| DR-007 | stage `install` | `pnpm install --frozen-lockfile` / `npm ci` / `yarn install --frozen-lockfile` (pnpm and yarn prefixed with `corepack enable`). |
| DR-008 | stage `lint` | Only when `scripts.lint` exists. |
| DR-009 | stage `test` | Only when `scripts.test` exists (`npm test` uses npm's alias). |
| DR-010 | stage `build` | Only when `scripts.build` exists. |
| DR-011 | stage `docker-build` | `docker build -t <project.name>:ci .` in image `docker:25`. |

Stage images come from `nodeImageFor(ctx)`: `node:<major>-alpine`, or
`node:lts-alpine` when the version is unknown.

### 4.4 Dockerfile generator (`modules/dockerfile-generator`)

`generate(ir)` returns `{dockerfile, dockerignore}` and never writes to disk. It
refuses unresolved required fields and non-`node` runtimes, then branches on the
**effective chain** (never on `enabled` directly):

| Effective `build` | Output |
|---|---|
| present with ≥ 1 step | Multi-stage: builder (full install → `COPY . .` → build command verbatim) + runtime (prod-only install → `COPY --from=builder /app/dist ./dist`). |
| present with 0 steps | Single-stage, "zero steps" header. |
| in the IR but disabled | Single-stage, "disabled" header. |
| absent from the IR | Single-stage, "not declared" header. |

Base image is always `node:<runtime.version>-alpine`; `corepack enable` is
emitted for pnpm/yarn; install commands follow a per-package-manager table;
`CMD` follows a convention table (`dist/main.js` for TypeScript, `index.js`
otherwise). Two `.dockerignore` variants exist — the multi-stage one excludes
`dist`, the single-stage one deliberately keeps it.

### 4.5 CI export (`modules/ci-export`)

Both generators are pure string builders over the effective chain.

**GitHub Actions** — one job `pipeline` containing every non-`docker-build`
stage as a step, all inside the first stage's `container.image`, so the workspace
is shared exactly like the local executor's `/workspace` mount. A stage that
declares a different image gets a comment, not a separate job. `docker-build`
becomes its own VM job with `needs: pipeline`. An empty effective chain produces
a `noop` job. Output path: `.github/workflows/ci.yml`.

**GitLab CI** — one job per stage with its own `image`, plus a YAML anchor
`.workspace-cache` keyed on the lockfile carrying `node_modules/` and `dist/`
between jobs (GitLab gives each job a fresh workspace). `docker-build` runs on
`docker:27` with a `docker:27-dind` service. Output path: `.gitlab-ci.yml`.

### 4.6 CI import (`modules/ci-import`)

`importCiConfig(content, provider|'auto')`. Sniffing is regex-based
(`jobs:` + `runs-on|uses:|steps:` → GHA; `stages:`/job-like keys + `script:` →
GitLab).

**GitHub Actions importer** — topologically orders jobs by `needs` (cycles
throw), warns when the graph is not linear, converts each job to a stage and each
`run:` step to an IR step. `actions/checkout` is dropped (implied locally);
`actions/setup-node` is dropped but its `node-version` feeds runtime inference;
any other `uses:` is skipped with a warning. `strategy`/matrix is warned about
and ignored. Workflow-level and job-level `env` cascade into step env. Jobs
without a container image get `node:20-alpine` with a warning. Push branches are
extracted, including the YAML `on:` → boolean-`true` key quirk.

**GitLab importer** — filters reserved top-level keys and hidden `.jobs`, orders
jobs by the `stages:` list then declaration order, warns when several jobs share
a GitLab stage (they are linearized), merges `default.before_script`, job
`before_script` and `script` into steps, and keeps per-job images.

`infer.ts` reconstructs the `project` block from evidence — package manager from
command text, runtime from `node:<major>` images or setup-node hints, language
from `tsc|typescript|ts-node|ts-jest` — and emits paired `unresolved` entries for
everything it cannot infer, so the imported IR always validates.

`mergeDetectedProjectFacts()` (used only by `/api/import/from-project`) lets the
detector fill gaps the CI file could not express and rebuilds the `unresolved`
list accordingly, so an imported pipeline of a local project is immediately
runnable.

### 4.7 Pipeline Doctor (`modules/advisor`)

`analyzePipeline(ir)` is pure and returns `{score, grade, findings}`. Penalties:
critical −25, warning −10, info −3, floored at 0; grades A ≥ 90, B ≥ 70, C ≥ 50,
else D. Checks: unpinned/`:latest` images (critical), runtime drift between
`project.runtime.version` and stage images (warning), missing enabled `install`
(critical), disabled or missing `test` stage (warning), missing `lint` (info),
non-frozen installs (`npm install`, `pnpm install` without `--frozen-lockfile`,
`yarn install` without `--frozen-lockfile|--immutable`) (warning), secret-looking
env keys with a non-empty value (critical), `docker-build` without a build stage
on a TypeScript project (warning), steps chaining ≥ 4 commands (info), and the
count of unresolved fields (info).

### 4.8 Executor (`modules/executor`)

`execute({ir, projectPath, signal?, onEvent?})`:

1. validates options (absolute existing directory, `validate(ir)` clean,
   `workspaceStrategy` only `temp-copy`);
2. `findUnrunnableReason` → `aggregateStatus: 'unrunnable'` with no containers;
3. an effective chain with no non-`docker-build` stage → `unrunnable` with reason
   `empty-effective-chain`, every declared stage reported as skipped;
4. requires `docker --version` to succeed, else `DockerUnavailableError`;
5. **materializes a temp copy** of the project (`mkdtemp` + `cpSync`), excluding
   exactly the top-level `node_modules`, `.git`, `dist`, `coverage`, `.cache`,
   `.pnpm-store`. Exclusions apply only at copy time — `/workspace` is then
   mutable across stages, so `install`'s `node_modules` and `build`'s `dist`
   reach downstream stages;
6. for each stage in document order: disabled → `skipped:disabled`;
   `docker-build` → `skipped:docker-build-delegated` with an explanatory reason
   (no DinD in v1); after a failure or abort → `skipped:dependency-failed`;
   otherwise the stage runs;
7. the temp copy is removed in a `finally` (unless `EXEC_KEEP_WORKSPACE` is set).

A stage run (`docker-client.ts`) spawns:

```
docker run --rm --cidfile=<tmp> -w <workingDir> -v <tempCopy>:/workspace \
           -e LANG=C.UTF-8 -e CI=true [-e COREPACK_HOME=/workspace/.corepack] \
           [-e <step env>…] <image> sh -c "<steps joined with &&>"
```

No `--privileged`, no `--network host`, no Docker socket mount, and the
environment is **constructed**, never inherited from the host. `corepack enable &&`
is prefixed for pnpm/yarn. Abort kills the docker client and `docker stop -t 5`s
the container via the cidfile. stdout/stderr are captured with a 256 KiB tail
bound and a visible truncation marker, and streamed live through `onEvent`.

Results: per-stage `{status, exitCode, stdout, stderr, startedAt, finishedAt,
durationMs, skipReason?}` plus an aggregate of
`passed | failed | aborted | unrunnable`.

### 4.9 Run registry and state store

`RunRegistry` (in-memory, 20 runs) assigns a UUID per run, buffers events for SSE
replay (bounded at 512 KiB of `stage-output`, other events unbounded), fans out to
subscribers with per-listener error isolation, supports abort through an
`AbortController`, evicts the oldest **finished** runs, and appends finished runs
to the durable store.

`StateStore` writes JSON under `PIPE_EDITOR_DATA_DIR` (default `~/.pipe-editor`),
namespaced by `sha1(workspaceRealpath).slice(0,12)`: `pipelines.json` (autosaved
working IRs keyed by the project path string) and `runs.json` (last 20 runs).
Writes are atomic (`tmp` + `rename`); read failures degrade to empty state.

### 4.10 Workspace bundle (`modules/workspace-bundle`)

**`inspectWorkspace()`** reuses `scanProjects`, skips fixture-looking paths
(`__fixtures__`, `__mocks__`, `test/fixtures`), caps at 50 services, runs the
detector per service, classifies the stack (Vite via the `vite` dependency or a
`vite` script; NestJS via `@nestjs/core` or a `nest` script; else generic),
allocates ports (Vite 8080→80, others 3000→3000 with collision bumping), derives
a start command, and inventories existing Compose files
(`^(docker-)?compose([._-]…)?\.ya?ml$`) in the root and in each service folder.

**`validateWorkspacePlan()`** produces a list of `{id, status, message}` checks:
plan version, ≤ 50 services, safe relative paths, unique/valid service ids,
per-service `validate(ir)`, port range and host-port uniqueness, non-empty start
command, readiness via `findUnrunnableReason`, a required enabled build stage for
Vite services, and a scope guard rejecting `docker push`, `kubectl`, `helm`,
`terraform`, `pulumi`, `gcloud`, `aws`, `az` in any step.

**`generateWorkspaceBundle()`** then emits, for each enabled service, a Dockerfile
(the standard generator with the `CMD` rewritten to the service start command; or
a bespoke Vite → nginx multi-stage image plus an SPA `nginx.conf` with a
`/health` endpoint), a `.dockerignore`, one Compose file (root mode) or one per
service, and one CI file. Compose documents are produced with `js-yaml` `dump`
(`name`, `services` with `build.context`, `image`, `restart`, `init`, `ports`,
plus a healthcheck for Vite services). Existing Compose paths are never reused:
`nextComposeArtifactPath` falls back to `docker-compose.pipe-editor.yml`, then
`-2`, `-3`… Every produced artifact is then re-validated (safe paths, unique
paths, YAML parses to a mapping, Dockerfile has `FROM`/`CMD`, the CI file builds
every service and contains no publish/deploy command, no existing Compose file is
overwritten). Any failed check throws `INVALID_WORKSPACE_PLAN` with the full
check list as `detail`.

---

## 5. Frontend

React 18 + Vite 5, hand-written CSS (BEM-ish), Vitest + Testing Library, jsdom.
`main.tsx` renders a single `<Editor />` inside `StrictMode`. The dev server binds
`127.0.0.1:5173` and proxies `/api` to `127.0.0.1:3000`.

### 5.1 Components

| File | Role |
|---|---|
| `Editor.tsx` (1 369 LOC) | The whole shell: path input, drag-and-drop, folder picker, detect/scan actions, onboarding, stage chain rendering, toolbar (undo/redo/reset/share/add stage), trigger editor, autosave, share-link decoding, JSON/YAML export. |
| `ProjectPicker.tsx` | Cards from `GET /api/projects` with search, favourites and recents (localStorage), "edited" badges from the state index, and per-card CI-import buttons. |
| `FolderPicker.tsx` | Modal directory browser over `GET /api/directories`; single click selects, double click/Open enters, "Use selected folder" confirms. |
| `WorkspaceStudio.tsx` | Multi-service flow: service cards (include toggle, ports, start command, editable build/test commands), CI provider and Compose-mode radios, Generate, artifact browser with per-file preview/copy/download and the full check report. |
| `RunPanel.tsx` | Docker availability gate, Run/Abort, per-stage live status and logs, a Gantt-style execution timeline with per-stage share and regression deltas against the previous run, run history, and a copy-paste `docker run …` reproduce command for failed stages. |
| `ArtifactsPanel.tsx` | One click → `POST /api/generate` + both `POST /api/export/*` in parallel; tabbed preview with copy/download and a staleness badge driven by canonical digests. |
| `DoctorPanel.tsx` | Debounced (350 ms) `POST /api/advise` on every valid edit; collapsible grade/score/findings. |
| `useUndoableIR.ts` | Undo/redo stacks (max 100) in refs plus a version counter for re-render. |
| `working-ir.ts` | Pure IR transforms: toggle, step-run edit, image edit, trigger branches, insert/remove stage with chain re-linking, next custom stage id. |
| `recent-projects.ts` | localStorage recents (8) and favourites, defensive against unavailable/garbage storage. |
| `api.ts` | Typed fetch client; `ApiError` carries `status`, `code`, `detail`; `openRunStream` wraps `EventSource`. |

### 5.2 State model

- **Loaded IR** — a deep-cloned, frozen snapshot of what `/api/detect` (or an
  import) returned. Never mutated.
- **Working IR** — the edited document, held by `useUndoableIR`. Every helper in
  `working-ir.ts` returns a new object.
- Derived per render: `computeEffectiveChain`, `validate` errors, and
  `hasUnresolvedRequiredField` (the gate for Generate and Run).
- Autosave: debounced 700 ms; `PUT`s while the working IR differs from the loaded
  IR, `DELETE`s when it returns to baseline; paused while a restore decision is
  pending. On the next detect, a saved pipeline that differs from the fresh
  detection surfaces a restore bar ("Restore my edits" / "Discard them").
- Share links: `#ir=<base64(canonical JSON)>`, decoded on mount, validated, then
  the hash is stripped from the URL.

### 5.3 The two user journeys

**Edit one app** — pick/paste/drop a folder → `POST /api/detect` → the stage chain
renders with an "effective chain" caption, project badges, warnings and
validation banners → edit → Doctor re-scores automatically → Generate artifacts
→ Run pipeline with live logs → export JSON/YAML or copy/download artifacts.

**Scan all services** — same folder input → `POST /api/workspace/inspect` →
Workspace Studio lists detected services with their stack, ports and commands →
choose CI provider and Compose mode → `POST /api/workspace/generate` → artifact
browser with the validation report → download file by file.

---

## 6. Infrastructure

- **`backend/Dockerfile`** — multi-stage Node 20 Alpine, corepack-pinned pnpm,
  prod-only install in the runner, `CMD ["node","dist/main.js"]`.
- **`frontend/Dockerfile`** — builder over the repo root (so `@modules/ir`
  resolves), runtime `nginx:alpine` serving `dist` with `nginx.conf`: security
  headers, a CSP (`default-src 'self'`, `script-src 'self'`, `frame-ancestors
  'none'`), `/health`, an `/api/` reverse proxy with SSE-friendly settings
  (`proxy_buffering off`, 1 h read timeout), SPA fallback and asset caching.
- **`docker-compose.yml`** — backend with `BIND_ADDRESS=0.0.0.0` but published
  only on `127.0.0.1:3000`, the workspace bind-mounted **read-only** at
  `/workspace`, `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` set to the host path, health
  checks on both services, frontend gated on backend health. No Docker socket,
  so local execution is off by design (ADR-0009).
- **`docker-compose.exec.yml`** — opt-in override mounting `/var/run/docker.sock`
  and making the workspace writable; its own header documents that the temp-copy
  path is not visible to the host daemon, so execution there is "best-effort".
- **`.github/workflows/ci.yml`** — checkout → pnpm 9.15.0 → Node 20 with pnpm
  cache → install both packages frozen → `pnpm build` → `pnpm typecheck` →
  `pnpm test` → `docker compose up --build --wait` plus curl of both health
  endpoints, with a `docker compose down --volumes` trap.

---

## 7. Tests and fixtures

`pnpm test` at the time of writing: **242 backend tests** (Jest) and **48
frontend tests** (Vitest), all passing, including the Docker-gated executor suite
(`execute.docker.spec.ts`, ~41 s, which really builds an image and runs
containers).

Backend suites cover: IR validation/canonicalization/round-trip/effective
chain/unrunnable, the detector engine and rules, Dockerfile goldens, CI export,
CI import, the advisor, the executor (pure + Docker), output bounding, the run
registry, the state store, project scanning, path security, workspace root
resolution, bind address, and the detect/generate/import/workspace/health
controllers over real HTTP (supertest).

Frontend suites cover: the editor behaviours (`Editor.spec.tsx`,
`Editor.features.spec.tsx`, `Editor.workspace.spec.tsx`), the folder picker, the
workspace studio, plus two "contract" suites that assert on CSS and config text
(`editor.css.spec.ts`, `product-shell.spec.ts`).

`test/fixtures/` holds 11 projects: three runnable demos (`demo-api`,
`demo-failing-tests`, `demo-no-tests`) with real scripts and npm lockfiles, and
eight detector fixtures covering npm/pnpm/yarn, both-lockfile precedence,
no-scripts, no-tests, build-disabled, build-zero-steps and a pnpm monorepo. Every
fixture declares both `engines.node` and (mostly) `packageManager`.

---

## 8. Documentation and process as they stand

`docs/` contains the product vision, MVP scope, domain glossary, the
productization brief, the local-workspace scope, ten ADRs, seven component specs,
the detection-rules catalogue and the test strategy with a consolidated
traceability table (102 criterion rows).

Recorded statuses: `IR`, `DOCKER`, `DET`, `EXEC`, `EDITOR` = **Accepted**;
`PRODUCT`, `WORKSPACE` = **Implemented**; `GHA` = *not started*. The three
"open boundary decisions" from `CLAUDE.md` were settled in the IR spec:
manifest-only detection (ADR-0005), omit-on-uncertainty as the default
(ADR-0006), and a linear topology in v1 (ADR-0007).

---

## 9. Configuration reference

| Variable | Consumer | Default | Effect |
|---|---|---|---|
| `PIPE_EDITOR_WORKSPACE_ROOT` | backend (required) | — | Highest inspectable directory; the process refuses to start without it. |
| `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` | backend | the root's realpath | Host-facing alias shown in the UI and accepted from paste/drop. |
| `PORT` | backend | `3000` | HTTP port. |
| `BIND_ADDRESS` | backend | `127.0.0.1` | Listener address. |
| `FRONTEND_URL` | backend | `http://localhost:5173` | The single allowed CORS origin. |
| `PIPE_EDITOR_DATA_DIR` | backend | `~/.pipe-editor` | Where autosaves and run history are written. *Not documented in `.env.example` or the README.* |
| `EXEC_KEEP_WORKSPACE` | executor | unset | Keeps the temp copy for debugging. *Not documented outside the executor spec.* |
| `WORKSPACE_HOST_PATH` | Compose | `./test/fixtures` | Host folder mounted at `/workspace`. |
| `EXEC_AVAILABLE` | set by `docker-compose.exec.yml` | — | *Read by no code in the repository.* |
