# ADR-0006: Omit on uncertainty as the global default

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-15 |
| Affected specs | `pipeline-ir.spec.md`, `detector-engine.spec.md` |

## Context

The second boundary decision deferred from
[MVP Scope](../product/02-mvp-scope.md#open-boundary-decisions) to the Pipeline
IR specification is **behavior under uncertainty**: when a Detection Rule's
signal is ambiguous, what should happen to the fact it would otherwise infer?

The three candidate behaviors come from the
[Domain Glossary](../product/03-domain-glossary.md#status-and-confidence-vocabulary):

- `assume-default` — apply a sensible default and commit it to the IR.
- `omit` — leave the fact out of the IR entirely.
- `needs-user-input` — emit a placeholder that the Visual Editor must resolve.

A global default is required because most Detection Rules will not be specific
about ambiguity, and the safe choice for "most rules" sets the project's
character.

## Decision

The **global default** behavior on uncertainty is **`omit`**. Detection Rules
MAY opt into `needs-user-input` per rule, and MAY opt into `assume-default` per
rule **only** when the default itself is named and justified in the rule.

### Confidence threshold

A rule's `confidence` (from the [Domain
Glossary](../product/03-domain-glossary.md#status-and-confidence-vocabulary):
`high | medium | low`) determines whether the rule's fact is considered
*certain* or *uncertain*:

- `confidence: high` → the fact is **certain**. The Detector commits it to
  the IR; the `on-uncertainty` directive is ignored.
- `confidence: medium` or `confidence: low` → the fact is **uncertain**.
  The rule's `on-uncertainty` directive applies. The three branches are
  exhaustive:
  - `omit` (the default) → emit nothing.
  - `assume-default` → emit the rule's documented default as a committed
    value. The fact still appears in the IR; its origin is the rule's
    documented default, not a direct observation. *This is the path
    `assume-default` takes — it does not require `confidence: high`.*
  - `needs-user-input` → emit exactly one `unresolved` entry; no committed
    value at the same field.

A rule that wants its fact committed to the IR has two paths: (a) justify
`confidence: high` with a concrete observed condition, or (b) declare
`on-uncertainty: assume-default` and document the default. Both are
testable: every rule declares both fields, and the Detector's behavior is a
pure function of `(confidence, on-uncertainty)`. See IR-FR-009 for the
complete truth table.

For **required** IR fields, `omit` is not legal (omitting a required field
makes the IR invalid). The IR spec's [Required-field uncertainty
resolution](../specs/pipeline-ir.spec.md#required-field-uncertainty-resolution)
collapses `omit` into `needs-user-input` for those fields: the value is
`null` and a paired `unresolved` entry appears at the field path.

### IR document representation

- An **omitted** fact leaves no trace at all.
- A **needs-user-input** fact appears as an entry in the IR's top-level
  `unresolved` array with a human-readable message and field path.
- An **assume-default** fact appears as a normal committed value (its origin
  is a property of the rule, not of the IR document).

### Cross-spec coupling (editor obligation)

The `omit` default is honest **only** if the Visual Editor surfaces what was
omitted. A canonical Stage that is absent from the IR (e.g. no Lint stage was
inferred) MUST be visible in the Visual Editor as an "add this" suggestion
with an explanation ("We did not detect a lint script; add a Lint stage?").
Without this, `omit` becomes a silent failure mode — the user sees no Lint
stage and has no way to know one could have been added.

This obligation is recorded as a cross-spec contract from the
[Pipeline IR Spec](../specs/pipeline-ir.spec.md#cross-spec-dependencies) and
will be reified in `visual-editor.spec.md` when that spec is drafted.

## Alternatives considered

- **Option A — Default `omit` (chosen).**
  - *Pros:* honest — the IR asserts only what the Detector can verify; nothing
    silently appears in the pipeline without evidence; composes well with the
    Visual Editor, where missing blocks are visible and addable; keeps the
    committed IR small.
  - *Cons:* omits "probably useful" blocks the user might have expected to see
    suggested.
- **Option B — Default `assume-default`.**
  - *Pros:* produces a more complete-looking pipeline out of the box.
  - *Cons / why NOT:* commits to facts the Detector cannot prove. A wrong
    default *looks* correct, which is precisely the failure mode the project
    exists to avoid. Erodes the "validate before push" promise.
- **Option C — Default `needs-user-input`.**
  - *Pros:* maximally transparent.
  - *Cons / why NOT:* in practice would turn most pipelines into a wall of
    prompts; users would dismiss them and lose trust. Better as a per-rule
    opt-in for the few cases where the user truly must decide.

## Consequences

- **Positive:** the IR's claims stay calibrated; the Visual Editor gracefully
  surfaces what is missing; reasoning about a generated IR is straightforward
  ("what is there is what was detected").
- **Negative / accepted costs:** users sometimes need to add a stage manually
  that a heuristic could have guessed. Acceptable trade for honesty.
- **Neutral / to revisit:** once enough Detection Rules exist, a few may
  justifiably override to `assume-default` (e.g. "default package manager is
  `npm` when no lock file is present and `package.json` exists"). Each such
  override is reviewed on its own merits.

## Links

- [Pipeline IR Spec](../specs/pipeline-ir.spec.md) — settles this boundary.
- [Detection Rules](../rules/detection-rules.md) — per-rule overrides live here.
- [MVP Scope — Open boundary decisions](../product/02-mvp-scope.md#open-boundary-decisions)
