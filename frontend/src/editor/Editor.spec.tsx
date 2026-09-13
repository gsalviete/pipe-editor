// Frontend component tests for the Visual Editor.
//
// Maps to EDITOR-AC-012…024 from docs/specs/visual-editor.spec.md.
// fetch is mocked globally; the Editor's detect-flow is exercised
// against the in-memory IR loaded from
// test/fixtures/node-pnpm-nest-basic/expected-ir.json.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load as yamlLoad } from 'js-yaml';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  canonicalEquals,
  computeEffectiveChain,
  serializeCanonical,
  type PipelineIR,
} from '@modules/ir';
import { Editor } from './Editor';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures');

function loadIr(fixture: string): PipelineIR {
  return JSON.parse(
    readFileSync(join(FIXTURES, fixture, 'expected-ir.json'), 'utf-8'),
  ) as PipelineIR;
}

function mockDetectFetch(ir: PipelineIR, warnings: { manifest: string; message: string }[] = []) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.endsWith('/api/detect') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ir, warnings }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function runDetect() {
  const input = screen.getByLabelText('projectPath') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'test/fixtures/node-pnpm-nest-basic' } });
  fireEvent.click(screen.getByRole('button', { name: /detect/i }));
  await waitFor(() => screen.getByTestId('chain'));
}

