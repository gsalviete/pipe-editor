"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_001_PROJECT_NAME = void 0;
const path_1 = require("path");
const helpers_1 = require("./helpers");
exports.DR_001_PROJECT_NAME = {
    id: 'DR-001',
    reads: ['package.json'],
    kind: 'field',
    cases: [
        {
            condition: (ctx) => (0, helpers_1.isNonEmptyString)(ctx.manifests['package.json']?.name),
            emit: (ctx) => ({
                kind: 'field',
                target: '/project/name',
                value: ctx.manifests['package.json'].name,
            }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
        {
            condition: () => true,
            emit: (ctx) => ({
                kind: 'field',
                target: '/project/name',
                value: (0, path_1.basename)(ctx.rootPath),
            }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
    ],
};
//# sourceMappingURL=dr-001-project-name.js.map