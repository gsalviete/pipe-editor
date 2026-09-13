# ADR-0008: Workspace-root containment for the detect endpoint

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-15 |
| Accepted on | 2026-06-21 |
| Affected specs | `visual-editor.spec.md` (Accepted) |

## Context

The Visual Editor's `POST /api/detect` endpoint receives a project path
from the client and runs `detect(rootPath)` against the **server's**
filesystem. That is textbook arbitrary-file-read surface. A naïve
implementation accepting any path the client sends would let the
backend read `package.json` (and, transitively via the manifest set,
`pnpm-lock.yaml`, `tsconfig.json`, etc.) from anywhere on the server's
disk — including `/etc/`, the user's secrets directory, mounted
volumes, and other projects' source trees.

A portfolio project must visibly reason about this, because the
shape of the problem ("read files from a path the client controls")
is exactly what production systems get wrong. This ADR records the
decision and its rationale.

The bounds of the threat:

- The detector reads only the [enumerated manifest set](../specs/detector-engine.spec.md#decision-3--manifest-set-hard-frontier).
  So arbitrary code execution is not the worst-case here — but
  information disclosure of `package.json` files (which may carry
  internal package names, private registry hints, etc.) and
  `.npmrc`-style secrets via the lockfile metadata IS a real concern.
- The MVP is a local-folder tool ([ADR-0002](./0002-local-folder-over-remote-repos.md));
  there is no multi-user authentication. The threat model is "a
  malicious client on localhost (e.g. a browser tab the user
  visited) sends a crafted request to the local backend."

## Decision

The detect endpoint enforces **workspace-root containment** with two
layers of defense:

1. **Configured workspace root.** The backend is started with a
   `PIPE_EDITOR_WORKSPACE_ROOT` environment variable pointing at a
   single absolute directory (typically the user's "projects" folder).
   Relative requests are interpreted under that root. Contained absolute paths
   are also accepted so users can paste paths from Finder or a terminal.
   In Docker, an optional `PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT` maps that
   host-facing absolute path onto the container's mounted workspace.
2. **Realpath containment check.** After joining the user's
   relative path onto the workspace root, the backend computes the
   **realpath** of both the resolved input and the workspace root,
   then verifies (via prefix check on the realpaths) that the
   resolved input lies under the workspace root. Symlinks inside
   the workspace pointing **outside** are rejected — the realpath
   resolves them away before the check.

Pseudocode (for the spec):

```
const wsRoot = realpath(env.PIPE_EDITOR_WORKSPACE_ROOT)
const displayRoot = env.PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT ?? wsRoot
if (request.projectPath contains NUL bytes) reject(400, INVALID_PROJECT_PATH)
const candidate = request.projectPath is inside displayRoot
  ? join(wsRoot, relative(displayRoot, request.projectPath))
  : resolve(wsRoot, request.projectPath)
if (candidate is lexically outside wsRoot) reject(403, PATH_OUTSIDE_WORKSPACE)
const resolved = realpath(candidate)
if (!resolved.startsWith(wsRoot + path.sep) && resolved !== wsRoot) {
  reject(403, PATH_OUTSIDE_WORKSPACE)
}
runDetect(resolved)
```

In addition (defense-in-depth, recorded for completeness rather than
as the primary control):

- The backend MUST bind to `127.0.0.1` only, not `0.0.0.0`
  ([EDITOR-API-NFR-001](../specs/visual-editor.spec.md#non-functional-requirements--constraints)).
  Network exposure of an unauthenticated read endpoint to other
  hosts on the LAN is unacceptable; localhost-only binding closes
  that off without auth machinery.
- CORS is configured permissively in dev (the React/Vite dev server
  at `:5173` must reach the backend at `:3000`), but the
  localhost binding above limits the blast radius.

## Alternatives considered

- **Option A — Workspace root + realpath containment (chosen).**
  - *Pros:* simple to implement; one env var to configure; symlink
    escape is closed by realpath; the rejection rule is auditable as a
    single function; localhost binding caps remote exposure; reasoning
    is visible to a portfolio reader.
  - *Cons:* user MUST set the env var; a user pointing the workspace
    root at `/` defeats the protection (documented but not enforced).
- **Option B — Hardcoded allowlist of directories.**
  - *Pros:* even tighter than a single root.
  - *Cons / why NOT:* requires the user to edit code (or a config
    file) to add each project; brittle; a single workspace root is
    the practical sweet spot.
- **Option C — Trust the client; accept any path.**
  - *Pros:* simplest possible code.
  - *Cons / why NOT:* obvious arbitrary-file-read. A portfolio
    project that doesn't catch this is the wrong portfolio project.
- **Option D — Upload the project from client to server, no
  filesystem reads at all.**
  - *Pros:* sidesteps the threat entirely.
  - *Cons / why NOT:* contradicts [ADR-0002](./0002-local-folder-over-remote-repos.md)
    ("local folder, no upload") and the MVP scope; would also need
    a large file-transfer protocol the v1 doesn't need.
- **Option E — Accept contained absolute paths + containment check (adopted 2026-09-12).**
  - *Pros:* allows the client to send absolute paths (one less
    transformation) and matches how people copy paths from Finder and terminals.
  - *Guardrail:* absolute does not mean unrestricted. Host paths are translated
    only when they are below the configured display root, and the final realpath
    must still be contained by the workspace root.

## Consequences

- **Positive:** known-classes of arbitrary-file-read (path traversal
  via `..`, symlink escape, or an outside absolute path) are closed by a
  single, testable function. Localhost-only binding eliminates remote
  exposure. The reasoning is documented (this ADR) and the spec's
  acceptance criteria turn the rules into tests.
- **Negative / accepted costs:** users MUST set
  `PIPE_EDITOR_WORKSPACE_ROOT` before running the backend; the
  Quick-start in the README will need a one-line update.
  Misconfiguration (pointing the root at `/`) is possible but
  documented; protecting against the user shooting themselves in the
  foot is out of scope.
- **Neutral / to revisit:** if the project ever ships an auth layer,
  this containment rule remains relevant — auth gates **who** can
  call the endpoint; this gates **what** any caller can reach. The
  two stack.

## Links

- [Visual Editor Spec](../specs/visual-editor.spec.md) — settles the
  request shape, error codes, and ACs that turn this ADR into
  tests.
- [ADR-0002](./0002-local-folder-over-remote-repos.md) — local-folder
  input, no upload; the upstream constraint this ADR exists under.
- [Detector Engine Spec](../specs/detector-engine.spec.md) — the
  `detect()` function this endpoint wraps. Its manifest-set
  frontier limits the WORST-case to manifest reads, not full
  arbitrary-file-read; this ADR closes the front door regardless.

## Amendments

| Date | Change |
|---|---|
| 2026-09-12 | Contained absolute paths are now accepted. Added the optional host-facing display-root alias so a macOS `/Users/...` path maps safely to Docker's `/workspace` mount. Outside absolute paths remain rejected. |
