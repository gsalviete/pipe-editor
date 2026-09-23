# Workspace Bundle Specification

| Field | Value |
|---|---|
| Component | `WORKSPACE` |
| Status | Implemented · amendment **Draft** (Hardening v2 Phase 1, 2026-09-23) — WORKSPACE-FR-014, WORKSPACE-AC-013 await acceptance |
| Accepted on | 2026-09-11 |
| Implemented on | 2026-09-11 |
| Product scope | [`05-local-workspace-scope.md`](../product/05-local-workspace-scope.md) |
| Architecture | [`ADR-0010`](../adr/0010-workspace-plan-above-service-pipelines.md) |

## Objective

Discover independently packaged Node services below a selected local folder and
generate a coherent, portable Docker + Compose + basic CI bundle without adding
cloud deployment semantics.

## Local definitions

- **Workspace:** the selected folder, contained by the configured workspace root.
- **Service:** a directory with a readable `package.json` and resolvable Node
  runtime/package manager.
- **Workspace Plan:** a provider-neutral aggregate containing one Pipeline IR
  plus containerization metadata per Service.
- **Root bundle:** service artifacts at their service-relative paths and one
  Compose file at the selected Workspace root. When a Compose file already
  exists there, the generated file uses a collision-free Pipe Editor name.

## Functional requirements

- **WORKSPACE-FR-001 — Contained inspection.** Inspection MUST accept only a
  relative path contained by `PIPE_EDITOR_WORKSPACE_ROOT`, including after
  symlink resolution.
- **WORKSPACE-FR-002 — Bounded discovery.** Inspection MUST reuse bounded,
  symlink-safe project discovery and MUST return at most 50 services.
- **WORKSPACE-FR-003 — Independent pipelines.** Every supported Service MUST own
  its own valid Pipeline IR. Failure in one candidate MUST be reported as a
  warning without hiding valid siblings.
- **WORKSPACE-FR-004 — Stack classification.** Manifest evidence MUST classify
  Vite, NestJS and generic Node services. Unknown frameworks MUST remain
  `node-generic`; source files MUST NOT be parsed.
- **WORKSPACE-FR-005 — Editable plan.** The user MAY change each Service's
  install, lint, test and build stages through its Pipeline IR, and MAY change
  its suggested port and runtime start command before generation.
- **WORKSPACE-FR-006 — Service artifacts.** Generation MUST emit a Dockerfile and
  `.dockerignore` for every Service. Vite output MUST use an nginx runtime;
  server-side Node output MUST use a Node runtime.
- **WORKSPACE-FR-007 — Compose modes.** `root` mode MUST emit one root
  `docker-compose.yml` referencing every Service context. `per-service` mode
  MUST emit one standalone Compose file beside each Service Dockerfile.
- **WORKSPACE-FR-008 — Basic CI.** Generation MUST require either
  `github-actions` or `gitlab-ci` and emit a basic validation/container-build
  pipeline for every Service. It MUST NOT push images or deploy.
- **WORKSPACE-FR-009 — Validation report.** Generation MUST return checks for
  unique service IDs, safe relative paths, valid IRs, Dockerfile structure,
  Compose structure and CI structure. Blocking failures MUST prevent a
  successful bundle response.
- **WORKSPACE-FR-010 — Portable paths.** Every artifact path MUST be relative,
  normalized with `/`, free of `..`, and located at the workspace root or inside
  a discovered Service.
- **WORKSPACE-FR-011 — Non-destructive delivery.** Generation MUST be read-only.
  The UI MUST preview and download artifacts without silently changing the
  selected projects.
- **WORKSPACE-FR-012 — Single-project compatibility.** Existing detect, edit,
  generate, execute and CI-export flows MUST remain unchanged.
- **WORKSPACE-FR-013 — Existing Compose protection.** Inspection MUST track
  Compose filename variants at the Workspace root and inside discovered
  Services. Generation MUST choose a deterministic, unused path and MUST NOT
  replace or reuse an existing Compose file path.

