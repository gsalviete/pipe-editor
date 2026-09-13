# Changelog

All notable changes to Pipe Editor are documented here. The project follows
[Semantic Versioning](https://semver.org/) while APIs remain pre-1.0.

## Unreleased

### Added

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
