"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_004_RUNTIME_VERSION = void 0;
const helpers_1 = require("./helpers");
exports.DR_004_RUNTIME_VERSION = {
    id: 'DR-004',
    reads: ['package.json'],
    kind: 'field',
    cases: [
        {
            condition: (ctx) => (0, helpers_1.isNonEmptyString)(ctx.manifests['package.json']?.engines?.node),
            emit: (ctx) => ({
                kind: 'field',
                target: '/project/runtime/version',
                value: (0, helpers_1.extractMajor)(ctx.manifests['package.json'].engines.node),
            }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
        {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/runtime/version', value: null }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Could not determine Node version (engines.node not declared); please specify.',
        },
    ],
};
//# sourceMappingURL=dr-004-runtime-version.js.map