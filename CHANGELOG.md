# Changelog

All notable changes to Pipe Editor are documented here. The project follows
[Semantic Versioning](https://semver.org/) while APIs remain pre-1.0.

## Unreleased

### Added

- Retroactive specifications for the four components that had shipped without
  one — `CI-EXPORT`, `CI-IMPORT`, `ADVISOR` and `STATE` — each with `FR`/`AC`
  ids mapped to the tests that already existed, and a Provenance section saying
  plainly that the spec followed the code.
- ADRs for the decisions that had been made in code with no record: YAML
  emission and the parse-back check (0013), imported `run:` blocks staying
  scripts (0014), the Doctor's weights and grade bands (0015), and where local
  state lives and what a share link is (0016).

- ESLint in both packages, a `lint` script alongside `typecheck` and `test`, and
  a lint step in CI. `pnpm check` is now typecheck + lint + build + test, which is
  what CLAUDE.md always said the project must run on itself.

- Pipelines now carry their provenance (detected, imported or shared). A shared
  link shows every command it contains and loads only when you say so, and the
  first run of any pipeline you did not detect yourself requires acknowledging
  the commands it will execute (EDITOR-UI-FR-019, EDITOR-AC-040…042).

- Unresolved project fields are now resolvable in the editor: each prompt carries
  a control (a select for package manager, runtime and language; a text input for
  the two version fields) that commits the value and clears the prompt in one
  undoable edit (EDITOR-UI-FR-018, EDITOR-AC-037…039).

- Productized local-CI-studio shell with a responsive editor and tool rail.
- Self-contained brand mark and favicon.
- Lightweight API and container health checks.
- GitHub Actions CI, contributor guidance, security policy and MIT license.
- Explicit bounds for captured container output, SSE replay and browser logs.
- Byte-accurate 512 KiB bounds for pasted and workspace-backed CI imports.
- Strict typecheck and reproducible CI quality gates.
- Multi-service workspace inspection for Vite, NestJS and generic Node projects.
- Editable per-service ports, start commands, build commands and test commands.
- Per-service Dockerfiles plus root or standalone Docker Compose generation.
- Selected-provider basic CI bundles for GitHub Actions or GitLab CI, with a
  complete artifact preview and validation report.
- A contained folder browser and folder drag-and-drop for project selection,
  including safe unique-name resolution when browser privacy hides host paths.
- Safe host-path aliases so absolute Finder paths work through Docker mounts.

### Fixed

- Undo/redo is a single reducer over `{past, present, future}`. History used to
  be pushed inside a state updater, which React 18 StrictMode invokes twice, so
  every edit recorded two entries and the first ⌘Z appeared to do nothing.
- The autosave effect no longer reads a stale `saveState`: the fact it actually
  needs — whether anything has been persisted for this project yet — is a ref,
  so the dependency list is complete without the effect re-running on its own
  writes. The last two `eslint-disable` comments are gone and
  `react-hooks/exhaustive-deps` is now an error, with warnings failing the lint
  gate in both packages.

- Autosaved pipelines are keyed by the workspace-relative realpath, so
  `demo-api`, `./demo-api`, `demo-api/` and the absolute path are one project
  rather than four separate saves. The picker's "edited" badges now key off the
  same value the picker displays.
- Share links are encoded with `TextEncoder` and base64url instead of the
  deprecated `escape`/`unescape` pair, and a corrupted link is reported as
  corrupted rather than decoded into a half-formed document.

- `EDITOR-AC-022` asserted that the editor exposed no controls for editing a
  step's command, adding a Stage or deleting one — the opposite of the shipped
  code and of its own test — while the traceability table reported it covered.
  The criterion and `EDITOR-UI-FR-013` are superseded by `EDITOR-UI-FR-020` and
  `EDITOR-AC-043`, which describe the real surface and name the invariants every
  edit preserves.

- A local run now proves the Docker daemon can see the temporary workspace copy
  before any stage executes, and aborts with `DOCKER_WORKSPACE_NOT_VISIBLE`
  otherwise. A bind mount whose source does not exist on the host is created as
  an empty directory rather than refused, so a tolerant pipeline could previously
  report success having validated nothing.
- Manifest reads are size-bounded at 8 MiB, so one oversized file in a workspace
  can no longer turn a discovery scan into an out-of-memory kill.
- An SSE stream whose run was evicted between the lookup and the subscription now
  closes with an explanatory event instead of staying open emitting heartbeats.

- The API now answers only requests whose `Host` names this machine, and refuses
  state-changing requests carrying `Sec-Fetch-Site: cross-site`. Binding loopback
  and narrowing CORS did not stop DNS rebinding: a page on another domain whose
  DNS points at 127.0.0.1 becomes same-origin and could read the project list,
  the directory tree, manifest contents and file contents, and start runs. Extra
  hostnames can be allowed with `PIPE_EDITOR_ALLOWED_HOSTS`.
- CORS no longer allows credentials; the API has no cookie, session or token.

- `validate()` now constrains the two IR values that leave the document for a
  place that can reinterpret them: `container.image` must be a real image
  reference (so a value starting with `-` cannot shift the image slot on the
  docker argv) and `step.env` keys must be environment variable names. Both
  checks live in the validator, so every consumer inherits them.
- Recursive walks over a client-supplied document are depth-bounded. A deeply
  nested body used to exhaust the stack and surface as an opaque 500; it is now a
  validation error.

- The workspace bundle's GitHub Actions file indents every line of a multi-line
  command, instead of only the first. A command containing newlines used to
  de-indent its continuation lines, break the block scalar and fail the bundle's
  own YAML re-check with an obscure message.

- A project that declares a package manager but has no lockfile now gets an
  install command that can actually run. `packageManager: "pnpm@9"` with no
  `pnpm-lock.yaml` used to produce `pnpm install --frozen-lockfile` and a
  `COPY package.json pnpm-lock.yaml ./`, both of which fail by definition, and the
  tool presented them as finished artifacts. Detection now warns, DR-007 emits a
  resolving install, and the generated Dockerfile makes the lockfile copy optional.

- The generated Dockerfile states, in the file, that it assumes the build writes
  to `dist/`, and the Pipeline Doctor reports the same assumption — the tool
  reads manifests only and cannot confirm where a build actually writes.
- The Pipeline Doctor flags floating tags such as `node:lts-alpine`, which is the
  image pipe-editor's own detector emits when the Node version is unknown.
- Doctor finding ids are unique per step, so a stage with two unfrozen install
  steps no longer produces duplicate ids and no longer docks the score twice for
  one displayed finding.

- Importing a GitHub Actions `run: |` block no longer flattens it with ` && `,
  which commented out the whole block when any line started with `#` and broke
  every loop, `if` and heredoc. The script is preserved verbatim and the importer
  says so.
- The GitLab importer gives each step its own `env` object instead of sharing one
  reference across a job's steps.
- Package-manager inference prefers the binary in an actual install command over
  a mention anywhere in the text, and every inferred project fact now carries a
  warning saying it was inferred.
- Provider detection for an auto-detected import is decided on the parsed
  document, so a Kubernetes manifest, an Azure Pipelines file or a Compose file
  is refused outright instead of being fed to a converter that fails later with a
  confusing message.

- The executor now runs a stage's steps as a script under `set -e` rather than
  joining them with ` && `, so a step ending in a comment can no longer comment
  out the steps after it, while a failing step still aborts the stage.

- Both CI exporters now refuse an IR with unresolved required fields, the way
  the Dockerfile generator already did. A direct module caller previously got a
  workflow whose base image was the `node:lts-alpine` fallback — a floating tag
  standing in for a version the document explicitly says is unknown.

- Scoped package names now produce valid Docker references. `@acme/api` used to
  generate `docker build -t @acme/api:ci .` in every exported CI file — an
  invalid reference that nothing in the pipeline noticed. One shared
  `dockerTagSlug` now serves DR-011 and both workspace-bundle call sites, and
  control characters are stripped from anything interpolated into a generated
  comment.

- Two fixture golden IRs declared npm and yarn but carried the pnpm install
  command, copied from the pnpm fixture. The Dockerfile generator branches on
  `packageManager.name` and ignores the step text, so its goldens passed and
  nothing noticed — while CI export and the executor emit `run` verbatim.
  A coherence test now locks every golden to its own declared package manager.

- Detection now resolves the Node version from `volta.node`, `.nvmrc` and
  `.node-version` as well as `engines.node`, so a project that pins its version
  the ordinary way no longer detects to a pipeline that can never be generated or
  run (DR-004, DET-AC-020, ADR-0011).

- The editor's Generate/Run gate now derives from `findUnrunnableReason`
  (`@modules/ir`) instead of a local two-field check, so the UI no longer enables
  actions the API refuses with a 422 naming a field the interface never showed
  (EDITOR-UI-FR-017, EDITOR-AC-036).

- The production backend image now declares `express` as a direct runtime
  dependency, preventing the Compose container from restarting as unhealthy.
- CI now starts the production Compose stack and checks both health endpoints,
  catching missing runtime dependencies before merge.
- Workspace scans now track existing Compose filename variants and generate a
  deterministic `docker-compose.pipe-editor*.yml` alternative without replacing
  the user's files.
- Project opening now has distinct single-app and multi-service actions, standard
  folder selection/navigation behavior, actionable path errors, and responsive
  layouts for tablet and mobile widths.
- Vite now proxies to the backend's IPv4 loopback address, avoiding failures on
  machines where `localhost` resolves to IPv6 first.
- The Vite development server now also binds IPv4 explicitly, so the documented
  `127.0.0.1:5173` preview and in-app workspace scan stay reachable.
- Project discovery no longer follows directory symlinks outside the workspace.
- Narrow layouts no longer compress wrapped project metadata or pipeline controls.
- JSONC comment handling no longer corrupts `tsconfig` aliases such as `@/*`.
- Workspace scans ignore test-fixture directories and do not reserve ports for
  package-only monorepo roots.

### Security

- Added baseline HTTP response headers and an nginx Content Security Policy.
