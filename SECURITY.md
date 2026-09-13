# Security Policy

## Supported versions

Pipe Editor is pre-1.0. Security fixes are applied to the current `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose files
outside the configured workspace or execute unintended host commands. Use
GitHub's private vulnerability reporting for this repository when available.

Include the affected route or module, reproduction steps, impact and any known
mitigation. Avoid attaching real secrets or private source code.

## Security boundary

Pipe Editor is a local, single-user developer tool. It intentionally executes
pipeline commands from a user-selected project inside Docker containers. It is
not designed to execute untrusted repositories as a multi-tenant hosted service.

The backend should remain loopback-only. Compose publishes ports on `127.0.0.1`.
Project paths are resolved against `PIPE_EDITOR_WORKSPACE_ROOT` after symlink
resolution, and execution uses a temporary copy instead of the user's working
tree. Stage containers are not privileged and do not receive the Docker socket.
