# Hardening Report — the adversarial review, executed

| Field | Value |
|---|---|
| Document type | Session report (not a spec, not normative) |
| Written on | 2026-09-13 |
| Input | [`adversarial-review.md`](./reports/adversarial-review.md) — 49 findings |
| Baseline | `e3a9b42e` + working-tree changes; 242 backend / 48 frontend tests |
| Result | 32 commits; of 49 findings: 47 closed, 1 partial (FE-05), 1 deferred with an ADR (ARCH-01) |
| Verification | `pnpm check` (typecheck → lint → build → test) exits 0: **528 backend, 130 frontend** (+368) |

---

## 1. What changed, in one paragraph

Every finding in the review was worked. The product's headline dead end is
gone — a project that declares its Node version the ordinary way now
detects, generates and runs, and a field the detector could not resolve can
be resolved in the editor instead of only in the user's `package.json`. The
generated artifacts are serialized by a YAML library and parsed back before
they are returned, so a scoped package name or a colon in a stage name can
no longer produce a broken file. The API refuses requests that are not
addressed to this machine, and a pipeline that arrived in a URL now shows
its commands before it will run them. On the process side the four
unspecified components have specs, the acceptance criterion that asserted
the opposite of its own test is superseded, the executor's 17 criteria are
traced, five specs advanced to *Implemented*, and the project that
penalises other projects for having no linter now has one.

---

## 2. Finding-by-finding

Commits are `git log e3a9b42e..HEAD`. Where one commit carries several
findings, the commit message names all of them and says why they were not
separable.

### Security

| ID | Status | Commit | Note |
|---|---|---|---|
| SEC-01 | done | `f9e26095` | Host allowlist + `Sec-Fetch-Site` on state-changing routes, before every other middleware. |
| SEC-02 | done | `08c491bc` | Provenance `detected \| imported \| shared`; a share link is held for review, never auto-loaded; first run of a non-detected document is acknowledged. |
| SEC-03 | done | `478bc0c5` | `container.image` against the reference grammar, inside `validate()`. |
| SEC-04 | done | `478bc0c5` | Env keys against `^[A-Za-z_][A-Za-z0-9_]*$`, values must be strings. |
| SEC-05 | done | `1c7434e2` | Marker written into the temp copy and read back from a throwaway container; `DOCKER_WORKSPACE_NOT_VISIBLE` otherwise. |
| SEC-06 | done | `1c7434e2` | 8 MiB bound at all three manifest read sites. |
| SEC-07 | done | `478bc0c5` | Depth cap of 64 in `validate()` **and** in `canonical.ts`. |
| SEC-08 | done | `f9e26095` | `credentials: true` removed. |
| SEC-09 | done | `1c7434e2` | SSE closes with a reason when the run was evicted between lookup and subscribe. |

### Generated artifacts

| ID | Status | Commit | Note |
|---|---|---|---|
| GEN-01 | done | `8ad4a1ae` | Shared `dockerTagSlug` + `sanitizeForComment`; both workspace copies of the rule retired. |
| GEN-02 | done | `907a59fd` | Documents serialized by js-yaml and parse-checked in production, not only in tests ([ADR-0013](./adr/0013-yaml-emission-and-parse-back.md)). |
| GEN-03 | done | `959c5499`, `29ba5736` | Assumption stated in the artifact **and** as a Doctor finding ([ADR-0012](./adr/0012-build-output-directory-stays-an-assumption.md)). |
| GEN-04 | done | `c401a224` | DR-007 picks frozen vs resolving from lockfile presence; the Dockerfile's lockfile `COPY` is optional. |
| GEN-05 | done | `907a59fd` | GitLab `docker-build` image comes from the IR; dind derived from it; privileged-runner requirement stated. |
| GEN-06 | done | `907a59fd`, `3a57537f` | Note in the file header, then in the editor — the review's actual complaint was that it was not in the UI. |
| GEN-07 | done | `c38161c1` | Every line of a multi-line command indented into the block scalar. |
| **GEN-08** | done | `fc4f25f3` | **Not in the review** — see §5. |

### CI import

| ID | Status | Commit | Note |
|---|---|---|---|
| IMP-01 | done | `39f2ebe2`, `ad7f04fd` | Newlines preserved on import; executor runs the script under `set -e` ([ADR-0014](./adr/0014-imported-run-blocks-stay-scripts.md)). |
| IMP-02 | done | `ad7f04fd`, `907a59fd` | Per-step env objects, import and export sides. |
| IMP-03 | done | `ad7f04fd` | Install command wins over loose mentions; every inferred fact warns. |
| IMP-04 | done | `ad7f04fd` | Structural detection on the parsed document. |

