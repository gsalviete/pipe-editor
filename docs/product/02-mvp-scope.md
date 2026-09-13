# MVP Scope & Non-Goals

| Field | Value |
|---|---|
| Status | Accepted |
| Last updated | 2026-06-01 |

The MVP is a **thin vertical slice** that crosses every capability of the vision
end to end, narrowing each axis to its minimum. The slice is finishable and
demonstrable in a short video. Depth is concentrated on the two axes that prove
engineering: the detector and the local executor.

## In scope

| Capability | MVP boundary |
|---|---|
| **Input** | A **local folder** only. Read a directory from disk. |
| **Target stack** | **One** stack only: a Node.js / NestJS application. |
| **Analysis** | Detect language, package manager, and presence of `build` / `test` / `lint` scripts. |
| **Suggestion + visualization** | A canonical pipeline suggested from the analysis, rendered in the visual editor. The user can toggle blocks on/off. |
| **Generation** | Two portable artifacts: a `Dockerfile` and a **GitHub Actions** workflow. Clean, commented, versionable. |
| **Local validation** | Run the pipeline steps locally in Docker and report pass/fail per block — before any push. |

The vertical slice therefore touches all six vision capabilities — understand,
suggest, visualize, generate portable, validate locally — without supporting more
than one of anything.

## Non-Goals (hard boundaries)

These are explicitly **out** of the MVP. They are not failures of ambition; they
are the defense against the project never finishing. Each may return in a later
version.

- **No OAuth / remote repository connection.** Plumbing with little DevOps value;
  it is where similar projects stall. (See [ADR-0002](../adr/0002-local-folder-over-remote-repos.md).)
- **No multi-language detection.** "Understand any project" is a bottomless pit.
  One language is a hard frontier.
- **No second CI provider** (no GitLab CI) and **no `docker-compose` generation**
  in the MVP. They multiply effort without changing the narrative.
- **No real cloud deploy.** The most expensive part in credentials and
  networking, and the part that least depends on the author. A v2 candidate.
- **No simulation of the full GitHub Actions runtime** (e.g. via `act`) in the
  MVP. The executor runs native project commands in containers. (See
  [ADR-0001](../adr/0001-native-container-execution.md).)
- **No authentication, multi-user, billing, or persistence beyond local files.**

## Open boundary decisions

These are deliberately deferred to the **Pipeline IR Specification**, where they
must be settled because they shape the central contract:

1. **Detection depth** — does the detector read *manifests only*, or also
   *inspect file contents*?
2. **Uncertainty behavior** — on an ambiguous signal, does a rule
   `assume-default`, `omit`, or mark `needs-user-input`?
3. **IR topology** — does the IR model a linear sequence of blocks, or a DAG with
   dependencies?

## Definition of "MVP done"

- The vertical slice runs end to end on at least one real Node/NestJS fixture.
- Every spec in scope has all of its acceptance criteria covered by passing tests.
- The project's own CI runs the project's own test suite (dogfooding).
