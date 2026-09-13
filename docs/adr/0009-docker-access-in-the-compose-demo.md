# ADR-0009: Docker access in the compose demo — editor slice by default, EXEC local-only in v1

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-22 |
| Affected specs | `pipeline-executor.spec.md` (Accepted), `visual-editor.spec.md` (Accepted) |

## Context

The compose stack runs the NestJS backend in a container so the demo
is `docker compose up -d` and done. But three of the pipeline-executor
spec's contract elements are awkward in that setting:

1. **Backend bind address.** `EDITOR-API-NFR-001` says the backend MUST
   bind `127.0.0.1` only. Inside a container, `127.0.0.1` is the
   container's loopback and is not reachable from the frontend
   container (or any sibling). If the backend listens on `127.0.0.1`
   only, the frontend's nginx proxy cannot reach `http://backend:3000`,
   and the whole demo breaks.

2. **The Executor needs Docker.** Per `pipeline-executor.spec.md`
   Decision A and `EXEC-FR-004`, `execute()` spawns one container
   per Stage via the local `docker` CLI. When the backend itself
   runs in a container, those `docker` calls need a way to reach
   the host daemon. The two standard options are mounting
   `/var/run/docker.sock` (effectively daemon-root inside the
   backend container) or running Docker-in-Docker (DinD) inside the
   backend image (its own complexity cliff that EXEC Decision B
   already rejected for Stage containers).

3. **EXEC's temp-copy workspace.** Decision A copies the project
   into a temp directory and bind-mounts it into Stage containers.
   When the Executor runs inside a container, that temp directory
   is on the **container's** filesystem — invisible to the host
   docker daemon. The daemon cannot `--mount source=<container-fs-path>`
   from a sibling container. Wiring a shared host-side temp area
   is solvable but is real engineering work.

The decisions below resolve all three.

## Decision

### 1. Bind address — two-layer enforcement

The NestJS server reads `BIND_ADDRESS` from env, defaulting to
`127.0.0.1`. The intent of `EDITOR-API-NFR-001` is "no LAN
exposure"; that intent is preserved whenever **either** the process
binds loopback **or** the host port mapping is loopback-only.

- **Local dev (no compose).** `BIND_ADDRESS` defaults to `127.0.0.1`.
  The process refuses to listen on non-loopback. ADR-0008 +
  EDITOR-API-NFR-001 hold by themselves at the process layer.
- **Compose.** The backend service sets `BIND_ADDRESS=0.0.0.0` (so
  the frontend container can reach it via the compose network)
  AND the compose port mapping is `127.0.0.1:3000:3000` (so the host
  is loopback-only). LAN exposure is closed at the port-mapping
  layer instead of the process layer.

This is **not** a relaxation of the security claim — it's a
restatement: "the listener is unreachable from the LAN" remains
true in both configurations; the implementation locus differs.

### 2. The Executor stays local-only in v1

The default compose **does not run the Executor**. The default
demo exercises the editor slice (detect → edit → generate):

- `POST /api/detect` reads the bind-mounted `/workspace` (read-only)
  and returns the IR + warnings.
- `POST /api/generate` runs `generate(ir)` and returns the
  Dockerfile + `.dockerignore` strings.

Neither needs Docker access from within the backend container.

A separate compose **override** file (`docker-compose.exec.yml`)
exists for users who want to enable EXEC and accept the trade-off.
It:

- Mounts `/var/run/docker.sock` into the backend container.
- Sets `EXEC_AVAILABLE=true` so a future frontend affordance can
  surface the "Run pipeline" action.

The override is documented as **EXPERIMENTAL** because issue (3)
above — the temp-copy workspace's location relative to the host
daemon — is unresolved in v1. The override boots; whether
`execute()` succeeds depends on the host's filesystem layout and
namespacing. Solving this cleanly is **v0.2 work** (a shared
host-side temp area mounted into the backend container and made
available to Stage containers as a docker volume).

### 3. The honest demo boundary

The README and the compose file's header comments state plainly
that the compose demo exercises **detect → edit → generate**, not
the live container chain (`execute()`). Local-dev (`pnpm dev` in
the backend, host docker available) is the supported path for
running EXEC and for the AC-011 receipt of ADR-0001.

## Alternatives considered

- **Option A — Default compose mounts the docker socket.**
  - *Pros:* one-command-up demo includes EXEC.
  - *Cons / why NOT:* the demo image becomes "container with
    daemon-root access." A casual user copy-pasting the compose
    invocation gets a stack that could be turned into a privilege-
    escalation primitive. The trade-off needs to be a deliberate
    opt-in, not a default.
- **Option B — DinD in the backend image.**
  - *Pros:* no host socket exposure.
  - *Cons / why NOT:* known complexity cliff (storage drivers,
    rootless quirks, slow startup). Same reason EXEC-Decision B
    rejected DinD for Stage containers.
- **Option C — Refactor EXEC to run on the host even when the
  backend runs in a container** (e.g., a thin client/server
  protocol with a privileged host helper).
  - *Pros:* clean separation.
  - *Cons / why NOT:* a new protocol and a new privileged binary,
    both v0.2 in scope. The honest v1 answer is "EXEC is
    local-dev; the compose demo is the editor slice."
- **Option D — Mount the host's `/var/folders` / `/tmp` so the
  temp-copy is visible to the host daemon.**
  - *Pros:* one tweak makes EXEC partially work in the override.
  - *Cons / why NOT:* OS-dependent (macOS Docker Desktop's
    virtualization, Linux namespacing) and brittle. The override
    file references it as "v0.2 work" rather than committing to
    it.

## Consequences

- **Positive:** the compose demo is honest — `docker compose up -d`
  gives a working editor slice with no surprises. EDITOR-API-NFR-001
  is satisfied via the port-mapping layer in compose; nothing in
  the spec is relaxed. The override file exists for users who want
  EXEC inside compose, with the trade-off named upfront.
- **Negative / accepted costs:** the compose demo does not
  demonstrate EXEC. The AC-011 receipt of ADR-0001 only runs from
  local-dev. The README mentions both paths and what each shows.
- **Neutral / to revisit:** v0.2 should design a shared host temp
  area so EXEC works inside the override compose cleanly. When
  that lands, the override stops being "experimental" and may
  become the default for the demo (with the socket-mount trade-off
  still documented loudly).

## Links

- [ADR-0001](./0001-native-container-execution.md) — the reason
  the Executor exists at all.
- [`pipeline-executor.spec.md`](../specs/pipeline-executor.spec.md) —
  Decision A (temp-copy workspace), Decision B (no DinD, no socket
  in Stage containers), EXEC-NFR-001…004 (container security model).
- [`visual-editor.spec.md`](../specs/visual-editor.spec.md) —
  EDITOR-API-NFR-001 (`127.0.0.1`-only bind), ADR-0008 (workspace-
  root containment).
- [ADR-0008](./0008-workspace-root-containment-for-detect-endpoint.md) —
  the orthogonal "where can detect read?" rule, which is unchanged
  by this ADR.
