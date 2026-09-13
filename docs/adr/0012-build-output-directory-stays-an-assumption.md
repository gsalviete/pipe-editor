# ADR-0012: The build output directory stays a declared assumption, not an IR field

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `dockerfile-generator.spec.md`, `pipeline-ir.spec.md` (considered, not changed) |

## Context

The Dockerfile Generator's multi-stage path emits

```dockerfile
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main.js"]
```

Both hardcode `dist/`. That is the NestJS and `tsc`-default layout, and it is
wrong for a project that builds to `build/` (Create React App, some tsconfigs),
`out/` (Next.js export), `.output/` (Nuxt) or nowhere at all. For those
projects the generated image is broken — and **every check in the product still
passes**, because nothing in pipe-editor ever builds the image it generates.

`DOCKER-LIMIT-001` already acknowledged the `CMD` convention. The `COPY`
assumption was not surfaced anywhere: not in the artifact, not in the UI, not
in the Doctor. The adversarial review records this as **GEN-03** and offers two
fixes: detect the output directory into the IR, or emit an explicit comment
plus a Doctor finding.

## Decision

**The build output directory stays an assumption, and the assumption is stated
loudly in three places** — the generated Dockerfile, the Pipeline Doctor, and
the Dockerfile Generator spec.

The generated Dockerfile carries, immediately above the `COPY`:

```dockerfile
# ASSUMPTION (GEN-03): your build writes to `dist/`. pipe-editor detects
# from manifests only and the Pipeline IR does not carry a build-output
# directory, so this path is a convention, not an observation. If your
# build writes somewhere else — `build/`, `out/`, `.output/` — change
# BOTH the line below and the CMD at the end of this file. The Pipeline
# Doctor reports this assumption on every multi-stage build.
```

and the Doctor emits `build-output-assumed` (info) whenever the effective chain
contains a build stage with at least one step.

## Alternatives considered

- **Option A (chosen): declare the assumption.** Honest, cheap, changes no
  contract, and it puts the information where the user is looking — in the file
  they are about to commit, and in the panel that scores their pipeline. It
  does not make the artifact correct for a non-`dist` project; it makes the
  defect visible and one edit away instead of silent.
- **Option B: carry `project.buildOutputDir` in the IR.** The better long-term
  answer, and rejected *for now* rather than on the merits. It is a schema
  change to the central contract — a new field to validate, canonicalize,
  render in the editor and version — and the detector could only fill it from
  `tsconfig.compilerOptions.outDir` plus a per-framework default table, which
  is itself a guess for every project that does not use `tsc`. Shipping a
  field named `buildOutputDir` whose value is frequently a guess is worse than
  a comment that says "this is a guess": the field looks authoritative. If it
  is added later, the comment and the Doctor finding become the thing that
  *validates* it, so this ADR is a step toward Option B, not away from it.
- **Option C: read the build output from the filesystem.** Ruled out by
  [ADR-0005](./0005-manifest-only-detection-in-mvp.md) (manifest-only
  detection), and it would only work after a build has been run once.
- **Option D: build the generated image to find out.** This is the only way to
  actually *know*, and it is exactly what the product never does for the
  single-service path. `T-DET-008` does run a real `docker build` on one
  fixture, so the machinery exists; extending it into a user-facing
  "verify this image" action is a feature, not a fix, and belongs in its own
  spec.

## Consequences

- **Positive:** a user whose build does not write to `dist/` is told so, in the
  artifact and in the Doctor, before they push. No contract changed, no schema
  version bumped, no new guess presented as a fact.
- **Negative / accepted costs:** the generated Dockerfile is still wrong for
  those projects until the user edits two lines. The product cannot tell which
  projects those are, so the Doctor finding fires for everyone — an `info`-level
  finding that costs 3 points on a pipeline that may be perfectly fine. That
  cost is deliberate: a false positive that reads "confirm this" is cheaper
  than a silent broken image.
- **Neutral / to revisit:** revisit when the IR next takes a MINOR version bump
  for another reason; `buildOutputDir` is the natural passenger, and by then
  the Doctor finding will have shown how often the assumption is wrong.

## Links

- [ADR-0005](./0005-manifest-only-detection-in-mvp.md) — manifest-only
  detection, which rules out Option C.
- [Dockerfile Generator Spec](../specs/dockerfile-generator.spec.md) —
  `DOCKER-LIMIT-001` (the `CMD` convention) and `DOCKER-AC-015`.
- [Adversarial Review — GEN-03](../reports/adversarial-review.md)
