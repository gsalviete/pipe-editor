// CSS regression guard for the bug that was actually broken on screen
// (the runtime triage from 2026-06-22). The component tests
// (Editor.spec.tsx) cover DOM-class presence and effective-chain
// wiring; this file guards the *visual contract* of the three classes
// the user reads at a glance — disabled stage, out-of-chain stage,
// inactive connector. The original incident was a self-contradictory
// rule in `.chain-connector--inactive` (background: var(--border) then
// background: transparent on the next line, leaving an invisible
// connector). These assertions would have caught it.
//
// jsdom + getComputedStyle does not parse complex backgrounds well
// enough to assert visual outcomes; we therefore check the rule body
// text. Brittle on cosmetic rewrites, but that is exactly the point —
// any rewrite of these three classes MUST consciously revisit this
// test.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS_PATH = join(__dirname, 'editor.css');
const CSS = readFileSync(CSS_PATH, 'utf-8');

function ruleBody(selector: string): string {
  // Match `selector { …body… }` where the body has no nested braces.
  // The three classes we check are flat selectors with flat bodies.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm');
  const match = CSS.match(re);
  if (!match) throw new Error(`CSS rule "${selector}" not found`);
  return match[1].trim();
}

describe('editor.css — visual contract regressions', () => {
  it('chain-connector--inactive renders as visible (no transparent background, has a background fill, distinct from --active)', () => {
    const body = ruleBody('.chain-connector--inactive');
    // The original bug: `background: transparent` cancelled the rule's
    // earlier background. Forbid `transparent` anywhere in the inactive
    // rule body — we want SOMETHING rendered.
    expect(body).not.toMatch(/background\s*:\s*transparent/i);
    // Must declare a background (solid colour, gradient, image, etc.).
    expect(body).toMatch(/background(?:-image)?\s*:/i);
    // Active rule remains the live-chain signal — they must NOT be
    // byte-equivalent.
    const active = ruleBody('.chain-connector--active');
    expect(body).not.toBe(active);
  });

  it('stage-node--disabled is distinguishable from the enabled state by MORE than opacity (a non-color cue must be present)', () => {
    const body = ruleBody('.stage-node--disabled');
    // The original "too subtle" symptom was an opacity-only difference
    // on a dark theme. Require at least one structural cue beyond
    // opacity: a border change, font-style, text-decoration, or a
    // background fill.
    const nonOpacityCues = [
      /border(?:-style|-color|-width)?\s*:/i,
      /background(?:-color|-image)?\s*:/i,
      /font-style\s*:/i,
      /text-decoration\s*:/i,
    ];
    const hits = nonOpacityCues.filter((re) => re.test(body));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('disabled state carries a non-color cue (a11y — distinguishable without color perception)', () => {
    // Color alone (e.g. amber border) is not sufficient — somewhere in
    // the .stage-node--disabled cascade there must be a shape cue:
    // strike-through (text-decoration: line-through), italic
    // (font-style: italic), or a dash pattern (border-style: dashed).
    const cssLines = CSS.split('\n');
    // Skip the comment header — we want the actual CSS rule that
    // STARTS with `.stage-node--disabled`, not the docstring entry.
    const disabledBlockStart = cssLines.findIndex((l) =>
      /^\s*\.stage-node--disabled[\s,{]/.test(l),
    );
    expect(disabledBlockStart).toBeGreaterThan(-1);
    // Capture the disabled rule and any nested descendant rules
    // following it until the next top-level non-disabled selector.
    const region = cssLines.slice(disabledBlockStart, disabledBlockStart + 30).join('\n');
    const shapeCues = [
      /text-decoration\s*:\s*line-through/i,
      /font-style\s*:\s*italic/i,
      /border-style\s*:\s*dashed/i,
      /border\s*:\s*[^;]*dashed/i,
    ];
    const hits = shapeCues.filter((re) => re.test(region));
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('chain-connector base default is not invisible (sanity: default-class connector must show)', () => {
    const body = ruleBody('.chain-connector');
    // The base default must declare something that paints — background
    // or border. Otherwise a no-class connector vanishes too.
    expect(body).toMatch(/background(?:-image|-color)?\s*:|border\s*:/i);
    // Width must be > 0 (the bug-adjacent failure mode: width:0 + only
    // a border-left of 2px rendered something but was easy to miss).
    expect(body).toMatch(/width\s*:\s*[1-9]/);
  });
});
