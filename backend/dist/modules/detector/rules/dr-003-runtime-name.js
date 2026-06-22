"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_003_RUNTIME_NAME = void 0;
exports.DR_003_RUNTIME_NAME = {
    id: 'DR-003',
    reads: ['package.json'],
    kind: 'field',
    cases: [
        {
            condition: (ctx) => ctx.manifests['package.json'] !== undefined,
            emit: () => ({ kind: 'field', target: '/project/runtime/name', value: 'node' }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
        {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/runtime/name', value: null }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Could not determine project runtime; please specify (v1 supports: node).',
        },
    ],
};
//# sourceMappingURL=dr-003-runtime-name.js.map