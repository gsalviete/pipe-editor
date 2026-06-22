"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_FIELD_TARGETS = exports.CANONICAL_STAGE_IDS = exports.REQUIRED_NULLABLE_FIELDS = exports.ENUMERATED_MANIFEST_SET = void 0;
exports.ENUMERATED_MANIFEST_SET = [
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'nest-cli.json',
    'tsconfig.json',
];
exports.REQUIRED_NULLABLE_FIELDS = [
    '/project/language',
    '/project/runtime/name',
    '/project/runtime/version',
    '/project/packageManager/name',
    '/project/packageManager/version',
];
exports.CANONICAL_STAGE_IDS = [
    'install',
    'lint',
    'test',
    'build',
    'docker-build',
];
exports.ALLOWED_FIELD_TARGETS = [
    '/project/name',
    '/project/language',
    '/project/runtime/name',
    '/project/runtime/version',
    '/project/packageManager/name',
    '/project/packageManager/version',
];
//# sourceMappingURL=types.js.map