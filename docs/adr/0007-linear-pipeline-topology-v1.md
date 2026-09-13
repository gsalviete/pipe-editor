# ADR-0007: Linear pipeline topology in v1 of the IR

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-15 |
| Affected specs | `pipeline-ir.spec.md`, `dockerfile-generator.spec.md`, `github-actions-generator.spec.md`, `pipeline-executor.spec.md`, `visual-editor.spec.md` |

## Context

The third boundary decision deferred from
[MVP Scope](../product/02-mvp-scope.md#open-boundary-decisions) to the Pipeline
IR specification is **IR topology**: does the IR model a pipeline as a **linear
ordered sequence** of Stages, or as a **directed acyclic graph (DAG)** with
explicit inter-Stage dependencies?

A DAG is the more general model — it can express parallel branches, fan-out,
fan-in. A linear sequence is a strict subset, easy to model and easy to render.
The choice affects every component: the Visual Editor (graph UI vs list), the
Generators (translating dependencies into provider syntax), and the Executor
(scheduling).

## Decision

Version 1 of the Pipeline IR models stage ordering as **explicit `dependsOn`
edges** in the schema. Every Stage carries a `dependsOn: [stageId, ...]`
field. The IR's contract therefore has the right *shape* to express a DAG from
day one.

v1 of the spec adds a **linear-chain validation rule**: the complete graph
formed by the `dependsOn` edges MUST be a single chain — every Stage has
in-degree ≤ 1 and out-degree ≤ 1, exactly one Stage has in-degree 0 (the
head), exactly one Stage has out-degree 0 (the tail), the graph is connected
and acyclic. Documents whose edges violate this rule fail validation in v1.

This separates two concerns:

- The **schema** (what fields exist) is DAG-ready.
- The **validator** (what shapes the schema admits) is linear-only in v1.

A future v2 IR relaxes the validator to accept any DAG; the schema and every
consumer that reads `dependsOn` is unchanged. Consumers therefore do not need
a breaking migration when topology generalizes — they only need to handle the
DAG case in their own logic.

Why this matters: encoding order as a bare ordered array (position = order)
would have hidden the dependency relation inside an implicit semantic of the
array. Moving from "implicit-position" to "explicit-edges" later would be a
breaking change to the central IR contract, which contradicts the "single
source of truth" promise of [ADR-0003](./0003-ir-as-single-source-of-truth.md).
Making the edges explicit now preserves additivity.

Parallelism within a single Stage may be added in a future minor revision as a
Step-level property. Cross-Stage parallelism is enabled by the v2 validator
relaxation, not by a schema change.

### Forward-compatibility note

GitHub Actions models inter-job ordering natively via `needs:` (a list of job
IDs). The IR's `dependsOn` is the provider-neutral analogue of that vocabulary.
The GitHub Actions Generator will translate `dependsOn` → `needs:` directly
once the validator allows non-linear shapes; in v1 it simply emits sequential
steps inside a single job. This direct translation is the practical reason for
using edges rather than position.

## Alternatives considered

- **Option A — Explicit `dependsOn` edges + linear-chain validator (chosen).**
  - *Pros:* the schema is DAG-ready from day one; relaxing to a DAG in v2 is
    additive, not breaking; consumers always read the same field; maps
    directly to GitHub Actions' native `needs:` vocabulary; cycle detection
    and chain validation are cheap in v1; explicit edges make the relation
    auditable in the document itself.
  - *Cons:* slightly more verbose than position-only ordering; v1 must
    implement a chain validator (small, ~30 lines).
- **Option B — Bare ordered array (position = order, no edges).**
  - *Pros:* maximally simple in v1; trivial Visual Editor (a list).
  - *Cons / why NOT:* the order relation is implicit in array position.
    Moving to a DAG later requires either adding `dependsOn` (breaking, because
    the new field changes how every consumer must compute order) or
    overloading position with a side table. Both options contradict
    [ADR-0003](./0003-ir-as-single-source-of-truth.md): the central contract
    must evolve additively.
- **Option C — Full DAG topology in v1.**
  - *Pros:* general; closer to how mature CI systems model pipelines.
  - *Cons / why NOT:* every consumer becomes more expensive (topological
    scheduling, graph rendering, multi-job `needs:` emission). Forces
    complexity the MVP does not require. The "two parallel branches" example
    does not appear in the MVP fixtures.

## Consequences

- **Positive:** the IR contract is DAG-ready while v1 stays linear; the
  Visual Editor renders a list (any chain is trivially a list) without
  precluding a graph view later; the GitHub Actions Generator's translation
  to `needs:` is direct; provider-neutrality is preserved because
  `dependsOn` is a generic graph concept, not a provider's word
  (`needs` from GHA stays on the forbidden list).
- **Negative / accepted costs:** every Stage carries a `dependsOn` field even
  when the array would obviously be `[<previous>]`. Slight verbosity. v1
  needs a small chain validator.
- **Neutral / to revisit:** v2 relaxes the chain validator to accept any DAG.
  No schema change, no consumer migration; only the validator and the
  consumers that *use* parallelism need to update. The IR's `version` field
  still bumps (MINOR) to advertise the relaxation.

## Links

- [ADR-0003](./0003-ir-as-single-source-of-truth.md) — the shared IR whose
  topology this ADR pins down.
- [Pipeline IR Spec](../specs/pipeline-ir.spec.md) — settles this boundary.
- [MVP Scope — Open boundary decisions](../product/02-mvp-scope.md#open-boundary-decisions)
