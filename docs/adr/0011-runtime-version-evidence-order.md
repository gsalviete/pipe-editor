# ADR-0011: Runtime-version evidence order, and aliases left unresolved

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `detector-engine.spec.md`, `pipeline-ir.spec.md`, `docs/rules/detection-rules.md` |

## Context

DR-004 resolved `/project/runtime/version` from `package.json`'s
`engines.node` and from nothing else. Most real Node projects do not declare
`engines.node`; they pin their Node version with `.nvmrc`, with
`.node-version`, or with Volta's `volta.node` block. For every one of those
projects the detector emitted `runtime.version: null` plus a paired
`unresolved` entry, and `findUnrunnableReason` then blocked `/api/generate`,
`/api/export/:provider` and `/api/execute` — so the product detected, drew,
scored and autosaved a pipeline it would never let the user generate or run.

Every fixture in `test/fixtures/` declared `engines.node`, which is why the
whole suite was green while the product's headline actions were unreachable
for ordinary input. The adversarial review records this as **UX-01b**.

Widening the evidence set raises two questions this ADR settles: **which
source wins when several disagree**, and **what to do with version files that
name an alias rather than a version**.

## Decision

**1. Evidence order.** DR-004 consults, in order, and takes the first that
yields a concrete major version:

1. `package.json` → `engines.node`
2. `package.json` → `volta.node`
3. `.nvmrc`
4. `.node-version`

`engines.node` stays first. It is a *declared contract* — the range the
package claims to support, published with the package and visible to its
consumers — whereas the other three are *workstation pins* that describe
whichever machine was last configured. Where they disagree, the declared
contract is the more defensible basis for an artifact the user will commit
and share.

Keeping `engines.node` first also means the change is purely additive: no
project that previously detected a version detects a different one, and the
three new sources only fire where DR-004 previously produced an `unresolved`
entry. Volta precedes the two dotfiles because it lives in the manifest the
project already publishes; `.nvmrc` precedes `.node-version` because it is
the more widely used of the two.

**2. Aliases stay unresolved.** `.nvmrc` accepts aliases — `lts/hydrogen`,
`node`, `stable` — that name no concrete version. Resolving one requires a
network lookup against the Node release index, which
[ADR-0005](./0005-manifest-only-detection-in-mvp.md) rules out. DR-004
therefore treats an alias as *no evidence* and falls through to the
catch-all case, leaving `runtime.version: null` with its paired `unresolved`
entry, which the user can now resolve in the editor (EDITOR-UI-FR-018).

The alternative — carrying the alias through — is worse than useless: the
value is interpolated directly into `node:<version>-alpine`, so
`lts/hydrogen` would produce the unpullable image tag
`node:lts/hydrogen-alpine` and turn a clearly-labelled unresolved field into
a build failure at the far end of the pipeline.

**3. Version files do not qualify a folder as a project.** `.nvmrc` and
`.node-version` join the enumerated manifest set so rules may read them, but
they are listed in `NON_QUALIFYING_MANIFESTS` and do not satisfy the
"at least one manifest present" precondition that guards `NoManifestError`.
A directory holding only a `.nvmrc` is not a Node project, and detecting one
there would produce an IR with no package manager and no stages.

## Alternatives considered

- **Pins before the declared range (chosen against).** `.nvmrc` and
  `volta.node` are exact versions while `engines.node` is usually a range,
  and the pin is what the developer actually runs locally, so there is a real
  argument that the pin better reproduces the developer's environment. It was
  rejected because it silently changes the detected version for every
  existing project that has both — a regression in output for a fix whose
  entire purpose is to *add* coverage where there was none — and because the
  first digit run of a range (`>=20.11` → `20`) is already the floor of what
  the package claims to support.
- **`assume-default` to the current LTS.** Cheap and unblocks everything at
  once, but it invents a fact and puts it in a committed artifact. It also
  contradicts [ADR-0006](./0006-omit-on-uncertainty-default.md), and the
  honest version of it — an "assumed" badge — is strictly more work than the
  editable field this project needed anyway.
- **Resolve nvm aliases from the Node release index.** Accurate, and rejected
  because it makes detection network-dependent
  ([ADR-0005](./0005-manifest-only-detection-in-mvp.md)), non-deterministic
  across runs (IR-AC-008), and slow.
- **Read the CI file's `setup-node` version.** Real evidence, and already
  used by the CI *importer*'s inference. Rejected for the detector because it
  makes detection depend on a file the detector does not otherwise read and
  whose location varies; the importer remains the right place for it.

## Consequences

- **Positive:** the most common real-world project shape — no
  `engines.node`, a `.nvmrc` or a Volta pin — now detects to a complete,
  generatable, runnable IR. No existing detection result changes.
- **Negative / accepted costs:** DR-004 grows from two cases to five, and the
  manifest set grows by two entries that are read as plain text rather than
  parsed. `NON_QUALIFYING_MANIFESTS` is a second concept in the manifest
  reader that has to stay in sync with the set.
- **Neutral / to revisit:** projects pinned with an nvm alias still land in
  the unresolved state. That is now a resolvable state rather than a dead
  end, so it is a prompt rather than a wall.

## Links

- [ADR-0005](./0005-manifest-only-detection-in-mvp.md) — manifest-only
  detection, which rules out the network lookup.
- [ADR-0006](./0006-omit-on-uncertainty-default.md) — the uncertainty policy
  the alias case follows.
- [Detection Rules — DR-004](../rules/detection-rules.md#dr-004--runtime-version)
- [Detector Engine Spec](../specs/detector-engine.spec.md) — DET-AC-020.
- [Visual Editor Spec](../specs/visual-editor.spec.md) — EDITOR-UI-FR-018,
  the editable-resolution surface that makes the unresolved state escapable.
