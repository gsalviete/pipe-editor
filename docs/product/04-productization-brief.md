# Productization Brief

| Field | Value |
|---|---|
| Status | Accepted |
| Accepted on | 2026-09-11 |
| Product owner direction | Transform the prototype into a market- and portfolio-ready product; broad freedom granted to improve product, UX and implementation. |

## Positioning

`pipe-editor` is a **local CI studio**: it turns an existing project or CI file
into an understandable, editable and locally verifiable pipeline before the
developer pushes a commit.

The product is not positioned as another YAML editor. Its value is the shorter,
safer feedback loop:

1. discover a project;
2. explain the inferred pipeline;
3. edit the effective chain visually;
4. diagnose risky choices;
5. run the same project commands in isolated local containers;
6. export portable CI and Docker artifacts.

## Primary audience

- Developers learning CI/CD who need the pipeline to be understandable.
- Teams migrating or reviewing existing GitHub Actions / GitLab CI pipelines.
- Portfolio reviewers evaluating spec-driven development, systems design and
  DevOps fundamentals through a working vertical slice.

## Product principles

1. **Local-first and explicit.** The current workspace and execution boundary
   are always visible. No remote account is required.
2. **Progressive disclosure.** A first-time user sees one obvious next action;
   detailed IR, logs and artifacts remain available without dominating the UI.
3. **Explain every state.** Empty, loading, unavailable, invalid, stale, failed
   and successful states include a concrete next step.
4. **Evidence over claims.** Product copy says exactly what is verified locally
   and never implies byte-for-byte parity with a hosted CI runner.
5. **Portfolio-quality craft.** The product, README, screenshots, tests and
   architecture tell one coherent story.

## Release boundary

The first productized release keeps the current local-first architecture and
Node-focused detector. It hardens and presents the capabilities already in the
working tree: project discovery, visual editing, CI import/export, Pipeline
Doctor, autosave, share links, artifact generation and local execution.

Remote accounts, hosted persistence, billing and real cloud deployment remain
outside this release. Those require a separate product and security decision.

