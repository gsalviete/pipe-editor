# Test Fixtures

Sample projects and golden files used to verify the Detector, Generators, and
Executor. See the [Test Strategy](../../docs/testing/test-strategy.md).

## Runnable demos

- [demo-api](demo-api): passing pipeline and importable GitHub Actions.
- [demo-failing-tests](demo-failing-tests): deliberate test failure with a clear fix.
- [demo-no-tests](demo-no-tests): missing test stage and importable GitLab CI.

These demos need Node.js 20+ and have no external dependencies. Select their
cards in Pipe Editor, or follow each README to run commands manually.

Other directories are detector fixtures, including intentionally incomplete
manifests and lockfiles; they are not necessarily runnable applications.

## Fixtures that break the mould

Every fixture written before 2026-09-13 declared `engines.node`, and most
declared `packageManager` too. That uniformity hid three defects behind a
green suite (adversarial review UX-01, UX-02, GEN-04), so these two exist
specifically to *not* look like the others:

- [node-npm-no-engines](node-npm-no-engines): declares its Node version
  nowhere — no `engines.node`, no `volta.node`, no `.nvmrc`, no
  `.node-version` — and has no `packageManager` field either, so two
  required fields detect as unresolved. Exercised through the **whole**
  flow (detect → refuse → resolve → generate → export) by
  `backend/src/integration/unresolved-flow.spec.ts`.
- [node-pm-field-no-lockfile](node-pm-field-no-lockfile): declares
  `packageManager: "pnpm@9.0.0"` with **no lockfile of any kind**, the
  shape that made the generators emit a `--frozen-lockfile` install that
  cannot succeed.

When adding a fixture, prefer one that stresses a shape the others do not.
A twelfth fixture that looks like the first eleven buys nothing.
