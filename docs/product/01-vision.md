# Product Vision

| Field | Value |
|---|---|
| Status | Accepted |
| Last updated | 2026-06-01 |

## The vision in one sentence

`pipe-editor` understands a project automatically, suggests a suitable CI/CD
pipeline, lets the user adjust it through a simple visual editor, generates
portable and versionable artifacts, and validates the entire pipeline locally
before anything is pushed.

## The problem we care about

Setting up CI/CD is not hard because the YAML syntax is hard — generators and AI
already produce that. It is hard because:

- understanding *what a pipeline should do* for a given project requires
  experience the developer may not have yet, and
- the loop between "I changed the pipeline config" and "I found out whether it
  works" runs through a remote runner, which is slow, opaque, and frustrating to
  debug.

`pipe-editor` attacks both: it proposes the pipeline from the project itself, and
it closes the feedback loop locally.

## What this project is for

This is a personal project. Its primary purpose is learning and demonstration,
not commercial validation. Concretely, it exists to practice and showcase:

- **Spec-Driven Development** — specs as verifiable contracts written before code.
- **Contract-oriented architecture** — a single Pipeline IR as the source of truth.
- **DevOps fundamentals** — Docker, builds, environment isolation, and a local
  pipeline executor.
- **Modern engineering practice** — traceability, ADRs, golden-file testing,
  dogfooding the project's own CI.

Because the goal is learning rather than market fit, we deliberately accept a
broader scope than a startup MVP would — but only along axes that *teach* or
*demonstrate*, never along axes that merely add breadth (see
[MVP Scope](./02-mvp-scope.md)).

## What success looks like

- A reader who opens the repository can see the SDD process clearly, from spec to
  test.
- A thin but complete vertical slice works end to end: understand → suggest →
  visualize → generate portable artifacts → validate locally.
- The generated artifacts are clean enough that a user could take them and use
  them anywhere — portability is preserved, which also keeps the door open to a
  future product without paying for it now.

## Guiding principles

1. **Depth over breadth.** One language, one CI target, done well — not six, done
   shallowly.
2. **The IR is sacred.** It is the contract. It must stay neutral to any specific
   CI provider.
3. **Honest claims.** We validate *the same pipeline steps* locally; we do not
   claim byte-for-byte parity with a remote runner (see [ADR-0001](../adr/0001-native-container-execution.md)).
4. **Reasoning is an artifact.** Decisions are recorded as ADRs while the
   reasoning is fresh.
