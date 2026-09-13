// DR-004 — Runtime version (major only).
//
// Evidence order (see docs/rules/detection-rules.md and ADR-0011):
//   1. package.json `engines.node`  — the declared supported range
//   2. package.json `volta.node`    — a Volta pin
//   3. `.nvmrc`                     — an nvm pin
//   4. `.node-version`              — the nodenv/asdf convention
// `engines.node` stays first so every previously detected project keeps
// the exact version it had; the three additions only fire where DR-004
// previously produced an unresolved entry.

import { Rule, RuleCtx } from '../types';
import { extractMajor, isNonEmptyString, majorFromVersionText } from './helpers';

function voltaNode(ctx: RuleCtx): string | undefined {
  return ctx.manifests['package.json']?.volta?.node;
}

// A version *file* is only evidence when it names a concrete version;
// `lts/hydrogen`, `node` and `stable` are aliases DR-004 cannot resolve
// without a network lookup, so they stay unresolved.
function fileMajor(ctx: RuleCtx, file: '.nvmrc' | '.node-version'): string | null {
  const raw = ctx.manifests[file]?.raw;
  return isNonEmptyString(raw) ? majorFromVersionText(raw) : null;
}

export const DR_004_RUNTIME_VERSION: Rule = {
  id: 'DR-004',
  reads: ['package.json', '.nvmrc', '.node-version'],
  kind: 'field',
  cases: [
    {
      condition: (ctx) => isNonEmptyString(ctx.manifests['package.json']?.engines?.node),
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/runtime/version',
        value: extractMajor(ctx.manifests['package.json']!.engines!.node as string),
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => {
        const v = voltaNode(ctx);
        return isNonEmptyString(v) && majorFromVersionText(v) !== null;
      },
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/runtime/version',
        value: majorFromVersionText(voltaNode(ctx) as string),
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => fileMajor(ctx, '.nvmrc') !== null,
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/runtime/version',
        value: fileMajor(ctx, '.nvmrc'),
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => fileMajor(ctx, '.node-version') !== null,
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/runtime/version',
        value: fileMajor(ctx, '.node-version'),
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/runtime/version', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message:
        'Could not determine Node version (no engines.node, volta.node, .nvmrc or .node-version); set it in the Project panel or declare one of them.',
    },
  ],
};
