# Domain Glossary

The **ubiquitous language** of `pipe-editor`, in natural language. These terms
are defined once, here, and used consistently across every spec, rule, and ADR.
The [Pipeline IR Specification](../specs/pipeline-ir.spec.md) formalizes this
vocabulary into a verifiable schema; this document is the prose contract that the
schema must honor.

> Convention: a term defined here is written in its canonical form. If a spec
> needs a term not in this list, it defines it locally and, if it proves
> reusable, promotes it here.

## Core concepts

**Project** — A software codebase located in a single local folder. The unit the
tool analyzes.

**Workspace** — A selected local folder that may contain one Project or several
independently packaged Services.

**Service** — A Project inside a Workspace that is independently built into a
container image, such as a frontend, backend, or microservice.

**Workspace Plan** — A provider-neutral aggregate containing the discovered
Services, one Pipeline IR per Service, and the local paths/ports needed to render
a containerization bundle.

**Containerization Bundle** — The portable set of per-Service Dockerfiles and
dockerignore files, Compose configuration, and one selected basic CI file.

**Analysis** — The act of inspecting a Project to derive facts about it (its
language, package manager, available scripts, and so on). Performed by the
Detector.

**Detector (Detector Engine)** — The component that traverses a Project and
produces a Pipeline IR. *How* it traverses and reports is the Detector Engine's
concern; *what* it concludes is governed by Detection Rules.

**Detection Rule** — A single verifiable assertion of the form "given an observed
condition in the Project, infer a fact in the IR." Detection Rules are versioned
and tested independently from the Detector Engine.

**Pipeline IR (Intermediate Representation)** — The neutral, provider-agnostic,
serializable model of a pipeline. The single source of truth. Produced by the
Detector, consumed by Generators and the Executor, edited by the Visual Editor.

**Pipeline** — The complete description of what should happen to build and verify
a Project, expressed as an ordered structure of Stages. The IR is the
serialization of a Pipeline.

**Stage** — A named phase of a Pipeline (for example: Build, Lint, Test, Docker
Build). A Stage groups one or more Steps and has a position in the Pipeline.

**Step** — The smallest executable unit within a Stage: a command to run, with its
environment and working directory. A Step is what the Executor actually runs.

**Trigger** — The condition under which a Pipeline runs (for example: on push).
Relevant primarily to generated CI artifacts; modeled in the IR neutrally.

**Artifact** — A file the tool *generates* from the IR (a `Dockerfile`, a GitHub
Actions workflow). Artifacts are portable: the user can take them and use them
outside the tool. *Not to be confused with CI "build artifacts."* Where ambiguity
is possible, this document uses **Generated Artifact**.

**Generator** — A component that consumes the IR and renders one kind of Generated
Artifact. Each Generator targets exactly one output format (e.g. the Dockerfile
Generator, the GitHub Actions Generator).

**Executor (Local Executor)** — The component that runs a Pipeline's Steps locally
in containers and reports a status per block, before any push. It consumes the
same IR the Generators consume, which is what makes local validation meaningful.

**Visual Editor** — The interface that renders the IR as a graph of blocks and
lets the user make simple adjustments (such as toggling blocks). It edits the IR;
it does not own its own separate model.

## Status and confidence vocabulary

**Confidence** — A Detection Rule's certainty about its inference: `high`,
`medium`, or `low`. Informs behavior under uncertainty.

**Behavior under uncertainty** — What happens when a signal is ambiguous. One of:
`assume-default` (apply a sensible default), `omit` (leave the fact out), or
`needs-user-input` (mark the fact as requiring a user decision). The global
default and per-rule overrides are defined in
[Detection Rules](../rules/detection-rules.md).

**Portable** — Property of a Generated Artifact: it is self-contained, clean, and
usable outside `pipe-editor`, with no lock-in to the tool.

**Provider-neutral** — Property of the IR: it carries no field, name, or semantics
specific to any one CI provider. Provider specifics appear only at generation
time, inside Generators.
