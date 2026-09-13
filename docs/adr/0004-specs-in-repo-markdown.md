# ADR-0004: Specifications as Markdown in the repository

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-01 |
| Affected specs | all |

## Context

The project's specifications, ADRs, rules, and test strategy need a home and a
format. The candidates were: Markdown inside the repository, a separate knowledge
base (e.g. Obsidian), or both kept in sync.

## Decision

All design documentation lives as **Markdown inside the repository**, under
`docs/`. The repository is the single source of truth. The same content may be
consumed elsewhere (for example, read in Obsidian), but those are downstream
views, not the canonical home.

## Alternatives considered

- **Option A — Markdown in the repository (chosen).**
  - *Pros:* versioned alongside the code; reviewable via Git diffs and pull
    requests; directly consumable by coding agents (e.g. Claude Code) and future
    agents; makes the SDD process explicit to anyone who opens the project — which
    is itself a portfolio goal.
  - *Cons:* fewer authoring conveniences than a dedicated knowledge tool (no
    backlink graph UI, etc.).
- **Option B — External knowledge base as source of truth.**
  - *Pros:* richer authoring and navigation features.
  - *Cons / why NOT:* divorces the design from the code's history; not reviewable
    in the same flow as code; not the artifact a reader of the repository sees;
    harder for agents to consume reliably.
- **Option C — Both, kept in sync.**
  - *Cons / why NOT:* synchronization is overhead and a drift risk for no benefit
    over treating the repo as canonical and the KB as a read-only view.

## Consequences

- **Positive:** documentation and code evolve together with one review process;
  the repository self-documents its own engineering method.
- **Negative / accepted costs:** authoring happens in Markdown without a
  knowledge-base UI. Acceptable, and tool-agnostic.
- **Neutral / to revisit:** an Obsidian (or other) read-only view can be layered
  on top at any time without changing the source of truth.

## Links

- [Documentation index](../README.md) — the structure this decision organizes.
