# Adversarial review evidence

Captured on 2026-09-22 at revision `fae6a98b6daaec0fc0112b6979d44dd1ca17ff32`. See the root [review](../../../adversarial-review.md) for interpretation, priorities and acceptance criteria.

These probes demonstrate current defects. Passing them is **not** a correctness gate. Docker-dependent execution is mocked in `probes.cjs`; it does not certify real container behavior. Filesystem probes use disposable temporary directories and clean up afterward. `limits.cjs` runs pathological inputs in bounded child processes; do not paste cyclic YAML into the application.

## Backend reproductions

From the repository root, with the existing dependencies installed:

```sh
pnpm --dir backend build
node docs/reports/review-evidence/probes.cjs
node docs/reports/review-evidence/limits.cjs
```

`results.jsonl` and `limits.jsonl` contain the captured outputs. R01–R18 cover filesystem containment, generated configuration, execution ordering/context, validation and persistence. L01–L03 cover cyclic YAML, large reversed chains (negative control), and FIFO reads. The FIFO check requires POSIX `mkfifo`. Timing and temporary paths vary by machine. Read the scripts before running them; do not interpret mocked execution output as an actual Docker run.

## UI reproductions

The archived test imports modules relative to `frontend/src/editor`. Copy it temporarily to that location to run the four regression demonstrations. This command refuses to overwrite an existing file and removes only its own copy on exit:

```sh
(
  set -e
  target=frontend/src/editor/review-evidence.spec.tsx
  test ! -e "$target"
  cp docs/reports/review-evidence/ui-probes.spec.tsx "$target"
  trap 'rm -f "$target"' EXIT
  pnpm --dir frontend exec vitest run src/editor/review-evidence.spec.tsx
)
```

U01: old workspace plan survives a project change. U02: an old generation response reinstates obsolete artifacts. U03: undo while the initial save is pending leaves the obsolete save. U04: an old project's saved pipeline can be restored after switching projects. These use mocked API promises and jsdom; they are not browser end-to-end tests. All four passed in the review. Vite emitted a sandbox websocket `EPERM` warning, but the test assertions completed.

## Existing gates and production image

```sh
pnpm check
pnpm --dir backend exec jest --runInBand execute.pure.spec.ts
pnpm --dir frontend test
docker build -f frontend/Dockerfile .
```

The review's typecheck, lint and package builds passed. With local Docker/socket access, backend tests returned 527 passed and one timeout; the isolated retry passed all nine tests. The separate frontend suite passed 130 tests. The frontend Docker image build failed on removed configuration files in its `COPY` instruction. These results must not be summarized as a fully passing `pnpm check`. No deployment or hosted CI run was performed.

## Dependency evidence

`dependency-audit.json` stores audit metadata and advisory records, including dependency paths. It combines `pnpm --dir backend audit --json`, the frontend equivalent, and both `--prod` variants. Counts reflect the registry response at capture time, not independently verified exploitability. Re-running may yield different results as advisories change. No dependency upgrades were made.

## Inventory

`inventory.tsv` lists tracked files at the reviewed revision plus the pre-existing untracked `REPORT.md`, with byte sizes, newline counts and SHA-256 hashes. It is an inventory, **not a per-file assertion of exhaustive manual review**. Generated output, installed dependencies, and this newly created evidence package are excluded. Scope and limitations are recorded in the main review.
