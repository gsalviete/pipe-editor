"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_002_LANGUAGE = void 0;
exports.DR_002_LANGUAGE = {
    id: 'DR-002',
    reads: ['package.json', 'tsconfig.json'],
    kind: 'field',
    cases: [
        {
            condition: (ctx) => ctx.manifests['tsconfig.json'] !== undefined,
            emit: () => ({ kind: 'field', target: '/project/language', value: 'typescript' }),
            confidence: 'high',
            onUncertainty: 'omit',
        },
        {
            condition: (ctx) => ctx.manifests['package.json'] !== undefined &&
                ctx.manifests['tsconfig.json'] === undefined,
            emit: () => ({ kind: 'field', target: '/project/language', value: 'javascript' }),
            confidence: 'medium',
            onUncertainty: 'assume-default',
            default: 'javascript',
        },
        {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/language', value: null }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Could not determine project language; please specify (e.g. typescript, javascript).',
        },
    ],
};
//# sourceMappingURL=dr-002-language.js.map