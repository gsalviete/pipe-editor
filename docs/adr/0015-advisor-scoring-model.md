# ADR-0015: The Pipeline Doctor's penalty weights and grade bands

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `advisor.spec.md` |

## Context

The Pipeline Doctor returns a score out of 100 and a letter grade. Five
constants produce them:

```ts
const PENALTY = { critical: 25, warning: 10, info: 3 };
score = max(0, 100 - sum(penalties));
grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
```

These were chosen in code with no recorded reasoning. The adversarial
review lists them under **SDD-04** as a non-obvious decision with no ADR,
and it is right to: a number a user is invited to trust, arrived at by
unexplained arithmetic, is the kind of thing a reviewer should be
suspicious of. The arithmetic is also load-bearing in a way plain prose
findings are not — a weight that is wrong makes the product recommend the
wrong priority.

## Decision

**The weights and bands are kept as they are, and the reasoning is recorded
here.**

**Penalties: 25 / 10 / 3.** These are not a measure of how bad something
is. They encode *how many findings of that kind it takes to leave the top
grade*:

| Severity | Penalty | Findings before the grade drops below A |
|---|---|---|
| `critical` | 25 | one |
| `warning` | 10 | two |
| `info` | 3 | four |

That is the property worth designing for. One critical finding —
an unpinned image, no install stage, a hardcoded secret — should be enough
to say "this pipeline is not fine", because each of those means the
pipeline does not reliably do the job it claims. Two warnings should,
because a single missing guarantee is a judgement call and two is a
pattern. Four `info` findings should, because that is a pipeline with a lot
of small things wrong.

**Floor at 0, not negative.** A score of −40 says nothing a 0 does not, and
a bounded scale keeps the grade meaningful.

**Bands 90 / 70 / 50.** Standard academic bands, chosen because they are
the ones a reader already knows how to interpret without a key. The fit
with the penalties is deliberate: A means "nothing critical and at most one
warning", B means "a couple of real gaps", C means "several", D means "this
needs work before it is trustworthy".

**Severity assignment is the actual decision.** Given the above, choosing a
finding's *severity* is where the judgement lives, and it follows one rule:

- `critical` — the pipeline does not reliably do what it claims to do.
  Unpinned images (it validates something different tomorrow), no install
  stage (downstream stages fail on a clean checkout), a hardcoded secret
  (it leaks on commit).
- `warning` — it works, but a guarantee a reviewer would expect is absent.
  A non-frozen install, a disabled test stage, runtime drift, a floating
  tag.
- `info` — worth knowing, no guarantee lost. No lint stage, a long command
  chain, an assumption the tool had to make.

## Alternatives considered

- **Option A (chosen): fixed weights by severity.** Transparent, stable,
  explainable in one table. Two pipelines with the same findings always get
  the same score.
- **Option B: per-check weights.** More expressive — "no install" is worse
  than "unpinned image" even though both are critical. Rejected because it
  multiplies the number of unexplained constants by the number of checks,
  and the severity buckets already carry the distinction that matters. The
  extra precision would be invented, not measured.
- **Option C: weight by how many stages a finding affects.** Rejected as
  double counting: per-stage findings are already emitted per stage, so a
  problem in three stages already costs three penalties.
- **Option D: no score, findings only.** Honest, and it loses the thing
  that makes the panel worth opening — a single signal that says whether to
  look. The score's role is to direct attention, and ADVISOR-FR-002 keeps
  it advisory: nothing in the product consults it to permit or refuse an
  operation.

## Consequences

- **Positive:** the score is explainable to a user who asks why, and the
  severity ladder gives a clear rule for classifying a new check.
- **Negative / accepted costs:** the scale is coarse. A pipeline with one
  critical finding and a pipeline with four score 75 and 0 respectively,
  which overstates the gap between them; and everything below 0 is flattened
  to D. Accepted: the grade is a prompt to read the findings, not a
  measurement.
- **Neutral / to revisit:** the weights have never been calibrated against
  real projects, because the fixtures are all synthetic. The moment worth
  revisiting them is when the product has been pointed at a corpus of real
  repositories and the grade distribution can be looked at.

## Links

- [Pipeline Doctor Spec](../specs/advisor.spec.md) — ADVISOR-FR-006 and the
  check list.
- [Adversarial Review — SDD-04](../reports/adversarial-review.md)
