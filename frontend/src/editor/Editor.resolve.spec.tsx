// T-EDITOR-037…039 — the in-UI resolution surface (EDITOR-UI-FR-018).
//
// Before this suite the editor rendered unresolved entries as read-only
// text, so a project without engines.node detected into a pipeline whose
// Generate and Run actions were permanently disabled and whose prompt told
// the user to do something the interface did not permit (review UX-01a).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { validate, type PipelineIR } from '@modules/ir';
import { Editor } from './Editor';

const FIXTURES = join(resolve(__dirname, '..', '..', '..'), 'test', 'fixtures');

function loadIr(fixture: string): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

/** The canonical fixture with runtime.version knocked back to unresolved. */
function irMissingRuntimeVersion(): PipelineIR {
  const ir = loadIr('node-pnpm-nest-basic');
  ir.project.runtime.version = null;
  ir.unresolved = [
    {
      field: '/project/runtime/version',
      reason: 'needs-user-input',
      message: 'Could not determine Node version; please specify.',
    },
  ];
  expect(validate(ir)).toEqual([]);
  return ir;
}

function irMissingPackageManagerName(): PipelineIR {
  const ir = loadIr('node-pnpm-nest-basic');
  ir.project.packageManager.name = null;
  ir.stages = [];
  ir.unresolved = [
    {
      field: '/project/packageManager/name',
      reason: 'needs-user-input',
      message: 'Could not determine the package manager; please specify.',
    },
  ];
  expect(validate(ir)).toEqual([]);
  return ir;
}

/** The gate hint appears in every panel it disables; count them. */
function gateHints(): number {
  return screen.queryAllByText(/before generating/i).length;
}

function mockDetect(ir: PipelineIR) {
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
    if (u.endsWith('/api/execute/availability')) return json({ available: false });
    if (u.endsWith('/api/execute')) return json({ runs: [] });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function detect() {
  fireEvent.change(screen.getByLabelText('projectPath'), {
    target: { value: 'some-project' },
  });
  fireEvent.click(screen.getByRole('button', { name: /edit one app/i }));
  await waitFor(() => screen.getByTestId('project-info'));
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('T-EDITOR-037 — unresolved prompts are editable', () => {
  it('offers a text input for the Node version and commits it', async () => {
    mockDetect(irMissingRuntimeVersion());
    render(<Editor />);
    await detect();

    // The gate is on before resolution.
    expect(gateHints()).toBeGreaterThan(0);

    const input = screen.getByLabelText('Node version') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /set node version/i }));

    // The prompt is gone, the badge shows the value, the gate is off.
    await waitFor(() => {
      expect(screen.queryByLabelText('Node version')).toBeNull();
    });
    expect(screen.getByTestId('project-info').textContent).toContain('node 20');
    expect(gateHints()).toBe(0);
  });

  it('offers a select for the package manager and commits on choice', async () => {
    mockDetect(irMissingPackageManagerName());
    render(<Editor />);
    await detect();

    const select = screen.getByLabelText('Package manager') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'npm', 'pnpm', 'yarn']);

    fireEvent.change(select, { target: { value: 'pnpm' } });

    await waitFor(() => {
      expect(screen.queryByLabelText('Package manager')).toBeNull();
    });
    expect(screen.getByTestId('project-info').textContent).toContain('pnpm');
  });

  it('normalizes a full semver to the major the IR carries', async () => {
    mockDetect(irMissingRuntimeVersion());
    render(<Editor />);
    await detect();

    fireEvent.change(screen.getByLabelText('Node version'), {
      target: { value: 'v20.11.0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set node version/i }));

    await waitFor(() => expect(screen.queryByLabelText('Node version')).toBeNull());
    expect(screen.getByTestId('project-info').textContent).toContain('node 20');
  });
});

describe('T-EDITOR-038 — a rejected value is reported, never written', () => {
  it('keeps the prompt and explains when the value is not usable', async () => {
    mockDetect(irMissingRuntimeVersion());
    render(<Editor />);
    await detect();

    fireEvent.change(screen.getByLabelText('Node version'), {
      target: { value: 'lts/hydrogen' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set node version/i }));

    expect(screen.getByRole('alert').textContent).toContain('lts/hydrogen');
    // Still unresolved, still gated — the invariant never broke.
    expect(screen.getByLabelText('Node version')).toBeTruthy();
    expect(gateHints()).toBeGreaterThan(0);
  });
});

describe('T-EDITOR-039 — resolution is an undoable edit', () => {
  it('undo restores the unresolved state', async () => {
    mockDetect(irMissingRuntimeVersion());
    render(<Editor />);
    await detect();

    fireEvent.change(screen.getByLabelText('Node version'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /set node version/i }));
    await waitFor(() => expect(screen.queryByLabelText('Node version')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    await waitFor(() => expect(screen.getByLabelText('Node version')).toBeTruthy());
    expect(gateHints()).toBeGreaterThan(0);
  });
});
