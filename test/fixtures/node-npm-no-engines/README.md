# Fixture: `node-npm-no-engines`

The shape the 11 original fixtures all missed: an **ordinary Node project
that declares its version nowhere**. No `engines.node`, no `volta.node`, no
`.nvmrc`, no `.node-version`.

Detection therefore resolves `/project/packageManager/name` and
`/project/packageManager/version` from the npm lockfile, but leaves
`/project/runtime/version` `null` with a paired `unresolved` entry — the
state that used to be a dead end (adversarial review UX-01).

This fixture exists to exercise the **whole flow**, not just detection:

```
detect → runtime.version is null and generate/export refuse (422)
       → resolveProjectField commits "20"
       → generate and export now succeed
```

Because every original fixture declared `engines.node`, 290 green tests
never touched this path. See `test/fixtures/README.md` and
`unresolved-flow.spec.ts`.
