# ADR-0010: Workspace Plan above service Pipeline IRs

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-11 |
| Affected specs | `workspace-bundle.spec.md`, `pipeline-ir.spec.md`, `visual-editor.spec.md` |

## Context

The post-MVP product accepts a folder that may contain a frontend, backend and
multiple services. A single Pipeline IR describes one project's ordered stages;
forcing multiple deployable units into that linear document would blur working
directories, runtimes, container images and generated artifact ownership.

## Decision

Introduce a `WorkspacePlan` aggregation outside the Pipeline IR. Each discovered
service owns one unchanged, provider-neutral Pipeline IR. The Workspace Plan
adds only local orchestration facts: service identity, relative build context,
classified Node stack, suggested port and generated-artifact paths.

Compose and multi-service CI generators consume the Workspace Plan. Existing
single-project generators and execution remain valid and unchanged.

The plan also carries a bounded inventory of existing Compose files at output
locations. Compose generation derives a deterministic unused artifact path from
that inventory, so the bundle never proposes replacing the user's current
Compose setup.

Generated files are previews by default. This release does not silently write
or overwrite files in selected projects.

## Consequences

- The existing IR contract and every single-project consumer remain stable.
- A service can be edited and validated independently before regenerating the
  aggregate bundle.
- Workspace orchestration stays provider-neutral; GitHub/GitLab syntax remains
  inside their generators.
- Cross-service runtime dependencies, secrets and databases are not inferred.
  Users may extend the portable Compose output after export.

## Alternatives considered

- **One enlarged Pipeline IR.** Rejected because it turns a service pipeline
  into a provider-shaped monorepo graph and violates the v1 linear semantics.
- **A provider-specific workspace model.** Rejected because it would duplicate
  facts between Compose, GitHub Actions and GitLab CI.
