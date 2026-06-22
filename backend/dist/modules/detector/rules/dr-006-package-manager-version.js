"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_006_PACKAGE_MANAGER_VERSION = void 0;
const helpers_1 = require("./helpers");
const PM_FIELD_RE = /^(pnpm|npm|yarn)@(.+)$/;
exports.DR_006_PACKAGE_MANAGER_VERSION = {
    id: 'DR-006',
    reads: ['package.json'],
    kind: 'field',
    cases: [
        {
            condition: (ctx) => PM_FIELD_RE.test(ctx.manifests['package.json']?.packageManager ?? ''),
            emit: (ctx) => {
                const field = ctx.manifests['package.json'].packageManager;
                const m = field.match(PM_FIELD_RE);
                return { kind: 'field', target: '/project/packageManager/version', value: (0, helpers_1.extractMajor)(m[2]) };
            },
            confidence: 'high',
            onUncertainty: 'omit',
        },
        {
            condition: () => true,
            emit: () => ({ kind: 'field', target: '/project/packageManager/version', value: null }),
            confidence: 'medium',
            onUncertainty: 'needs-user-input',
            message: 'Could not determine package-manager version (packageManager field absent); please specify.',
        },
    ],
};
//# sourceMappingURL=dr-006-package-manager-version.js.map