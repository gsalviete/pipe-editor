# ADR-0002: Local folder input over remote repository integration (MVP)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-01 |
| Affected specs | `detector-engine.spec.md`, `pipeline-ir.spec.md` |

## Context

The original vision allowed connecting a GitHub repository, a GitLab repository,
or a local folder as the input the tool analyzes. Supporting remote repositories
requires OAuth flows, token storage, API clients, and per-provider quirks.

This is a personal learning and portfolio project. The question is whether remote
integration earns its cost against the project's goals (learning DevOps,
demonstrating SDD and contract-oriented design).

## Decision

For the MVP, the only input is a **local folder read from disk**. OAuth and remote
repository integration are explicitly out of scope.

## Alternatives considered

- **Option A — Local folder only (chosen).**
  - *Pros:* delivers the same "automatic project analysis" demonstration at a
    fraction of the cost; no auth plumbing; lets effort concentrate on the
    detector and executor, which is where the learning and the narrative live.
  - *Cons:* the user must have the project locally; no "paste a repo URL"
    convenience.
- **Option B — Local folder + GitHub/GitLab OAuth.**
  - *Pros:* nicer onboarding; closer to a real product.
  - *Cons / why NOT:* OAuth and API integration are pure plumbing — they teach
    little DevOps and are exactly where similar projects stall. They add
    significant effort without adding to the project's narrative.

## Consequences

- **Positive:** lower effort and risk; focus stays on high-value components;
  faster path to a finished vertical slice.
- **Negative / accepted costs:** input is restricted to local folders for now.
- **Neutral / to revisit:** remote repository connectors are a clean v2 addition;
  because the Detector consumes a filesystem-like view, a future connector can
  present a checked-out repo to the same Detector with minimal change.

## Links

- [MVP Scope](../product/02-mvp-scope.md) — non-goals.