### Product behaviour

| ID | Status | Commit | Note |
|---|---|---|---|
| UX-01a | done | `5a2b7982` | Editable unresolved prompts; `resolveProjectField` commits the value and drops the entry atomically. |
| UX-01b | done | `cc8e92c9` | DR-004 reads `volta.node`, `.nvmrc`, `.node-version` ([ADR-0011](./adr/0011-runtime-version-evidence-order.md)). |
| UX-02 | done | `eb8efade` | Gate delegates to `findUnrunnableReason`. |
| UX-03 | done | `06d334f5` | "Download all" as a zip with paths intact. |
| UX-04 | done | `bcd8e7ec` | Port fields hold text, validate on blur. |
| UX-05 | done | `959c5499` | Finding ids key stage **and** step. |
| UX-06 | done | `959c5499` | New floating-tag rule catching the product's own `node:lts-alpine`. |
| UX-07 | done | `06d334f5` | Bind a folder without losing the imported document. |

### Frontend engineering

| ID | Status | Commit | Note |
|---|---|---|---|
| FE-01 | done | `3e1f3611` | One `useReducer` over `{past, present, future}`. |
| FE-02 | done | `3e1f3611` | The fact the branch needs is a ref; the dependency list is complete. |
| FE-03 | done | `bcd8e7ec` | `snapshotLoadedIR` freezes recursively. |
| FE-04 | done | `88068f1b` | `TextEncoder` + base64url. |
| FE-05 | **partial** | `890950d3` | `StageChain.tsx` and `useAutosave.ts` extracted; `useDetectFlow` deliberately not — see §6. |
| FE-06 | done | `3a57537f` | The CSS suite now asserts `getComputedStyle` against the real cascade. |

### Architecture

| ID | Status | Commit | Note |
|---|---|---|---|
| ARCH-01 | **deferred** | `edead6de` | [ADR-0018](./adr/0018-ir-stays-a-source-alias-for-now.md) records why and the full migration surface — see §6. |
| ARCH-02 | done | `bcd8e7ec` | Both packages on js-yaml 4.3.2, with a cross-boundary round-trip test. |
| ARCH-03 | done | `2bb1cefb` | Tailwind removed ([ADR-0017](./adr/0017-no-css-framework.md)). |
| ARCH-04 | done | `c28b6c7b` | ESLint, `lint` script, CI step; `pnpm check` is typecheck + lint + build + test. |
| ARCH-05 | done | `88068f1b` | Autosave keyed by workspace-relative realpath. |
| ARCH-06 | done | `a2b37f40` | Working tree clean — with a correction on the record, §7. |

### Spec-driven development

| ID | Status | Commit | Note |
|---|---|---|---|
| SDD-01 | done | `8806d591` | Retroactive `CI-EXPORT`, `CI-IMPORT`, `ADVISOR`, `STATE` specs, labelled as retroactive. |
| SDD-02 | done | `dc3f0c8b` | `EDITOR-UI-FR-013` and `EDITOR-AC-022` struck through, replaced by FR-020 / AC-043; the table corrected. |
| SDD-03 | done | `2f256d4a` | 17 EXEC rows added; IR-AC-011 reconciled; five specs advanced to *Implemented*. |
| SDD-04 | done | `8806d591`, `29ba5736`, and others | ADRs 0011–0018 — see §4. |
| SDD-05 | done | `8da919a3` | `ALL_RULES` and the catalogue check each other. |

### Testing

| ID | Status | Commit | Note |
|---|---|---|---|
| TEST-01 | done | `547a4f88` | Two fixtures unlike the other eleven, exercised through the whole flow. |
| TEST-02 | done | `8ad4a1ae`, `907a59fd` | Adversarial inputs for generators and importers. |
| TEST-03 | done | `907a59fd` | Every exported document is re-parsed — in production, not only in tests. |
| TEST-04 | done | `3a57537f` | HTTP contracts for `/api/advise`, `/api/projects`, `/api/directories`, the execute family, and the error envelope. |
| TEST-05 | done | `3a57537f` | Docker-unavailable degradation, end to end. |

**Nothing was discarded as wrong.** The review's findings all reproduced.
Two were narrower than stated and are noted as such: GEN-06's comment *was*
already in the generated file (the missing half was the UI), and FE-06's
target suite was a deliberate regression guard for a real incident, not an
arbitrary string lock — its stated reason for avoiding `getComputedStyle`
was simply wrong, which is what made the fix possible.

