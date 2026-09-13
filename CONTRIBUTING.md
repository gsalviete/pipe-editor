# Contributing

Thanks for helping improve Pipe Editor. This repository uses spec-driven
development: behavior is agreed as a verifiable contract before implementation.

## Development setup

Requirements: Node.js 20+, pnpm 9.15+ and Docker for executor integration tests.

```bash
pnpm install:all
PIPE_EDITOR_WORKSPACE_ROOT="$(pwd)" pnpm dev:backend
pnpm dev:frontend
```

Before opening a pull request, run:

```bash
pnpm check
```

## Change workflow

1. Find the Accepted spec that governs the behavior.
2. If no spec covers it, draft or extend one and agree its acceptance criteria
   before changing implementation code.
3. Add tests that reference the relevant acceptance-criterion IDs.
4. Record a non-obvious architectural decision as an ADR.
5. Keep generated artifacts portable and the Pipeline IR provider-neutral.

Keep pull requests focused. Explain the user-visible outcome, the governing
spec and how the change was verified.
