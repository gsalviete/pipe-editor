// DR-010 — Build Stage emission. `npm run build` (npm has no `build` alias).

import { Rule } from '../types';
import { isNonEmptyString, nodeImageFor, stepShape } from './helpers';

const BUILD_RUN_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'pnpm build',
  npm: 'npm run build',
  yarn: 'yarn build',
};

export const DR_010_BUILD: Rule = {
  id: 'DR-010',
  reads: ['package.json'],
  kind: 'stage',
  cases: (['pnpm', 'npm', 'yarn'] as const).map((pm) => ({
    condition: (ctx) =>
      isNonEmptyString(ctx.manifests['package.json']?.scripts?.build) &&
      ctx.ir.project.packageManager.name === pm,
    emit: (ctx) => ({
      kind: 'stage',
      stage: {
        id: 'build',
        name: 'Build',
        enabled: true,
        dependsOn: [],
        container: { image: nodeImageFor(ctx) },
        steps: [stepShape('build', BUILD_RUN_BY_PM[pm])],
      },
    }),
    confidence: 'high',
    onUncertainty: 'omit',
  })),
};
