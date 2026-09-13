# ADR-0003: A single Pipeline IR as the source of truth

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-01 |
| Affected specs | `pipeline-ir.spec.md`, `detector-engine.spec.md`, `dockerfile-generator.spec.md`, `github-actions-generator.spec.md`, `pipeline-executor.spec.md`, `visual-editor.spec.md` |

## Context

The system has several components that all deal with "a pipeline": the Detector
infers one, Generators render it to artifacts, the Executor runs it, and the
Visual Editor edits it. Without a shared model, each component would carry its own
representation, and translating between them would be a constant source of bugs
and divergence — including the specific risk that the local Executor and the
GitHub Actions Generator drift apart, breaking the "validate before push" promise.

## Decision

We will define a single, neutral, serializable **Pipeline IR** as the source of
truth. The Detector **produces** it; Generators and the Executor **consume** it;
the Visual Editor **edits** it. No component maintains a separate competing model.

The IR is **provider-neutral**: it carries no field, name, or semantics specific
to any single CI provider. Provider specifics appear only at generation time,
inside individual Generators. This neutrality is a non-functional requirement of
the IR spec, because the whole portability promise depends on it.

## Alternatives considered

- **Option A — Single shared IR (chosen).**
  - *Pros:* one contract to specify and test; consistency across all components by
    construction; local Executor and Actions Generator derive from the same source,
    making local validation structurally honest; the IR is the perfect, central
    SDD showcase (a declarative contract specified before any code).
  - *Cons:* the IR must be designed carefully; an insufficient IR forces rework
    across consumers.
- **Option B — Per-component models with translators.**
  - *Pros:* each component evolves independently in the short term.
  - *Cons / why NOT:* N models and N² translations; guaranteed drift; no single
    place to reason about a pipeline; directly reintroduces the
    Executor-vs-Generator fidelity risk this decision exists to remove.

## Consequences

- **Positive:** a clean contract-oriented architecture; honest local validation;
  a strong SDD centerpiece; new consumers (e.g. a GitLab generator, an `act`
  backend) attach to the existing IR without touching others.
- **Negative / accepted costs:** the IR is a critical dependency; we mitigate the
  risk of an insufficient IR by specifying a **minimal Dockerfile generator
  immediately after the IR**, so a real consumer stresses the contract before it
  hardens.
- **Neutral / to revisit:** the IR will version (semver in its header); additive
  changes are expected as new consumers appear.

## Links

- [ADR-0001](./0001-native-container-execution.md) — relies on the shared IR for
  honest local validation.
- [Specs README](../specs/README.md) — spec ordering puts a minimal generator
  right after the IR to validate the contract early.
