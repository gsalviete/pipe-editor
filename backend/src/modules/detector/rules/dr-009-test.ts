// DR-009 — Test Stage emission. `npm test` uses npm's special alias.

import { Rule } from '../types';
import { isNonEmptyString, nodeImageFor, stepShape } from './helpers';

const TEST_RUN_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'pnpm test',
  npm: 'npm test',
  yarn: 'yarn test',
};

export const DR_009_TEST: Rule = {
  id: 'DR-009',
  reads: ['package.json'],
  kind: 'stage',
  cases: (['pnpm', 'npm', 'yarn'] as const).map((pm) => ({
    condition: (ctx) =>
      isNonEmptyString(ctx.manifests['package.json']?.scripts?.test) &&
      ctx.ir.project.packageManager.name === pm,
    emit: (ctx) => ({
      kind: 'stage',
      stage: {
        id: 'test',
        name: 'Test',
        enabled: true,
        dependsOn: [],
        container: { image: nodeImageFor(ctx) },
        steps: [stepShape('test', TEST_RUN_BY_PM[pm])],
      },
    }),
    confidence: 'high',
    onUncertainty: 'omit',
  })),
};
