# Local Workspace Product Scope

| Field | Value |
|---|---|
| Status | Accepted |
| Accepted on | 2026-09-11 |
| Product owner direction | Expand the post-MVP product from one project to a local folder containing multiple independently containerized services, while keeping cloud deployment out of scope. |

## Product promise

Point Pipe Editor at a local folder. It discovers the Node services inside,
lets the user review their build and test pipelines, and produces a portable
containerization bundle: one Dockerfile per service, a Compose file for running
the set locally, and a basic GitHub Actions or GitLab CI configuration.

## In scope

- One local folder containing a single app, a frontend/backend pair, or several
  independently packaged services.
- Manifest-based Node stack classification, initially including Vite, NestJS
  and generic Node services.
- One Pipeline IR per service, preserving the existing provider-neutral model.
- Editable install, lint, test and build commands through the existing pipeline
  editor, one selected service at a time.
- Service-aware Dockerfiles and `.dockerignore` files.
- A root Compose file by default, with an optional standalone Compose file per
  service. Existing Compose variants are inventoried and protected; generated
  output receives a separate collision-free filename.
- Static validation of the generated bundle and explicit commands for optional
  Docker build/config validation.
- A basic CI file for either GitHub Actions or GitLab CI that validates and
  container-builds every service without publishing or deploying images.

## Explicitly out of scope

- Cloud accounts, registries and deployments.
- SSH access and remote server mutation.
- Provisioning infrastructure, databases, domains or Kubernetes.
- Managing provider secrets or repository settings.
- Multi-language detection in this release. Unsupported services are reported
  honestly rather than guessed.

This is a post-MVP scope. It does not rewrite the historical MVP boundary in
`02-mvp-scope.md`; it deliberately advances the product after that slice was
completed.
