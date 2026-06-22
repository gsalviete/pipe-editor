// DR-004 — Runtime version (engines.node, major only).

import { Rule } from '../types';
import { extractMajor, isNonEmptyString } from './helpers';

export const DR_004_RUNTIME_VERSION: Rule = {
  id: 'DR-004',
  reads: ['package.json'],
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
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/runtime/version', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message: 'Could not determine Node version (engines.node not declared); please specify.',
    },
  ],
};
