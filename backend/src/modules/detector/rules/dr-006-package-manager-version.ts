// DR-006 — Package manager version (major only, from packageManager field).

import { Rule } from '../types';
import { extractMajor } from './helpers';

const PM_FIELD_RE = /^(pnpm|npm|yarn)@(.+)$/;

export const DR_006_PACKAGE_MANAGER_VERSION: Rule = {
  id: 'DR-006',
  reads: ['package.json'],
  kind: 'field',
  cases: [
    {
      condition: (ctx) => PM_FIELD_RE.test(ctx.manifests['package.json']?.packageManager ?? ''),
      emit: (ctx) => {
        const field = ctx.manifests['package.json']!.packageManager as string;
        const m = field.match(PM_FIELD_RE)!;
        return { kind: 'field', target: '/project/packageManager/version', value: extractMajor(m[2]) };
      },
      confidence: 'high',
      onUncertainty: 'omit',
    },
    {
      condition: () => true,
      emit: () => ({ kind: 'field', target: '/project/packageManager/version', value: null }),
      confidence: 'medium',
      onUncertainty: 'needs-user-input',
      message: 'Could not determine package-manager version (packageManager field absent); please specify.',
    },
  ],
};
