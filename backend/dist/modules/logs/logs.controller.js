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
exports.LogsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const github_service_1 = require("../github/github.service");
const logs_service_1 = require("./logs.service");
function extractToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        throw new common_1.BadRequestException('Missing or malformed Authorization header');
    }
    return authHeader.slice(7);
}
let LogsController = class LogsController {
    constructor(github, logs) {
        this.github = github;
        this.logs = logs;
    }
    async getJobLogsWithName(auth, owner, repo, runId, jobId) {
        const token = extractToken(auth);
        const [rawLog, jobRuns] = await Promise.all([
            this.github.downloadJobLogs(token, owner, repo, jobId),
            this.github.listRunJobs(token, owner, repo, runId),
        ]);
        const job = jobRuns.find((j) => j.id === jobId);
        const jobName = job?.name ?? `Job #${jobId}`;
        return this.logs.parseJobLog(jobId, jobName, rawLog);
    }
};
exports.LogsController = LogsController;
__decorate([
    (0, common_1.Get)('repos/:owner/:repo/runs/:runId/jobs/:jobId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get structured logs for a job in a run (with name enrichment)' }),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('owner')),
    __param(2, (0, common_1.Param)('repo')),
    __param(3, (0, common_1.Param)('runId', common_1.ParseIntPipe)),
    __param(4, (0, common_1.Param)('jobId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], LogsController.prototype, "getJobLogsWithName", null);
exports.LogsController = LogsController = __decorate([
    (0, swagger_1.ApiTags)('Logs'),
    (0, common_1.Controller)('api/logs'),
    __metadata("design:paramtypes", [github_service_1.GithubService,
        logs_service_1.LogsService])
], LogsController);
//# sourceMappingURL=logs.controller.js.map