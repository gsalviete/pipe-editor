// DR-002 — Language detection.
// Target: /project/language (required nullable).

import { Rule } from '../types';

export const DR_002_LANGUAGE: Rule = {
  id: 'DR-002',
  reads: ['package.json', 'tsconfig.json'],
  kind: 'field',
  cases: [
    // Case 1 — TypeScript via tsconfig.json
    {
      condition: (ctx) => ctx.manifests['tsconfig.json'] !== undefined,
      emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    // Case 2 — JavaScript by inference (assume-default)
    {
      condition: (ctx) =>
        ctx.manifests['package.json'] !== undefined &&
        ctx.manifests['tsconfig.json'] === undefined,
      emit: () => ({ kind: 'field', target: '/project/language', value: 'javascript' }),
      confidence: 'medium',
      onUncertainty: 'assume-default',
      default: 'javascript',
    },
    // Case 3 — Catch-all (required-field collapse)
    {
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/language', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message: 'Could not determine project language; please specify (e.g. typescript, javascript).',
    },
  ],
};
