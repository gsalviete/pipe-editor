// SEC-01 — DNS-rebinding defence.
//
// The API binds loopback and sets a narrow CORS origin, and neither is a
// defence against DNS rebinding. A page on evil.test whose DNS record flips
// to 127.0.0.1 becomes *same-origin* with this API: CORS does not apply,
// and the page can read `GET /api/projects` and `GET /api/directories`
// (a map of the user's source tree), `POST /api/detect` (manifest
// contents), `POST /api/import/from-project` (file contents), and can
// start `POST /api/execute` runs.
//
// What that attack cannot forge is the `Host` header — the browser sends
// the hostname the page was loaded from, which is the attacker's domain,
// never `127.0.0.1` or `localhost`. Checking it is the standard defence and
// costs one comparison.
//
// The second half is `Sec-Fetch-Site`, which browsers set and scripts
// cannot override. A `cross-site` value on a state-changing route means a
// different site initiated the request; nothing legitimate does that here.
// The header is absent from non-browser clients (curl, the container health
// check, supertest), so only an explicit `cross-site` is rejected.

import type { NextFunction, Request, Response } from 'express';

/** Hosts that always denote "this machine", at any port. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

/** Methods that change state and therefore also get the Sec-Fetch-Site check. */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const ALLOWED_HOSTS_ENV = 'PIPE_EDITOR_ALLOWED_HOSTS';

/**
 * Additional hostnames to accept, comma-separated, from the environment.
 *
 * Needed when the editor is reached through a name that is not loopback —
 * the Compose stack's service name, or a host alias a user has set up.
 * Ports are ignored; entries are compared case-insensitively.
 */
export function configuredHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env[ALLOWED_HOSTS_ENV] ?? '')
      .split(',')
      .map((entry) => stripPort(entry.trim().toLowerCase()))
      .filter((entry) => entry !== ''),
  );
}

/**
 * Whether a `Host` header names this machine.
 *
 * A missing Host is rejected: HTTP/1.1 requires it, and an attacker's page
 * cannot omit it either, so nothing legitimate arrives without one.
 */
export function isAllowedHost(host: string | undefined, extra: Set<string>): boolean {
  if (host === undefined || host === '') return false;
  const bare = stripPort(host.trim().toLowerCase());
  if (bare === '') return false;
  return LOOPBACK_HOSTS.has(bare) || extra.has(bare);
}

function stripPort(host: string): string {
  // Bracketed IPv6 keeps its brackets; the port follows the closing one.
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(0, close + 1);
  }
  const colon = host.lastIndexOf(':');
  // A bare IPv6 address has several colons and no port.
  if (colon === -1 || host.indexOf(':') !== colon) return host;
  return host.slice(0, colon);
}

export interface HostGuardOptions {
  extraHosts?: Set<string>;
}

export function hostGuard(options: HostGuardOptions = {}) {
  const extra = options.extraHosts ?? configuredHosts();
  return function guard(req: Request, res: Response, next: NextFunction): void {
    if (!isAllowedHost(req.headers.host, extra)) {
      res.status(403).json({
        error: {
          code: 'HOST_NOT_ALLOWED',
          message:
            'This request did not come from the local editor. pipe-editor only answers requests ' +
            'addressed to localhost, which is what stops a web page on another domain from ' +
            'reaching your workspace through your browser.',
          detail: `Host header: ${String(req.headers.host ?? '(absent)')}`,
        },
      });
      return;
    }

    const fetchSite = req.headers['sec-fetch-site'];
    if (STATE_CHANGING.has(req.method) && fetchSite === 'cross-site') {
      res.status(403).json({
        error: {
          code: 'CROSS_SITE_REQUEST_BLOCKED',
          message:
            'A state-changing request arrived from another site. pipe-editor is a single-user ' +
            'local tool and never expects one.',
          detail: 'Sec-Fetch-Site: cross-site',
        },
      });
      return;
    }

    next();
  };
}
