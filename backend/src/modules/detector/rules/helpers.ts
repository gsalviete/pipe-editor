// Helpers shared by DR-NNN rules.

import { Step } from '../../ir';
import { RuleCtx } from '../types';

export function extractMajor(version: string): string {
  // Strip a leading `>=`, `^`, `~`, `v`, or whitespace; take the first run of digits.
  const m = version.match(/(\d+)/);
  return m === null ? version : m[1];
}

/**
 * Major version from a free-text version pin, or null when the text names
 * no concrete version. Unlike `extractMajor` this REJECTS input that does
 * not start with a version-ish token, so nvm aliases (`lts/hydrogen`,
 * `node`, `stable`) become "no evidence" rather than a bogus version that
 * would be interpolated straight into a `node:<v>-alpine` image tag.
 */
export function majorFromVersionText(raw: string): string | null {
  const trimmed = raw.trim();
  // Strip a leading range operator or `v` prefix, then require digits.
  const m = trimmed.match(/^(?:[>=<~^]=?|v)?\s*(\d+)(?:[.\-+a-zA-Z0-9]*)?$/);
  return m === null ? null : m[1];
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
