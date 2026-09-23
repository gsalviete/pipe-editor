# CLAUDE.md

Operating instructions for Claude Code working in this repository. Read this
before doing anything. The design documentation in `docs/` is the **source of
truth**; this file tells you how to work within it.

## What this project is

`pipe-editor` is a spec-driven tool that understands a project, suggests a CI/CD
pipeline, lets the user adjust it visually, generates **portable** artifacts
(Dockerfile, Docker Compose, GitHub Actions and GitLab CI), and **validates the
pipeline locally in containers** before any push. It is a portfolio-quality
local developer product that demonstrates Spec-Driven Development,
contract-oriented architecture, and DevOps fundamentals.

This repo is a monorepo: `backend/`, `frontend/`, plus the design docs in `docs/`.

## The one rule that governs everything

**No implementation code before an Accepted spec covers it.**

Specs come first. Code follows a spec. Tests verify the spec's acceptance
criteria. If asked to build something that has no Accepted spec, stop and say so —
propose drafting or extending the spec first. This discipline is the entire point
of the project; do not bypass it to "save time."

## Source of truth and reading order

Start at `docs/README.md`. The intended reading order is:

1. `docs/product/01-vision.md` — what and why.
2. `docs/product/02-mvp-scope.md` — scope and **hard non-goals**. Respect these.
3. `docs/product/03-domain-glossary.md` — the ubiquitous language. Use these exact
   terms in code, comments, and docs.
4. `docs/adr/` — accepted decisions. Do not contradict them; if you believe one is
   wrong, propose a new ADR that supersedes it (never edit the old one away).
5. `docs/specs/` — component specifications and their status. `docs/specs/README.md`
   has the spec lifecycle and the planned order (IR first).
6. `docs/rules/detection-rules.md` — detection rules (scaffold until the IR exists).
7. `docs/testing/test-strategy.md` — how specs become tests.

## Conventions you must follow

- **Stable IDs.** Requirements `<COMP>-FR-NNN`, non-functional `<COMP>-NFR-NNN`,
  acceptance criteria `<COMP>-AC-NNN`, detection rules `DR-NNN`, ADRs `ADR-NNNN`,
  tests `T-<COMP>-NNN`. IDs are never reused. Tests reference the criteria IDs they
  cover.
- **Component codes:** `IR`, `DET`, `DOCKER`, `GHA`, `EXEC`, `EDITOR`, `PRODUCT`,
  `WORKSPACE`.
- **Status lifecycle** (specs & ADRs): `Draft → Accepted → Implemented → Superseded`.
  Never delete a doc; supersede it and link the replacement.
- **The IR is provider-neutral.** It carries no field or semantics specific to any
  one CI provider. Provider specifics live only inside generators. (See ADR-0003.)
- **Generated artifacts are portable.** Clean, commented, versionable, usable
  outside this tool.
- **Honest claims.** Local validation runs the *same pipeline steps* in containers;
  it does not claim byte-for-byte parity with a remote runner. (See ADR-0001.)
- **Docs language is English.** File names use kebab-case.

## MVP baseline and current non-goals

The historical MVP in `docs/product/02-mvp-scope.md` excluded GitLab and Compose.
The Accepted post-MVP Workspace scope now includes both. Current hard non-goals
remain OAuth / remote repo connectors, multi-language detection, real cloud
deploy, image publishing, full GitHub Actions runtime simulation (for example
`act`), auth, multi-user behavior and billing. See
`docs/product/05-local-workspace-scope.md`.

## Workflow for any change

1. Identify which spec governs the work. If none, draft/extend the spec first
   (status `Draft`) and ask for review before coding.
2. Implement against the Accepted spec only.
3. Add tests that map to the spec's acceptance-criteria IDs.
4. Record any non-obvious decision as a new ADR and link it from the affected spec.
5. Update the spec status (`Implemented`) and the traceability table in
   `docs/testing/test-strategy.md` when criteria are covered by passing tests.

## Dogfooding

This project must eventually run its own pipeline (build, lint, test) on itself.
Keep that in mind when structuring the repo.

## Open boundary decisions (settled in the IR spec, not before)

1. Detection depth — manifests only vs file-content inspection.
2. Behavior under uncertainty — `assume-default` | `omit` | `needs-user-input`.
3. IR topology — linear sequence vs DAG.

Do not hardcode answers to these elsewhere; they belong in `pipeline-ir.spec.md`.

## Agent skills

This project is configured for the ship-it pipeline.
Role config lives in docs/agents/ (tracker, labels, reviewer, notifier, validation).
Skills must read it instead of asking. Learned project rules are written back there.
Conversation language: en (source of truth: docs/agents/language.md).

## Guidelines

- GUIDELINES.md
