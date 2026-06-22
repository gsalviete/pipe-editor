// DR-003 — Runtime name.

import { Rule } from '../types';

export const DR_003_RUNTIME_NAME: Rule = {
  id: 'DR-003',
  reads: ['package.json'],
  kind: 'field',
  cases: [
    {
      condition: (ctx) => ctx.manifests['package.json'] !== undefined,
      emit: () => ({ kind: 'field', target: '/project/runtime/name', value: 'node' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/runtime/name', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message: 'Could not determine project runtime; please specify (v1 supports: node).',
    },
  ],
};
