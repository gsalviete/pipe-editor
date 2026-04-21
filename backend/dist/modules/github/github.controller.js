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
exports.GithubController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const github_service_1 = require("./github.service");
function extractToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        throw new common_1.BadRequestException('Missing or malformed Authorization header');
    }
    return authHeader.slice(7);
}
let GithubController = class GithubController {
    constructor(github) {
        this.github = github;
    }
    getAuthUrl(state = 'default') {
        return { url: this.github.getOAuthRedirectUrl(state) };
    }
    async handleCallback(body) {
        if (!body.code)
            throw new common_1.BadRequestException('code is required');
        const accessToken = await this.github.exchangeCodeForToken(body.code);
        return { accessToken };
    }
    async getUser(auth) {
        return this.github.getAuthenticatedUser(extractToken(auth));
    }
    async listRepos(auth) {
        return this.github.listRepositories(extractToken(auth));
    }
    async listWorkflows(auth, owner, repo) {
        return this.github.listWorkflows(extractToken(auth), owner, repo);
    }
    async listRuns(auth, owner, repo, workflowId, perPage = '10') {
        return this.github.listWorkflowRuns(extractToken(auth), owner, repo, workflowId, Number(perPage));
    }
    async listJobs(auth, owner, repo, runId) {
        return this.github.listRunJobs(extractToken(auth), owner, repo, runId);
    }
};
exports.GithubController = GithubController;
__decorate([
    (0, common_1.Get)('auth/url'),
    (0, swagger_1.ApiOperation)({ summary: 'Get GitHub OAuth redirect URL' }),
    __param(0, (0, common_1.Query)('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], GithubController.prototype, "getAuthUrl", null);
__decorate([
    (0, common_1.Post)('auth/callback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Exchange OAuth code for access token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "handleCallback", null);
__decorate([
    (0, common_1.Get)('user'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get authenticated GitHub user' }),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "getUser", null);
__decorate([
    (0, common_1.Get)('repos'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List repositories for the authenticated user' }),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "listRepos", null);
__decorate([
    (0, common_1.Get)('repos/:owner/:repo/workflows'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List workflows for a repository' }),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('owner')),
    __param(2, (0, common_1.Param)('repo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "listWorkflows", null);
__decorate([
    (0, common_1.Get)('repos/:owner/:repo/workflows/:workflowId/runs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List recent runs for a workflow' }),
    (0, swagger_1.ApiQuery)({ name: 'perPage', required: false }),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('owner')),
    __param(2, (0, common_1.Param)('repo')),
    __param(3, (0, common_1.Param)('workflowId', common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('perPage')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number, Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "listRuns", null);
__decorate([
    (0, common_1.Get)('repos/:owner/:repo/runs/:runId/jobs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List jobs for a workflow run' }),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('owner')),
    __param(2, (0, common_1.Param)('repo')),
    __param(3, (0, common_1.Param)('runId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "listJobs", null);
exports.GithubController = GithubController = __decorate([
    (0, swagger_1.ApiTags)('GitHub'),
    (0, common_1.Controller)('api/github'),
    __metadata("design:paramtypes", [github_service_1.GithubService])
], GithubController);
//# sourceMappingURL=github.controller.js.map