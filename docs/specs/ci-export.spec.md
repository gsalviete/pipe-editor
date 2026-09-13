# CI Export Specification

| Field | Value |
|---|---|
| Component | `CI-EXPORT` |
| Status | Implemented |
| Written on | 2026-09-13 |
| Authored | **Retroactively** — see [Provenance](#provenance) |
| Supersedes | the never-started `github-actions-generator.spec.md` slot (`GHA`) |
| Architecture | [`ADR-0003`](../adr/0003-ir-as-single-source-of-truth.md), [`ADR-0007`](../adr/0007-linear-pipeline-topology-v1.md), [`ADR-0013`](../adr/0013-yaml-emission-and-parse-back.md) |

## Provenance

This spec is **retroactive**. The code it describes
(`backend/src/modules/ci-export/`) shipped without one, which the adversarial
review recorded as **SDD-01**: `github-actions-generator.spec.md` was listed
`☐ Not started` in the spec index while two CI generators were in production,
and GitLab had no spec at all.

`04-productization-brief.md` authorised the capability in prose, but prose
carries no `FR`/`AC` ids, so no test could trace to it and `test-strategy.md`
could not account for it. Writing the spec after the fact is a documentation
exercise, not a rewrite — but it is an honest one only if it says so, which
is what this section is for. Where the spec and the shipped code disagreed,
the disagreement is recorded in the [changelog](#changelog) rather than
quietly resolved in the spec's favour.

The component code is `CI-EXPORT` rather than `GHA` because the shipped
component emits two providers, not one. The `GHA` slot in
[`specs/README.md`](./README.md) is retired.

## Objective

Turn a Pipeline IR into a CI configuration file for a named provider, such
that the file is **portable** (committable and runnable with no pipe-editor
tooling present) and **faithful** (it runs the same commands, in the same
order, in the same images as the local Executor).

## Local definitions

- **Provider:** `github-actions` or `gitlab-ci`.
- **Artifact:** `{ provider, filename, content }` — the suggested repository
  path and the file's bytes.
- **Effective chain:** `computeEffectiveChain(ir)`, the document with disabled
  Stages spliced out and their dependents re-linked.
- **Live stages:** the effective chain minus `docker-build`, which both
  providers treat specially.

## Functional requirements

- **CIEXPORT-FR-001 — Two providers, one IR.** `generateGithubActions(ir)`
  and `generateGitlabCi(ir)` each return a `CiExportArtifact`. Neither reads
  anything outside the IR, and neither writes to disk.

- **CIEXPORT-FR-002 — The effective chain is the source of the job graph.**
  Both generators MUST branch on `computeEffectiveChain(ir)`, never on
  `stages[].enabled` directly. A disabled Stage is absent from the output, not
  present-and-disabled.

- **CIEXPORT-FR-003 — Unresolved required fields are refused.** Both
  generators MUST call `findUnrunnableReason(ir)` and throw
  `UnresolvedRequiredFieldError` for an `unresolved-required-field` result,
  as the Dockerfile Generator does. A document whose runtime version is
  explicitly unknown MUST NOT be silently rendered onto the
  `node:lts-alpine` fallback.

- **CIEXPORT-FR-004 — YAML is serialized, never concatenated.** Both
  generators MUST build a plain JS object and serialize it with a YAML
  serializer. Building the document by string concatenation is forbidden:
  stage names, commands, branch names and env keys are all user-editable and
  all capable of changing or breaking the document.

- **CIEXPORT-FR-005 — The emitted bytes are parsed back.** After
  serialization and before returning, the generator MUST re-parse its own
  output and compare it to the object it serialized, raising
  `GeneratedYamlDefectError` on any difference. A generator defect must
  surface as a generator defect, not as a broken file in the user's
  repository.

- **CIEXPORT-FR-006 — Multi-line commands are block scalars.** A `run`
  containing newlines MUST be emitted as a YAML literal block scalar, and
  long lines MUST NOT be folded.

- **CIEXPORT-FR-007 — A Stage's steps are newline-separated, not
  `&&`-joined.** Joining with `&&` changes meaning: a step ending in a `#`
  comment turns the joiner and every later step into comment text, and a
  step that is a loop or an `if` block cannot be chained at all. GitHub runs
  `run:` under `bash -e`, so newline separation preserves abort-on-failure.

- **CIEXPORT-FR-008 — Header comments carry what YAML cannot.** A serializer
  cannot emit inline comments, so provenance, portability notes, per-Stage
  image notes (FR-010) and deployment requirements (FR-012) go in a comment
  block above the document. Anything interpolated into that block MUST be
  stripped of control characters.

- **CIEXPORT-FR-009 — GitHub Actions layout.** Every live Stage becomes a
  step of ONE job (`pipeline`) running inside the first live Stage's
  `container.image`, so the workspace is shared across Stages exactly as the
  Executor's `/workspace` mount shares it. `docker-build` becomes its own job
  on the VM runner with `needs: pipeline`, because the docker CLI is not
  available inside the pipeline container. Output path
  `.github/workflows/ci.yml`.

- **CIEXPORT-FR-010 — Divergent images are reported, not honoured.** When a
  live Stage declares an image different from the job's, the generator MUST
  note it in the header (naming the Stage, its requested image and the image
  actually used) and MUST NOT split the job. Sharing a workspace requires one
  container; the note tells the user what to do if that isolation matters.

- **CIEXPORT-FR-011 — GitLab CI layout.** One job per Stage, each keeping its
  own `container.image` (GitLab supports per-job images). Because GitLab
  gives every job a fresh workspace, a `.workspace-cache` hidden job holds a
  cache keyed on the package manager's lockfile and carrying `node_modules/`
  and the build output; every live job pulls it in with `extends`. Output
  path `.gitlab-ci.yml`.

- **CIEXPORT-FR-012 — The docker-build image comes from the IR.** The GitLab
  `docker-build` job MUST use `docker-build`'s `container.image` from the
  document and derive its Docker-in-Docker service from that same reference.
  The generator does not get to overrule the IR
  ([ADR-0003](../adr/0003-ir-as-single-source-of-truth.md)). Because the job
  requires a runner registered in privileged mode — a real deployment
  constraint — the header MUST say so.

- **CIEXPORT-FR-013 — corepack.** For `pnpm` and `yarn`, the generator MUST
  ensure corepack is enabled, and MUST NOT duplicate it when a Stage's own
  command already does so.

- **CIEXPORT-FR-014 — An empty effective chain is honest.** When every Stage
  is disabled, the generator emits a single no-op job and a header saying the
  chain is empty and why. It does not emit an empty `jobs:` mapping, which
  most providers reject.

- **CIEXPORT-FR-015 — Triggers.** `triggers[0].branches` becomes the push
  branch list; absent triggers default to `main`. The generator never invents
  a trigger the IR does not carry.

## Non-functional requirements

- **CIEXPORT-NFR-001 — Provider neutrality stays in the IR.** All
  provider-specific vocabulary (`jobs`, `runs-on`, `needs`, `uses`, `script`,
  `stages`) exists only inside these generators. The IR's forbidden-key walk
  enforces the other direction.
- **CIEXPORT-NFR-002 — Deterministic.** The same IR produces byte-identical
  output; nothing reads the clock, the filesystem or the environment.
- **CIEXPORT-NFR-003 — Read-only.** Generation never writes to disk.
- **CIEXPORT-NFR-004 — No deploy semantics.** The generated files build and
  verify; they never push an image or deploy
  ([`02-mvp-scope.md`](../product/02-mvp-scope.md) non-goals).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| **CIEXPORT-AC-001** | `generateGithubActions` on the canonical fixture emits `.github/workflows/ci.yml` whose `yaml.load()` yields a `pipeline` job containing every live Stage as a step in document order, inside the first Stage's image, plus a `docker-build` job with `needs: pipeline`. | T-CIEXPORT-001 (`export.spec.ts`) |
| **CIEXPORT-AC-002** | `generateGitlabCi` on the canonical fixture emits `.gitlab-ci.yml` with one job per Stage, each keeping its own image, a `stages:` list in effective order, and a `.workspace-cache` job keyed on the lockfile that every live job `extends`. | T-CIEXPORT-002 (`export.spec.ts`) |
| **CIEXPORT-AC-003** | A disabled Stage is absent from both outputs, and the remaining Stages stay adjacent — the generators branch on the effective chain, not on `enabled`. | T-CIEXPORT-003 (`export.spec.ts`) |
| **CIEXPORT-AC-004** | Both generators throw `UnresolvedRequiredFieldError` for an IR with any null required field, naming the field. No artifact is produced. | T-FLOW-001 (`unresolved-flow.spec.ts`) |
| **CIEXPORT-AC-005** | Every exported document parses back as YAML to a mapping. | T-ADV-003 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-006** | A Stage renamed to any of `Build: prod`, `Test #1`, `Release [beta]`, `- leading dash`, `quote"and'both`, `trailing space `, `*`, `yes` survives the round trip with its exact text, and the GitLab document stays complete. | T-ADV-004 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-007** | A multi-line `run` is emitted as a literal block scalar and parses back byte-identical, with a leading `#` line still a comment on its own line rather than something that swallowed the rest. | T-ADV-005 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-008** | A Stage with two steps emits them on separate lines, never joined with ` && ` — the case where the first step's trailing comment would have commented out the second. | T-ADV-005 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-009** | A branch literal of `*`, `release: x`, `feat/**`, `yes`, `null` or `- dash` survives the round trip, and the `on:` key is emitted in the bare form a human writes. | T-ADV-006 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-010** | An env entry whose value contains a colon, a newline, a leading `*`, or is empty survives both exporters. Steps' env objects are copied, never aliased. | T-ADV-006 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-011** | A `project.name` containing newlines and a `jobs:` mapping cannot inject structure through the header comment block. | T-ADV-007 (`adversarial.spec.ts`) |
| **CIEXPORT-AC-012** | The GitLab `docker-build` job uses the image from the IR (`docker:25` for a detected document, `docker:28` when edited) and derives `docker:<tag>-dind` from it; a reference with no tag to extend falls back to `docker:dind`. The header states the privileged-runner requirement. | T-CIEXPORT-012 (`export.spec.ts`) |
| **CIEXPORT-AC-013** | A Stage declaring an image different from the GitHub job's produces a header note naming the Stage and both images, and does not split the job. | T-CIEXPORT-013 (`export.spec.ts`) |
| **CIEXPORT-AC-014** | An all-disabled IR produces a single no-op job in both providers, with a header explaining the empty chain. | T-CIEXPORT-014 (`export.spec.ts`) |
| **CIEXPORT-AC-015** | For pnpm and yarn, corepack is enabled exactly once per job — not duplicated when a Stage's own command already enables it. | T-CIEXPORT-015 (`export.spec.ts`) |

## Testing approach

Backend Jest suites, no Docker required: `ci-export/export.spec.ts` for
structure and layout, `ci-export/adversarial.spec.ts` for hostile inputs and
the parse-back guarantee, `integration/unresolved-flow.spec.ts` for the
refusal path.

The adversarial suite is the one that matters. Every value it feeds in is
reachable from the editor's own controls, and each of them broke the
document before [ADR-0013](../adr/0013-yaml-emission-and-parse-back.md).

## Changelog

| Date | Change |
|---|---|
| 2026-09-13 | Retroactive spec written from the shipped code (adversarial review **SDD-01**), covering `ci-export/` which had been in production with no spec at all — the `GHA` slot was still `☐ Not started` and GitLab was never specified. Authoring it surfaced four places where the code did not meet what a spec would have demanded, each fixed in the same session rather than written down as-is: **GEN-02** (YAML built by string concatenation with no parse-back — now FR-004/FR-005), **GEN-05** (the GitLab `docker-build` image hardcoded to `docker:27` while the IR said `docker:25`, the generator overruling the document ADR-0003 makes authoritative — now FR-012), **GEN-08** (neither generator consulted `findUnrunnableReason`, unlike the Dockerfile Generator — now FR-003), and the ` && ` step join (now FR-007). Writing the spec is what made those four visible as *contract* violations rather than as isolated bugs. |
