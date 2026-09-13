# ADR-0005: Manifest-only detection in the MVP

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-15 |
| Affected specs | `pipeline-ir.spec.md`, `detector-engine.spec.md` |

## Context

The first of three boundary decisions deferred from
[MVP Scope](../product/02-mvp-scope.md#open-boundary-decisions) to the Pipeline
IR specification is **detection depth**: when the Detector traverses a Project,
what is it allowed to observe?

Two credible levels exist:

1. **Manifest-only.** Read a finite, enumerated set of structured, declarative
   project files (`package.json`, lock files, `nest-cli.json`, `tsconfig.json`,
   any pre-existing `Dockerfile`). Do not parse arbitrary source code.
2. **File-content inspection.** Additionally inspect source files — for example
   parse TypeScript imports to detect that `@nestjs/core` is actually used.

This decision shapes the surface area of every Detection Rule and the cost of
every one of them. It also shapes the project's exposure to per-language parser
work, which the MVP deliberately narrows to a single stack (Node/NestJS).

## Decision

For the MVP, the Detector observes **manifest files only** — a finite,
enumerated set — and **parses their content**. "Manifest-only" is a constraint
on *which files* are read, not on the depth at which they are read. Detection
Rules MAY:

- read a manifest's full structured content (parse JSON / YAML / `key=value` /
  the Dockerfile's directive list);
- inspect specific keys and string values (e.g. `scripts.test`,
  `dependencies["@nestjs/core"]`, `engines.node`);
- match against an allowed vocabulary inside those values (e.g. detect that
  `pnpm` is named in `packageManager`).

Detection Rules MUST NOT:

- read or parse any file outside the enumerated manifest set;
- scan or parse arbitrary source code (`.ts`, `.js`, `.json` files that are not
  in the manifest set, etc.);
- shell out, network, or otherwise observe the project beyond reading the
  enumerated files.

The enumerated manifest set, for the MVP, is exactly:

- `package.json` — full content: `scripts`, `dependencies`,
  `devDependencies`, `engines`, `packageManager`, `name`, `version`, `type`.
- `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` — presence is the primary
  signal; lockfile *headers* may be read (e.g. pnpm `lockfileVersion`) to
  derive a package-manager version. The lockfile dependency tree is not
  walked.
- `nest-cli.json` — full content.
- `tsconfig.json` — `compilerOptions.target`, `compilerOptions.module`,
  `include`, `exclude`.
- Any pre-existing `Dockerfile` at the Project root — directive-level reading
  only (which directives appear, e.g. presence of `CMD` / `EXPOSE`). Not a
  general Dockerfile interpreter.

The set is **closed**. Adding a manifest file kind to it requires updating the
Pipeline IR spec. Reading source files (e.g. `src/main.ts`) is not permitted
by any rule in v1, regardless of how trivial the read might seem.

### MVP boundary: Project root

A Detection Rule reads manifests relative to the Project's `rootPath` — the
single folder the user pointed at. Workspace traversal (descending into
sub-packages and reading *their* manifests) is **out of scope for the MVP**;
see the [Pipeline IR Spec](../specs/pipeline-ir.spec.md#scope) for the
workspace policy and rationale.

## Alternatives considered

- **Option A — Manifest-only (chosen).**
  - *Pros:* small, stable, cheap; no per-language parsers; aligns with the
    MVP's "one stack" constraint; keeps each Detection Rule small and
    independently testable; covers everything the MVP requires (language,
    package manager, available scripts).
  - *Cons:* misses signals that are only visible in source code (e.g. a project
    that imports `@nestjs/core` but does not declare it in `package.json`).
- **Option B — File-content inspection.**
  - *Pros:* richer signal; a step toward "really understand the project."
  - *Cons / why NOT:* invites per-language parser dependencies; expands the
    Detector's surface area sharply for marginal MVP benefit; the same effect
    is almost always achievable by reading the declared dependency in
    `package.json`. Out of proportion with the MVP's narrowing to one stack.

## Consequences

- **Positive:** small, fast, deterministic Detector; Detection Rules stay
  individually testable; the IR contract is decoupled from any source-language
  parser; the boundary is explicit and gated.
- **Negative / accepted costs:** some signals are unreachable in v1 — Detection
  Rules that depend on source-level evidence cannot be written. Acceptable;
  none of the MVP rules need them.
- **Neutral / to revisit:** a later ADR may admit a narrowly scoped
  source-content rule (e.g. "Dockerfile already declares a `CMD`") when a
  concrete generator or executor need arises.

## Links

- [Pipeline IR Spec](../specs/pipeline-ir.spec.md) — settles this boundary.
- [Detection Rules](../rules/detection-rules.md) — the enumerated manifest set
  is reified here once the Pipeline IR spec is Accepted.
- [MVP Scope — Open boundary decisions](../product/02-mvp-scope.md#open-boundary-decisions)
