# ADR-0018: The shared IR stays a source alias, for now

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `pipeline-ir.spec.md`, `visual-editor.spec.md` |

## Context

The frontend consumes the Pipeline IR by aliasing directly into backend
source:

```ts
// frontend/vite.config.ts and tsconfig.json
'@modules/ir': resolve(__dirname, '../backend/src/modules/ir')
```

This delivers exactly what the Editor spec demands — `validate`,
`computeEffectiveChain`, `findUnrunnableReason`, `serializeCanonical` and
`canonicalEquals` are literally the same symbols on both sides of the wire,
so the two cannot drift. That guarantee is load-bearing: UX-02 in the
adversarial review was a bug caused precisely by the frontend keeping its
own copy of a rule, and the fix was to import the shared one.

The cost is real, and the review records it as **ARCH-01**: the frontend
image must build from the repository root with a bespoke
`COPY backend/src/modules/ir`, the frontend's `tsconfig` compiles files
outside its own root, and any backend-side refactor of that folder breaks
the frontend build with no contract in between. The proposed fix is to
promote the IR to an internal workspace package — same single symbol, a
real boundary, a simpler Docker context.

## Decision

**The alias stays for now. The promotion to `packages/ir` is deferred, and
this ADR records why and what it will take, so the next session starts from
analysis rather than from scratch.**

The proposal is right. It is also not the small refactor it looks like,
because of a fact the review does not mention: **this repository has no
pnpm workspace.** `backend/` and `frontend/` are two independent pnpm
projects with two lockfiles, driven by root scripts that `cd` into each.
There is no `pnpm-workspace.yaml`. An internal package consumed by both
requires creating that workspace first, which changes:

| Surface | Change |
|---|---|
| `pnpm-workspace.yaml` | new — the repository becomes one workspace |
| Lockfiles | two become one; both packages reinstall |
| `backend/src` | 37 files import the IR by relative path |
| `frontend` | Vite alias, `tsconfig` paths |
| `frontend/Dockerfile` | the bespoke `COPY backend/src/modules/ir` and the root build context |
| `backend/Dockerfile` | must now include the package |
| `.github/workflows/ci.yml` | two `pnpm --dir … install --frozen-lockfile` steps become one |
| `backend/package.json` jest | `rootDir: src` no longer covers the IR's own tests |

Doing that at the end of a session that has already changed 60 findings
across both packages would mean landing a build-system change on top of a
large diff, with the build and CI as the only things that can prove it
worked. The failure mode is a repository that installs on one machine and
not another — which is worse than the cost being paid today, and it is not
a cost that is growing.

**What is true meanwhile:** the guarantee ARCH-01 is protecting is intact,
and this session strengthened it — UX-02 moved the runnability gate onto
the shared symbol, and the IR module gained `project-fields.ts` precisely
so the detector and the editor would share one rule rather than two.

## Alternatives considered

- **Option A (chosen): keep the alias, record the plan.** No behaviour
  change, no risk, and the next session opens with the surface list above
  instead of rediscovering it.
- **Option B: promote to `packages/ir` now.** The right end state. Rejected
  for sequencing, not on merit — see above.
- **Option C: publish the IR to a registry.** Solves nothing this project
  has: one repository, one consumer pair, no external users. It adds a
  release step between writing a rule and using it, which is the opposite
  of what the shared-symbol design is for.
- **Option D: duplicate the IR types into the frontend and keep them in
  sync by review.** Named only to reject it. This is exactly the drift that
  produced UX-02, and no amount of discipline substitutes for the compiler.

## Consequences

- **Positive:** no build-system change lands untested at the end of a large
  session. The single-symbol guarantee — the thing that matters — is
  unaffected.
- **Negative / accepted costs:** the frontend still compiles files outside
  its own root and builds from the repository root; a backend-side refactor
  of `modules/ir` still breaks the frontend build with no contract in
  between. The `frontend/Dockerfile` keeps a `COPY` line that has to be
  remembered.
- **Neutral / to revisit:** do it as the first change of a session, on a
  clean tree, with the Compose smoke test in CI as the acceptance gate.
  The trigger to stop deferring is a third consumer of the IR, or the first
  time the missing contract actually breaks a build.

## Links

- [ADR-0003](./0003-ir-as-single-source-of-truth.md) — the guarantee this
  is protecting.
- [Visual Editor Spec](../specs/visual-editor.spec.md) — EDITOR-UI-FR-017,
  which mandates importing the shared symbol.
- [Adversarial Review — ARCH-01](../reports/adversarial-review.md)