---

## 3. Verification

```
pnpm check   # typecheck → lint → build → test
  backend   528 tests, 41 suites   (baseline 242)
  frontend  130 tests, 15 files    (baseline  48)
  lint      0 errors, 0 warnings (--max-warnings 0, both packages)
  exit 0
```

The Docker-backed executor suite runs in this total: it really builds
images and runs containers, and it now also runs the SEC-05 visibility
probe before every execution.

---

## 4. Decisions taken without asking, and their ADRs

The brief said to choose the most defensible option and record it. Eight
ADRs were written; each states the alternative it rejected and why.

| ADR | Decision | The judgement call |
|---|---|---|
| [0011](./adr/0011-runtime-version-evidence-order.md) | Runtime-version evidence order | `engines.node` stays **first**, ahead of `.nvmrc`/Volta pins. A declared range is a published contract; a pin describes whichever machine was last configured. Keeping it first also makes the change purely additive. nvm aliases (`lts/hydrogen`) resolve to *no evidence* rather than an unpullable `node:lts/hydrogen-alpine`. |
| [0012](./adr/0012-build-output-directory-stays-an-assumption.md) | `dist/` stays a declared assumption | The review offered "detect it into the IR **or** state it loudly". Chose the second: a `buildOutputDir` the detector could only fill from a guess *looks* authoritative in a way a comment saying "this is a guess" does not. |
| [0013](./adr/0013-yaml-emission-and-parse-back.md) | Serialize YAML, then parse it back | The parse-back runs **in production**, not only in tests. The bug class it catches is one where the generator is confident and wrong; the cost is one parse of a few kilobytes. |
| [0014](./adr/0014-imported-run-blocks-stay-scripts.md) | An imported `run:` block stays a script | Rejected the review's first suggestion (one IR step per line): it is wrong for the same inputs, because a loop, a heredoc and a continuation all span lines. Preserving the text avoids the question. `set -e` restores the abort-on-failure that ` && ` was providing. |
| [0015](./adr/0015-advisor-scoring-model.md) | The Doctor's weights and bands | Kept 25/10/3 and 90/70/50, and explained them as "how many findings of this kind before the grade drops below A" — one critical, two warnings, four infos. |
| [0016](./adr/0016-local-state-persistence-and-share-links.md) | `~/.pipe-editor`, and the share-link format | The fragment (never a query string) is the security property that matters: the payload is a shell script and must not reach an access log. Signing was considered and rejected as false comfort — with no identity system it would invite skipping the review that is the actual defence. |
| [0017](./adr/0017-no-css-framework.md) | Tailwind removed, not adopted | Adoption means rewriting 3,322 lines of working, already-tokenised CSS to reach the same visual result. Leaving it installed was rejected explicitly: an unused dependency is not optionality, it is a claim about the project that is not true. |
| [0018](./adr/0018-ir-stays-a-source-alias-for-now.md) | ARCH-01 deferred | See §6. |

Two smaller calls without their own ADR, recorded in commit messages:
`majorFromVersionText`/`resolveProjectField` live in `@modules/ir` rather
than in the detector or the editor, because they describe **IR field value
shapes** and both sides need one implementation; and the GitLab cache moved
from a YAML anchor to a `.workspace-cache` hidden job with `extends`,
because js-yaml can only emit anchors with generated names.

---

## 5. What the review did not find

Five things surfaced while working, all now fixed or recorded.

**1. Two fixture goldens disagreed with their own manifests.**
`node-npm-nest-basic/expected-ir.json` declared `packageManager: npm` and
carried `corepack enable && pnpm install --frozen-lockfile`;
`node-yarn-nest-basic` did the same. Both were copy-pasted from the pnpm
fixture and never updated. The Dockerfile generator branches on
`packageManager.name` and ignores the step's text, so its goldens passed and
nothing noticed — but **CI export and the executor emit `step.run`
verbatim**, so those goldens described pipelines that would run pnpm in an
npm project. Fixed, with `T-FLOW-003` locking every golden to its declared
package manager. (`547a4f88`)

**2. The CI exporters did not guard themselves (GEN-08).**
`findUnrunnableReason` is documented as the single-source runnability probe,
and the Dockerfile generator calls it. Neither CI generator did — the check
lived only in the controller. A direct module caller handing an unresolved
IR to `generateGithubActions` got a plausible-looking workflow built on the
`node:lts-alpine` fallback: a floating base tag standing in for a version
the document explicitly records as unknown, with no error and no comment.
Two of three generators refusing was an asymmetry, not a policy. (`fc4f25f3`)

