# pipe-editor

A spec-driven CI/CD pipeline visualizer and local validator. `pipe-editor` reads
a project from a local folder, suggests a suitable pipeline, lets the user
adjust it in a visual editor, generates **portable** artifacts (a `Dockerfile`
and a GitHub Actions workflow), and **validates the pipeline locally in
containers** before any push.

This is a personal learning + portfolio project. The point is to practice and
demonstrate Spec-Driven Development, contract-oriented architecture, and DevOps
fundamentals end to end — not to ship a business.

## Source of truth

**The design lives in [`docs/`](./docs/README.md).** That directory is the
authoritative description of what this project is, what it does, and why. Code
follows specs; specs come first. If you read only one file, start with
[`docs/README.md`](./docs/README.md).

## Repository layout

This repository is a **monorepo**.

```
pipe-editor/
├── backend/            # NestJS API — detection, generation, local execution
├── frontend/           # React + Vite — the visual editor
├── docs/               # Vision, ADRs, specs, rules, test strategy (source of truth)
├── test/               # Test fixtures and golden files
├── docker-compose.yml  # Dev stack for backend + frontend
├── CLAUDE.md           # Operating instructions for the Claude Code agent
└── package.json        # Monorepo entry — convenience scripts only
```

## Stack

- **Backend:** NestJS (Node.js, TypeScript), pnpm
- **Frontend:** React + Vite + TypeScript + Tailwind, pnpm
- **Local pipeline execution:** Docker, orchestrated by the backend Executor
  ([ADR-0001](./docs/adr/0001-native-container-execution.md))

## Quick start (development)

Prerequisites: Node.js 20+, [pnpm](https://pnpm.io/), Docker.

```bash
# install workspace dependencies
pnpm --dir backend install
pnpm --dir frontend install

# run the dev stack (two terminals)
pnpm --dir backend run start:dev      # NestJS on :3000
pnpm --dir frontend run dev           # Vite on :5173

# or run everything in containers
docker compose up
```

## How to read this repository

For an honest sense of the project, read the docs in this order:

1. [`docs/product/01-vision.md`](./docs/product/01-vision.md) — what and why.
2. [`docs/product/02-mvp-scope.md`](./docs/product/02-mvp-scope.md) — what is and is not in scope.
3. [`docs/product/03-domain-glossary.md`](./docs/product/03-domain-glossary.md) — the ubiquitous language.
4. [`docs/adr/`](./docs/adr/README.md) — the decisions and their rationale.
5. [`docs/specs/`](./docs/specs/README.md) — the contracts implementations follow.
6. [`docs/testing/test-strategy.md`](./docs/testing/test-strategy.md) — how specs become tests.

## Project status

Early. The Pipeline IR specification
([`docs/specs/pipeline-ir.spec.md`](./docs/specs/pipeline-ir.spec.md)) is the
first spec being authored; it gates all subsequent implementation work. See
[`docs/specs/README.md`](./docs/specs/README.md) for the planned spec order and
the status board.

## Working with the agent

Claude Code agents working on this repo are bound by
[`CLAUDE.md`](./CLAUDE.md). That file is operating instructions — it is **not**
the design source of truth; `docs/` is.

## License

TBD — personal project.
