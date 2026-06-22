"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_007_INSTALL = void 0;
const helpers_1 = require("./helpers");
const INSTALL_RUN_BY_PM = {
    pnpm: 'corepack enable && pnpm install --frozen-lockfile',
    npm: 'npm ci',
    yarn: 'corepack enable && yarn install --frozen-lockfile',
};
exports.DR_007_INSTALL = {
    id: 'DR-007',
    reads: ['package.json'],
    kind: 'stage',
    cases: ['pnpm', 'npm', 'yarn'].map((pm) => ({
        condition: (ctx) => ctx.ir.project.packageManager.name === pm,
        emit: (ctx) => ({
            kind: 'stage',
            stage: {
                id: 'install',
                name: 'Install',
                enabled: true,
                dependsOn: [],
                container: { image: (0, helpers_1.nodeImageFor)(ctx) },
                steps: [(0, helpers_1.stepShape)('install-deps', INSTALL_RUN_BY_PM[pm])],
            },
        }),
        confidence: 'high',
        onUncertainty: 'omit',
    })),
};
//# sourceMappingURL=dr-007-install.js.map