# Pipe Editor — Adversarial Review

| Field | Value |
|---|---|
| Document type | Critique / review report (not a spec, not normative) |
| Written on | 2026-09-13 |
| Scope | Whole repository: backend, frontend, generated artifacts, infrastructure, docs and process |
| Baseline | `main` @ `e3a9b42e` + working-tree changes; `pnpm test` green (242 backend, 48 frontend) |
| Companion | [`system-overview.md`](./system-overview.md) — what the code does, without judgement |

**Stance.** This report assumes the code is wrong until proven otherwise and
attacks it from four directions: a hostile input, a real-world project that does
not look like the fixtures, a reviewer reading the generated artifacts, and the
project's own governing rule in `CLAUDE.md`. Every finding cites evidence.
Severity is about *impact on the product's claims*, not about how hard the fix is.

---

## 0. What holds up

Stated first, because the rest of this document is deliberately negative and the
baseline is genuinely strong.

- The IR really is provider-neutral and really is the single source of truth: a
  recursive forbidden-key walk enforces it, and `computeEffectiveChain` /
  `findUnrunnableReason` are imported by every consumer instead of being
  re-implemented. That discipline is rare and it shows.
- The filesystem boundary is well built: lexical check *before* `realpath` (so
  outside paths 403 rather than leaking existence through 404), symlink
  resolution on the whole path, the root itself explicitly allowed, discovery that
  refuses to follow directory symlinks, and every path-taking endpoint funnelled
  through the same function.
- The executor's security posture is correct by construction: temp copy, one
  container per stage, constructed environment (no host inheritance), no
  `--privileged`, no `--network host`, no socket mount, cidfile-based abort,
  bounded output with a visible truncation marker.
- The Docker-backed executor tests actually run containers in the suite. Most
  projects with this shape mock that away.
- The workspace bundle re-validates its own output (YAML parses, Dockerfile has
  `FROM`/`CMD`, no publish/deploy command, existing Compose files untouched)
  before returning it.