- **WORKSPACE-FR-014 — Contained manifest reads.** *(Draft — Hardening v2
  Phase 1, AR-02 / AR-03.)* Inspection MUST read every candidate service's
  `package.json` (and any other project file it reads) through the contained
  read of [STATE-FR-017](./state.spec.md#discovery) /
  [ADR-0019](../adr/0019-filesystem-boundary-reads-and-writes.md), with that
  service's directory as the boundary. A refused manifest is a per-candidate
  warning under WORKSPACE-FR-003. It never hides valid siblings and never
  blocks inspection.

## Non-functional requirements

- **WORKSPACE-NFR-001.** The Workspace Plan MUST contain no GitHub- or
  GitLab-specific keys.
- **WORKSPACE-NFR-002.** Identical normalized input MUST generate byte-identical
  artifacts, excluding existing Pipeline IR timestamps.
- **WORKSPACE-NFR-003.** Generated YAML MUST parse as a mapping.
- **WORKSPACE-NFR-004.** Service IDs MUST be valid Compose service keys and CI
  job identifiers.
- **WORKSPACE-NFR-005.** Unsupported or incomplete services MUST be visible as
  warnings, never silently fabricated.

## Acceptance criteria

| Criterion | Assertion |
|---|---|
| **WORKSPACE-AC-001** | Inspecting a fixture with frontend and backend returns two supported Services with independent valid IRs. |
| **WORKSPACE-AC-002** | A path escape or symlink escape is rejected using the existing HTTP security envelope. |
| **WORKSPACE-AC-003** | Vite is classified as `vite`, NestJS as `nestjs`, and an unrecognized Node package as `node-generic`. |
| **WORKSPACE-AC-004** | Root generation returns service Dockerfiles, dockerignores, one root Compose file and exactly one selected-provider CI file. |
| **WORKSPACE-AC-005** | Vite Dockerfile builds static output into nginx; NestJS Dockerfile runs compiled output with Node. |
| **WORKSPACE-AC-006** | Root Compose contains one build context per service, unique names, optional ports and restart defaults without cloud fields. |
| **WORKSPACE-AC-007** | Per-service mode emits a Compose file for every service and no root Compose file. |
| **WORKSPACE-AC-008** | GitHub and GitLab outputs include every service's enabled verification commands and Docker build, with no push/deploy command. |
| **WORKSPACE-AC-009** | Invalid duplicate IDs, unsafe paths or invalid service IRs fail validation and produce no bundle. |
| **WORKSPACE-AC-010** | Single-project editor and generator tests remain green. |
| **WORKSPACE-AC-011** | The UI can inspect a folder, select a service, edit its pipeline metadata/commands, choose Compose mode/provider and preview every artifact path. |
| **WORKSPACE-AC-012** | Existing `docker-compose.yml`, `docker-compose.*.yml`, `compose.yml`, and equivalent YAML variants are reported to the user and force generation to a collision-free `docker-compose.pipe-editor*.yml` path in the same directory. |
| **WORKSPACE-AC-013** *(Draft)* | Inspecting a workspace in which one candidate's `package.json` is a symlink outside that candidate's directory, and another candidate's is a FIFO, completes within 1 second, returns the healthy services, reports a warning for each refused candidate, and never includes the outside file's content. | T-WORKSPACE-013 (TASK-003) |

## Non-goals

Cloud deployment, image publishing, secret management, databases, automatic
dependency inference, Kubernetes and non-Node Dockerfile generation.

## Notes

The specification is Accepted from its first revision because it records the
product owner's explicit 2026-09-11 approval to begin implementation with cloud
kept outside the product.

## Changelog

| Date | Change |
|---|---|
| 2026-09-11 | Initial scope accepted from the product owner's multi-service workflow. |
| 2026-09-11 | Marked Implemented after backend, HTTP, UI, regression, typecheck and production-build verification passed. |
| 2026-09-12 | Added collision-safe tracking and naming for existing Compose files. |
| 2026-09-23 | **Amendment — Draft** (Hardening v2 Phase 1, `tasks/TASK-001`), from the second adversarial review's **AR-02** / **AR-03**. WORKSPACE-FR-001 contains the inspected *directory*, but candidate manifests were then read by following their path. New **WORKSPACE-FR-014** routes them through the contained read of STATE-FR-017 / [ADR-0019](../adr/0019-filesystem-boundary-reads-and-writes.md), with each service directory as the boundary. New **WORKSPACE-AC-013**. |
