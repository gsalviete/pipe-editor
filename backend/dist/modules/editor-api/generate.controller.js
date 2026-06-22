"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const dockerfile_generator_1 = require("../dockerfile-generator");
const ir_1 = require("../ir");
const http_errors_1 = require("./http-errors");
const ALLOWED_FIELDS = ['ir'];
function findUnresolvedRequiredField(ir) {
    if (ir.project?.packageManager?.name == null)
        return '/project/packageManager/name';
    if (ir.project?.runtime?.version == null)
        return '/project/runtime/version';
    return null;
}
let GenerateController = class GenerateController {
    generate(body) {
        if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
            throw (0, http_errors_1.httpError)(400, 'INVALID_IR', 'Request body must be a JSON object with a single ir field.');
        }
        const extras = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
        if (extras.length > 0) {
            throw (0, http_errors_1.httpError)(400, 'INVALID_IR', `Unexpected fields in request body: ${extras.join(', ')}.`);
        }
        if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
            throw (0, http_errors_1.httpError)(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
        }
        const validationErrors = (0, ir_1.validate)(body.ir);
        if (validationErrors.length > 0) {
            throw (0, http_errors_1.httpError)(400, 'INVALID_IR', 'Supplied IR failed validate().', validationErrors);
        }
        const ir = body.ir;
        const unresolvedField = findUnresolvedRequiredField(ir);
        if (unresolvedField !== null) {
            throw (0, http_errors_1.httpError)(422, 'UNRESOLVED_REQUIRED_FIELD', `Required field ${unresolvedField} is unresolved; resolve it before generating.`, { field: unresolvedField });
        }
        try {
            const { dockerfile, dockerignore } = (0, dockerfile_generator_1.generate)(ir);
            return { dockerfile, dockerignore };
        }
        catch (err) {
            if (err instanceof dockerfile_generator_1.UnsupportedRuntimeError) {
                throw (0, http_errors_1.httpError)(422, 'UNSUPPORTED_RUNTIME', err.message, {
                    field: '/project/runtime/name',
                    supported: ['node'],
                });
            }
            throw (0, http_errors_1.httpError)(500, 'INTERNAL_GENERATOR_DEFECT', err.message ?? 'Unknown generator error.');
        }
    }
};
exports.GenerateController = GenerateController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Generate a Dockerfile and .dockerignore from a (possibly edited) PipelineIR. Read-only — no server-side disk writes.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GenerateController.prototype, "generate", null);
exports.GenerateController = GenerateController = __decorate([
    (0, swagger_1.ApiTags)('Editor'),
    (0, common_1.Controller)('api')
], GenerateController);
//# sourceMappingURL=generate.controller.js.map