"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_KEYS = exports.REQUIRED_NULLABLE_FIELDS = void 0;
exports.REQUIRED_NULLABLE_FIELDS = [
    '/project/language',
    '/project/runtime/name',
    '/project/runtime/version',
    '/project/packageManager/name',
    '/project/packageManager/version',
];
exports.FORBIDDEN_KEYS = [
    'jobs',
    'uses',
    'needs',
    'runs-on',
    'with',
    'permissions',
    'include',
    'workflow_dispatch',
];
//# sourceMappingURL=types.js.map