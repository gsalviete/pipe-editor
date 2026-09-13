// Visual-contract regressions, asserted against the CASCADE (FE-06).
//
// History: this suite was written after a real incident (2026-06-22) in
// which `.chain-connector--inactive` declared `background: var(--border)`
// and then `background: transparent` on the next line, leaving an invisible
// connector. The original version guarded it by matching rule-body TEXT,
// with a header explaining that jsdom could not compute the properties.
//
// That assumption turns out to be wrong. The adversarial review's **FE-06**
// says these assertions "lock strings, break on cosmetic refactors, and
// prove nothing about rendering", and the right answer is the one it
// suggests: a computed-style check. jsdom does apply an injected stylesheet
// and does resolve class and descendant selectors, element widths, and
// backgrounds — enough to assert what the cascade actually produces for a
// real element.
//
// So these tests now build the DOM the editor builds, apply the real
// stylesheet, and read `getComputedStyle`. A cosmetic rewrite that keeps
// the behaviour now passes; one that reintroduces the invisible connector
// still fails.
//
// The remaining limitation is honest and narrow: jsdom leaves `var()`
// references unresolved and does not expand the `border` shorthand into its
// longhands. Assertions below are written to hold regardless — they compare
// values against each other rather than against a resolved colour.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(join(__dirname, 'editor.css'), 'utf-8');

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Mount an element with the given classes and return its computed style. */
function mount(className: string, children: string[] = []): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  for (const childClass of children) {
    const child = document.createElement('span');
    child.className = childClass;
    el.appendChild(child);
  }
  document.body.appendChild(el);
  return el;
}

describe('editor.css — the cascade, not the file', () => {
  it('an inactive connector still paints, and differs from an active one', () => {
    const base = getComputedStyle(mount('chain-connector'));
    const inactive = getComputedStyle(mount('chain-connector chain-connector--inactive'));
    const active = getComputedStyle(mount('chain-connector chain-connector--active'));

    // The 2026-06-22 bug exactly: the inactive variant computed to a
    // transparent background and vanished.
    expect(inactive.background).not.toBe('');
    expect(inactive.background).not.toBe('transparent');
    expect(inactive.background).not.toBe('none');

    // It must read as a DIFFERENT thing from a live link, or the splice
    // is invisible to the user (EDITOR-UI-FR-006's first layer).
    expect(inactive.background).not.toBe(active.background);
    expect(inactive.background).not.toBe(base.background);
  });

  it('a connector with no modifier is not invisible', () => {
    const base = getComputedStyle(mount('chain-connector'));
    expect(parseFloat(base.width)).toBeGreaterThan(0);
    expect(parseFloat(base.height)).toBeGreaterThan(0);
    expect(base.background).not.toBe('');
    expect(base.background).not.toBe('transparent');
  });

  it('a disabled stage differs from an enabled one by more than opacity', () => {
    const enabled = getComputedStyle(mount('stage-node'));
    const disabled = getComputedStyle(mount('stage-node stage-node--disabled'));

    expect(disabled.opacity).not.toBe(enabled.opacity);
    expect(parseFloat(disabled.opacity)).toBeLessThan(1);

    // The original "too subtle" symptom was an opacity-only difference on
    // a dark theme. At least two further cues must actually compute.
    const cues = [
      disabled.border !== enabled.border,
      disabled.background !== enabled.background,
      disabled.color !== enabled.color,
    ].filter(Boolean);
    expect(cues.length).toBeGreaterThanOrEqual(2);
  });

  it('a disabled stage carries a cue that survives without colour perception', () => {
    // Colour alone is not an accessible signal. The id badge is struck
    // through, which is a shape cue — and jsdom computes it through the
    // descendant selector, so this is the real cascade, not a grep.
    const node = mount('stage-node stage-node--disabled', ['stage-node__id']);
    const badge = node.querySelector('.stage-node__id') as HTMLElement;
    expect(getComputedStyle(badge).textDecoration).toContain('line-through');
  });

  // The one cue the cascade cannot answer for us. `.stage-node--disabled`
  // declares `border: 1px dashed var(--warn)`, and jsdom refuses to compute
  // a shorthand containing a `var()` reference — it returns the initial
  // value. So the dashed border is still checked as text, deliberately and
  // in isolation, rather than the whole suite being written that way.
  it('the disabled border is dashed (source check — jsdom cannot compute a var() shorthand)', () => {
    const rule = /\.stage-node--disabled\s*\{([^}]*)\}/.exec(CSS);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/border\s*:[^;]*dashed/);
  });

  it('the enabled state has no strike-through to confuse it with disabled', () => {
    const node = mount('stage-node', ['stage-node__id']);
    const badge = node.querySelector('.stage-node__id') as HTMLElement;
    expect(getComputedStyle(badge).textDecoration).not.toContain('line-through');
  });
});
