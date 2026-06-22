// DR-011 — Docker Build Stage emission.

import { Rule } from '../types';
import { isNonEmptyString, stepShape } from './helpers';

export const DR_011_DOCKER_BUILD: Rule = {
  id: 'DR-011',
  reads: [],
  kind: 'stage',
  cases: [
    {
      condition: (ctx) =>
        ctx.ir.project.runtime.name === 'node' &&
        ctx.ir.project.packageManager.name !== null &&
        isNonEmptyString(ctx.ir.project.name),
      emit: (ctx) => ({
        kind: 'stage',
        stage: {
          id: 'docker-build',
          name: 'Docker Build',
          enabled: true,
          dependsOn: [],
          container: { image: 'docker:25' },
          steps: [stepShape('docker-build', `docker build -t ${ctx.ir.project.name}:ci .`)],
        },
      }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
  ],
};
