"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_009_TEST = void 0;
const helpers_1 = require("./helpers");
const TEST_RUN_BY_PM = {
    pnpm: 'pnpm test',
    npm: 'npm test',
    yarn: 'yarn test',
};
exports.DR_009_TEST = {
    id: 'DR-009',
    reads: ['package.json'],
    kind: 'stage',
    cases: ['pnpm', 'npm', 'yarn'].map((pm) => ({
        condition: (ctx) => (0, helpers_1.isNonEmptyString)(ctx.manifests['package.json']?.scripts?.test) &&
            ctx.ir.project.packageManager.name === pm,
        emit: (ctx) => ({
            kind: 'stage',
            stage: {
                id: 'test',
                name: 'Test',
                enabled: true,
                dependsOn: [],
                container: { image: (0, helpers_1.nodeImageFor)(ctx) },
                steps: [(0, helpers_1.stepShape)('test', TEST_RUN_BY_PM[pm])],
            },
        }),
        confidence: 'high',
        onUncertainty: 'omit',
    })),
};
//# sourceMappingURL=dr-009-test.js.map