// DR-008 — Lint Stage emission.

import { Rule } from '../types';
import { isNonEmptyString, nodeImageFor, stepShape } from './helpers';

const LINT_RUN_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'pnpm lint',
  npm: 'npm run lint',
  yarn: 'yarn lint',
};

export const DR_008_LINT: Rule = {
  id: 'DR-008',
  reads: ['package.json'],
  kind: 'stage',
  cases: (['pnpm', 'npm', 'yarn'] as const).map((pm) => ({
    condition: (ctx) =>
      isNonEmptyString(ctx.manifests['package.json']?.scripts?.lint) &&
      ctx.ir.project.packageManager.name === pm,
    emit: (ctx) => ({
      kind: 'stage',
      stage: {
        id: 'lint',
        name: 'Lint',
        enabled: true,
        dependsOn: [],
        container: { image: nodeImageFor(ctx) },
        steps: [stepShape('lint', LINT_RUN_BY_PM[pm])],
      },
    }),
    confidence: 'high',
    onUncertainty: 'omit',
  })),
};
