"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envelope = envelope;
exports.httpError = httpError;
const common_1 = require("@nestjs/common");
function envelope(code, message, detail) {
    return detail === undefined
        ? { error: { code, message } }
        : { error: { code, message, detail } };
}
function httpError(status, code, message, detail) {
    return new common_1.HttpException(envelope(code, message, detail), status);
}
//# sourceMappingURL=http-errors.js.map