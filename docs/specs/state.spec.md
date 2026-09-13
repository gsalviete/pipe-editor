# Local State & Discovery Specification

| Field | Value |
|---|---|
| Component | `STATE` |
| Status | Implemented |
| Written on | 2026-09-13 |
| Authored | **Retroactively** — see [Provenance](#provenance) |
| Architecture | [`ADR-0008`](../adr/0008-workspace-root-containment-for-detect-endpoint.md), [`ADR-0016`](../adr/0016-local-state-persistence-and-share-links.md) |

## Provenance

This spec is **retroactive**. Four shipped capabilities had no spec, which
the adversarial review recorded as **SDD-01**:

- `state-store/` — autosaved working IRs and run history under
  `~/.pipe-editor`
- `run-registry.ts`'s persistence half
- share links (`#ir=<base64>`)
- `/api/projects`, `/api/directories`, `/api/directories/resolve`

They are specified together because they are one concern: **state and
navigation that live outside any single Pipeline IR.** See
[`ci-export.spec.md`](./ci-export.spec.md#provenance).

## Objective

Let a user leave and come back — to an edit, to a run's outcome, to the
folder they were working in — without the product writing anything into
their project, and without any of it becoming a way to read files it should
not.

## Local definitions

- **Data directory:** `PIPE_EDITOR_DATA_DIR`, default `~/.pipe-editor`.
  Never inside the user's project.
- **Workspace namespace:** `sha1(workspaceRealpath).slice(0, 12)`, the
  subdirectory under the data directory holding one workspace's state.
- **Working IR:** the edited document, as distinct from the Loaded IR the
  detector produced.
- **Share link:** a URL fragment carrying a whole IR.

## Functional requirements

### Persistence

- **STATE-FR-001 — Nothing is written into the user's project.** All state
  lives under the data directory. This is the product's read-only stance
  ([`02-mvp-scope.md`](../product/02-mvp-scope.md)) and it holds for
  autosave, run history and everything else.

- **STATE-FR-002 — State is namespaced per workspace.** Two workspaces
  never see each other's saved pipelines or runs. The namespace is derived
  from the workspace **realpath**, so reaching the same workspace by a
  different route lands in the same namespace.

- **STATE-FR-003 — Writes are atomic.** Write to a temp file and rename.
  An interrupted write MUST NOT leave a truncated file that breaks the next
  start.

- **STATE-FR-004 — Reads degrade to empty.** A missing, unreadable or
  malformed state file yields empty state, never an error. Losing an
  autosave is an inconvenience; refusing to start is not acceptable for
  cached convenience data.

- **STATE-FR-005 — Autosave keys are normalized.** A saved pipeline is
  keyed by the project's **workspace-relative realpath**, not by the string
  the client sent. `demo-api`, `./demo-api`, `demo-api/` and the contained
  absolute path are one project, not four.

- **STATE-FR-006 — Autosave is dirty-driven.** The editor `PUT`s while the
  Working IR differs from the Loaded IR and `DELETE`s when it returns to
  baseline, debounced. Equality is `canonicalEquals`, so a key reordering
  is not an edit.

- **STATE-FR-007 — Restoring is offered, never imposed.** When a detect
  finds a saved pipeline that differs from what detection just produced,
  the editor offers both and applies neither until the user chooses.

- **STATE-FR-008 — Run history is bounded and append-only.** The registry
  retains a bounded number of runs in memory, evicting the oldest
  **finished** runs first, and appends finished runs to the durable store.
  A run in progress is never evicted.

### Discovery

- **STATE-FR-009 — Discovery is contained.** `/api/projects`,
  `/api/directories` and `/api/directories/resolve` go through the same
  `checkProjectPath` containment as every other path-taking endpoint
  ([ADR-0008](../adr/0008-workspace-root-containment-for-detect-endpoint.md)).
  No route may enumerate outside the workspace root.

- **STATE-FR-010 — Discovery never follows directory symlinks**, and skips
  `node_modules`, `.git`, build output directories, caches and all
  dotfiles.

- **STATE-FR-011 — Discovery is bounded** in depth, projects returned,
  directories visited, scripts listed per project, CI configs per project
  and name matches, so a large or hostile tree cannot turn a scan into a
  hang.

- **STATE-FR-012 — Manifest reads are bounded.** Probing a project reads
  its `package.json` under a size limit; an oversized manifest degrades the
  entry exactly as a malformed one does — the project is still listed under
  its directory name, and `detect()` reports the real diagnostic when the
  user picks it.

- **STATE-FR-013 — Name resolution is a search, not a path.**
  `/api/directories/resolve?name=` exists because browsers hide host paths
  on folder drop. It resolves a bare folder *name* to contained paths and
  returns candidates; it never accepts a path from the client for that
  purpose.

### Share links

- **STATE-FR-014 — A share link carries a document, not a reference.** The
  fragment holds the canonical IR so the link works with no server state.
  It is a **fragment**, never a query parameter: fragments are not sent to
  servers and do not land in access logs.

- **STATE-FR-015 — Encoding is UTF-8-safe.** Encoding and decoding MUST use
  `TextEncoder`/`TextDecoder` with base64url, not `escape`/`unescape`.

- **STATE-FR-016 — A share link is untrusted input.** It is decoded,
  `validate()`d and then held for review — never loaded on arrival. The
  contract is EDITOR-UI-FR-019; this requirement records that the link
  format's security properties are the editor's to enforce, and that the
  fragment is stripped from the URL either way.

## Non-functional requirements

- **STATE-NFR-001 — State is a convenience, never a source of truth.** The
  project's manifests are the source of truth; everything here is
  reconstructible by re-detecting. No feature may become unavailable
  because state was lost.
- **STATE-NFR-002 — No secrets.** Nothing here stores credentials or
  tokens. A saved IR may contain whatever env values the user put in it,
  which is exactly why the Doctor flags secret-looking env values as
  `critical` (ADVISOR-FR-014).
- **STATE-NFR-003 — Single user.** No authentication, no multi-user
  semantics, no locking. The API's protection is containment plus the host
  allowlist (SEC-01), not identity.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| **STATE-AC-001** | A saved pipeline round-trips: `PUT` then `GET` returns a `canonicalEquals`-equal IR with a `savedAt`. | T-STATE-001 (`store.spec.ts`) |
| **STATE-AC-002** | Two workspace roots produce different namespaces and never see each other's pipelines or runs. | T-STATE-002 (`store.spec.ts`) |
| **STATE-AC-003** | A truncated or malformed state file yields empty state rather than an error, and the next write repairs it. | T-STATE-003 (`store.spec.ts`) |
| **STATE-AC-004** | Writes are atomic: no partial file is observable, and an interrupted write leaves the previous content intact. | T-STATE-004 (`store.spec.ts`) |
| **STATE-AC-005** | `demo-api`, `./demo-api`, `demo-api/` and the contained absolute path address ONE saved pipeline. | T-STATE-005 (`store.spec.ts`) |
| **STATE-AC-006** | The editor `PUT`s when the Working IR diverges and `DELETE`s when it returns to baseline. | T-EDITOR-AUTOSAVE (`Editor.features.spec.tsx`) |
| **STATE-AC-007** | A saved pipeline differing from a fresh detection surfaces a restore choice; neither is applied until the user picks. | T-EDITOR-RESTORE (`Editor.features.spec.tsx`) |
| **STATE-AC-008** | The registry retains a bounded number of runs, evicts the oldest finished run first, and never evicts a running one. | T-STATE-008 (`run-registry.spec.ts`) |
| **STATE-AC-009** | Discovery refuses a path outside the workspace root, does not follow directory symlinks, and respects its bounds. | T-STATE-009 (`project-scan.spec.ts`, `path-security.spec.ts`) |
| **STATE-AC-010** | An oversized `package.json` leaves the project listed under its directory name with no scripts, and the scan completes. | T-SEC-006 (`bounded-read.spec.ts`) |
| **STATE-AC-011** | `encodeShareHash`/`decodeShareHash` round-trip a document containing non-ASCII text without corruption, using `TextEncoder`/base64url. | T-STATE-011 (`share-link.spec.ts`) |
| **STATE-AC-012** | A share link is validated and held for review rather than loaded, and the fragment is cleared from the URL. | T-SEC-010 (`Editor.provenance.spec.tsx`) |

## Testing approach

Backend: `state-store/store.spec.ts`, `editor-api/run-registry.spec.ts`,
`editor-api/project-scan.spec.ts`, `editor-api/path-security.spec.ts`,
`editor-api/bounded-read.spec.ts`. Frontend: `Editor.features.spec.tsx` for
autosave and restore, `share-link.spec.ts` for the encoding,
`Editor.provenance.spec.tsx` for the trust boundary.

## Changelog

| Date | Change |
|---|---|
| 2026-09-13 | Retroactive spec written from the shipped code (adversarial review **SDD-01**), covering four capabilities that had none: the state store, the run registry's persistence, share links, and the discovery routes. Writing it produced three requirements the code did not meet, each fixed in the same session: **STATE-FR-005** (autosave keyed by the raw client string, so one project had up to four saves depending on how the path was typed — **ARCH-05**), **STATE-FR-012** (manifest reads unbounded — **SEC-06**), and **STATE-FR-015** (share links encoded with the deprecated `escape`/`unescape` pair — **FE-04**). **STATE-FR-014**'s "fragment, never a query parameter" and **STATE-FR-016**'s trust boundary were already true of the code but had never been written down as requirements, which is how a later change would have quietly broken them. The persistence location and the link format are argued in [ADR-0016](../adr/0016-local-state-persistence-and-share-links.md). |
