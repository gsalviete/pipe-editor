"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_008_LINT = void 0;
const helpers_1 = require("./helpers");
const LINT_RUN_BY_PM = {
    pnpm: 'pnpm lint',
    npm: 'npm run lint',
    yarn: 'yarn lint',
};
exports.DR_008_LINT = {
    id: 'DR-008',
    reads: ['package.json'],
    kind: 'stage',
    cases: ['pnpm', 'npm', 'yarn'].map((pm) => ({
        condition: (ctx) => (0, helpers_1.isNonEmptyString)(ctx.manifests['package.json']?.scripts?.lint) &&
            ctx.ir.project.packageManager.name === pm,
        emit: (ctx) => ({
            kind: 'stage',
            stage: {
                id: 'lint',
                name: 'Lint',
                enabled: true,
                dependsOn: [],
                container: { image: (0, helpers_1.nodeImageFor)(ctx) },
                steps: [(0, helpers_1.stepShape)('lint', LINT_RUN_BY_PM[pm])],
            },
        }),
        confidence: 'high',
        onUncertainty: 'omit',
    })),
};
//# sourceMappingURL=dr-008-lint.js.map