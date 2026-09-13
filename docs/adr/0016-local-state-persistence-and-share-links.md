# ADR-0016: Where local state lives, and what a share link is

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-13 |
| Affected specs | `state.spec.md`, `visual-editor.spec.md` |

## Context

Two decisions were made in code with no record, both listed under
**SDD-04** in the adversarial review: persisting state in `~/.pipe-editor`
keyed by a hash of the workspace path, and the `#ir=<base64>` share-link
format. The second is security-relevant, which makes an unrecorded choice
worse than an unexplained one.

## Decision

### 1. State lives in `~/.pipe-editor`, namespaced by workspace realpath

Autosaved working IRs and run history are written under
`PIPE_EDITOR_DATA_DIR` (default `~/.pipe-editor`), in a subdirectory named
`sha1(workspaceRealpath).slice(0, 12)`.

**Not in the user's project**, because the product's central promise is
that it never writes there ([`02-mvp-scope.md`](../product/02-mvp-scope.md)).
A `.pipe-editor/` directory appearing in someone's repository — to be
gitignored, reviewed, explained to a teammate — would break that promise for
a convenience feature.

**Namespaced**, because one installation inspects many workspaces and their
state must not collide. The namespace is derived from the **realpath**, so
the same workspace reached through a symlink or a Docker display-root alias
lands in the same place. It is **hashed** because a path is not a filename:
it contains separators, may be long, and its case sensitivity varies by
filesystem. Twelve hex characters is 48 bits — ample when the population is
the handful of workspaces one person opens.

The hash is *not* a privacy measure and is not claimed as one; the paths are
plainly visible inside the files.

### 2. A share link is a document in the URL fragment

`#ir=<base64url(canonical JSON)>`.

**A document, not a reference**, because there is no server to hold a
reference. Every alternative — an id, a gist, a paste service — requires
either state this product does not have or an external service, and
[ADR-0002](./0002-local-folder-over-remote-repos.md) rules out network
dependencies for local-first flows.

**In the fragment, never a query parameter.** Fragments are not sent to
servers: the pipeline does not land in an access log, a referrer header, or
a proxy's cache. For a payload that is a shell script this is the whole
game, and it is the reason the format is worth an ADR at all.

**base64url with `TextEncoder`**, not `btoa(unescape(encodeURIComponent(…)))`.
The old pair works but `escape`/`unescape` have been deprecated for two
decades, and `TextEncoder` states the intent — UTF-8 bytes — instead of
achieving it by a chain of coincidences.

**And a share link is untrusted.** The format's convenience is exactly its
risk: a URL can be sent to someone who opens it without any deliberate act
of importing. The editor therefore never loads one on arrival — it decodes,
validates, and shows every command for review first (EDITOR-UI-FR-019). The
link format and that gate are one decision, which is why they are recorded
together.

## Alternatives considered

- **State inside the project (`.pipe-editor/`).** Rejected: breaks the
  read-only promise. Also wrong for run history, which is about a machine
  rather than a repository.
- **State in a single flat file keyed by path.** Simpler, and it makes
  "forget this workspace" impossible without rewriting everyone's entries.
- **Namespace by the raw path instead of a hash.** Readable, and it needs
  escaping rules for separators and lengths that vary by platform.
- **A share link that is a reference to stored state.** Rejected: requires
  a server, an identifier scheme, and a retention policy, for a feature
  whose value is that it works by copy-paste.
- **Compressing the payload.** A large pipeline makes a long URL. Rejected
  for now as unnecessary complexity — the documents are kilobytes — but it
  is the obvious next step if links start hitting URL length limits.
- **Signing the payload.** Considered and rejected as false comfort: with no
  identity system there is no key to trust, and a signature would invite the
  user to skip the review that is the actual defence.

## Consequences

- **Positive:** the user's repository stays clean; state survives restarts
  and is per-workspace; a share link works with no infrastructure and never
  reaches a server log.
- **Negative / accepted costs:** state is invisible to the user unless they
  look in `~/.pipe-editor`, and there is no UI to prune it. Long pipelines
  make long URLs. The hashed directory name is opaque when browsing by hand.
- **Neutral / to revisit:** a "forget this workspace" action and a
  compressed payload are both additive. Neither changes the shape of this
  decision.

## Links

- [ADR-0002](./0002-local-folder-over-remote-repos.md) — local-first, which
  rules out the server-side alternatives.
- [Local State & Discovery Spec](../specs/state.spec.md) — STATE-FR-001…016.
- [Visual Editor Spec](../specs/visual-editor.spec.md) — EDITOR-UI-FR-019,
  the review gate that makes the link format safe to offer.
- [Adversarial Review — SDD-04, SEC-02](../reports/adversarial-review.md)
