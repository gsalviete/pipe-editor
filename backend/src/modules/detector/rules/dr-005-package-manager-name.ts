// DR-005 — Package manager name (with lockfile precedence).
// Cases in declared order; first match wins.

import { Rule } from '../types';

function packageManagerField(ctx: { manifests: { 'package.json'?: { packageManager?: string } } }): string | undefined {
  return ctx.manifests['package.json']?.packageManager;
}

export const DR_005_PACKAGE_MANAGER_NAME: Rule = {
  id: 'DR-005',
  reads: ['package.json', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'],
  kind: 'field',
  cases: [
    {
      condition: (ctx) => /^pnpm@/.test(packageManagerField(ctx) ?? ''),
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'pnpm' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => /^npm@/.test(packageManagerField(ctx) ?? ''),
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'npm' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => /^yarn@/.test(packageManagerField(ctx) ?? ''),
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'yarn' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => ctx.manifests['pnpm-lock.yaml'] !== undefined,
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'pnpm' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => ctx.manifests['yarn.lock'] !== undefined,
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'yarn' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: (ctx) => ctx.manifests['package-lock.json'] !== undefined,
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: 'npm' }),
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/packageManager/name', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message:
        'Could not determine package manager (no lockfile and no packageManager field); please specify (npm | pnpm | yarn).',
    },
  ],
};
