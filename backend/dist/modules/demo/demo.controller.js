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
exports.DemoController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const demo_service_1 = require("./demo.service");
let DemoController = class DemoController {
    constructor(demo) {
        this.demo = demo;
    }
    listWorkflows() {
        return this.demo.listWorkflows();
    }
    getGraph(name) {
        return this.demo.getGraph(name);
    }
    getLogs(name, jobId) {
        return this.demo.getFakeJobLog(name, jobId);
    }
};
exports.DemoController = DemoController;
__decorate([
    (0, common_1.Get)('workflows'),
    (0, swagger_1.ApiOperation)({ summary: 'List available demo workflows (no auth required)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DemoController.prototype, "listWorkflows", null);
__decorate([
    (0, common_1.Get)('workflows/:name/graph'),
    (0, swagger_1.ApiOperation)({ summary: 'Get parsed DAG graph for a demo workflow' }),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DemoController.prototype, "getGraph", null);
__decorate([
    (0, common_1.Get)('workflows/:name/logs/:jobId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get fake structured logs for a demo job' }),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DemoController.prototype, "getLogs", null);
exports.DemoController = DemoController = __decorate([
    (0, swagger_1.ApiTags)('Demo'),
    (0, common_1.Controller)('api/demo'),
    __metadata("design:paramtypes", [demo_service_1.DemoService])
], DemoController);
//# sourceMappingURL=demo.controller.js.map