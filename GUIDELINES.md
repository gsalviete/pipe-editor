# Guidelines

> Precedence: module GUIDELINES.md > codebase GUIDELINES.md > defaults. Guidelines tighten the pipeline's guardrails — they can never loosen them.

These are the codebase-wide rules for `pipe-editor`. `CLAUDE.md` holds the operating rules (spec-first workflow, stable IDs, non-goals) and `docs/` is the source of truth. This file covers how the code itself is written.

## Code style

- Use kebab-case for file names (`bounded-read.ts`, `working-ir.ts`). The exception is React component files, which use PascalCase (`StageChain.tsx`). Hooks use camelCase `useX.ts`.
- Every backend module under `backend/src/modules/<name>/` exposes its public surface through `index.ts`. Keep types in `types.ts` and thrown errors in `errors.ts`.
- Comments explain *why*, not *what*. When a comment exists because of a spec clause, acceptance criterion, ADR, detection rule or review finding, cite its ID (`IR-AC-020`, `ADR-0006`, `DR-004`, `FE-02`).
  ```ts
  // ADR-0006 — omit on uncertainty: a guessed runtime version is worse than none.
  ```
- Name things with the glossary terms from `docs/product/03-domain-glossary.md` (`PipelineIR`, `Stage`, `Step`, `Unresolved`, …). Don't use synonyms (`job`, `task`, `phase`) for IR concepts. Provider terms appear only inside the provider's generator or importer.
- Don't add a formatter or reformat existing code. The style is hand-written and consistent, and ESLint checks correctness only. Match the surrounding file.
- `pnpm lint` passes with `--max-warnings 0`, in both packages.

## Architecture

- `ir` depends on no other module. It is the single source of truth (ADR-0003) and stays provider-neutral: no GitHub Actions, GitLab or other provider field or semantics appears in it.
- Core modules (`detector`, `dockerfile-generator`, `ci-export`, `ci-import`, `advisor`, `executor`, `workspace-bundle`, `state-store`) may import `ir` and shared helpers (`docker-naming`). They never import `editor-api`.
- Only `editor-api` touches NestJS (`@nestjs/*`, controllers, `HttpException`). Core modules are plain TypeScript that you can test without Nest.
- Import other modules only through their `index.ts`, never through a deep path (`'../ir'`, not `'../ir/validate'`).
- Provider specifics live only in their generator or importer file (`ci-export/github-actions.ts`, `ci-export/gitlab-ci.ts`, `ci-import/*`).
- On the frontend, every backend call goes through `frontend/src/editor/api.ts`. Components never call `fetch` directly.
- **Known violation:** `detector/manifests.ts` imports `readManifestBounded` from `editor-api/bounded-read`. Move `bounded-read` to a neutral module that `detector` and `editor-api` can both import. Don't add further imports from core modules into `editor-api`.

## Best practices

Always:
- Have an Accepted spec before writing implementation code (`CLAUDE.md`). If there isn't one, draft it and stop.
- Name tests after the criteria they verify: `T-<COMP>-NNN (<COMP>-AC-NNN) — <behavior>`, and add a row to the traceability table in `docs/testing/test-strategy.md`.
  ```ts
  it('T-IR-001 (IR-AC-001) — rejects a document missing `version`', …)
  ```
- Keep generated artifacts (Dockerfile, Compose, GitHub Actions and GitLab YAML) portable, commented and usable outside this tool.
- Keep the IR provider-neutral (ADR-0003).

Never:
- Add `// eslint-disable…` comments. Fix the cause instead.
- Use `any` outside `*.spec.ts(x)`. Use `unknown` and narrow it.
- Claim byte-for-byte parity with a remote runner. Local validation runs *the same pipeline steps* in containers (ADR-0001).
- Build anything on the non-goals list (`docs/product/05-local-workspace-scope.md`): OAuth or remote repo connectors, multi-language detection, cloud deploy, image publishing, `act`-style runtime simulation, auth, multi-user, billing.

## Logging

- Use only `console.warn` and `console.error`. ESLint enforces this, and no logger library is used.
- Log failures and degraded paths, never the happy path.
- Never log the contents of user files, environment or secret values, or absolute host paths outside the project folder.
- Stage output from executed pipelines goes into `RunResult` for the user, never into the process log.

## Error handling

- Return expected failures as data, not exceptions. IR validation returns `ValidationError[]`, and each entry carries its `acId` and `path`. A failed stage is `StageResult.status === 'failed'`, not a throw.
- Throw only for programmer or infrastructure faults, using a module-specific `Error` subclass declared in that module's `errors.ts` with `name` set. Don't use a bare `throw new Error(...)` in `src`.
  ```ts
  export class DockerUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DockerUnavailableError';
    }
  }
  ```
- In `editor-api`, every 4xx/5xx response uses the `{ error: { code, message, detail? } }` envelope built by `httpError()` in `http-errors.ts`. The `code` comes from the closed `ErrorCode` union, and a new code is added to the governing spec first.
- Never let an unmapped exception reach the client as a raw 500 with a stack trace or file contents.

## Fail-safe vs fail-fast

- **Fail fast:** reject invalid IR before generation, export or execution; reject requests that fail path containment (ADR-0008) or the host guard; reject oversized reads; return `DOCKER_UNAVAILABLE` when Docker can't be reached. Refuse clearly, never partially.
- **Fail safe:** when detection is uncertain it omits the field and records it as unresolved (ADR-0006). It never guesses a default. A failed stage stops the chain and is reported in `RunResult`.
- Give every Docker or child-process call a timeout. No `spawn` or `exec` call may wait forever.
- Bound every file read by size, and read manifests through the bounded reader.

