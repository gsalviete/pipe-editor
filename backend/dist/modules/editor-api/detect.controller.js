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
exports.DetectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const detector_1 = require("../detector");
const http_errors_1 = require("./http-errors");
const path_security_1 = require("./path-security");
const workspace_root_1 = require("./workspace-root");
const ALLOWED_FIELDS = ['projectPath'];
let DetectController = class DetectController {
    constructor(wsRoot) {
        this.wsRoot = wsRoot;
        this.detector = new detector_1.Detector({ rules: detector_1.ALL_RULES });
    }
    detect(body) {
        if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
            throw (0, http_errors_1.httpError)(400, 'INVALID_PROJECT_PATH', 'Request body must be a JSON object with a single projectPath field.');
        }
        const extras = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
        if (extras.length > 0) {
            throw (0, http_errors_1.httpError)(400, 'INVALID_PROJECT_PATH', `Unexpected fields in request body: ${extras.join(', ')}.`);
        }
        const result = (0, path_security_1.checkProjectPath)(body.projectPath, this.wsRoot.realpath);
        if (result.kind === 'invalid') {
            throw (0, http_errors_1.httpError)(400, 'INVALID_PROJECT_PATH', result.reason);
        }
        if (result.kind === 'not-found') {
            throw (0, http_errors_1.httpError)(404, 'PATH_NOT_FOUND', 'The supplied projectPath does not exist within the workspace root.');
        }
        if (result.kind === 'outside') {
            throw (0, http_errors_1.httpError)(403, 'PATH_OUTSIDE_WORKSPACE', 'The supplied projectPath resolves outside the workspace root.');
        }
        try {
            const { ir, warnings } = this.detector.detect(result.realCandidate);
            return { ir, warnings };
        }
        catch (err) {
            if (err instanceof detector_1.NoRootDirError) {
                throw (0, http_errors_1.httpError)(404, 'PATH_NOT_FOUND', err.message);
            }
            if (err instanceof detector_1.NoManifestError) {
                throw (0, http_errors_1.httpError)(422, 'NO_MANIFEST', err.message);
            }
            if (err instanceof detector_1.MalformedPackageJsonError) {
                throw (0, http_errors_1.httpError)(422, 'MALFORMED_PACKAGE_JSON', err.message, { diagnostic: err.message });
            }
            if (err instanceof detector_1.RuleRegistrationError ||
                err instanceof detector_1.RuleConflictError ||
                err instanceof detector_1.RuleDefectError ||
                err instanceof detector_1.InvalidProducedIRError) {
                throw (0, http_errors_1.httpError)(500, 'INTERNAL_IR_DEFECT', err.message);
            }
            throw err;
        }
    }
};
exports.DetectController = DetectController;
__decorate([
    (0, common_1.Post)('detect'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Detect a PipelineIR from a project under PIPE_EDITOR_WORKSPACE_ROOT.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DetectController.prototype, "detect", null);
exports.DetectController = DetectController = __decorate([
    (0, swagger_1.ApiTags)('Editor'),
    (0, common_1.Controller)('api'),
    __param(0, (0, common_1.Inject)(workspace_root_1.WORKSPACE_ROOT_TOKEN)),
    __metadata("design:paramtypes", [Object])
], DetectController);
//# sourceMappingURL=detect.controller.js.map