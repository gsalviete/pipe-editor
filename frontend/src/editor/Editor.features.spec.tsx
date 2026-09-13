// Tests for the product features layered on top of the original
// editor: project picker, undo/redo, step editing, stage add/remove,
// and the live run panel (SSE via a fake EventSource).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { PipelineIR } from '@modules/ir';
import { Editor } from './Editor';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures');

function loadIr(fixture: string): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

interface RouteConfig {
  ir?: PipelineIR;
  projects?: { path: string; name: string; ciConfigs?: string[] }[];
  dockerAvailable?: boolean;
  runId?: string;
  savedPipeline?: { projectPath: string; ir: PipelineIR; savedAt: string } | null;
}

function mockRoutes(config: RouteConfig) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (u.endsWith('/api/detect') && init?.method === 'POST') {
      if (!config.ir) throw new Error('detect not configured');
      return json({ ir: config.ir, warnings: [] });
    }
    if (u.endsWith('/api/projects')) {
      return json({
        workspaceRoot: '/ws',
        projects: (config.projects ?? []).map((p) => ({
          packageManager: 'pnpm',
          scripts: ['test', 'build'],
          hasDockerfile: false,
          isMonorepoRoot: false,
          ciConfigs: [],
          ...p,
        })),
      });
    }
    if (u.includes('/api/state/pipeline?')) {
      return json({ saved: config.savedPipeline ?? null });
    }
    if (u.endsWith('/api/state/pipelines')) {
      return json({
        pipelines: config.savedPipeline
          ? { [config.savedPipeline.projectPath]: { savedAt: config.savedPipeline.savedAt } }
          : {},
      });
    }
    if (u.endsWith('/api/state/pipeline') && init?.method === 'PUT') {
      return json({ saved: { savedAt: new Date().toISOString() } });
    }
    if (u.endsWith('/api/state/pipeline') && init?.method === 'DELETE') {
      return json({ deleted: true });
    }
    if (u.endsWith('/api/advise') && init?.method === 'POST') {
      return json({
        score: 90,
        grade: 'A',
        findings: [
          {
            id: 'no-lint-stage',
            severity: 'info',
            title: 'No lint stage',
            detail: 'Static analysis catches a class of defects tests rarely cover.',
            fix: 'Add a lint script to the project.',
          },
        ],
      });
    }
    if (u.endsWith('/api/import/from-project') && init?.method === 'POST') {
      if (!config.ir) throw new Error('import not configured');
      return json({
        ir: config.ir,
        warnings: [{ message: 'action "codecov/codecov-action@v4" has no local equivalent and was skipped.' }],
        provider: 'github-actions',
      });
    }
    if (u.endsWith('/api/import') && init?.method === 'POST') {
      if (!config.ir) throw new Error('import not configured');
      return json({
        ir: config.ir,
        warnings: [{ message: 'Job "build" runs directly on a VM runner; assigned container image node:20-alpine for local execution.' }],
        provider: 'github-actions',
      });
    }
    if (u.endsWith('/api/execute/availability')) {
      return json({ available: config.dockerAvailable ?? true });
    }
    if (u.endsWith('/api/execute') && init?.method === 'POST') {
      return json({ runId: config.runId ?? 'run-1' }, 202);
    }
    if (u.endsWith('/api/execute') && (!init || init.method === undefined)) {
      return json({ runs: [] });
    }
    if (u.endsWith('/api/generate') && init?.method === 'POST') {
      return json({
        dockerfile: '# generated dockerfile\nFROM node:20-alpine\n',
        dockerignore: 'node_modules\n',
      });
    }
    if (u.endsWith('/api/export/github-actions')) {
      return json({
        provider: 'github-actions',
        filename: 'ci.yml',
        content: 'name: CI\njobs: {}\n',
      });
    }
    if (u.endsWith('/api/export/gitlab-ci')) {
      return json({
        provider: 'gitlab-ci',
        filename: '.gitlab-ci.yml',
        content: 'stages: [install]\n',
      });
    }
    throw new Error(`Unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Minimal EventSource stand-in; tests drive it via `emit`.
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 1;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  close() {
    this.readyState = 2;
  }
}

async function detectFixture() {
  const input = screen.getByLabelText('projectPath') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'node-pnpm-nest-basic' } });
  fireEvent.click(screen.getByRole('button', { name: /edit one app/i }));
  await waitFor(() => screen.getByTestId('chain'));
}

function stageResult(stageId: string, status = 'passed', extra: Record<string, unknown> = {}) {
  const skipped = status.startsWith('skipped');
  return {
    stageId,
    status,
    exitCode: status === 'passed' ? 0 : status === 'failed' ? 1 : null,
    stdout: '',
    stderr: '',
    // Mirrors the executor: skipped stages never started.
    startedAt: skipped ? null : new Date().toISOString(),
    finishedAt: skipped ? null : new Date(Date.now() + 42).toISOString(),
    durationMs: skipped ? 0 : 42,
    ...extra,
  };
}

describe('Editor product features', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('project picker lists discovered projects and one click detects', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    const fetchMock = mockRoutes({
      ir,
      projects: [
        { path: 'app-a', name: 'app-a' },
        { path: 'group/app-b', name: 'app-b' },
      ],
    });
    render(<Editor />);

    await waitFor(() => screen.getByRole('button', { name: 'Detect app-a' }));
    expect(screen.getByRole('button', { name: 'Detect app-b' })).toBeInTheDocument();
    expect(screen.getByText('group/app-b')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Detect app-a' }));
    await waitFor(() => screen.getByTestId('chain'));

    const detectCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith('/api/detect') && init?.method === 'POST',
    );
    expect(JSON.parse(String(detectCall?.[1]?.body))).toEqual({ projectPath: 'app-a' });
    // The picker is replaced by the loaded pipeline.
    expect(screen.queryByTestId('project-picker')).toBeNull();
  });

  it('undo/redo restore toggle edits (buttons + history invariants)', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    const undoBtn = screen.getByRole('button', { name: /undo/i });
    const redoBtn = screen.getByRole('button', { name: /redo/i });
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();

    await user.click(screen.getByLabelText('Toggle lint enabled'));
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).toMatch(/stage-node--disabled/);
    expect(undoBtn).toBeEnabled();

    await user.click(undoBtn);
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).not.toMatch(/stage-node--disabled/);
    expect(redoBtn).toBeEnabled();

    await user.click(redoBtn);
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).toMatch(/stage-node--disabled/);
  });

  it('step commands are editable inline; undo reverts the edit', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockRoutes({ ir });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Edit install step 1'));
    const input = screen.getByLabelText('install step 1 command') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'pnpm install --no-frozen-lockfile{enter}');

    const installNode = document.querySelector('[data-stage-id="install"]') as HTMLElement;
    expect(installNode.textContent).toContain('pnpm install --no-frozen-lockfile');

    await user.click(screen.getByRole('button', { name: /undo/i }));
    const originalRun = ir.stages.find((s) => s.id === 'install')!.steps[0].run;
    expect(
      (document.querySelector('[data-stage-id="install"]') as HTMLElement).textContent,
    ).toContain(originalRun);
  });

  it('deleting a stage splices the chain (like a permanent disable); undo restores it', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Delete lint stage'));
    expect(document.querySelector('[data-stage-id="lint"]')).toBeNull();
    const caption = screen.getByTestId('effective-chain-caption');
    expect(caption.textContent).toMatch(/install\s*→\s*test\s*→\s*build\s*→\s*docker-build/);
    expect(caption.textContent).not.toMatch(/lint/);
    // Still a valid IR — no validation banner.
    expect(screen.queryByTestId('validation-errors')).toBeNull();

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(document.querySelector('[data-stage-id="lint"]')).not.toBeNull();
  });

  it('adding a stage inserts a custom stage before docker-build, valid and in the caption', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();

    await userEvent.setup().click(screen.getByRole('button', { name: /add stage/i }));

    expect(document.querySelector('[data-stage-id="custom"]')).not.toBeNull();
    expect(screen.getByTestId('effective-chain-caption').textContent).toMatch(
      /build\s*→\s*custom\s*→\s*docker-build/,
    );
    expect(screen.queryByTestId('validation-errors')).toBeNull();
  });

  it('run panel: streams stage progress over SSE and shows the aggregate result', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic'), dockerAvailable: true, runId: 'r-42' });
    render(<Editor />);
    await detectFixture();

    const runButton = await screen.findByRole('button', { name: /run pipeline/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    await userEvent.setup().click(runButton);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];
    expect(stream.url).toBe('/api/execute/r-42/events');

    // All five stages render as pending rows immediately.
    const stagesEl = screen.getByTestId('run-stages');
    expect(within(stagesEl).getAllByRole('button')).toHaveLength(5);

    act(() => {
      stream.emit({ type: 'stage-started', stageId: 'install', at: new Date().toISOString() });
      stream.emit({
        type: 'stage-output',
        stageId: 'install',
        stream: 'stdout',
        chunk: 'Lockfile is up to date\n',
      });
    });
    expect(within(stagesEl).getByText(/running/)).toBeInTheDocument();
    expect(screen.getByText(/Lockfile is up to date/)).toBeInTheDocument();

    act(() => {
      stream.emit({ type: 'stage-finished', result: stageResult('install') });
      stream.emit({
        type: 'stage-finished',
        result: stageResult('lint', 'skipped:disabled', { skipReason: 'Stage disabled in IR' }),
      });
      stream.emit({ type: 'stage-finished', result: stageResult('test') });
      stream.emit({ type: 'stage-finished', result: stageResult('build') });
      stream.emit({
        type: 'stage-finished',
        result: stageResult('docker-build', 'skipped:docker-build-delegated'),
      });
      stream.emit({
        type: 'run-finished',
        result: {
          aggregateStatus: 'passed',
          reason: null,
          stages: [],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 1234,
        },
      });
    });

    expect(screen.getByTestId('run-result').textContent).toMatch(/Pipeline passed/);
    expect(screen.getByTestId('run-result').textContent).toMatch(/1\.2s/);
    // Stream closed after the terminal event.
    expect(stream.readyState).toBe(2);

    // Profiler: executed stages appear on the timeline; skipped ones are
    // annotated as not executed.
    const timeline = screen.getByTestId('execution-timeline');
    expect(within(timeline).getAllByText(/not executed/)).toHaveLength(2);
    expect(timeline.querySelectorAll('.timeline__bar--passed').length).toBe(3);
  });

  it('Generate artifacts produces all four artifacts in tabs, with staleness on edit', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /generate artifacts/i }));
    await waitFor(() => screen.getByTestId('artifacts'));

    // Dockerfile tab active by default.
    expect(screen.getByText(/generated dockerfile/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'GitHub Actions' }));
    expect(screen.getByText(/name: CI/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'GitLab CI' }));
    expect(screen.getByText(/stages: \[install\]/)).toBeInTheDocument();

    expect(screen.queryByText(/outdated — regenerate/)).toBeNull();
    await user.click(screen.getByLabelText('Toggle lint enabled'));
    expect(screen.getByText(/outdated — regenerate/)).toBeInTheDocument();
  });

  it('container image is editable inline and undoable', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Edit install image'));
    const input = screen.getByLabelText('install image') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'node:22-alpine{enter}');

    const installNode = document.querySelector('[data-stage-id="install"]') as HTMLElement;
    expect(installNode.textContent).toContain('node:22-alpine');

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(
      (document.querySelector('[data-stage-id="install"]') as HTMLElement).textContent,
    ).toContain('node:20-alpine');
  });

  it('trigger branches are editable and land in the working IR', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Edit trigger branches'));
    const input = screen.getByLabelText('Trigger branches') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'main, develop{enter}');

    expect(screen.getByText('main, develop')).toBeInTheDocument();
    // Undoable like any other edit.
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.queryByText('main, develop')).toBeNull();
  });

  it('importing a pipeline JSON file loads it read-only-for-run (imported badge, no Run panel)', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await waitFor(() => screen.getByTestId('project-picker'));

    const ir = loadIr('node-pnpm-nest-basic');
    const file = new File([JSON.stringify(ir)], 'my-pipeline.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Import pipeline file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.getByText(/imported from my-pipeline.json/)).toBeInTheDocument();
    expect(screen.queryByTestId('run-panel')).toBeNull();
    expect(screen.getByText(/no local project to run it against/i)).toBeInTheDocument();
  });

  it('rejects an invalid imported pipeline with a validation message', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await waitFor(() => screen.getByTestId('project-picker'));

    const file = new File(
      [JSON.stringify({ version: 'nope', project: {}, stages: 'not-an-array' })],
      'broken.json',
      { type: 'application/json' },
    );
    fireEvent.change(screen.getByLabelText('Import pipeline file'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/not a valid pipeline/i),
    );
    expect(screen.queryByTestId('chain')).toBeNull();
  });

  // SEC-02 (superseded behaviour): a #ir= link used to load straight into
  // the editor, one click from ▶ Run. It now shows its commands first and
  // waits. See T-SEC-010 in Editor.provenance.spec.tsx for the full
  // contract; this pins the mount-time half.
  it('a #ir= share link shows its commands instead of loading on mount', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    const ir = loadIr('node-pnpm-nest-basic');
    const json = JSON.stringify(ir);
    window.location.hash = `#ir=${btoa(unescape(encodeURIComponent(json)))}`;

    render(<Editor />);
    await waitFor(() => screen.getByTestId('share-link-review'));
    // Nothing is loaded until the user says so.
    expect(screen.queryByTestId('chain')).toBeNull();
    // The hash is cleared regardless, so a reload does not re-prompt.
    expect(window.location.hash).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /load the pipeline/i }));
    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.getByText(/imported from a shared link/)).toBeInTheDocument();
  });

  it('autosaves edits (PUT), shows Saved ✓, and deletes the save when back at baseline', async () => {
    const fetchMock = mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Toggle lint enabled'));
    await waitFor(
      () => expect(screen.getByTestId('save-indicator').textContent).toBe('Saved ✓'),
      { timeout: 3000 },
    );
    const putCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith('/api/state/pipeline') && init?.method === 'PUT',
    );
    const putBody = JSON.parse(String(putCall?.[1]?.body));
    expect(putBody.projectPath).toBe('node-pnpm-nest-basic');
    expect(putBody.ir.stages.find((s: { id: string }) => s.id === 'lint').enabled).toBe(false);

    // Undo back to baseline → the stale save is deleted server-side.
    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            ([u, init]) =>
              String(u).endsWith('/api/state/pipeline') && init?.method === 'DELETE',
          ),
        ).toBe(true),
      { timeout: 3000 },
    );
  });

  it('offers to restore differing saved edits after detect; Restore applies them undoably', async () => {
    const detected = loadIr('node-pnpm-nest-basic');
    const edited = {
      ...detected,
      stages: detected.stages.map((s) => (s.id === 'lint' ? { ...s, enabled: false } : s)),
    };
    mockRoutes({
      ir: detected,
      savedPipeline: {
        projectPath: 'node-pnpm-nest-basic',
        ir: edited,
        savedAt: '2026-07-01T10:00:00Z',
      },
    });
    render(<Editor />);
    await detectFixture();

    const bar = await screen.findByTestId('restore-bar');
    expect(bar.textContent).toMatch(/saved edits/i);

    await userEvent.setup().click(screen.getByRole('button', { name: /restore my edits/i }));
    expect(screen.queryByTestId('restore-bar')).toBeNull();
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).toMatch(/stage-node--disabled/);
    // Undo returns to the detected pipeline.
    await userEvent.setup().click(screen.getByRole('button', { name: /undo/i }));
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).not.toMatch(/stage-node--disabled/);
  });

  it('picker marks projects that carry saved edits', async () => {
    mockRoutes({
      ir: loadIr('node-pnpm-nest-basic'),
      projects: [{ path: 'app-a', name: 'app-a' }],
      savedPipeline: {
        projectPath: 'app-a',
        ir: loadIr('node-pnpm-nest-basic'),
        savedAt: '2026-07-01T10:00:00Z',
      },
    });
    render(<Editor />);
    await waitFor(() => screen.getByRole('button', { name: 'Detect app-a' }));
    await waitFor(() => expect(screen.getByText('✎ saved edits')).toBeInTheDocument());
  });

  it('pipeline doctor analyzes automatically and lists findings on expand', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await detectFixture();

    const panel = await screen.findByTestId('doctor-panel');
    expect(panel.textContent).toMatch(/Pipeline doctor/);
    expect(panel.textContent).toMatch(/90\/100/);
    expect(panel.textContent).toMatch(/ℹ 1/);

    await userEvent.setup().click(within(panel).getByRole('button', { name: /pipeline doctor/i }));
    expect(screen.getByText('No lint stage')).toBeInTheDocument();
    expect(screen.getByText(/Fix: Add a lint script/)).toBeInTheDocument();
  });

  it('dropping a real GitHub Actions workflow converts it via the migration engine', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic') });
    render(<Editor />);
    await waitFor(() => screen.getByTestId('project-picker'));

    const ghaYaml = 'name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test\n';
    const file = new File([ghaYaml], 'ci.yml', { type: 'text/yaml' });
    fireEvent.change(screen.getByLabelText('Import pipeline file'), {
      target: { files: [file] },
    });

    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.getByText(/converted from GitHub Actions/)).toBeInTheDocument();
    // Conversion warnings surface in the warnings banner.
    expect(screen.getByText(/VM runner/)).toBeInTheDocument();
    // No local project attached — Run stays gated.
    expect(screen.queryByTestId('run-panel')).toBeNull();
  });

  it('picker offers "visualize existing CI" and the imported pipeline is RUNNABLE', async () => {
    mockRoutes({
      ir: loadIr('node-pnpm-nest-basic'),
      projects: [{ path: 'app-a', name: 'app-a', ciConfigs: ['.github/workflows/ci.yml'] }],
      dockerAvailable: true,
    });
    render(<Editor />);
    await waitFor(() => screen.getByTestId('project-picker'));

    const chip = screen.getByLabelText('Visualize existing CI .github/workflows/ci.yml of app-a');
    await userEvent.setup().click(chip);

    await waitFor(() => screen.getByTestId('chain'));
    expect(screen.getByText(/converted from GitHub Actions/)).toBeInTheDocument();
    // Bound to the local project → run panel IS present.
    expect(screen.getByTestId('run-panel')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /run pipeline/i }),
    ).toBeInTheDocument();
  });

  it('run button is disabled with an explanation when docker is unavailable', async () => {
    mockRoutes({ ir: loadIr('node-pnpm-nest-basic'), dockerAvailable: false });
    render(<Editor />);
    await detectFixture();

    const runButton = await screen.findByRole('button', { name: /run pipeline/i });
    await waitFor(() => expect(runButton).toBeDisabled());
    expect(screen.getByText(/Docker is not available/i)).toBeInTheDocument();
  });
});
