# ADR-0001: Native container execution over full GitHub Actions simulation

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-01 |
| Affected specs | `pipeline-executor.spec.md`, `pipeline-ir.spec.md`, `github-actions-generator.spec.md` |

## Context

Local validation is the core value proposition: validate the pipeline locally
before pushing. There are two credible ways to run a pipeline locally:

1. **Native execution** — run the project's own commands (`npm test`, etc.) inside
   containers that the Executor orchestrates.
2. **Full CI simulation** — run the generated GitHub Actions workflow itself via a
   tool such as `act`.

The honest argument *for* simulation is fidelity: native execution runs in a
container we orchestrate, while GitHub Actions runs on a different runner image
with different context, so "green locally, red on push" is possible — which
attacks the value proposition directly.

The counterweight: `act` is also not faithful. It uses its own runner images (not
GitHub's), does not support all actions, and diverges on secrets, matrices, and
services. It does not remove the fidelity gap; it trades it for a smaller, more
opaque one we cannot fix, debugged through a third party's black box.

## Decision

We will run pipelines locally via **native execution of the project's commands in
Docker containers**, orchestrated by our own Executor.

Crucially, this is not a permanent fork in the road. Both the native Executor and
the GitHub Actions Generator will consume the **same Pipeline IR**. We therefore
generate the local executor and the Actions workflow from a single source of
truth, and could add an `act`-based Executor backend later as a second consumer
without rework.

We calibrate the claim accordingly: not "validates exactly what CI runs," but
"validates the same pipeline steps locally." Because both targets derive from the
same IR, that claim is structurally honest.

## Alternatives considered

- **Option A — Native container execution (chosen).**
  - *Pros:* full control, deterministic behavior, and — decisively — we *build* a
    miniature CI runner, the richest learning and the most impressive engineering
    artifact in the project. Directly serves the goal of deepening Docker, build,
    and environment-isolation knowledge. Fewer external moving parts, so lower and
    more controllable implementation risk.
  - *Cons:* not literally identical to the GitHub runner; we handle env vars,
    working directory, dependency caching, log streaming, and container cleanup
    ourselves (real but educational and bounded costs).
- **Option B — Full GitHub Actions simulation via `act`.**
  - *Pros:* narrative parity ("it is exactly what runs on push").
  - *Cons / why NOT:* abstracts away the very Docker internals we want to learn;
    its learning is largely the idiosyncrasies of one tool (disposable knowledge);
    trades controllable risk for third-party, black-box risk; its fidelity is also
    imperfect.

## Consequences

- **Positive:** maximum learning on the project's stated DevOps axis; a strong
  portfolio artifact (a hand-built mini-runner); deterministic, debuggable
  execution; optionality preserved via the shared IR.
- **Negative / accepted costs:** we must implement env/working-dir/cache/log
  plumbing ourselves; the local result is not byte-for-byte identical to a remote
  runner, so the claim must stay calibrated to "same steps."
- **Neutral / to revisit:** an `act`-based Executor backend may be added later as a
  second IR consumer if higher fidelity becomes worthwhile.

## Links

- [ADR-0003](./0003-ir-as-single-source-of-truth.md) — the shared IR that makes
  the optionality and the honest claim possible.
- [MVP Scope](../product/02-mvp-scope.md) — local validation in scope; `act`
  simulation a non-goal for the MVP.
