// Helpers shared by DR-NNN rules.

import { majorFromVersionText, Step } from '../../ir';

// DR-004's evidence test is the IR's own value-shape rule; re-exported here
// so rule modules keep importing their helpers from one place.
export { majorFromVersionText };
import { RuleCtx } from '../types';

export function extractMajor(version: string): string {
  // Strip a leading `>=`, `^`, `~`, `v`, or whitespace; take the first run of digits.
  const m = version.match(/(\d+)/);
  return m === null ? version : m[1];
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function nodeImageFor(ctx: RuleCtx): string {
  const v = ctx.ir.project.runtime.version;
  return v === null ? 'node:lts-alpine' : `node:${v}-alpine`;
}

export function stepShape(id: string, run: string): Step {
  return { id, run, workingDir: '.', env: {} };
}
