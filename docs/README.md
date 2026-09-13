# Documentation

This directory is the **source of truth** for the design of `pipe-editor`.
Everything here is versioned with the code, reviewed via Git, and written to be
consumed by humans and by coding agents alike.

## How this documentation is organized

| Directory | Purpose |
|---|---|
| [`product/`](./product/) | What we are building and why. Vision, MVP scope and non-goals, domain glossary. |
| [`specs/`](./specs/) | Verifiable component specifications. The contracts. One file per component. |
| [`rules/`](./rules/) | Detection rules — the assertions that turn an observed project into pipeline facts. The primary SDD showcase. |
| [`adr/`](./adr/) | Architecture Decision Records. *Why* non-obvious choices were made. |
| [`testing/`](./testing/) | Test strategy. How specs become tests, and how traceability is maintained. |

Test fixtures and golden files live outside `docs/`, in
[`test/`](../test/), because they are test code rather than documentation. The
[Test Strategy](./testing/test-strategy.md) points to them.

## Reading order

Read top to bottom for a full understanding of the project:

1. [`product/01-vision.md`](./product/01-vision.md) — the one-page vision.
2. [`product/02-mvp-scope.md`](./product/02-mvp-scope.md) — what the MVP includes and, just as importantly, what it explicitly does **not**.
3. [`product/03-domain-glossary.md`](./product/03-domain-glossary.md) — the ubiquitous language. Read this before any spec; the specs assume these terms.
4. [`adr/README.md`](./adr/README.md) — the accepted decisions that shape everything downstream.
5. [`specs/README.md`](./specs/README.md) — the specification lifecycle and the planned order of specs.
6. The specs themselves, in the order listed in `specs/README.md` — **Pipeline IR first**, because it is the contract every other component depends on.
7. [`rules/detection-rules.md`](./rules/detection-rules.md) — read alongside the detector spec.
8. [`testing/test-strategy.md`](./testing/test-strategy.md) — how the above is verified.

## Conventions used throughout

**Stable IDs.** Requirements, rules, and acceptance criteria carry stable,
greppable IDs. Tests reference these IDs. This is what closes the loop from
specification to verification.

| Artifact | Prefix | Example |
|---|---|---|
| Functional requirement | `<COMP>-FR-NNN` | `IR-FR-001` |
| Non-functional requirement | `<COMP>-NFR-NNN` | `IR-NFR-001` |
| Acceptance criterion | `<COMP>-AC-NNN` | `IR-AC-001` |
| Detection rule | `DR-NNN` | `DR-014` |
| Architecture decision | `ADR-NNNN` | `ADR-0001` |
| Test case | `T-<COMP>-NNN` | `T-IR-001` |

Component codes (`<COMP>`): `IR`, `DET` (detector engine), `DOCKER` (Dockerfile
generator), `GHA` (GitHub Actions generator), `EXEC` (executor), `EDITOR`,
`PRODUCT` and `WORKSPACE` (multi-service bundle).

**Status lifecycle.** Specs and ADRs move through
`Draft → Accepted → Implemented → Superseded`. Documents are never deleted; a
superseded document is marked as such and points to its replacement. The trail
of reasoning is part of the value of this project.

**Language.** Documentation content is written in English. File names use
`kebab-case`.
