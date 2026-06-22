"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_010_BUILD = void 0;
const helpers_1 = require("./helpers");
const BUILD_RUN_BY_PM = {
    pnpm: 'pnpm build',
    npm: 'npm run build',
    yarn: 'yarn build',
};
exports.DR_010_BUILD = {
    id: 'DR-010',
    reads: ['package.json'],
    kind: 'stage',
    cases: ['pnpm', 'npm', 'yarn'].map((pm) => ({
        condition: (ctx) => (0, helpers_1.isNonEmptyString)(ctx.manifests['package.json']?.scripts?.build) &&
            ctx.ir.project.packageManager.name === pm,
        emit: (ctx) => ({
            kind: 'stage',
            stage: {
                id: 'build',
                name: 'Build',
                enabled: true,
                dependsOn: [],
                container: { image: (0, helpers_1.nodeImageFor)(ctx) },
                steps: [(0, helpers_1.stepShape)('build', BUILD_RUN_BY_PM[pm])],
            },
        }),
        confidence: 'high',
        onUncertainty: 'omit',
    })),
};
//# sourceMappingURL=dr-010-build.js.map