# ADR-0019: Contained regular-file reads and no-follow writes at the filesystem boundary

| Field | Value |
|---|---|
| Status | Draft |
| Date | 2026-09-23 |
| Affected specs | `state.spec.md`, `detector-engine.spec.md`, `workspace-bundle.spec.md`, `product-shell.spec.md`, `pipeline-executor.spec.md` |
| Origin | Adversarial review second pass: AR-01, AR-02, AR-03 ([`docs/reports/adversarial-review.md`](../reports/adversarial-review.md) §3); product [`06-hardening-v2.md`](../product/06-hardening-v2.md) Phase 1 |

## Context

[ADR-0008](./0008-workspace-root-containment-for-detect-endpoint.md) contains
every path the client sends: the selected **directory** is resolved with
realpath and must stay inside `PIPE_EDITOR_WORKSPACE_ROOT`. The second
adversarial review showed that this containment stops at the directory. The
files read inside it, and the files the backend writes into the executor's
temporary copy, are handled with ordinary path-based calls that follow
symlinks and trust `stat`.

- **AR-01.** The executor copies the project with symlinks preserved, then
  writes a fixed-name visibility marker with `writeFileSync`. A project that
  ships a symlink with that name makes the backend overwrite the link's
  target (any writable host file) before a stage runs.
- **AR-02.** Detection, discovery and workspace inspection read `package.json`,
  lockfiles and `.nvmrc` by following whatever those names point to. A
  contained directory can expose a manifest from outside the workspace
  through a file symlink.
- **AR-03.** The "bounded" reader checks `stat.size` and then reads the whole
  file. A FIFO reports size 0, and **opening** it for reading blocks until a
  writer appears. The scan runs synchronously, so the whole API process stops,
  including health and abort. A regular file can also grow between the `stat`
  and the read.

All three are the same mistake: a decision is made on a **path**, and the
operation then happens on whatever that path names at a later moment.

## Decision

### 1. One contained read primitive

Every backend read of a file whose name comes from a user's project goes
through one primitive, with a boundary directory and a byte budget:

1. Resolve the path with realpath. A result outside the boundary is
   **refused** with a containment diagnostic.
2. Open the resolved path **non-blocking** and **without following a final
   symlink**, so that a FIFO or device can't block the open and a component
   swapped after step 1 can't redirect it.
3. `fstat` the **open descriptor**. Anything but a regular file is
   **refused** (a special-file diagnostic). Its identity (device and inode)
   must equal the identity of the path resolved in step 1, or the read is
   refused as changed during the check.
4. Read through the descriptor up to `budget + 1` bytes. Reading more than
   the budget is refused as oversized, however large `stat` said the file
   was.

The primitive lives in a module that the core modules may import
(`GUIDELINES.md` § Architecture). It doesn't live in `editor-api`.

### 2. The boundary is the project directory

The boundary for manifest and CI-file reads is the **project directory**
being detected, probed, inspected or imported from, not the whole workspace
root.

- A symlink that resolves **inside the project directory** is followed. This
  is legitimate, for example `.nvmrc -> config/.nvmrc`.
- A symlink that resolves **outside the project directory** is refused,
  even if the target is elsewhere inside the workspace root.

The detector's public API takes only a project root. With the project as the
boundary, the detector stays independent of workspace configuration and one
rule holds everywhere. The CI-file import already contained its file to the
project directory, so this makes the rest of the system match it.

### 3. No-follow, exclusive writes into the executor copy

The executor copy keeps symlinks as symlinks. Stage containers see only the
copy's mount, so a link inside the copy resolves in the container's
filesystem, not the host's. The hazard is the **backend** operating on the
copy. Therefore:

- The backend never writes, reads or deletes through a symlink inside the
  copy.
- Any file the backend creates there (today: the visibility probe marker)
  has an unpredictable name. It is created exclusively and without following
  links (it fails if anything already exists at that name), and it must be a
  regular file.
- Cleanup removes only a file whose identity matches the one this operation
  created. An entry that isn't this operation's file is never overwritten,
  truncated or removed.

## Alternatives considered

- **Workspace root as the read boundary.** It allows links between sibling
  projects inside the workspace. It was rejected because the detector would
  need to know the workspace root, and because a link from one project into
  another is exactly the cross-project surprise that Phase 2 of the same
  product removes elsewhere.
- **Refuse every symlink at manifest positions.** It is simpler, but it
  breaks legitimate in-project links for no security gain.
- **`lstat` before each read, per caller.** This is the pattern that
  produced AR-02 and AR-03. It is still check-then-use on a path, and it
  would be copied into every reader.
- **Dereference symlinks when copying.** It turns an external link into a
  copy of an external file, which is a read outside the boundary. It was
  rejected.
- **Delete whatever sits at the marker name first.** That is a destructive
  race: it removes a user's file.

## Consequences

- A project whose manifest is a link to a file outside its own directory
  loses that manifest. Detection throws a containment diagnostic for
  `package.json` (DET-FR-019 still makes it load-bearing) and warns for the
  others. Discovery still lists the project under its directory name.
- A FIFO, device or directory at a manifest name is reported, not read.
  Sibling projects keep being discovered.
- Reads are fd-based and budgeted. The synchronous scan remains (moving it
  off the event loop is a separate follow-up), but no single file can block
  it any more.
- The fixed marker name disappears. Nothing outside the executor depended
  on it.
- This ADR claims **no sandbox**. It prevents unintended file access by the
  backend. It doesn't make running a user's pipeline commands safe;
  running those commands is the product's intended capability
  ([ADR-0001](./0001-native-container-execution.md)).

## Links

- Implemented by: STATE-FR-017, STATE-FR-018, DET-FR-020, WORKSPACE-FR-014,
  PRODUCT-FR-013, EXEC-FR-016, EXEC-FR-017.
- Cards: `tasks/TASK-002` (marker), `tasks/TASK-003` (primitive and manifest
  readers), `tasks/TASK-004` (CI-file reads).
- Related: [ADR-0008](./0008-workspace-root-containment-for-detect-endpoint.md)
  (directory containment, which this extends to files).
