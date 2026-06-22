"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_011_DOCKER_BUILD = void 0;
const helpers_1 = require("./helpers");
exports.DR_011_DOCKER_BUILD = {
    id: 'DR-011',
    reads: [],
    kind: 'stage',
    cases: [
        {
            condition: (ctx) => ctx.ir.project.runtime.name === 'node' &&
                ctx.ir.project.packageManager.name !== null &&
                (0, helpers_1.isNonEmptyString)(ctx.ir.project.name),
            emit: (ctx) => ({
                kind: 'stage',
                stage: {
                    id: 'docker-build',
                    name: 'Docker Build',
                    enabled: true,
                    dependsOn: [],
                    container: { image: 'docker:25' },
                    steps: [(0, helpers_1.stepShape)('docker-build', `docker build -t ${ctx.ir.project.name}:ci .`)],
                },
            }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
    ],
};
//# sourceMappingURL=dr-011-docker-build.js.map