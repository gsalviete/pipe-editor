# ADR-0013: Generated YAML is serialized from a document and parsed back

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `ci-export.spec.md`, `workspace-bundle.spec.md` |

## Context

Both CI generators assembled their output line by line:

```ts
lines.push(`      - name: ${stage.name}`);
lines.push(`        run: ${quote(joinedRun(stage))}`);
```

with a hand-written `quote()` that single-quoted a scalar when it looked
risky. Every interpolated value — stage names, commands, branch names, env
keys and values — is editable from the product's own controls, and several
of them break the document:

| Input, all reachable from the editor | Result |
|---|---|
| a Stage renamed `Build: prod` | YAML parse error — bad indentation of a mapping entry |
| a branch literal `*` | YAML parse error — `*` is an alias indicator in flow context |
| a multi-line `run` | a single-quoted scalar containing raw newlines, not a block scalar |
| an env key containing `:` | a different mapping than the one displayed |

Nothing on the single-service export path re-parsed the result. The
workspace-bundle path had been re-parsing its own output since it was
written (`validateYamlArtifacts`), which made the omission an internal
inconsistency as much as a bug. The adversarial review records this as
**GEN-02**.

The generated files are the product's actual deliverable. A tool whose
output is broken by a scoped package name or a colon in a stage name has
failed at the only thing it exists to do.

## Decision

**Generated YAML is serialized by a YAML serializer from a plain JS object,
and the emitted bytes are parsed back and compared to the object before
they are returned.**

Concretely, in `ci-export/yaml-doc.ts`:

1. Build a plain object — no strings, no indentation arithmetic.
2. `yaml.dump` it with `lineWidth: -1`, so a long command is never folded
   (folding rewrites the command) and a multi-line command becomes a
   literal block scalar, which is what a shell script in a `run:` block
   should be.
3. Re-parse the result and deep-compare it to the source object, ignoring
   key order. Any difference raises `GeneratedYamlDefectError`, which names
   the provider and says it is a generator defect rather than a problem
   with the user's pipeline.

Step 3 is the part worth arguing for. It is not a test — it runs in
production, on every export. The class of bug it catches is one where the
generator is confident and wrong, and its cost is one parse of a document
measured in kilobytes.

**Two consequences follow from the serializer, and both are accepted:**

- **Inline comments are impossible.** A serializer emits data, not
  commentary. The per-Stage image notes and the privileged-runner warning
  therefore move into a comment block above the document. The information
  stays in the file, which is what mattered; it is no longer adjacent to
  the line it describes, which is a real loss.
- **`on:` is quoted.** YAML 1.1 reads `on` as a boolean, so js-yaml emits
  `'on':`. The two denote the same string key — js-yaml's own loader
  returns `"on"` for both, as does GitHub's parser — but every
  hand-written workflow uses the bare form, and these files are meant to be
  read by people. One anchored substitution at column zero restores it,
  applied *before* the parse-back check so the check validates what is
  actually written.

## Alternatives considered

- **Option A (chosen): serialize, then verify.**
- **Option B: keep hand-built text, quote every interpolated scalar.**
  Offered by the review as an acceptable alternative and rejected. It
  requires a correct YAML quoting implementation — deciding between plain,
  single-quoted, double-quoted and block styles by context — which is the
  job of a serializer we already depend on. The existing `quote()` was a
  four-line approximation of that job and it was wrong in four separate
  ways.
- **Option C: parse-back only in tests.** Cheaper, and it would have caught
  the four known cases. It would not catch the fifth, which is the reason
  the check exists: a value shape nobody thought to test. Running it in
  production turns "the generator has a bug" into an error message instead
  of a broken file in someone's repository.
- **Option D: emit YAML anchors for the GitLab cache.** The hand-built
  version used `&workspace-cache`. js-yaml can emit anchors only for shared
  object references, and names them `&ref_0`. GitLab's own `extends:` with
  a `.workspace-cache` hidden job says the same thing in plain data that the
  parse-back check can compare, and reads better.

## Consequences

- **Positive:** the export path cannot emit a document that does not parse,
  and cannot emit one that parses differently from what the editor showed.
  The single-service path now has the guarantee the workspace path always
  had.
- **Negative / accepted costs:** inline comments are gone (see above). Every
  export pays one extra parse. The output is more verbose in places — block
  sequences where the hand-built version used flow style — which is valid,
  idiomatic, and slightly longer to read.
- **Neutral / to revisit:** if inline comments become important enough, the
  answer is a YAML library with comment support (`yaml`'s Document API),
  not a return to string concatenation.

## Links

- [ADR-0003](./0003-ir-as-single-source-of-truth.md) — the IR is
  authoritative; a generator that mangles it on the way out breaks that.
- [CI Export Spec](../specs/ci-export.spec.md) — CIEXPORT-FR-004…008.
- [Adversarial Review — GEN-02](../reports/adversarial-review.md)
