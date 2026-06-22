// T-EDITOR-007 / EDITOR-AC-007 — the listener is bound to 127.0.0.1
// only. Verified by inspecting the resolved listener address rather
// than attempting an LAN connection (which would be environment-
// dependent and flaky on CI). Spec: visual-editor.spec.md "Security
// model" / EDITOR-API-NFR-001.

import type { AddressInfo } from 'net';
import { resolve } from 'path';
import {
  PIPE_EDITOR_WORKSPACE_ROOT_ENV,
} from './workspace-root';

describe('Backend listener bind (T-EDITOR-007 / EDITOR-AC-007)', () => {
  const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

  let savedEnv: string | undefined;

  beforeAll(() => {
    savedEnv = process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
  });

  afterAll(() => {
    if (savedEnv === undefined) {
      delete process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    } else {
      process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = savedEnv;
    }
  });

  it('binds 127.0.0.1 only — never 0.0.0.0', async () => {
    // Lazy-load so the env var is in place before the module factory
    // resolves and so the bootstrap guard in main.ts does not run.
    const { createApp, BIND_ADDRESS } = await import('../../main');
    expect(BIND_ADDRESS).toBe('127.0.0.1');

    const app = await createApp();
    try {
      await app.listen(0, BIND_ADDRESS);
      const server = app.getHttpServer() as import('http').Server;
      const addr = server.address() as AddressInfo;
      expect(addr).not.toBeNull();
      expect(addr.address).toBe('127.0.0.1');
      // family is 'IPv4' on Node 18+ for 127.0.0.1.
      expect(addr.family).toBe('IPv4');
    } finally {
      await app.close();
    }
  });
});
