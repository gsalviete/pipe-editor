import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineIR } from '@modules/ir';
import type { WorkspacePlan } from './api';
import { Editor } from './Editor';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('Editor workspace entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('T-WORKSPACE-011 (WORKSPACE-AC-011) scans the chosen folder and opens the multi-service studio', async () => {
    window.localStorage.setItem('pipe-editor:onboarded', '1');
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target === '/api/projects') return json({ workspaceRoot: '/workspace', projects: [] });
      if (target === '/api/state/pipelines') return json({ pipelines: {} });
      if (target === '/api/workspace/inspect' && init?.method === 'POST') return json(plan());
      throw new Error(`Unexpected fetch ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Editor />);

    fireEvent.change(screen.getByLabelText('projectPath'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByRole('button', { name: /Scan all services/ }));

    expect(await screen.findByTestId('workspace-studio')).toBeInTheDocument();
    expect(screen.getByText('acme-platform')).toBeInTheDocument();
    expect(screen.queryByTestId('project-picker')).toBeNull();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/workspace/inspect');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ projectPath: 'platform' });
    });
  });

  it('explains how to recover when the local API is offline', async () => {
    window.localStorage.setItem('pipe-editor:onboarded', '1');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target === '/api/projects') return json({ workspaceRoot: '/workspace', projects: [] });
      if (target === '/api/state/pipelines') return json({ pipelines: {} });
      throw new TypeError('Failed to fetch');
    }));
    render(<Editor />);

    fireEvent.change(screen.getByLabelText('projectPath'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByRole('button', { name: /Scan all services/ }));

    expect(
      await screen.findByText(/local API is offline.*pnpm dev:backend/i),
    ).toBeInTheDocument();
  });

  it('resolves a nested dropped folder hidden behind browser path privacy', async () => {
    window.localStorage.setItem('pipe-editor:onboarded', '1');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target === '/api/projects') return json({ workspaceRoot: '/workspace', projects: [] });
      if (target === '/api/state/pipelines') return json({ pipelines: {} });
      if (target === '/api/directories/resolve?name=mad-test') {
        return json({ workspaceRoot: '/workspace', matches: ['mad/mad-test'] });
      }
      throw new Error(`Unexpected fetch ${target}`);
    }));
    render(<Editor />);

    const item = {
      webkitGetAsEntry: () => ({ isDirectory: true, name: 'mad-test' }),
      getAsFile: () => null,
    };
    fireEvent.drop(screen.getByTestId('editor-root'), {
      dataTransfer: { items: { 0: item, length: 1 }, files: [] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('projectPath')).toHaveValue('mad/mad-test');
    });
    expect(screen.getByText(/Folder selected: mad\/mad-test/)).toBeInTheDocument();
  });
});

function json(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function plan(): WorkspacePlan {
  const ir = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'test', 'fixtures', 'node-pnpm-nest-basic', 'expected-ir.json'),
      'utf-8',
    ),
  ) as PipelineIR;
  return {
    version: '0.1.0',
    name: 'acme-platform',
    workspacePath: 'platform',
    warnings: [],
    existingComposeFiles: [],
    services: [
      {
        id: 'api',
        name: 'api',
        path: 'backend',
        enabled: true,
        stack: 'nestjs',
        kind: 'backend',
        hostPort: 3000,
        containerPort: 3000,
        startCommand: 'node dist/main.js',
        ir,
      },
    ],
  };
}