## Dependencies

- Reach for Node built-ins (`fs`, `path`, `child_process`, `crypto`) and the existing dependencies first: NestJS, `js-yaml`, `jszip`, React.
- A new runtime dependency must be justified in the change summary, with name and version. An architectural dependency also needs an ADR.
- Forbidden: CSS frameworks or utility-CSS (ADR-0017), UI component kits, global state libraries (Redux, Zustand, MobX), `axios` (use `fetch`), `lodash`, `moment` and date libraries, `dockerode` (Docker is driven through the CLI or socket in `executor`).
- A library used by both packages (for example `js-yaml`) is pinned to the same version in `backend` and `frontend`.

## Security & sensitive data

Sensitive data in this domain: the user's source tree, environment and secret values in their manifests and CI files, and anything on the host outside `PIPE_EDITOR_WORKSPACE_ROOT`.

- Resolve every client-supplied path with realpath and check that it is contained in `PIPE_EDITOR_WORKSPACE_ROOT` before any read. Symlinks don't get around this.
- IR strings never reach a shell unescaped. Pass them as argv arrays, never interpolated into a command string. Text that goes into a generated file comment passes through `sanitizeForComment`. IR value constraints (IR-AC-020/021/022) are enforced by `validate`, not by callers.
- Never run a user's commands on the host. Execution happens only inside containers (ADR-0001, ADR-0009).
- Never return or log file contents beyond what a spec's response shape defines.
- The server binds to loopback and is protected by the host guard. Don't loosen either.

## Commit conventions

Agents never commit, push or open PRs (`docs/agents/guardrails.md`). They never run the commands below themselves. The owner reviews the working tree and commits. Every handoff ends with a **commit plan**, not a single suggested message.

Commit messages use the project's format:

```
<type>(<ID>): <imperative summary>; also <OTHER-ID>, <OTHER-ID>
```

`type` is one of `feat`, `fix`, `docs`, `test`, `refactor` or `chore`. `ID` is the governing card, finding or spec ID, for example `fix(FE-01): move undo history into a reducer; also FE-02`.

Building the plan:
- Split changes by concern: one commit per logical change. One ADR is one commit, one spec amendment is one commit, and a fix goes in the same commit as its tests.
- Order commits so each one leaves the repo consistent: spec before code, code together with its tests.
- Every file in `git status` appears in exactly one commit. If a file belongs to no commit, list it explicitly as leftover and say why.
- Stage files by explicit path. Never use `git add -A`, `git add .` or globs.

For each commit, output a ready-to-run block:

```
git add <explicit file paths>
git commit -m "<type>(<ID>): <summary>"
git push
```

## Domain criticality

Use this severity scale for triage, chaos findings and attention points:

- **Critical:** escaping the workspace root (reading or writing host files outside it); running user commands on the host instead of in a container; shell or YAML injection through IR fields.
- **High:** generated artifacts that are wrong or not portable (Dockerfile, Compose or GHA/GitLab YAML that fails outside the tool or silently changes meaning); IR round-trip loss; provider-specific data leaking into the IR.
- **Medium:** the editor losing the user's work (autosave, undo history, share links).
- **Low:** UI polish and cosmetic issues.

## Frontend

Structure and state:
- Keep state in component hooks and reducers (`useUndoableIR`, `useAutosave`). Don't use global stores. When a reducer handles undoable IR edits, it goes through the existing undo history.
- Keep components focused. When a component grows past about 400 lines, extract sub-components or hooks (as in FE-05) before adding more. Don't grow `Editor.tsx`. Extract from it.
- There's no router. The only URL state is the share link (ADR-0016), encoded through `share-link.ts`.

Styling:
- Use plain CSS files only (ADR-0017). Don't use inline `style={{…}}` except for values computed at runtime.
- Colors, spacing, radii and shadows come from CSS custom properties defined in `styles/product.css`. Don't add raw hex or rgb values outside the token definitions.
- Every interactive element has a visible `:focus-visible` style.
- Animations and transitions respect `prefers-reduced-motion: reduce`.
- Layouts work down to 560px wide, the smallest existing breakpoint, with no horizontal page scroll.

Accessibility:
- Interactive elements are native `<button>`, `<a>`, `<input>`, `<select>` or `<textarea>`. Never use a clickable `<div>` or `<span>`.
- Every form control has an associated `<label>` or an `aria-label`. Icon-only controls always have an `aria-label`.
- Tabs, toggles and dialogs use the correct ARIA roles and states (`role="tab"`, `aria-selected`, `aria-pressed`, `aria-expanded`) and are keyboard-operable.
- Text and UI contrast meets WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).
- Status that changes asynchronously (run progress, detection result, save state) is announced with `aria-live="polite"`.

UX states:
- Every async surface (detect, generate, execute, import, save) has an explicit loading, error and empty state. Error states show the envelope's `message` and a way to recover, never a blank panel.
- Destructive or irreversible actions (discarding edits, overwriting a bound folder) need a confirmation step inside the UI, not `window.confirm`.

Text and tests:
- UI text is English only, with no i18n layer. Use the glossary terms in labels.
- Tests query by role or label (`getByRole`, `getByLabelText`). Use `getByTestId` only when no accessible query exists.
