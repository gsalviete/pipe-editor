import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineIR } from '@modules/ir';
import type { WorkspaceBundle, WorkspacePlan } from './api';
import { WorkspaceStudio } from './WorkspaceStudio';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('WorkspaceStudio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('T-WORKSPACE-011 (WORKSPACE-AC-011) edits a service, chooses output modes, and previews every artifact', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('/api/workspace/generate');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify(bundle()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<WorkspaceStudio initialPlan={plan()} onBack={vi.fn()} />);

    expect(screen.getByText('Vite frontend')).toBeInTheDocument();
    expect(screen.getByText('apps/web')).toBeInTheDocument();
    expect(screen.getByText('Existing Compose files are protected')).toBeInTheDocument();
    expect(screen.getByText('apps/web/docker-compose.dev.yml')).toBeInTheDocument();

    const port = screen.getByLabelText('web host port');
    // UX-04: a port field holds raw text while focused and commits on blur,
    // so intermediate typing states never reach the plan.
    fireEvent.change(port, { target: { value: '4173' } });
    fireEvent.blur(port);
    const build = screen.getByLabelText('web build command 1');
    await user.clear(build);
    await user.type(build, 'npm run build:production');
    await user.click(screen.getByLabelText(/GitLab CI/));
    await user.click(screen.getByLabelText(/One per service/));
    await user.click(screen.getByRole('button', { name: 'Generate bundle' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      plan: WorkspacePlan;
      provider: string;
      composeMode: string;
    };
    expect(request.provider).toBe('gitlab-ci');
    expect(request.composeMode).toBe('per-service');
    expect(request.plan.services[0].hostPort).toBe(4173);
    expect(
      request.plan.services[0].ir.stages.find((stage) => stage.id === 'build')?.steps[0].run,
    ).toBe('npm run build:production');

    expect(await screen.findByText('3 files generated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apps\/web\/Dockerfile/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\.gitlab-ci\.yml/ }));
    expect(screen.getByText('stages: [verify, containerize]')).toBeInTheDocument();
    expect(screen.getByText('2 checks passed')).toBeInTheDocument();
  });

  it('requires at least one selected service before generation', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    render(<WorkspaceStudio initialPlan={plan()} onBack={vi.fn()} />);

    await user.click(screen.getByLabelText('Include web'));
    expect(screen.getByRole('button', { name: 'Generate bundle' })).toBeDisabled();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });
});

function plan(): WorkspacePlan {
  const ir = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
      'utf-8',
    ),
  ) as PipelineIR;
  ir.project.name = 'web';
  return {
    version: '0.1.0',
    name: 'acme-platform',
    workspacePath: '.',
    warnings: [],
    existingComposeFiles: ['apps/web/docker-compose.dev.yml'],
    services: [
      {
        id: 'web',
        name: 'web',
        path: 'apps/web',
        enabled: true,
        stack: 'vite',
        kind: 'frontend',
        hostPort: 8080,
        containerPort: 80,
        startCommand: 'nginx -g "daemon off;"',
        ir,
      },
    ],
  };
}

function bundle(): WorkspaceBundle {
  return {
    provider: 'gitlab-ci',
    composeMode: 'per-service',
    artifacts: [
      { path: 'apps/web/Dockerfile', kind: 'dockerfile', serviceId: 'web', content: 'FROM nginx:alpine\nCMD ["nginx"]\n' },
      { path: 'apps/web/docker-compose.pipe-editor.yml', kind: 'compose', serviceId: 'web', content: 'services:\n  web: {}\n' },
      { path: '.gitlab-ci.yml', kind: 'ci', content: 'stages: [verify, containerize]' },
    ],
    checks: [
      { id: 'docker', status: 'passed', message: 'Dockerfile is valid.' },
      { id: 'ci', status: 'passed', message: 'CI is valid.' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// T-WORKSPACE-104 (UX-04) — port fields never write a non-port.
//
// These were `value={service.hostPort}` with `Number(event.target.value)`
// on change. `Number('')` is 0, so clearing the field wrote port 0 into the
// plan — valid client-side, and a server check failure later. Every
// intermediate typing state had the same problem.
// ─────────────────────────────────────────────────────────────────────────
describe('T-WORKSPACE-104 (UX-04) — port fields', () => {
  async function renderStudio() {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkspaceStudio initialPlan={plan()} onBack={() => undefined} />);
    return screen.getByLabelText('web host port') as HTMLInputElement;
  }

  it('shows the current port', async () => {
    expect((await renderStudio()).value).toBe('8080');
  });

  it('keeps an intermediate typing state without committing it', async () => {
    const port = await renderStudio();
    fireEvent.change(port, { target: { value: '4' } });
    // Displayed, not committed — no error, nothing written yet.
    expect(port.value).toBe('4');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['', '0', '65536', 'abc', '-1', '80.5'])(
    'refuses %p on blur and restores the last good value',
    async (bad) => {
      const port = await renderStudio();
      fireEvent.change(port, { target: { value: bad } });
      fireEvent.blur(port);
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(port.value).toBe('8080');
    },
  );

  it('commits a valid port on blur', async () => {
    const port = await renderStudio();
    fireEvent.change(port, { target: { value: '4173' } });
    fireEvent.blur(port);
    expect(port.value).toBe('4173');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('commits on Enter and abandons the draft on Escape', async () => {
    const port = await renderStudio();
    fireEvent.change(port, { target: { value: '9000' } });
    fireEvent.keyDown(port, { key: 'Enter' });
    expect(port.value).toBe('9000');

    fireEvent.change(port, { target: { value: '1234' } });
    fireEvent.keyDown(port, { key: 'Escape' });
    expect(port.value).toBe('9000');
  });
});
