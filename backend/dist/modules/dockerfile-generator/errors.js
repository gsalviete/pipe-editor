"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsupportedRuntimeError = void 0;
const types_1 = require("./types");
class UnsupportedRuntimeError extends Error {
    constructor(actual) {
        super(`Dockerfile Generator v1 only supports runtimes { ${types_1.SUPPORTED_RUNTIMES.join(', ')} }; ` +
            `got ${JSON.stringify(actual)} at ${'/project/runtime/name'}`);
        this.path = '/project/runtime/name';
        this.name = 'UnsupportedRuntimeError';
    }
}
exports.UnsupportedRuntimeError = UnsupportedRuntimeError;
//# sourceMappingURL=errors.js.map