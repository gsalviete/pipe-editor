# Architecture Decision Records

An **Architecture Decision Record (ADR)** captures a single significant decision:
the context that forced it, the option chosen, the alternatives rejected, and the
consequences accepted. In this project ADRs are a **living artifact** — new ones
are added whenever a non-obvious choice is made, and the reasoning is recorded
while it is fresh.

For a portfolio, the ADR log is half the value: it shows that the design choices
were *reasoned*, not accidental.

## Index

| ID | Title | Status |
|---|---|---|
| [ADR-0001](./0001-native-container-execution.md) | Native container execution over full GitHub Actions simulation | Accepted |
| [ADR-0002](./0002-local-folder-over-remote-repos.md) | Local folder input over remote repository integration (MVP) | Accepted |
| [ADR-0003](./0003-ir-as-single-source-of-truth.md) | A single Pipeline IR as the source of truth | Accepted |
| [ADR-0004](./0004-specs-in-repo-markdown.md) | Specifications as Markdown in the repository | Accepted |
| [ADR-0005](./0005-manifest-only-detection-in-mvp.md) | Manifest-only detection in the MVP | Accepted |
| [ADR-0006](./0006-omit-on-uncertainty-default.md) | Omit on uncertainty as the global default | Accepted |
| [ADR-0007](./0007-linear-pipeline-topology-v1.md) | Linear pipeline topology in v1 of the IR | Accepted |
| [ADR-0008](./0008-workspace-root-containment-for-detect-endpoint.md) | Workspace-root containment for the detect endpoint | Accepted |
| [ADR-0009](./0009-docker-access-in-the-compose-demo.md) | Docker access in the compose demo — editor slice by default, EXEC local-only in v1 | Accepted |
| [ADR-0010](./0010-workspace-plan-above-service-pipelines.md) | Workspace Plan above service Pipeline IRs | Accepted |
| [ADR-0011](./0011-runtime-version-evidence-order.md) | Runtime-version evidence order, and aliases left unresolved | Accepted |
| [ADR-0012](./0012-build-output-directory-stays-an-assumption.md) | The build output directory stays a declared assumption, not an IR field | Accepted |

## How to register a new decision

1. **Copy the structure** of an existing ADR (or use the template below).
2. **Number it** with the next sequential 4-digit ID. Numbers are immutable and
   never reused, even if an ADR is later superseded.
3. **Name the file** `NNNN-short-title-in-kebab-case.md`.
4. **Write it in active voice** in the Decision section: "We will use X."
5. **Fill the Alternatives section honestly** — this is the most valuable part.
   State what was rejected and *why*.
6. **Set the status.** A new ADR is usually `Accepted` (if the decision is made)
   or `Proposed` (if still open). When a later ADR overrides this one, change the
   status to `Superseded by ADR-NNNN` — never delete the file.
7. **Add it to the index** table above.
8. **Link it** from any spec it affects (in the spec's header table).

## ADR template

```markdown
# ADR-NNNN: <Title of the decision>

| Field | Value |
|---|---|
| Status | Proposed \| Accepted \| Superseded by ADR-NNNN |
| Date | YYYY-MM-DD |
| Affected specs | ... |

## Context
The situation and the forces at play. What problem or decision was on the table.

## Decision
What was decided, in active voice.

## Alternatives considered
- **Option A (chosen):** pros / cons.
- **Option B:** pros / cons / why NOT.

## Consequences
- **Positive:** ...
- **Negative / accepted costs:** ...
- **Neutral / to revisit:** ...

## Links
Related ADRs, specs, discussions.
```
