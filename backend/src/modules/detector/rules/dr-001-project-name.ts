// DR-001 — Project name.
// Target: /project/name. Always emits at confidence:high.

import { basename } from 'path';
import { Rule } from '../types';
import { isNonEmptyString } from './helpers';

export const DR_001_PROJECT_NAME: Rule = {
  id: 'DR-001',
  reads: ['package.json'],
  kind: 'field',
  cases: [
    // Case 1 — From package.json.name
    {
      condition: (ctx) => isNonEmptyString(ctx.manifests['package.json']?.name),
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/name',
        value: ctx.manifests['package.json']!.name as string,
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    // Case 2 — From rootPath basename
    {
      condition: () => true,
      emit: (ctx) => ({
        kind: 'field',
        target: '/project/name',
        value: basename(ctx.rootPath),
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
  ],
};
