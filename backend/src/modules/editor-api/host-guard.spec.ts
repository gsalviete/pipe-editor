// T-SEC-001 (SEC-01) / T-SEC-002 (SEC-08) — the DNS-rebinding defence.
//
// CORS is not a defence against DNS rebinding: a page on evil.test whose
// DNS flips to 127.0.0.1 becomes same-origin with this API, so CORS never
// applies. What such a page cannot forge is the Host header.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  ALLOWED_HOSTS_ENV,
  configuredHosts,
  isAllowedHost,
} from './host-guard';
import { PIPE_EDITOR_WORKSPACE_ROOT_ENV } from './workspace-root';

describe('T-SEC-001 (SEC-01) — isAllowedHost', () => {
  const none = new Set<string>();

  it.each([
    '127.0.0.1',
    '127.0.0.1:3000',
    'localhost',
    'localhost:5173',
    'localhost:8080',
    'LOCALHOST:3000',
    '[::1]',
    '[::1]:3000',
    '0.0.0.0:3000',
  ])('accepts %p', (host) => {
    expect(isAllowedHost(host, none)).toBe(true);
  });

  it.each([
    'evil.test',
    'evil.test:3000',
    'localhost.evil.test',
    'notlocalhost',
    '127.0.0.1.evil.test',
    '10.0.0.5:3000',
    'example.com',
    '',
    undefined,
  ])('rejects %p', (host) => {
    expect(isAllowedHost(host, none)).toBe(false);
  });

  it('accepts a host named in the environment, ignoring its port', () => {
    const extra = configuredHosts({ [ALLOWED_HOSTS_ENV]: 'backend, editor.lan:8080' });
    expect(isAllowedHost('backend:3000', extra)).toBe(true);
    expect(isAllowedHost('editor.lan', extra)).toBe(true);
    expect(isAllowedHost('other.lan', extra)).toBe(false);
  });

  it('treats an empty environment value as no extra hosts', () => {
    expect(configuredHosts({ [ALLOWED_HOSTS_ENV]: '' }).size).toBe(0);
    expect(configuredHosts({}).size).toBe(0);
  });
});

describe('T-SEC-001 (SEC-01) — over real HTTP', () => {
  let app: INestApplication;
  let root: string;
  let savedRoot: string | undefined;

  beforeAll(async () => {
    // A small purpose-built workspace, NOT the repository root. This suite
    // is about the host guard; pointing it at the whole repo made
    // `GET /api/projects` walk thousands of directories, which is fine
    // alone and times out when the rest of the suite is competing for the
    // machine. The guard runs before any route, so one fixture is enough.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pipe-editor-hostguard-')));
    mkdirSync(join(root, 'test'), { recursive: true });
    mkdirSync(join(root, 'test', 'fixtures', 'node-pnpm-nest-basic'), { recursive: true });
    writeFileSync(
      join(root, 'test', 'fixtures', 'node-pnpm-nest-basic', 'package.json'),
      JSON.stringify({
        name: 'node-pnpm-nest-basic',
        engines: { node: '20' },
        packageManager: 'pnpm@9.0.0',
        scripts: { build: 'nest build', test: 'jest' },
      }),
    );
    writeFileSync(
      join(root, 'test', 'fixtures', 'node-pnpm-nest-basic', 'pnpm-lock.yaml'),
      'lockfileVersion: 9\n',
    );

    savedRoot = process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = root;
    const { createApp } = await import('../../main');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
    if (savedRoot === undefined) delete process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV];
    else process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV] = savedRoot;
  });

  it('answers a loopback-addressed request', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  // The rebinding case: same request, attacker's hostname.
  it('refuses a request addressed to another hostname', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Host', 'evil.test')
      .expect(403);
    expect(res.body.error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('refuses a rebound request to a route that reads the workspace', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/projects')
      .set('Host', 'evil.test')
      .expect(403);
    expect(res.body.error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('refuses a rebound attempt to start a run', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/execute')
      .set('Host', 'evil.test')
      .send({ projectPath: '.', ir: {} })
      .expect(403);
    expect(res.body.error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('refuses a cross-site state-changing request even from localhost', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/detect')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ projectPath: 'test/fixtures/node-pnpm-nest-basic' })
      .expect(403);
    expect(res.body.error.code).toBe('CROSS_SITE_REQUEST_BLOCKED');
  });

  it.each(['same-origin', 'same-site', 'none'])(
    'allows a state-changing request with Sec-Fetch-Site: %s',
    async (site) => {
      await request(app.getHttpServer())
        .post('/api/detect')
        .set('Sec-Fetch-Site', site)
        .send({ projectPath: 'test/fixtures/node-pnpm-nest-basic' })
        .expect(200);
    },
  );

  // A cross-site GET is not blocked by this rule — it is not state-changing,
  // and the Host check already covers the rebinding case that matters.
  it('allows a cross-site GET from an allowed host', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(200);
  });

  it('T-SEC-002 (SEC-08) — does not advertise credentialed CORS', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
