<p align="center">
  <img src="frontend/public/pipe-icon.svg" width="72" alt="Pipe Editor logo" />
</p>

<h1 align="center">Pipe Editor</h1>

<p align="center">
  <strong>Understand, shape, and prove your CI pipeline before the push.</strong>
</p>

<p align="center">
  <a href="https://github.com/gsalviete/pipe-editor/actions/workflows/ci.yml"><img src="https://github.com/gsalviete/pipe-editor/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-38bdf8" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-34d399" alt="Node.js 20 or newer" />
  <img src="https://img.shields.io/badge/pnpm-9.15%2B-a78bfa" alt="pnpm 9.15 or newer" />
</p>

Pipe Editor is a local-first CI studio for Node.js projects. Point it at one
project or a folder containing a frontend, backend, and microservices. It
detects the stacks, gives every service an editable pipeline, and generates the
Docker and CI files needed to build the project consistently.

No cloud account is required. It does not push images, deploy applications, or
silently overwrite your source files.

## What it does

```text
project / existing CI / multi-service folder
                    │
          detect, import, or inspect
                    │
       Pipeline IR(s) + Workspace Plan
          ┌─────────┼──────────┐
          │         │          │
     visual edit  local run  portable bundle
                  in Docker  Docker / Compose / CI
```

There are two main workflows:

- **Edit one app** opens one project as a visual pipeline. You can edit stages,
  validate it locally in Docker, inspect logs, and export its files.
- **Scan all services** finds independently packaged services below a folder. You
  can choose which ones belong in the bundle, customize commands and ports, and
  generate everything together.

You can paste a relative or contained absolute path, use **Browse folders**, or
drag a folder onto the page. In the folder browser, one click selects a folder;
double-click or **Open** enters it; **Use selected folder** confirms it.
When a browser hides a dropped folder's absolute path, Pipe Editor resolves its
name inside the allowed workspace; ambiguous names are shown instead of guessed.

The workspace flow currently produces:

```text
your-workspace/
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── nginx.conf          # Vite frontends
├── backend/
│   ├── Dockerfile
│   └── .dockerignore
├── services/worker/
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml      # or docker-compose.pipe-editor.yml when Compose already exists
└── .github/workflows/ci.yml
    # alternatively: .gitlab-ci.yml
```

These files first appear in a preview with a validation report. You decide what
to download and add to your repository.

Existing Compose files are detected and shown in the workspace review. Pipe
Editor never reuses their paths: it generates `docker-compose.pipe-editor.yml`
(or a numbered variant) so your current local setup stays untouched.

## Highlights

- Detects Vite, NestJS, and generic Node.js services from manifests.
- Understands JavaScript/TypeScript and npm, pnpm, or Yarn projects.
- Detects conventional install, lint, test, and build commands.
- Imports GitHub Actions and GitLab CI into an editable provider-neutral model.
- Supports undo/redo, autosave, share links, and canonical JSON/YAML export.
- Scores pipelines with a practical Pipeline Doctor.
- Runs pipeline stages in isolated Docker containers with live logs and abort.
- Generates multi-stage Node images and nginx runtime images for Vite.
- Generates one root Compose file or one standalone file per service.
- Generates a basic GitHub Actions or GitLab CI pipeline with no publish/deploy.
- Validates paths, service IDs, ports, IR documents, YAML, and artifact structure.
- Keeps the API loopback-only and resolves paths through a strict workspace
  boundary, including symlinks.

## Quick start