describe('Visual Editor (T-EDITOR-012…024)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-012 (EDITOR-AC-012) — initial render: folder input + clear actions,
  // no chain.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-012 — initial render shows the folder input and open actions; no chain rendered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const path = typeof url === 'string' ? url : url.toString();
        if (path.endsWith('/api/projects')) {
          return Response.json({ workspaceRoot: '/workspace', projects: [] });
        }
        if (path.endsWith('/api/state/pipelines')) {
          return Response.json({ pipelines: {} });
        }
        throw new Error(`Unexpected fetch ${path}`);
      }),
    );
    render(<Editor />);
    expect(screen.getByLabelText('projectPath')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /detect/i })).toBeInTheDocument();
    expect(screen.queryByTestId('chain')).toBeNull();
    expect(screen.getByText(/Your CI pipeline, made visible/i)).toBeInTheDocument();
    expect(screen.getByText('Discover', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Shape', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Prove', { selector: 'strong' })).toBeInTheDocument();
    await screen.findByText(/No projects found under the workspace root/i);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-013 (EDITOR-AC-013) — every Stage rendered, regardless of
  // enabled.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-013 — after Detect every Stage in the IR appears in the DOM', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();
    for (const stage of ir.stages) {
      expect(
        screen.getByText(stage.id, { selector: '.stage-node__id' }),
      ).toBeInTheDocument();
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-014 (EDITOR-AC-014) — toggle flips enabled; disabled Stage
  // gets the `stage-node--disabled` class.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-014 — toggling lint adds the stage-node--disabled class', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const user = userEvent.setup();
    const lintCheckbox = screen.getByLabelText('Toggle lint enabled') as HTMLInputElement;
    expect(lintCheckbox.checked).toBe(true);

    const lintNode = document.querySelector('[data-stage-id="lint"]') as HTMLElement;
    expect(lintNode.className).not.toMatch(/stage-node--disabled/);

    await user.click(lintCheckbox);

    expect(lintCheckbox.checked).toBe(false);
    expect(
      (document.querySelector('[data-stage-id="lint"]') as HTMLElement).className,
    ).toMatch(/stage-node--disabled/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-015 (EDITOR-AC-015) — connector reflects
  // computeEffectiveChain: toggling lint off makes `test`'s effective
  // predecessor `install` (mirrors IR-AC-015).
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-015 — toggling lint off makes the install→lint connector inactive and install→test effective chain', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Toggle lint enabled'));

    // Effective chain after toggling lint off: install→test→build→docker-build.
    const effectiveAfter = computeEffectiveChain({
      ...ir,
      stages: ir.stages.map((s) =>
        s.id === 'lint' ? { ...s, enabled: false } : s,
      ),
    });
    expect(effectiveAfter.find((s) => s.id === 'lint')).toBeUndefined();
    expect(effectiveAfter.find((s) => s.id === 'test')).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-016 (EDITOR-AC-016) — re-enabling a disabled Stage restores
  // it to the effective chain.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-016 — re-enabling a disabled Stage restores it', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const user = userEvent.setup();
    const cb = screen.getByLabelText('Toggle lint enabled') as HTMLInputElement;
    await user.click(cb);
    expect(cb.checked).toBe(false);
    await user.click(cb);
    expect(cb.checked).toBe(true);

    const lintNode = document.querySelector('[data-stage-id="lint"]') as HTMLElement;
    expect(lintNode.className).not.toMatch(/stage-node--disabled/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-017 (EDITOR-AC-017) — unresolved entries rendered with both
  // field path and message.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-017 — every unresolved entry is rendered with field + message', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    // Null the committed value so the unresolved entry is consistent
    // (the editor now ALSO surfaces validate() errors, so an entry
    // contradicting a committed value would legitimately render twice).
    ir.project.language = null;
    ir.unresolved = [
      {
        field: '/project/language',
        reason: 'needs-user-input',
        message: 'Language could not be inferred.',
      },
    ];
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();
    const list = screen.getByTestId('unresolved-list');
    expect(within(list).getByText('/project/language')).toBeInTheDocument();
    expect(
      within(list).getByText(/Language could not be inferred/i),
    ).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-018 (EDITOR-AC-018) — warnings rendered as non-blocking
  // notice; chain still renders.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-018 — warnings render as a notice; chain still renders', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir, [
      { manifest: 'tsconfig.json', message: 'parser diagnostic' },
    ]);
    render(<Editor />);
    await runDetect();
    expect(screen.getByText(/parser diagnostic/)).toBeInTheDocument();
    expect(screen.getByTestId('chain')).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-019 (EDITOR-AC-019) — Export JSON = serializeCanonical of
  // the WORKING IR (reflects toggles).
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-019 — Export JSON serializes the WORKING IR (post-toggle), not the Loaded IR', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Toggle lint enabled'));

    const captured = captureNextDownload();
    await user.click(screen.getByRole('button', { name: /export json/i }));
    const exported = await captured.content();

    const expectedWorking = {
      ...ir,
      stages: ir.stages.map((s) =>
        s.id === 'lint' ? { ...s, enabled: false } : s,
      ),
    };
    expect(exported.trimEnd()).toBe(serializeCanonical(expectedWorking));
    // And it MUST differ from the Loaded IR's canonical form.
    expect(exported.trimEnd()).not.toBe(serializeCanonical(ir));
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-020 (EDITOR-AC-020) — Export YAML round-trips back to a
  // canonicalEquals-equal IR.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-020 — Export YAML round-trips via yaml.load() to a canonicalEquals IR', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const captured = captureNextDownload();
    await userEvent.setup().click(screen.getByRole('button', { name: /export yaml/i }));
    const exported = await captured.content();

    const parsed = yamlLoad(exported) as PipelineIR;
    expect(canonicalEquals(parsed, ir)).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-021 (EDITOR-AC-021) — effective chain reflects
  // computeEffectiveChain on the Working IR exactly.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-021 — connector active states match computeEffectiveChain(workingIR)', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    // Initially the full chain is active.
    const allConnectors = document.querySelectorAll('.chain-connector');
    expect(allConnectors.length).toBe(ir.stages.length - 1);
    for (const c of Array.from(allConnectors)) {
      expect(c.className).toMatch(/chain-connector--active/);
    }

    // Toggle test off; the connector adjacent to test must become inactive.
    await userEvent.setup().click(screen.getByLabelText('Toggle test enabled'));
    const idx = ir.stages.findIndex((s) => s.id === 'test');
    const updatedConnectors = document.querySelectorAll('.chain-connector');
    // Connectors at idx-1 (lint→test) and idx (test→build) MUST be
    // marked inactive after disabling test.
    expect(updatedConnectors[idx - 1].className).toMatch(/chain-connector--inactive/);
    expect(updatedConnectors[idx].className).toMatch(/chain-connector--inactive/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-022 (superseded) — the v1 "closed editable surface" is gone:
  // the editor now supports step editing, stage insertion and stage
  // deletion. This test pins the NEW surface: those affordances exist,
  // while reordering (still unsupported) stays absent.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-022 — editing affordances present (add/delete stage, step edit); no reorder controls', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();
    expect(screen.getByRole('button', { name: /add stage/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Delete lint stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit install step 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reorder/i })).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-023 (EDITOR-AC-023) — PM-null fixture: empty chain + the
  // PM-name prompt carries `unresolved-prompt--primary`.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-023 — empty stages + PM-name unresolved: PM-name prompt has unresolved-prompt--primary; other entries do not', async () => {
    const base = loadIr('node-pnpm-nest-basic');
    const synth: PipelineIR = {
      ...base,
      stages: [],
      project: {
        ...base.project,
        packageManager: { name: null, version: null },
      },
      unresolved: [
        {
          field: '/project/packageManager/name',
          reason: 'needs-user-input',
          message: 'No lockfile or packageManager field present.',
        },
        {
          field: '/project/language',
          reason: 'needs-user-input',
          message: 'Language inference unavailable without manifests.',
        },
      ],
    };
    mockDetectFetch(synth);
    render(<Editor />);
    await runDetect();

    // Empty chain area visible.
    expect(screen.getByText(/No stages were detected/i)).toBeInTheDocument();

    // PM-name prompt has primary emphasis.
    const pmPrompt = document.querySelector(
      '[data-field="/project/packageManager/name"]',
    ) as HTMLElement;
    expect(pmPrompt).not.toBeNull();
    expect(pmPrompt.className).toMatch(/unresolved-prompt--primary/);

    // Other unresolved entries: present, but no primary class.
    const langPrompt = document.querySelector(
      '[data-field="/project/language"]',
    ) as HTMLElement;
    expect(langPrompt).not.toBeNull();
    expect(langPrompt.className).not.toMatch(/unresolved-prompt--primary/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-035 (EDITOR-AC-035) — Effective-chain caption tracks the
  // splice. Positive assertion of the "test's effective predecessor
  // visually becomes install" claim from EDITOR-AC-015.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-035 — effective-chain caption shows full chain initially, splices out lint on toggle, restores on re-toggle', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const caption = screen.getByTestId('effective-chain-caption');
    // Initial: full chain in order, lint between install and test.
    expect(caption.textContent).toMatch(
      /install\s*→\s*lint\s*→\s*test\s*→\s*build\s*→\s*docker-build/,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Toggle lint enabled'));

    // After toggle: lint absent; install IMMEDIATELY followed by test.
    const after = screen.getByTestId('effective-chain-caption');
    expect(after.textContent).not.toMatch(/lint/);
    expect(after.textContent).toMatch(
      /install\s*→\s*test\s*→\s*build\s*→\s*docker-build/,
    );

    // Re-enable: caption returns to the original.
    await user.click(screen.getByLabelText('Toggle lint enabled'));
    expect(screen.getByTestId('effective-chain-caption').textContent).toMatch(
      /install\s*→\s*lint\s*→\s*test\s*→\s*build\s*→\s*docker-build/,
    );
  });

  it('T-EDITOR-035b — when every Stage is disabled the caption shows the empty-chain placeholder, not a Stage list', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const user = userEvent.setup();
    for (const stageId of ['install', 'lint', 'test', 'build', 'docker-build']) {
      await user.click(screen.getByLabelText(`Toggle ${stageId} enabled`));
    }

    const caption = screen.getByTestId('effective-chain-caption');
    expect(caption.className).toMatch(/effective-chain-caption--empty/);
    expect(caption.textContent).toMatch(/empty|nothing to run/i);
    // None of the canonical Stage IDs may appear in the empty caption.
    for (const stageId of ['install', 'lint', 'test', 'build', 'docker-build']) {
      expect(caption.textContent).not.toMatch(new RegExp(`\\b${stageId}\\b`));
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // T-EDITOR-024 (EDITOR-AC-024) — Loaded IR remains byte-equal pre- and
  // post-toggle.
  // ───────────────────────────────────────────────────────────────────────
  it('T-EDITOR-024 — Loaded IR snapshot is unchanged after toggling Stage.enabled', async () => {
    const ir = loadIr('node-pnpm-nest-basic');
    mockDetectFetch(ir);
    render(<Editor />);
    await runDetect();

    const before =
      (document.querySelector(
        '[data-testid="loaded-ir-digest"]',
      ) as HTMLElement).getAttribute('data-loaded-ir') ?? '';

    await userEvent.setup().click(screen.getByLabelText('Toggle lint enabled'));

    const after =
      (document.querySelector(
        '[data-testid="loaded-ir-digest"]',
      ) as HTMLElement).getAttribute('data-loaded-ir') ?? '';

    expect(after).toBe(before);
    expect(before.length).toBeGreaterThan(0);
  });
});

// Capture-next-download helper: intercepts the next URL.createObjectURL
// call, reads the Blob's content, and exposes it as a promise.
function captureNextDownload(): { content: () => Promise<string> } {
  let resolver: (s: string) => void;
  const done = new Promise<string>((res) => {
    resolver = res;
  });
  const original = URL.createObjectURL;
  URL.createObjectURL = ((blob: Blob): string => {
    void blob.text().then((text) => resolver(text));
    URL.createObjectURL = original;
    return 'blob:test';
  }) as typeof URL.createObjectURL;
  // No-op revoke so the URL above doesn't throw.
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  // jsdom treats anchor navigation as an unimplemented browser operation.
  // The download contract is the Blob payload, so keep the synthetic click
  // local and assert that payload without emitting a misleading test warning.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return { content: () => done };
}
