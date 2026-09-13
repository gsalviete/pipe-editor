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
    fireEvent.change(port, { target: { value: '4173' } });
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
