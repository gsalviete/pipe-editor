// T-DET-021 (DET-AC-021) — the detection-rules catalogue is enforced.
//
// docs/rules/detection-rules.md describes DR-001…011: their ids, what each
// reads, and what each targets. Nothing asserted that the document matched
// the code, so the catalogue was unverified prose that could drift away
// from ALL_RULES without anything noticing (adversarial review SDD-05).
//
// This test makes the document self-enforcing in both directions: every
// documented rule is registered, every registered rule is documented, and
// the `Reads` and `Target` lines agree with the rule objects.

import { readFileSync } from 'fs';
import { join } from 'path';
import { ALL_RULES } from './index';
import { ALLOWED_FIELD_TARGETS, CANONICAL_STAGE_IDS, ENUMERATED_MANIFEST_SET } from '../types';

const CATALOGUE = join(
  __dirname, '..', '..', '..', '..', '..', 'docs', 'rules', 'detection-rules.md',
);

const catalogue = readFileSync(CATALOGUE, 'utf-8');

/** Every `### DR-NNN — Title` heading in the catalogue, in document order. */
function documentedRuleIds(): string[] {
  return [...catalogue.matchAll(/^### (DR-\d{3}) — /gm)].map((m) => m[1]);
}

/** The `| Reads | … |` row of a rule's header table. */
function documentedSection(ruleId: string): string {
  const start = catalogue.indexOf(`### ${ruleId} — `);
  expect(start).toBeGreaterThan(-1);
  const next = catalogue.indexOf('\n### DR-', start + 1);
  return catalogue.slice(start, next === -1 ? undefined : next);
}

describe('T-DET-021 (DET-AC-021) — ALL_RULES matches the documented catalogue', () => {
  it('every documented rule id is registered', () => {
    const registered = new Set(ALL_RULES.map((r) => r.id));
    for (const id of documentedRuleIds()) {
      expect(registered.has(id)).toBe(true);
    }
  });

  it('every registered rule id is documented', () => {
    const documented = new Set(documentedRuleIds());
    for (const rule of ALL_RULES) {
      expect(documented.has(rule.id)).toBe(true);
    }
  });

  it('the two lists are the same list, in the same order', () => {
    expect(ALL_RULES.map((r) => r.id)).toEqual(documentedRuleIds());
  });

  it('rule ids are unique and sequential from DR-001', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id, i) => {
      expect(id).toBe(`DR-${String(i + 1).padStart(3, '0')}`);
    });
  });

  it.each(ALL_RULES.map((r) => [r.id, r] as const))(
    "%s's documented Reads row lists exactly what the rule declares",
    (id, rule) => {
      const section = documentedSection(id);
      const readsRow = /^\| Reads \| (.+) \|$/m.exec(section);
      expect(readsRow).not.toBeNull();
      // Stage rules document two things in one cell: the manifests they
      // read, and the in-progress `/project/*` state they consult. Only
      // the first half corresponds to `rule.reads` — `/project/*` is
      // freely readable by contract (DET-FR-015) and is not declared.
      const manifestHalf = readsRow![1].split('plus in-progress IR')[0];
      const tokens = [...manifestHalf.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

      // The cell also backticks the field a rule looks at, e.g.
      // "`package.json` (for `scripts.lint`)". Split the tokens into
      // manifest names and everything else, and require that nothing
      // file-shaped is left over — so a row naming a manifest that does
      // not exist fails rather than being quietly ignored.
      const manifests = tokens.filter((t) =>
        (ENUMERATED_MANIFEST_SET as readonly string[]).includes(t),
      );
      const strays = tokens.filter(
        (t) =>
          !(ENUMERATED_MANIFEST_SET as readonly string[]).includes(t) &&
          (t.startsWith('.') || /\.(json|ya?ml|lock)$/.test(t)),
      );
      expect(strays).toEqual([]);
      expect([...manifests].sort()).toEqual([...rule.reads].sort());
    },
  );

  it.each(ALL_RULES.filter((r) => r.kind === 'field').map((r) => [r.id, r] as const))(
    "%s's documented Target is an allowed field target",
    (id) => {
      const section = documentedSection(id);
      const targetRow = /^\| Target \| `([^`]+)`/m.exec(section);
      expect(targetRow).not.toBeNull();
      expect(ALLOWED_FIELD_TARGETS as readonly string[]).toContain(targetRow![1]);
    },
  );

  it('every declared read is inside the enumerated manifest set', () => {
    for (const rule of ALL_RULES) {
      for (const manifest of rule.reads) {
        expect(ENUMERATED_MANIFEST_SET).toContain(manifest);
      }
    }
  });

  it('every stage rule emits a canonical stage id named in its heading', () => {
    const stageRules = ALL_RULES.filter((r) => r.kind === 'stage');
    expect(stageRules.length).toBeGreaterThan(0);
    for (const rule of stageRules) {
      const heading = /^### DR-\d{3} — (.+)$/m.exec(documentedSection(rule.id))![1];
      const named = (CANONICAL_STAGE_IDS as readonly string[]).filter((stageId) =>
        heading.toLowerCase().includes(stageId.replace('-', ' ')) ||
        heading.toLowerCase().includes(stageId),
      );
      expect(named.length).toBeGreaterThan(0);
    }
  });
});
