# Validation

Root scripts run backend then frontend (pnpm, not npm). `pnpm check` runs
typecheck, lint, build and test, matching CI (`.github/workflows/ci.yml`). Tests map
to spec acceptance-criteria IDs (`docs/testing/test-strategy.md`).

```
lint: pnpm lint                # per workspace: pnpm lint:backend | pnpm lint:frontend
typecheck: pnpm typecheck
test: pnpm test                # per workspace: pnpm test:backend | pnpm test:frontend
build: pnpm build
full: pnpm check
images: docker build -f backend/Dockerfile . && docker build -f frontend/Dockerfile .
pr_size_budget: 500            # max changed production lines per change/card (tests/fixtures/generated excluded). No PRs in this project: it bounds each card's working-tree diff
guidelines: GUIDELINES.md, CLAUDE.md, CONTRIBUTING.md, AGENTS.md
```
