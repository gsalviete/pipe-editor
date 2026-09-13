# ADR-0017: No CSS framework — Tailwind removed rather than adopted

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `product-shell.spec.md` |

## Context

The frontend shipped with `tailwindcss`, `postcss`, `autoprefixer`, a
`postcss.config.js`, a themed `tailwind.config.js` declaring a colour
palette and font stack — and **not one utility class** across 3,766 lines
of TSX. All styling is hand-written BEM across 3,322 lines of CSS, whose
design tokens already exist as CSS custom properties (`--bg`, `--panel`,
`--border`, `--accent`, …) duplicating the ones in the Tailwind config.

So the repository carried a dependency, a build step and a config surface
that did nothing, plus two definitions of the same palette that nothing
kept in sync. The adversarial review records it as **ARCH-03** and says,
correctly, that the one unacceptable option is leaving it as it is.

## Decision

**Tailwind is removed.** The three `@tailwind` directives, both config
files and the three packages are gone. The existing hand-written CSS is
the styling approach, deliberately and solely.

Adoption was the alternative, and it loses on the arithmetic: the styling
that exists *works*, is consistent, is already tokenised, and is tested
where it matters. Adopting Tailwind means rewriting 3,322 lines of working
CSS to reach the same visual result, and the payoff — utility classes and a
design system — is a payoff this codebase has already collected by other
means.

The scale argues the same way. This is one focused application with one
designer-author, not a component library shared across teams. Tailwind's
value grows with the number of people who need a shared vocabulary to avoid
colliding; at one, the vocabulary is the CSS file.

Two related pieces of dead weight went with it: `@react-flow` and Monaco
editor style overrides in `index.css`, for libraries that stopped being
dependencies when the legacy visualizer was removed.

## Alternatives considered

- **Option A (chosen): remove it.** One dependency, one build step, two
  config files and a duplicated palette deleted. Nothing changes visually —
  the build output confirms it.
- **Option B: adopt it properly.** Rewrite the BEM CSS as utilities, delete
  the custom properties, keep the config as the single source of tokens.
  A coherent end state, and it is a week of work whose entire deliverable
  is "the app looks the same". Rejected on cost, not on merit.
- **Option C: adopt it incrementally — utilities for new UI, BEM for old.**
  The worst of the three: two styling systems, two token definitions, and a
  standing question on every new component. This is roughly the state the
  repository was already in, minus anyone having decided it.
- **Option D: leave it installed for a future decision.** Rejected
  explicitly. An unused dependency is not optionality, it is a claim about
  the project that is not true, and a reviewer opening `tailwind.config.js`
  is owed an accurate one.

## Consequences

- **Positive:** the dependency tree, the build and the config surface each
  get smaller; the palette has one definition; a reader is no longer told
  the project uses a framework it does not use.
- **Negative / accepted costs:** new UI is hand-written CSS, which is
  slower per component than utilities and puts the burden of consistency on
  the author. `product-shell.spec.ts` asserting on CSS text is the weak
  substitute for the guarantee a framework gives by construction — the
  review flags those assertions separately as FE-06.
- **Neutral / to revisit:** if the frontend ever grows a second author or a
  shared component library, Option B becomes worth its cost. Reversing this
  is an `install` and a rewrite, and the rewrite was always the real price.

## Links

- [Product Shell Spec](../specs/product-shell.spec.md).
- [Adversarial Review — ARCH-03](../reports/adversarial-review.md)
