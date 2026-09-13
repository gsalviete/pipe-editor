// DR-007 — Install Stage emission.
// Cross-cuts DET-FR-018(b): MUST fire at confidence:high when PM is known.
//
// GEN-04 — the install command depends on whether the lockfile the package
// manager would freeze against actually exists. DR-005 resolves the package
// manager from `packageManager` *before* consulting lockfiles, so
// `packageManager: "pnpm@9"` with no `pnpm-lock.yaml` used to produce
// `pnpm install --frozen-lockfile` — a command that fails by definition —
// and the tool presented it as a finished artifact.

import { ManifestPath, Rule, RuleCtx } from '../types';
import { nodeImageFor, stepShape } from './helpers';

const LOCKFILE_BY_PM: Record<'pnpm' | 'npm' | 'yarn', ManifestPath> = {
  pnpm: 'pnpm-lock.yaml',
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
};

/** The install a lockfile makes reproducible. */
const FROZEN_INSTALL_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'corepack enable && pnpm install --frozen-lockfile',
  npm: 'npm ci',
  yarn: 'corepack enable && yarn install --frozen-lockfile',
};

/**
 * The install to use when the lockfile is absent.
 *
 * `npm ci` and `--frozen-lockfile` do not merely resolve loosely without a
 * lockfile — they abort. Emitting a resolving install is the only command
 * that can run at all; the accompanying detector warning says the build is
 * not reproducible until a lockfile is committed.
 */
const RESOLVING_INSTALL_BY_PM: Record<'pnpm' | 'npm' | 'yarn', string> = {
  pnpm: 'corepack enable && pnpm install',
  npm: 'npm install',
  yarn: 'corepack enable && yarn install',
};

export function hasLockfileFor(ctx: RuleCtx, pm: 'pnpm' | 'npm' | 'yarn'): boolean {
  return ctx.manifests[LOCKFILE_BY_PM[pm]] !== undefined;
}

export const DR_007_INSTALL: Rule = {
  id: 'DR-007',
  reads: ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'],
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
        steps: [
          stepShape(
            'install-deps',
            hasLockfileFor(ctx, pm)
              ? FROZEN_INSTALL_BY_PM[pm]
              : RESOLVING_INSTALL_BY_PM[pm],
          ),
        ],
      },
    }),
    confidence: 'high',
    onUncertainty: 'omit',
  })),
};