**3. The rules catalogue had already drifted.** The SDD-05 test found it on
its first run: DR-007's documented `Reads` row still said `package.json`
only, after the GEN-04 change taught the rule to consult the three
lockfiles. That is the test doing exactly the job it was added for, in the
same session. (`8da919a3`)

**4. `IR-AC-011` was a stale ◑, not a real gap.** It asserts a disabled
stage is round-tripped by the editor, skipped by the executor and omitted
from both generated artifacts; only the first was traced, and the other two
halves had been covered since EXEC and DOCKER landed. Reconciled rather
than left as an open item. (`2f256d4a`)

**5. `editor.css.spec.ts` avoided `getComputedStyle` for a reason that is
not true.** Its header stated that jsdom "does not parse complex
backgrounds well enough to assert visual outcomes". jsdom applies an
injected stylesheet and resolves class selectors, descendant selectors,
widths and backgrounds perfectly well. The suite is now written against the
cascade. (`3a57537f`)

---

## 6. What is not finished

**ARCH-01 — `packages/ir` is deferred.** The brief allowed this one item to
wait, and it is the right call for a reason the review does not mention:
**this repository has no pnpm workspace.** `backend/` and `frontend/` are
two independent pnpm projects with two lockfiles, driven by root scripts
that `cd` into each. An internal package consumed by both means creating
that workspace first, which touches `pnpm-workspace.yaml`, both lockfiles,
37 backend imports, the Vite alias, the frontend `tsconfig` paths, both
Dockerfiles, the CI install steps and the backend's jest `rootDir`.
Landing a build-system change on top of this session's diff, with CI as the
only thing that could prove it worked, risks a repository that installs on
one machine and not another. [ADR-0018](./adr/0018-ir-stays-a-source-alias-for-now.md)
tabulates the full surface so the next session starts from analysis, and
records that the guarantee ARCH-01 protects is intact and was
*strengthened* here — UX-02 moved the runnability gate onto the shared
symbol, and `project-fields.ts` exists precisely so the detector and the
editor share one rule.

**FE-05 — `useDetectFlow` was not extracted.** `StageChain.tsx` and
`useAutosave.ts` are out, and `Editor.tsx` is down from 1,638 to 1,373
lines. `onDetect` touches twelve setters — path, loading, error, loaded IR,
history, warnings, detected path, provenance, imported-from, workspace
plan, save state, restore candidate. A hook with a twelve-field return
moves the problem rather than solving it; the real fix is consolidating
that state into a reducer, which is a larger change than a `Low`-severity
finding warrants. Left as it is, deliberately, rather than done badly.

**Two smaller notes**, neither a review finding:

- The Doctor's `mega-step` rule counts `&&` occurrences, so it does not see
  a newline-separated multi-line script. Recorded in
  [ADR-0014](./adr/0014-imported-run-blocks-stay-scripts.md) as a
  consequence worth closing if multi-line steps become common.
- A multi-line **build** command still reaches the Dockerfile as a single
  `RUN` joined with ` && `, which is the IMP-01 hazard in the one place
  where preserving newlines is genuinely awkward (a Dockerfile `RUN` has no
  portable multi-line form without BuildKit heredocs). Steps are emitted
  one per line everywhere else.

---

## 7. Corrections on the record

**The first commit swept in 39,875 deletions that were not its subject.**
`backend/dist/**` and `backend/.env` were already staged in the index when
the session began. A `git commit` takes the whole index, not only what was
just added, and I did not check the index before committing — so those
deletions landed in `eb8efade`, whose subject is the editor's runnability
gate. The hygiene outcome is correct (`backend/dist` and `backend/.env` are
untracked, both gitignored, `.env` still on disk where it belongs) but the
attribution is wrong. Recorded rather than rewritten, since rewriting
published history to tidy a commit message is worse than the mistake.

**One commit grouped four findings that could have been three.**
`ad7f04fd` carries IMP-01 through IMP-04 because they are interleaved in
the same four files; splitting them would have meant rewriting the same
functions four times. The message names all four and explains each
separately. Several other commits carry two or three findings for the same
reason, always stated in the subject.

**A test I added made another test flaky.** `wire-contracts.spec.ts` added
enough parallel load that `host-guard.spec.ts` — which pointed the
workspace root at the entire repository, so `GET /api/projects` walked
thousands of directories — began exceeding Jest's 5s timeout. Fixed at the
cause: a test about the host guard now uses a purpose-built fixture
workspace. It passed in isolation the whole time, which is exactly the kind
of flake that reaches CI and not the developer.

