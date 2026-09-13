# ADR-0014: An imported `run:` block stays a script

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `ci-import.spec.md`, `pipeline-executor.spec.md` |

## Context

GitHub Actions' `run: |` block is a **shell script**. The importer turned
one into a single IR step like this:

```ts
const run = step.run.trim().split('\n').join(' && ');
```

For the single most common GitHub Actions idiom, that is a silent
mistranslation:

```yaml
run: |
  # install dependencies
  npm ci
  npm run build
```

became `# install dependencies && npm ci && npm run build` — one comment
line, executing nothing at all. The user sees a pipeline in the editor,
runs it, and it passes without having done anything.

It is not only comments. A line that is not a complete command cannot be
chained with `&&`: loops, `if` blocks, `case` statements, heredocs and
backslash continuations all break. And the failure semantics differ — a
script runs line by line, an `&&` chain short-circuits and collapses exit
codes into one.

The same joiner appeared in two more places: the Executor joined a Stage's
steps with ` && ` before handing them to `sh -c`, and the GitHub Actions
exporter joined them before emitting `run:`. All three had the same defect
for the same reason.

The adversarial review records the import half as **IMP-01**.

## Decision

**Newlines are preserved everywhere, and abort-on-failure is restored
explicitly where it was implicit.**

1. **Import** keeps the block's newlines in one IR step. The IR's `run` is
   a string; nothing in its contract said that string was a single command,
   and treating it as a script is both simpler and correct.

2. **Execution** joins a Stage's steps with `\n` and prefixes the whole
   script with `set -e`. The `set -e` is load-bearing and is the reason
   this is an ADR rather than a bug fix: `sh` does **not** abort on a failed
   command by default, so switching to newlines without it would let a
   Stage keep running after a failure and report success. With it,
   abort-on-failure is exactly what ` && ` was providing.

3. **Export** joins a Stage's steps with `\n` into a YAML block scalar and
   adds nothing. GitHub runs `run:` under `bash -e`, so the failure
   semantics are already what `set -e` gives locally.

4. **The user is told** when an imported block contains comments or control
   flow — not because anything is broken, but because that content is
   exactly what the old flattening destroyed, and a step that is a script
   is edited as a whole rather than as a command.

## Alternatives considered

- **Option A (chosen): one step, newlines preserved.**
- **Option B: one IR step per non-empty line.** The review offered this
  first, and it is attractive — the IR already models a list of steps, and
  per-step granularity gives better failure attribution in the UI, which is
  something the Pipeline Doctor actively encourages (`mega-step`). It is
  rejected because it is *wrong for the same inputs*: a `for` loop spans
  lines, a heredoc spans lines, a backslash continuation spans lines. Split
  per line, each fragment becomes its own step and none of them runs. It
  trades a defect that mangles comments for a defect that mangles control
  flow.
- **Option C: parse the shell to find statement boundaries.** Correct, and
  it means embedding a shell parser to answer a question the product does
  not need answered. Preserving the text answers it by not asking.
- **Option D: keep ` && ` and warn.** Rejected: a warning does not make the
  output correct, and the user cannot act on it without hand-editing the
  step back into the shape it arrived in.

## Consequences

- **Positive:** the most common GitHub Actions idiom imports correctly.
  Loops, heredocs and continuations survive. The executor's failure
  semantics are now stated in the script (`set -e`) instead of being an
  emergent property of a string join.
- **Negative / accepted costs:** a multi-line step is one unit in the
  editor, so per-line failure attribution is not available for imported
  scripts. The Doctor's `mega-step` finding, which counts `&&` occurrences,
  does not see a newline-separated script — a gap worth closing if
  multi-line steps become common.
- **Neutral / to revisit:** if per-step granularity for imported scripts
  becomes valuable, the honest route is offering the user a "split this
  script into steps" action they can review, not doing it silently at
  import time.

## Links

- [CI Import Spec](../specs/ci-import.spec.md) — CIIMPORT-FR-003/FR-004.
- [CI Export Spec](../specs/ci-export.spec.md) — CIEXPORT-FR-007.
- [Pipeline Executor Spec](../specs/pipeline-executor.spec.md).
- [Adversarial Review — IMP-01](../reports/adversarial-review.md)