- The honesty discipline in the copy ("same commands in containers, not
  byte-for-byte parity") is maintained consistently, including in ADR-0001.

Now the problems.

---

## 1. Top five

| # | Finding | Why it is first |
|---|---|---|
| 1 | [UX-01] Unresolved fields are a dead end | The product's headline actions (Generate, Run) are permanently disabled for any project without `engines.node`, and the UI offers no way to fix it. This is most real projects. |
| 2 | [SDD-01/02] Shipped code with no spec, and a spec that contradicts its own test | The project's entire thesis is spec-driven development. Two CI generators, the importer, the Doctor and the state store have no spec; `EDITOR-AC-022` now asserts the opposite of what the code does, while the traceability table reports it ✅. |
| 3 | [GEN-01/02] Unescaped interpolation into generated Dockerfiles and YAML | The output is the deliverable. Today a scoped package name or a stage renamed with a `:` silently produces a broken or semantically different artifact, with no parse-back check on the single-service export path. |
| 4 | [SEC-01/02] Untrusted IR → one-click container execution, on an unauthenticated loopback API | A share link or a dropped file is enough to stage arbitrary commands; nothing defends against DNS rebinding into `127.0.0.1:3000`. |
| 5 | [IMP-01] GHA multi-line `run:` blocks joined with ` && ` | Import silently changes the meaning of very common workflows — a `#` comment line swallows the rest of the block. |

---

## 2. Security

### SEC-01 — No Host-header / DNS-rebinding defence — **High**

`main.ts` binds loopback, sets a narrow CORS origin and stops there. CORS is not
a defence against DNS rebinding: a page on `evil.test` whose DNS flips to
`127.0.0.1` becomes *same-origin* with the API and can read the responses of
`GET /api/projects` and `GET /api/directories` (a map of the user's source tree),
`POST /api/detect` (manifest contents), `POST /api/import/from-project` (file
contents), and can start `POST /api/execute` runs.

The product is marketed as local-first and single-user, which makes this the
threat model that *does* apply.

**Fix.** Reject any request whose `Host` is not `127.0.0.1[:port]`/`localhost`
(or the configured Compose host) in a global middleware, and reject
`Sec-Fetch-Site: cross-site` on state-changing routes. Both are a few lines and
neither breaks the Vite proxy.

### SEC-02 — Untrusted IR becomes executable with one click — **High**

Three paths load an IR the user did not author: `#ir=<base64>` share links
(`Editor.tsx:695-706`), dropped/imported JSON-YAML files (`loadExternalIR`), and
CI text sent to `/api/import`. After loading, `RunPanel`'s **▶ Run pipeline** posts
that IR to `/api/execute`, which runs `sh -c "<steps joined with &&>"` in a
container with a copy of the project mounted read-write and network access.

`validate()` is a *schema* gate; it says nothing about what the commands do. The
UI does display the commands, but nothing marks an imported pipeline as
untrusted, and the Run button is equally prominent for detected and imported
pipelines.

**Fix.** Taint IRs by provenance (`detected | imported | shared`). For tainted
IRs require an explicit "I reviewed these commands" confirmation listing every
`run` string before the first execution, and never auto-load a share link without
showing the command list first.

### SEC-03 — Unvalidated `container.image` is interpolated into the docker argv — **Medium**

```ts
// backend/src/modules/executor/docker-client.ts:68-82
const argv = ['run','--rm',`--cidfile=${cidFile}`,'-w',req.workingDir,'-v',`${req.workspaceHostPath}:/workspace`];
for (const [k,v] of Object.entries(req.env)) argv.push('-e', `${k}=${v}`);
argv.push(req.image, 'sh', '-c', req.shellCommand);
```

`validate()` only requires `container.image` to be a *string*. A value starting
with `-` is consumed by the Docker CLI as another option, shifting the image slot
to `sh`. In practice that limits escalation (the `sh` image will not resolve), so
this is argument injection with a low ceiling rather than a container escape —
but it is a client-controlled value landing in the option region of a
privilege-bearing CLI, and the ceiling depends on Docker's parser, not on us.

**Fix.** Validate the image against a reference regex
(`^[a-z0-9][a-z0-9._\/-]*(:[\w.\-]+)?(@sha256:[a-f0-9]{64})?$`) in `validate()`
so every consumer benefits, and keep argv construction ordered so no user value
can precede the image.

### SEC-04 — Environment keys and values are never constrained — **Medium**

`step.env` is validated only as "an object" (`validate.ts:247`). Values flow into
`-e KEY=VALUE` (executor), into `env:` blocks in the GitHub Actions export
(`github-actions.ts:70`) and into `variables:` in GitLab (`gitlab-ci.ts:60`) with
the **key unquoted**. A key containing `:` or a leading `-` produces invalid or
re-interpreted YAML; a value containing a newline breaks the single-quoted scalar.

**Fix.** Constrain keys to `^[A-Za-z_][A-Za-z0-9_]*$` in `validate()`; emit YAML
through a serializer (see GEN-02).

### SEC-05 — The exec Compose override can report a green run that validated nothing — **Medium**

`docker-compose.exec.yml`'s own header admits the temp copy lives inside the
backend container and is not visible to the host daemon. What it does not say is
what Docker *does* in that situation: `-v /tmp/pipe-editor-exec-xxx/workspace:/workspace`
with a source path that does not exist on the host **creates an empty directory**
and mounts it. The stage then runs against an empty workspace. Depending on the
commands, that yields a confusing failure — or, for a tolerant script, a
**passing** run that verified nothing. That directly contradicts the ADR-0001
fidelity claim the whole product rests on.

**Fix.** Before the first stage, write a marker file into the temp copy and
assert from inside a throwaway container that it is visible; abort the run with a
clear `DOCKER_WORKSPACE_NOT_VISIBLE` error otherwise. Alternatively wire the
shared host temp dir the ADR defers, and until then make the override refuse to
start runs rather than "best-effort" them.

### SEC-06 — Unbounded manifest reads — **Low/Medium**

`readManifests` (`manifests.ts:37`), `probeProject` (`project-scan.ts:211`) and
`inspectWorkspace` (`inspect.ts:40`) read `package.json`/lockfiles with no size
check. A multi-hundred-megabyte file anywhere in the workspace (a vendored
artifact, a hostile repo the user cloned to inspect) turns a discovery scan into
an OOM. The CI-import path *does* have a 512 KiB bound; manifests do not.

**Fix.** `statSync().size` gate (e.g. 2 MiB) with a warning, mirroring the import
limit.

### SEC-07 — Unbounded recursion on client JSON — **Low**

`validateForbiddenKeys` (`validate.ts:50`) recurses over the whole document with
no depth limit, and `deepSortKeys` (`canonical.ts:76`) does the same. Express
accepts 1 MB bodies, which is enough for ~10⁵ nesting levels. Verified on this
machine's Node: `JSON.parse` handles a 200 000-deep object without complaint (V8
parses iteratively), and an equivalent recursive walk then throws
`RangeError: Maximum call stack size exceeded` — i.e. body-parser does *not*
shield the validator, and the failure surfaces as an opaque 500 rather than a 400.

**Fix.** Depth cap (say 64) returning a validation error.

### SEC-08 — `credentials: true` on CORS with no auth — **Low**

`main.ts:35-38` allows credentials for an API that has no cookies, sessions or
tokens. It widens what a permitted origin can do and buys nothing.

### SEC-09 — SSE stream can leak — **Low**

`ExecuteController.events` checks `registry.get(runId)` and then calls
`subscribe()` (`execute.controller.ts:156-190`). If the run is evicted between
the two, `subscribe` returns `undefined`, no terminal event ever arrives, and the
response stays open emitting heartbeats until the client disconnects. Concurrent
SSE subscribers are also unbounded.

---

## 3. Generated artifacts (the actual deliverable)

### GEN-01 — Unescaped `project.name` in Dockerfiles and in the docker-build command — **High**

```ts
// dockerfile-generator/generate.ts:92 and :174
`# Source: project "${ir.project.name}" — runtime: …`
// detector/rules/dr-011-docker-build.ts:24
`docker build -t ${ctx.ir.project.name}:ci .`
```

`project.name` comes from `package.json` (or is edited client-side). Two concrete
failures:

1. **Scoped packages.** `@acme/api` → `docker build -t @acme/api:ci .` → an
   invalid reference. Every exported CI file for every scoped package is broken,
   and nothing in the pipeline notices — the workspace-bundle path slugs service
   ids, the single-service path does not.
2. **Injection.** A name containing a newline injects arbitrary lines into the
   generated Dockerfile (`RUN curl …`); a name containing `;` or backticks
   extends the docker-build shell command that is exported to CI and shown in
   RunPanel's copy-paste reproduce command.

**Fix.** One shared `dockerTagSlug()` used by DR-011 and the workspace path;
strip control characters from anything interpolated into a comment.

### GEN-02 — YAML built by string concatenation, with no parse-back check — **High**

`ci-export/github-actions.ts` and `ci-export/gitlab-ci.ts` assemble YAML line by
line. Failure modes reachable from the editor's own controls:

| Input | Line | Result |
|---|---|---|
| Stage renamed `Build: prod` | `github-actions.ts:66` — `- name: ${stage.name}` | Invalid YAML (or a nested mapping). |
| Multi-line `step.run` | `:72` `run: ${quote(...)}` | `quote()` returns a single-quoted scalar containing raw newlines — broken indentation, not a block scalar. |
| Branch `*` or `release: x` | `:40` `branches: [${branches.join(', ')}]` | `*` is an alias indicator in flow context → parse error. |
| Env key with `:` | `:70` | Invalid mapping. |

The workspace-bundle path *does* re-parse everything it emits
(`validateYamlArtifacts`), which makes the omission on the single-service export
path an inconsistency as much as a bug.

**Fix.** Build a JS object and `yaml.dump` it (use block scalars for multi-line
`run`), or keep the hand-built text but (a) quote every interpolated scalar and
(b) add the same parse-back assertion the workspace path already has — plus a
golden test with hostile names.

### GEN-03 — `dist/` is hardcoded as the build output — **Medium**

`COPY --from=builder /app/dist ./dist` (`generate.ts:131`) and
`CMD ["node","dist/main.js"]` (`conventionalCmd`) assume a NestJS-shaped layout.
For a project that builds to `build/`, `out/`, `.output/` or nothing at all, the
generated image is broken — and every check in the product still passes, because
nothing ever builds it. `DOCKER-LIMIT-001` acknowledges the CMD convention, but
the `COPY` assumption is not surfaced to the user at all.

**Fix.** Either detect the output directory (tsconfig `outDir`, Vite default,
NestJS default) into the IR, or emit an explicit, visible comment plus a Doctor
finding: "the image copies `dist/`; confirm your build writes there."

### GEN-04 — Generated Dockerfiles assume a lockfile that may not exist — **Medium**

DR-005 resolves the package manager from the `packageManager` field **before**
consulting lockfiles, so `packageManager: "pnpm@9"` with no `pnpm-lock.yaml`
yields a Dockerfile with `COPY package.json pnpm-lock.yaml ./` and
`RUN pnpm install --frozen-lockfile` — a guaranteed build failure that the tool
presents as a finished artifact.

**Fix.** Record lockfile presence during detection (a warning, or a nullable IR
field behind a spec amendment) and have the generator either fall back to a
non-frozen install with a loud comment or refuse with a clear message.

### GEN-05 — GitLab export ignores the IR's docker-build image — **Medium**

`gitlab-ci.ts:73-74` hardcodes `image: docker:27` and `services: [docker:27-dind]`
while DR-011 put `docker:25` in the IR. The IR is supposed to be the source of
truth (ADR-0003); here the generator overrules it, and it silently requires a
privileged GitLab runner — a real deployment constraint the output never mentions.

### GEN-06 — Multi-image chains are flattened silently-ish — **Low**

`github-actions.ts:57-65` runs every stage in the *first* stage's image and
leaves a comment. A user who deliberately gave `test` a different image gets a
workflow that does not reproduce their local run; the comment is in the file, not
in the UI.

### GEN-07 — Workspace GHA block scalar breaks on multi-line commands — **Low**

`workspace-bundle/generate.ts:254-255` emits `run: |` then each `step.run` at a
fixed 10-space indent. A command containing newlines de-indents the continuation
lines and breaks the block — the same class of bug as GEN-02, in the path that
otherwise validates its YAML (the bundle would catch it as a failed check, which
turns a data problem into a hard generation failure with an obscure message).

---

## 4. CI import

### IMP-01 — Multi-line `run:` blocks are joined with ` && ` — **High**

```ts
// ci-import/github-actions.ts:117
const run = step.run.trim().split('\n').join(' && ');
```

GitHub's `run: |` blocks are shell scripts. Joining lines with `&&`:

- **comments out the rest of the block** if any line starts with `#`
  (`# install deps && npm ci` — everything after the `#` is a comment);
- breaks any line that is not a complete command (loops, heredocs, `if` blocks,
  line continuations);
- changes failure semantics (a script runs under `set -e` per line; `&&` chains
  short-circuit differently and collapse exit codes).

The importer is one of the product's headline features ("turn an existing CI file
into an editable pipeline"), and this silently mistranslates the most common
GitHub Actions idiom. No warning is emitted.

**Fix.** Emit one IR step per non-empty line (the IR already models a list of
steps, and per-step granularity is better for the editor anyway), or keep the
newlines in a single step and let the executor pass the script to `sh -c`
verbatim. Warn when a block contains comments or shell control flow.

### IMP-02 — Shared `env` object across steps — **Medium**

`ci-import/gitlab-ci.ts:99-110` assigns the same `env` object reference to every
step of a job. Any future per-step env edit mutates all of them; canonical
serialization also duplicates the content per step, inflating the document.

### IMP-03 — Package-manager inference from free text — **Medium**

`infer.ts:25-28` decides the package manager with `\bpnpm\b` / `\byarn\b` /
`\bnpm\b` over *all* command text, first match wins in that fixed order. A
workflow that runs `npm ci` but mentions pnpm in a comment or in a cache key is
classified as pnpm, which then drives the install command, the Dockerfile lockfile
line and the corepack prefix. The result carries warnings for skipped actions but
never says "I guessed your package manager from command text".

**Fix.** Add an explicit inference-provenance warning per inferred field, and
prefer the *install* command's binary over any mention.

### IMP-04 — Provider sniffing is regex-shaped — **Low**

`sniffProvider` (`ci-import/index.ts:12-20`) can match a Kubernetes manifest or
an Azure Pipelines file well enough to pick a converter and then fail with a
confusing downstream message. A cheap structural check after `yamlLoad` would be
more honest.

---

## 5. Product behaviour

### UX-01 — Unresolved fields cannot be resolved in the product — **Critical (for the product story)**

The chain is airtight and it dead-ends:

1. DR-004 only reads `engines.node` (`dr-004-runtime-version.ts`). Most real
   projects do not declare it — `.nvmrc`, Volta, `.node-version` and CI
   `setup-node` are all ignored.
2. The detector then emits `runtime.version: null` + a paired `unresolved` entry.
3. `findUnrunnableReason` makes that a hard block on `/api/generate`,
   `/api/export/:provider` and `/api/execute` (422 / `unrunnable`).
4. The UI disables **Generate artifacts** and **▶ Run pipeline** and displays
   "Resolve `/project/runtime/version` before generating."
5. `UnresolvedPrompt` (`Editor.tsx:342-357`) renders a `<code>` and a message.
   **There is no input.** Nothing anywhere in the frontend can set
   `project.runtime.version`, `packageManager.name/version` or `language` — the
   editable surface is stages, steps, images and trigger branches only.

So for a normal Node project the product detects, renders, scores and autosaves a
pipeline it will never let the user generate or run, and instructs them to do
something the UI does not permit. The only escapes are editing the target
project's `package.json` or hand-editing an exported IR and re-importing it.

Every fixture in `test/fixtures/` declares `engines.node` and (mostly)
`packageManager`, which is exactly why 290 green tests do not see this.

**Fix (both halves).** (a) Make unresolved prompts *editable*: a small form that
commits a value and drops the paired `unresolved` entry — this is the missing
half of the IR's `null ⟺ unresolved` design, and it needs a spec amendment
because it adds a new editable surface. (b) Widen DR-004's evidence to `.nvmrc` /
`.node-version` / `volta.node` (a detection-rule change, hence a rules-doc + spec
update), or make the version `assume-default` to the current LTS with a visible
"assumed" badge instead of a blocking unresolved.

### UX-02 — The frontend's runnability gate disagrees with the backend's — **High**

```ts
// frontend/src/editor/working-ir.ts:16-20
export function hasUnresolvedRequiredField(ir) {
  if (ir.project?.packageManager?.name == null) return '/project/packageManager/name';
  if (ir.project?.runtime?.version == null)     return '/project/runtime/version';
  return null;
}
```

The backend blocks on **five** fields (`ir/unrunnable.ts:19-25`), including
`/project/packageManager/version`, `/project/runtime/name` and `/project/language`.
When one of the three the UI ignores is null, Generate and Run look enabled and
fail with a 422 citing a field the interface never mentioned.

**Fix.** Import `findUnrunnableReason` from `@modules/ir` in the frontend — the
alias already exists and this is precisely the class of drift the shared-symbol
design was created to prevent.

### UX-03 — The workspace bundle is delivered file-by-file with mangled names — **Medium**

`WorkspaceStudio.tsx` downloads one artifact at a time and flattens the path
(`active.path.replace(/\//g,'__')` → `frontend__Dockerfile`). A five-service
bundle is ~16 downloads that the user must rename and re-file by hand. For a
product whose value proposition is "generate everything together", the last mile
is manual.

**Fix.** A client-side zip preserving paths (or a copy-all-as-shell-script
fallback); optionally an explicit, confirmed "write into the project" action —
the read-only stance is a good default but it does not have to be the only one.

### UX-04 — Port inputs coerce to 0 — **Medium**

`Number(event.target.value)` on an empty `<input type="number">` yields `0`
(`WorkspaceStudio.tsx:328`, `:344`), which passes client-side and fails later as a
server check line. Intermediate typing states are equally broken.

**Fix.** Keep the raw string in state, validate on blur, show the error inline.

### UX-05 — Duplicate Doctor finding ids — **Medium**

`frozenFinding` builds `id: unfrozen-install:${stage.id}` (`analyze.ts:185`) but
is emitted **per step** (`analyze.ts:103-113`). A stage with two unfrozen install steps
produces two findings with the same id → duplicate React keys in `DoctorPanel`
and −20 instead of −10 on the score.

### UX-06 — The Doctor does not flag its own detector's fallback image — **Low**

`nodeImageFor` emits `node:lts-alpine` when the version is unknown
(`rules/helpers.ts`). The unpinned-image rule only catches `:latest` or a missing
tag (`analyze.ts:34`), and the drift rule only matches `^node:(\d+)`. The most
common floating tag the product itself produces is invisible to the product's own
reproducibility check.

### UX-07 — Imported pipelines are unrunnable by design, with no way back — **Low**

A pipeline loaded from a file or share link has `detectedPath === null`, so
RunPanel is replaced by "Detect a workspace project to unlock ▶ Run". There is no
"bind this pipeline to a folder" action, so the user must re-detect and lose the
imported document. (The project-card CI import path does set a runnable path —
which shows the mechanism exists.)

---

## 6. Frontend engineering

### FE-01 — History mutation inside a state updater — **Medium**

```ts
// useUndoableIR.ts:31-41
setWorkingIR((current) => { past.current.push(current); … return next; });
```

Updater functions must be pure; React 18 StrictMode invokes them twice in
development, so every edit pushes **two** history entries and ⌘Z appears to do
nothing on the first press. `main.tsx` renders inside `StrictMode`, so this is the
default dev experience.

**Fix.** Model it as one reducer over `{past, present, future}` (a single
`useReducer`), or compute the push outside the updater.

### FE-02 — Stale closure in the autosave effect — **Medium**

The effect at `Editor.tsx:777-800` branches on `saveState === null` but omits
`saveState` from its dependency array behind an eslint-disable. The branch decides
whether a pristine pipeline triggers a `DELETE`; reading a stale value makes the
behaviour timing-dependent.

### FE-03 — "Immutable Loaded IR" is only shallowly frozen — **Low**

`Object.freeze(JSON.parse(JSON.stringify(ir)))` (`Editor.tsx:535`, `:598`) freezes the top
level only; `loadedIR.project.runtime` is fully mutable. The invariant EDITOR-AC-024
tests behaviourally is not enforced structurally.

### FE-04 — Deprecated `escape`/`unescape` in share links — **Low**

`encodeShareHash` / `decodeShareHash` (`Editor.tsx:463-468`). Works today,
deprecated for two decades; `TextEncoder` + base64url is the drop-in.

### FE-05 — `Editor.tsx` is a 1 369-line component — **Low**

Discovery, drag-and-drop, import, share links, autosave, the stage chain, the
toolbar and an inline IIFE-rendered detail panel all live in one file with ~20
`useState` calls. It is readable today because it is well commented; it will not
stay that way. Extracting `useDetectFlow`, `useAutosave` and `<StageChain/>` is
low-risk.

### FE-06 — Two suites test CSS text, not behaviour — **Low**

`editor.css.spec.ts` and `product-shell.spec.ts` assert on the *contents* of CSS
and config files (focus-visible rules, proxy target, font references). They lock
strings, break on cosmetic refactors, and prove nothing about rendering. The
proxy-target assertion is genuinely useful; the CSS-text assertions would be
better as a computed-style check or dropped.

---

## 7. Architecture, build and dependencies

### ARCH-01 — The frontend compiles backend source — **Medium**

`@modules/ir → ../backend/src/modules/ir` (`vite.config.ts`, `tsconfig.json`)
delivers the "one symbol" guarantee the editor spec demands, but the cost is
real: the frontend image must be built from the repo root with a bespoke
`COPY backend/src/modules/ir`, the frontend's `tsconfig` compiles files outside
its own root, and any backend-side refactor of that folder breaks the frontend
build with no contract in between.

**Fix.** Promote the IR to an internal workspace package (`packages/ir`) consumed
by both apps. Same single symbol, a real boundary, simpler Docker context.

### ARCH-02 — Two different YAML parsers — **Medium**

Backend `js-yaml ^4.1.0`; frontend `js-yaml ^5.0.0` (5.0.0 installed). The editor
parses pasted YAML and round-trips exported YAML with a *different* major version
than the one that will parse it server-side on import. Any YAML 1.1/1.2 behaviour
change between 4 and 5 becomes a "works in the browser, fails in the API" class of
bug. EDITOR-AC-020's round-trip proof only exercises the frontend's parser.

**Fix.** Pin one version across both packages (and add a cross-parser test for the
export → import round trip).

### ARCH-03 — Tailwind is installed, configured and unused — **Medium**

`tailwindcss`, `postcss.config.js`, a themed `tailwind.config.js` and three
`@tailwind` directives in `index.css` — and not one utility class in 3 766 lines
of TSX (all styling is hand-written BEM across 3 322 CSS lines). It is a
dependency, a build step and a config surface that do nothing.

**Fix.** Remove it, or commit to it. The design tokens in `tailwind.config.js`
duplicate values that already exist as CSS custom properties.

### ARCH-04 — No linter, in a product that scores pipelines for not linting — **Medium**

There is no ESLint config anywhere, no `lint` script in either `package.json`, and
no lint step in `.github/workflows/ci.yml` — while `analyze.ts:92-100` penalises
*user* projects for having no lint stage, `CLAUDE.md` states the project must run
"build, lint, test" on itself, and the source contains
`// eslint-disable-next-line` comments that nothing enforces (including the ones
suppressing the real `react-hooks/exhaustive-deps` issues in FE-02).

This is the sharpest dogfooding gap in the repository: the tool would give its own
pipeline a worse grade than it gives its fixtures.

### ARCH-05 — Autosave keys are un-normalized path strings — **Low**

`StateStore.savePipeline(projectPath, …)` keys by the raw client string
(`store.ts:58`). `demo-api`, `./demo-api`, `demo-api/` and the contained absolute
path are four different saves for one project, so the restore bar and the "edited"
badges depend on how the user typed the path.

**Fix.** Key by the workspace-relative realpath (the controller already computes
`realCandidate`).

### ARCH-06 — Working-tree and repo hygiene — **Low**

`backend/test/` exists and is empty; `git status` shows a large staged deletion of
`backend/dist/**` (previously committed build output) and a staged deletion of
`backend/.env` while the file is still on disk. None of this is dangerous, but a
portfolio repository is read by humans and the first `git status` is part of the
first impression.

---

## 8. Spec-driven development — measured against `CLAUDE.md`

This section matters more than any single bug: the repository's stated purpose is
to *demonstrate* SDD, so drift here attacks the thesis, not just the code.

### SDD-01 — Implementation without an Accepted spec — **High**

`CLAUDE.md`: *"No implementation code before an Accepted spec covers it. […] do
not bypass it to 'save time.'"*

| Shipped code | Governing spec |
|---|---|
| `ci-export/github-actions.ts`, `ci-export/gitlab-ci.ts` | `github-actions-generator.spec.md` — listed **☐ Not started** in `docs/specs/README.md`; GitLab has no spec at all. |
| `ci-import/**` (two importers + inference) | none |
| `advisor/**` (Pipeline Doctor, scoring, grades) | none |
| `state-store/**`, `run-registry.ts` persistence | none |
| Share links (`#ir=`) | none |
| `/api/projects`, `/api/directories`, `/api/directories/resolve` | none |

`04-productization-brief.md` authorises these capabilities in prose, but prose
carries no `FR`/`AC` ids, so no test can trace to it and `test-strategy.md` cannot
account for them. The result is that roughly a third of the backend is outside the
process the project exists to demonstrate.

**Fix.** Write the missing specs retroactively and honestly — `CI-EXPORT`,
`CI-IMPORT`, `ADVISOR`, `STATE` — each with its `FR`/`AC` ids mapped to the tests
that already exist. That is a documentation exercise, not a rewrite, and it turns
the gap into evidence of rigour instead of evidence of drift.

### SDD-02 — A spec that contradicts its own test, while the traceability table claims coverage — **High**

- Spec: *"**EDITOR-AC-022** — The Editor exposes no UI control for editing
  `steps[].run`, adding a Stage, deleting a Stage, or reordering Stages (negative
  test by absence)."* (`visual-editor.spec.md:877`)
- Test: `Editor.spec.tsx:294-308` — *"T-EDITOR-022 (superseded) … This test pins
  the NEW surface: those affordances exist"*, asserting `Add stage`,
  `Delete lint stage` and `Edit install step 1` **are** present.
- Traceability: `test-strategy.md` still reports
  `EDITOR-AC-022 | T-EDITOR-022 (no add/delete/reorder/run-edit affordances present) | ✅`.

The table asserts the opposite of reality while showing a green tick. A reviewer
who trusts the traceability table is misled; the lifecycle in `specs/README.md`
("changes now require a changelog entry") was not followed.

**Fix.** Supersede AC-022 with an amendment describing the open editable surface
(and its new invariants: chain stays linear, ids stay unique), update the table,
and record the change in the spec changelog — the mechanism already exists and was
used well for the 2026-06-15 detector amendment.

### SDD-03 — The Executor is not "Done" by the project's own definition — **Medium**

`pipeline-executor.spec.md` defines `EXEC-AC-001…017` and the tests exist
(`execute.pure.spec.ts`, `execute.docker.spec.ts`, `workspace.spec.ts`,
`output-buffer.spec.ts`), but **`test-strategy.md` contains zero `EXEC-AC` rows**.
Per its own "Definition of Done", a criterion with no traceability row is not
covered — which is consistent with the status column: IR, DOCKER, DET, EXEC and
EDITOR are all still `Accepted`, never advanced to `Implemented`, even though
every one is implemented and green.

**Fix.** Add the 17 EXEC rows and advance the five statuses. Low effort, high
signal — the progress board currently understates the project.

### SDD-04 — Non-obvious decisions with no ADR — **Medium**

`CLAUDE.md` step 4: *"Record any non-obvious decision as a new ADR."* Missing:
joining multi-line `run` blocks with `&&` on import (IMP-01 — a semantic decision
with real consequences), hardcoding `docker:27`+dind in the GitLab export
(GEN-05), the advisor's penalty weights and grade bands, persisting state in
`~/.pipe-editor` keyed by a workspace hash, and the share-link format (which is a
security-relevant choice, see SEC-02).

### SDD-05 — The detection-rules catalogue is unverified prose — **Low**

`docs/rules/detection-rules.md` describes DR-001…011; nothing asserts that
`ALL_RULES` matches the catalogue (ids, targets, evidence order). A cheap test
("every documented DR id is registered, and vice-versa") would make the document
self-enforcing.

---

## 9. Testing

| # | Gap | Severity |
|---|---|---|
| TEST-01 | **No fixture without `engines.node` or without a lockfile.** All 11 declare `engines.node`. This single blind spot hides UX-01, UX-02 and GEN-04 behind 290 green tests. Add `node-npm-no-engines/` and `node-pm-field-no-lockfile/` and assert the *whole* flow, not just detection. | High |
| TEST-02 | No adversarial-input tests for generators and importers: scoped package names, names/stage names with newlines or `:`, multi-line commands, a branch literal `*`, env keys with `:`, a 50 MB manifest, a 10⁵-deep IR. | Medium |
| TEST-03 | `/api/export/:provider` output is never parsed back as YAML in any test, although the workspace-bundle path proves the technique works. | Medium |
| TEST-04 | No HTTP-level tests for `/api/advise`, `/api/state/*`, `/api/execute*`, `/api/projects`, `/api/directories*` — the underlying functions are covered, the wire contracts are not. | Low |
| TEST-05 | The Docker-unavailable degradation path (availability false → disabled Run with a reason) is not exercised end to end in CI. | Low |

---

## 10. Suggested order of work

**Now — the product is wrong without these**

1. UX-01: editable unresolved prompts (+ spec amendment) and/or widen DR-004.
2. UX-02: frontend imports `findUnrunnableReason`.
3. GEN-01 + GEN-02: sanitize interpolated values; emit YAML through a serializer;
   add the parse-back assertion to the single-service export path.
4. IMP-01: stop collapsing multi-line `run` blocks with `&&`.
5. TEST-01: the two missing fixtures, asserted through generate + run.

**Next — the claims must stay true**

6. SEC-01 (Host allowlist) and SEC-02 (provenance + explicit confirmation).
7. SEC-05: refuse to run when the temp copy is not visible to the daemon.
8. SDD-02 + SDD-03: fix the contradicted AC, add the EXEC rows, advance the five
   spec statuses.
9. SEC-03/SEC-04: image and env-key validation inside `validate()`.
10. GEN-04 + GEN-03: lockfile awareness and an honest build-output assumption.

**Then — the thesis must hold**

11. SDD-01: retroactive specs for CI export, CI import, advisor and state.
12. ARCH-04: ESLint + a `lint` script + a CI lint step (dogfooding).
13. ARCH-02/ARCH-03: one YAML version; remove or adopt Tailwind.
14. FE-01/FE-02, UX-05, ARCH-05, SEC-06/07/09.
15. ARCH-01: extract `packages/ir`.

---

## 11. One-paragraph verdict

The core is better than most projects of this kind: the IR contract is real and
enforced, the filesystem boundary is carefully built, the executor's security
model is correct by construction, and the tests genuinely run containers. The
weaknesses are concentrated in three places — the **last mile** (a user whose
project does not look like a fixture hits a dead end with no way out; the
generated artifacts are assembled by string concatenation and can be broken by a
scoped package name or a colon in a stage name), the **trust model** (an
unauthenticated loopback API with no rebinding defence, one click from executing
an IR that arrived in a URL), and the **process** (a third of the backend has no
spec, one acceptance criterion asserts the opposite of its own test, and the
traceability table shows it green). None of these require a rewrite. The first two
are a focused week; the third is documentation the project already knows how to
write — and, given that the repository exists to demonstrate spec-driven
development, closing it is worth more than any feature.