---

## 8. Tests added

23 new test files, 368 new tests.

| Area | Files | Covers |
|---|---|---|
| IR | `project-fields.spec.ts`, `security.spec.ts` | Atomic field resolution; image/env/depth validation |
| Detector | `dr-004-runtime-version.spec.ts`, `catalogue.spec.ts` | Evidence order and alias rejection; the catalogue checking itself |
| Generators | `docker-naming.spec.ts`, `ci-export/adversarial.spec.ts` | Tag slugs and comment sanitising; hostile names, branches, env, multi-line commands, parse-back |
| Importers | `ci-import/adversarial.spec.ts` | Script preservation, per-step env, install-command inference, structural sniffing |
| Advisor | `advisor/adversarial.spec.ts` | Unique ids, floating tags, the build-output assumption, actionable findings |
| Security | `host-guard.spec.ts`, `bounded-read.spec.ts`, `workspace-visibility.spec.ts` | Rebinding over real HTTP; size bounds; the daemon-visibility probe |
| API | `wire-contracts.spec.ts`, `state-key.spec.ts` | HTTP shapes and the error envelope; one project one save |
| Flow | `integration/unresolved-flow.spec.ts`, `adversarial-generation.spec.ts` | Detect → refuse → resolve → generate → export; scoped names and injection |
| Editor | `working-ir.spec.ts`, `editable-surface.spec.ts`, `useUndoableIR.spec.tsx`, `Editor.resolve.spec.tsx`, `Editor.provenance.spec.tsx` | The shared gate; chain invariants under any edit sequence; StrictMode undo; in-UI resolution; provenance and the review gate |
| Frontend infra | `share-link.spec.ts`, `yaml-parity.spec.ts`, `download-zip.spec.ts` | UTF-8 links; one YAML version across the wire; the zip read back |

Two fixtures were added because every existing one declared `engines.node`
and most declared `packageManager` — the uniformity that hid UX-01, UX-02
and GEN-04 behind 290 green tests: `node-npm-no-engines` (declares its
version nowhere) and `node-pm-field-no-lockfile` (declares pnpm, has no
lockfile).

---

## 9. Dependencies added

Three, each justified per the brief's rule.

| Package | Where | Why |
|---|---|---|
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, `eslint-plugin-react-hooks` | both, dev | ARCH-04 asked for a linter. There was none. |
| `jszip` | frontend | UX-03 asked for a zip. A zip container has a CRC per entry and a central directory whose offsets must be right, and the deliverable is a file the user extracts — a hand-rolled writer that is subtly wrong produces an archive that opens in one tool and not another. The test reads the archive back rather than inspecting bytes. |

`js-yaml` was **aligned**, not added: frontend 5.0.0 → 4.3.2 to match the
backend, which owns the contract. `tailwindcss`, `postcss` and
`autoprefixer` were **removed**.

A note for whoever runs `pnpm install` next: `node_modules` in both
packages had been linked from a pnpm 10 store while the repo pins
pnpm 9.15.0, so any `pnpm add` refused with `ERR_PNPM_UNEXPECTED_STORE`.
Both packages were reinstalled from their existing lockfiles before
anything was added.

---

## 10. Where the documentation moved

- **Specs:** 7 → 11. Four retroactive (`CI-EXPORT`, `CI-IMPORT`, `ADVISOR`,
  `STATE`), each labelled as such with a Provenance section. The `GHA` slot
  is retired rather than left "☐ Not started".
- **Statuses:** `IR`, `DOCKER`, `DET`, `EXEC`, `EDITOR` advanced *Accepted →
  Implemented*, after the traceability table was completed rather than
  before.
- **ADRs:** 10 → 18.
- **Traceability:** 102 criterion rows → 192 (191 ✅, 1 ⊘ superseded). No `◑` or `☐` rows remain. The
  legend now states explicitly that a ✅ means *the test asserts what the
  criterion says*, and that a disagreement is fixed by amending the
  criterion — never by adjusting the tick.

That last line is the whole point of the exercise. SDD-02 was a passing
test certifying a false statement, which is worse than an untested
criterion because the gap is at least visible. The four retroactive specs
are worth having for the same reason: writing them **found eleven defects**,
because stating a requirement forces the question "does the code do this?"
The specs are not documentation of the code. They are a second opinion
about it.
