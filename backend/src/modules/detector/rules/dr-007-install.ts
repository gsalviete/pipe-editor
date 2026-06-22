// DR-007 — Install Stage emission.
// Cross-cuts DET-FR-018(b): MUST fire at confidence:high when PM is known.

import { Rule } from '../types';
import { nodeImageFor, stepShape } from './helpers';

const INSTALL_RUN_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'corepack enable && pnpm install --frozen-lockfile',
  npm: 'npm ci',
  yarn: 'corepack enable && yarn install --frozen-lockfile',
};

export const DR_007_INSTALL: Rule = {
  id: 'DR-007',
  reads: ['package.json'],
  kind: 'stage',
  cases: (['pnpm', 'npm', 'yarn'] as const).map((pm) => ({
    condition: (ctx) => ctx.ir.project.packageManager.name === pm,
    emit: (ctx) => ({
      kind: 'stage',
      stage: {
        id: 'install',
        name: 'Install',
        enabled: true,
        dependsOn: [],
        container: { image: nodeImageFor(ctx) },
        steps: [stepShape('install-deps', INSTALL_RUN_BY_PM[pm])],
      },
    }),
    confidence: 'high',
    onUncertainty: 'omit',
  })),
};
