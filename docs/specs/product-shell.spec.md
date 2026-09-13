# Product Shell & Experience Hardening Specification

| Field | Value |
|---|---|
| Component | `PRODUCT` |
| Status | Implemented |
| Accepted on | 2026-09-11 |
| Linked brief | [`04-productization-brief.md`](../product/04-productization-brief.md) |

## Objective

Turn the existing feature-complete prototype into a coherent, trustworthy local
developer product without changing the provider-neutral Pipeline IR contract.

## Functional requirements

- **PRODUCT-FR-001 — Clear entry point.** The initial screen MUST communicate
  the product promise and make project selection the primary action.
- **PRODUCT-FR-002 — Workspace layout.** Once a pipeline is loaded, the editor
  MUST visually separate pipeline construction from diagnosis, artifacts and
  execution while preserving access to every existing capability.
- **PRODUCT-FR-003 — System feedback.** Loading, success, error, disabled,
  autosave and stale-artifact states MUST remain visible and understandable.
- **PRODUCT-FR-004 — Responsive use.** The shell MUST work as one column on a
  narrow viewport and as an editor plus supporting rail on wider viewports.
- **PRODUCT-FR-005 — Keyboard and focus.** Interactive controls MUST expose a
  visible focus state and retain the existing undo/redo and Enter-to-detect
  shortcuts.
- **PRODUCT-FR-006 — Honest local boundary.** The interface MUST describe local
  execution as running the same pipeline commands in containers, not as an exact
  simulation of a hosted runner.
- **PRODUCT-FR-007 — Reliable local integration.** The Vite proxy MUST target
  the backend's actual loopback bind address without depending on ambiguous
  `localhost` resolution.
- **PRODUCT-FR-008 — Contained discovery.** Project discovery MUST NOT follow
  directory symlinks, escape the configured workspace, or revisit the same
  directory through an alias.
- **PRODUCT-FR-009 — Bounded output.** Container stdout/stderr, replayable SSE
  events and browser-side live logs MUST have explicit memory bounds. Truncation
  MUST be visible to the user rather than silently changing the output.
- **PRODUCT-FR-010 — Operable distribution.** The API MUST expose a lightweight
  health endpoint. Production containers MUST declare health checks, and the web
  server MUST send baseline security headers without breaking the local app.
- **PRODUCT-FR-011 — Self-contained shell.** The production interface MUST NOT
  depend on a remote font or visual asset to render correctly.
- **PRODUCT-FR-012 — Bounded imports.** Pasted and workspace-backed CI files
  MUST share the documented 512 KiB byte limit, including non-ASCII content.

## Non-functional requirements

- **PRODUCT-NFR-001.** Existing stable DOM hooks and behavior tests remain valid.
- **PRODUCT-NFR-002.** The production frontend and backend builds complete with
  no TypeScript errors.
- **PRODUCT-NFR-003.** No new remote runtime dependency is required for the
  product shell; typography and core visuals work offline.
- **PRODUCT-NFR-004.** Color is not the only signal for important states.
- **PRODUCT-NFR-005.** Motion respects `prefers-reduced-motion`.
- **PRODUCT-NFR-006.** A command that prints indefinitely MUST not grow backend
  or browser memory without bound while cancellation remains available.

## Acceptance criteria

| Criterion | Assertion |
|---|---|
| **PRODUCT-AC-001** | A first-time user can identify what the product does, choose a discovered project and import a pipeline from the initial screen. |
| **PRODUCT-AC-002** | A loaded pipeline renders a primary editor canvas and a supporting control rail at desktop width; the same content stacks at mobile width. |
| **PRODUCT-AC-003** | Focus-visible styling is present for buttons, inputs, tabs and editable controls. |
| **PRODUCT-AC-004** | The local development proxy reaches a backend bound to `127.0.0.1`. |
| **PRODUCT-AC-005** | Backend and frontend production builds pass after the shell changes. |
| **PRODUCT-AC-006** | Existing frontend behavior tests remain green or are amended only when the accepted product contract intentionally changes. |
| **PRODUCT-AC-007** | A symlink inside the workspace pointing to a project outside it is absent from discovery results. |
| **PRODUCT-AC-008** | Small command output remains byte-identical; oversized output is bounded and carries a truncation marker. |
| **PRODUCT-AC-009** | `GET /api/health` returns a small non-sensitive readiness document without scanning the workspace or probing Docker. |
| **PRODUCT-AC-010** | The built frontend contains its own favicon and no Google Fonts request. |
| **PRODUCT-AC-011** | UTF-8 pasted content and CI files read from a project are rejected when their encoded size exceeds 512 KiB. |

## Notes

This specification is Accepted from its first revision because it records the
product owner's explicit 2026-09-11 direction to redesign and harden the whole
prototype with broad implementation freedom. It does not supersede component
specs; it governs the cross-cutting product experience around them.

Implementation was verified on 2026-09-11 through the specification-linked
backend/frontend suites, production builds, Docker image builds and visual
inspection at desktop and 390 × 844 mobile viewports.