### Requirements

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) 9.15 or newer
- [Docker](https://www.docker.com/) running, if you want local pipeline runs and
  Docker-backed integration tests

Enable the pnpm version declared by the repository:

```bash
corepack enable
```

### 1. Install

```bash
git clone https://github.com/gsalviete/pipe-editor.git
cd pipe-editor
pnpm install:all
```

### 2. Start the backend

`PIPE_EDITOR_WORKSPACE_ROOT` is the only required setting. It defines the
highest folder Pipe Editor is allowed to inspect.

To explore this repository itself:

```bash
PIPE_EDITOR_WORKSPACE_ROOT="$(pwd)" pnpm dev:backend
```

To inspect a separate folder of your own projects:

```bash
PIPE_EDITOR_WORKSPACE_ROOT="/absolute/path/to/your/projects" pnpm dev:backend
```

The API starts at `http://127.0.0.1:3000`; Swagger is available at
`http://127.0.0.1:3000/api/docs`.

### 3. Start the frontend

In a second terminal:

```bash
pnpm dev:frontend
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

### 4. Try the product

For a quick multi-service demo:

1. Enter `.` if the workspace root is this repository.
2. Click **Scan all services**.
3. Review the detected `backend` and `frontend` services.
4. Expand **Customize build and tests** if you want to change a command.
5. Choose GitHub Actions or GitLab CI.
6. Choose one root Compose file or one Compose file per service.
7. Click **Generate bundle** and inspect the files/check report.

Use **Edit one app** instead when you want the deeper visual editor and local executor
for just one package.

## Dummy projects to try

Three self-contained Node.js projects are included in `test/fixtures`. They
have real build scripts, npm lockfiles, and no external dependencies.

| Project | Expected result | What to try |
|---|---|---|
| [demo-api](test/fixtures/demo-api) | Lint, test, and build pass | Detect, run locally, export Dockerfile, import GitHub Actions |
| [demo-failing-tests](test/fixtures/demo-failing-tests) | Test fails intentionally | Inspect failure logs; change `actualDiscount` to `20` and run again |
| [demo-no-tests](test/fixtures/demo-no-tests) | Lint/build pass; no test stage | Inspect Pipeline Doctor and import GitLab CI |

With the backend running, choose a `demo-*` card in **Projects**. With this
repository as the workspace root, paths are `test/fixtures/demo-api`, etc.;
with `test/fixtures` as the root (the Compose default), use `demo-api`, etc.
The CI buttons on the cards import the supplied configurations.

For a workspace bundle, enter `test/fixtures` (or `.` with the fixtures as
root), click **Scan all services**, and select the three demo services. Give each
service a different host port when running them together.

Local pipeline execution requires Docker and an executor-enabled backend.
The default Compose demo supports detection, CI import and export only.
Each project README also includes commands for running directly with Node.js.

## Docker Compose demo

You can run the editor itself without installing Node dependencies locally:

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173).

By default, Compose exposes the bundled fixtures as the readable workspace. To
open your own folder, edit `.env`:

```dotenv
WORKSPACE_HOST_PATH=/absolute/path/to/your/projects
```

Restart Compose after changing `.env`. The same absolute host path is shown in
the UI and can be pasted directly; Pipe Editor safely maps it to the container's
read-only `/workspace` mount. Paths outside this configured folder are rejected.

The default containerized demo does not mount the host Docker socket, so local
pipeline execution is disabled there. Detection, editing, workspace scans, and
artifact generation still work. The security trade-off for the opt-in executor
is documented in [ADR-0009](docs/adr/0009-docker-access-in-the-compose-demo.md).

## Fork this repository

Anyone can build on Pipe Editor under the MIT license.

1. Click **Fork** on GitHub.
2. Clone your fork and install dependencies:

   ```bash
   git clone https://github.com/YOUR_USERNAME/pipe-editor.git
   cd pipe-editor
   corepack enable
   pnpm install:all
   ```

3. Keep the original repository available as `upstream`:

   ```bash
   git remote add upstream https://github.com/gsalviete/pipe-editor.git
   git fetch upstream
   ```

4. Create a branch and run the quality gates before opening a pull request:

   ```bash
   git switch -c feat/my-improvement
   pnpm check
   ```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing behavior. This project
uses spec-driven development: a feature starts with an Accepted spec, tests
reference stable acceptance-criterion IDs, and non-obvious decisions live in an
ADR.

## Configuration

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `PIPE_EDITOR_WORKSPACE_ROOT` | Yes | — | Highest directory the API may inspect or execute from |
| `PORT` | No | `3000` | Backend HTTP port |
| `BIND_ADDRESS` | No | `127.0.0.1` | Backend listener; keep loopback for local development |
| `FRONTEND_URL` | No | `http://localhost:5173` | Allowed browser origin |
| `WORKSPACE_HOST_PATH` | Compose only | `./test/fixtures` | Host folder mounted read-only at `/workspace` |

See [backend/.env.example](backend/.env.example) and
[.env.example](.env.example) for copy-ready examples.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev:backend` | Starts the NestJS API in watch mode |
| `pnpm dev:frontend` | Starts the Vite UI in watch mode |
| `pnpm typecheck` | Runs strict TypeScript checks in both apps |
| `pnpm build` | Produces backend and frontend production builds |
| `pnpm test` | Runs all backend and frontend tests |
| `pnpm check` | Runs typecheck, build, and the full test suite |

Docker-backed tests automatically exercise the real container path when Docker
is available.

## Architecture

| Layer | Responsibility |
|---|---|
| React + Vite frontend | Discovery, visual editing, diagnostics, workspace planning, artifacts, and live runs |
| NestJS API | Loopback HTTP/SSE contracts and the filesystem security boundary |
| Detector + rules | Manifest evidence converted into explicit pipeline facts |
| Pipeline IR | Provider-neutral source of truth for one service pipeline |
| Workspace Plan | Provider-neutral aggregate with one Pipeline IR per selected service |
| Generators | Dockerfile, Docker Compose, GitHub Actions, and GitLab CI output |
| Executor | Temporary workspace copy, isolated stage containers, bounded logs, and cleanup |
| State store | Workspace-scoped autosave and bounded run history |

Repository layout:

```text
backend/   NestJS API, detector, generators, executor, and domain modules
frontend/  React product interface
docs/      product scope, ADRs, component specs, and test traceability
test/      realistic projects, expected IR documents, and golden files
```

The best technical reading path is:

1. [Product vision](docs/product/01-vision.md)
2. [Local workspace scope](docs/product/05-local-workspace-scope.md)
3. [Workspace architecture decision](docs/adr/0010-workspace-plan-above-service-pipelines.md)
4. [Workspace bundle specification](docs/specs/workspace-bundle.spec.md)
5. [Full spec index](docs/specs/README.md)
6. [Test strategy and traceability](docs/testing/test-strategy.md)

## Supported today

| Area | Supported |
|---|---|
| Runtime | Node.js |
| Languages | JavaScript, TypeScript |
| Package managers | npm, pnpm, Yarn |
| Classified stacks | Vite, NestJS, generic Node.js |
| CI input/output | GitHub Actions, GitLab CI |
| Containers | Dockerfile, `.dockerignore`, Docker Compose |

## Honest limits

- Detection is manifest-based; Pipe Editor does not guess by reading arbitrary
  source code.
- Cloud deployment, registries, SSH, Kubernetes, secrets, and infrastructure
  provisioning are intentionally out of scope.
- Compose does not infer databases or cross-service dependencies yet.
- Local execution runs the same shell commands in containers, but it is not a
  byte-for-byte simulation of a hosted GitHub or GitLab runner.
- This is a local single-user developer tool, not a hosted multi-tenant service.

## Security

Pipeline commands are code. Review them before running a project you do not
trust. The backend binds to loopback by default, resolves every path beneath the
configured workspace after symlink resolution, and runs stages from a temporary
copy without privileged containers or a Docker-socket mount.

See [SECURITY.md](SECURITY.md) for the full boundary and private reporting
guidance.

## Contributing

Issues and focused pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md), keep the Pipeline IR provider-neutral, and
run `pnpm check` before submitting a change.

## License

[MIT](LICENSE) © 2026 Gabriel Salviete.
