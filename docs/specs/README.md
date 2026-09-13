# Specifications

A **specification** in this project is a contract: a set of verifiable assertions
about one component, written *before* the component is implemented. Specs are the
heart of the Spec-Driven Development process this project demonstrates.

## What makes a good spec here

- It defines **contracts** (inputs and outputs), not implementations.
- Its functional requirements are **assertions**, not descriptions: "Given X, the
  component MUST do Y," never "the component handles X."
- Every requirement and acceptance criterion has a **stable ID** (see the
  [documentation index](../README.md#conventions-used-throughout)).
- Every acceptance criterion maps to at least one **test case** (see the
  [Test Strategy](../testing/test-strategy.md)). A spec without that mapping is
  not "Done."
- It states its **non-goals** explicitly. The boundary is part of the contract.

Every spec follows the standard structure: Objective, Scope, Local Definitions,
Input/Output Contracts, Functional Requirements, Non-Functional Requirements /
Constraints, Edge Cases, Acceptance Criteria, Open Questions, Changelog.

## Spec lifecycle

A spec moves through these statuses, recorded in its header table:

| Status | Meaning |
|---|---|
| **Draft** | Under active authoring or review. Content may change freely. |
| **Accepted** | Reviewed and agreed. Implementation may begin. Changes now require a changelog entry. |
| **Implemented** | The component exists and all acceptance criteria are covered by passing tests. |
| **Superseded** | Replaced by another spec. The file is kept and points to its replacement. |

Specs are **never deleted**. A superseded spec is marked `Superseded by …` in its
header so the reasoning trail is preserved.

Significant decisions made while authoring a spec are captured as
[ADRs](../adr/README.md) and linked from the spec header.

## Planned specs and order

The order follows the dependency graph: the IR is the contract everything else
consumes, so it comes first. A minimal generator comes next to *stress the IR
with a real consumer* before the expensive components are built.

| # | Spec | Component | Status | Notes |
|---|---|---|---|---|
| 1 | [`pipeline-ir.spec.md`](./pipeline-ir.spec.md) | `IR` | ✅ Implemented | The central contract. Settles the three open boundary decisions. |
| 2 | [`dockerfile-generator.spec.md`](./dockerfile-generator.spec.md) | `DOCKER` | ✅ Implemented | Cheap consumer that validates the IR before it hardens. |
| 3 | [`detector-engine.spec.md`](./detector-engine.spec.md) | `DET` | ✅ Implemented | How the project is traversed and reported. Pairs with [Detection Rules](../rules/detection-rules.md). |
| 4 | [`pipeline-executor.spec.md`](./pipeline-executor.spec.md) | `EXEC` | ✅ Implemented | The expensive component. Accepted 2026-06-22; introduces the cross-cutting `findUnrunnableReason` helper in `@modules/ir` consumed by EXEC, DOCKER, and EDITOR. |
| 5 | `github-actions-generator.spec.md` | `GHA` | ☐ Not started | Co-designed with the executor for fidelity (same IR, two render targets). |
| 6 | [`visual-editor.spec.md`](./visual-editor.spec.md) | `EDITOR` | ✅ Implemented | Edits the IR. Comes last; depends on everything. Pairs with [ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md). Accepted 2026-06-21. |
| 7 | [`product-shell.spec.md`](./product-shell.spec.md) | `PRODUCT` | ✅ Implemented | Cross-cutting productization and experience hardening. Verified on desktop/mobile plus the full build and test gates. |
| 8 | [`workspace-bundle.spec.md`](./workspace-bundle.spec.md) | `WORKSPACE` | ✅ Implemented | Post-MVP multi-service discovery and portable Docker/Compose/basic-CI bundle. |

Update the **Status** column as specs progress. This table is the project's
at-a-glance progress board.

### Companion documents

| Document | Purpose | Status |
|---|---|---|
| [`docs/rules/detection-rules.md`](../rules/detection-rules.md) | DR-NNN rule catalogue (data side of the Detector). Pairs with `detector-engine.spec.md`. The Engine is the interpreter; this is the program it runs. | ✅ Accepted |

The Detector Engine spec was Accepted on 2026-06-15 and then amended in place
on the same date (the catalogue authoring stressed the `Case` contract); the
amendment is recorded in that spec's changelog. Status remains Accepted because
the widening is strictly additive — the engine spec's authority is unchanged.

## Status advance, 2026-09-13

`IR`, `DOCKER`, `DET`, `EXEC` and `EDITOR` moved **Accepted → Implemented**.

Per the lifecycle above, *Implemented* means the component exists and every
acceptance criterion is covered by passing tests. All five had satisfied that
for some time; the status simply was never advanced, and the adversarial
review (**SDD-03**) pointed out that the board therefore understated the
project. Two things had to be true before the advance was honest, and both
were done first:

1. **`pipeline-executor.spec.md` had no traceability at all.** Its 17
   criteria were tested — `execute.pure.spec.ts`, `execute.docker.spec.ts`,
   `workspace.spec.ts`, `output-buffer.spec.ts` — but
   `test-strategy.md` contained zero `EXEC-AC` rows, and by the project's
   own Definition of Done a criterion with no row is not covered. The 17
   rows are now there.
2. **`IR-AC-011` was the last partial row.** It asserts a disabled Stage is
   round-tripped by the editor, skipped by the executor and omitted from both
   generated artifacts; only the first was traced. The other two halves have
   been covered since EXEC and DOCKER landed, so the row now cites all of
   them.

`GHA` remains the one spec that is not started — see `CI-EXPORT` in the
retroactive specs, which covers the code that shipped in its place.
