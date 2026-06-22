# Fixture: `node-pnpm-nest-basic`

The canonical example from
[`docs/specs/pipeline-ir.spec.md`](../../../docs/specs/pipeline-ir.spec.md):
a NestJS application detected to use pnpm and Node 20, with the canonical
Install → Lint → Test → Build → Docker Build chain.

## Files

- `expected-ir.json` — the IR document the Detector is expected to produce
  for this Project. Used by the IR validator and effective-chain tests
  (see `backend/src/modules/ir/`); will be used by the Detector tests once
  the Detector spec is Accepted.

## Status

The actual Project files (`package.json`, `pnpm-lock.yaml`, `nest-cli.json`,
`tsconfig.json`) are not committed yet — they will be added with the
Detector Engine spec. For now this directory hosts only the expected IR,
which is enough to exercise every validator and splice rule of the
Pipeline IR spec.
