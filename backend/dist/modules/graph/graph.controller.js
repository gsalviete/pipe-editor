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
exports.GraphController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const github_service_1 = require("../github/github.service");
const parser_service_1 = require("../parser/parser.service");
const graph_service_1 = require("./graph.service");
function extractToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        throw new common_1.BadRequestException('Missing or malformed Authorization header');
    }
    return authHeader.slice(7);
}
let GraphController = class GraphController {
    constructor(github, parser, graph) {
        this.github = github;
        this.parser = parser;
        this.graph = graph;
    }
    async getWorkflowGraph(auth, owner, repo, workflowId, runIdStr) {
        const token = extractToken(auth);
        const workflows = await this.github.listWorkflows(token, owner, repo);
        const wf = workflows.find((w) => w.id === workflowId);
        if (!wf)
            throw new common_1.BadRequestException(`Workflow ${workflowId} not found`);
        const file = await this.github.fetchWorkflowFile(token, owner, repo, wf.path);
        const { workflow, errors: parseErrors } = this.parser.parse(file.name, file.content);
        if (!workflow) {
            return {
                graph: {
                    workflowId: String(workflowId),
                    workflowName: wf.name,
                    nodes: [],
                    edges: [],
                    isValid: false,
                    validationErrors: parseErrors,
                },
                parseErrors,
            };
        }
        let graph = this.graph.buildGraph(workflow);
        if (runIdStr) {
            const runId = Number(runIdStr);
            if (!isNaN(runId)) {
                const jobRuns = await this.github.listRunJobs(token, owner, repo, runId);
                graph = this.graph.mergeRunStatus(graph, jobRuns);
                graph = { ...graph, runId };
            }
        }
        return { graph, parseErrors };
    }
};
exports.GraphController = GraphController;
__decorate([
    (0, common_1.Get)('repos/:owner/:repo/workflows/:workflowId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Build DAG graph for a workflow' }),
    (0, swagger_1.ApiQuery)({ name: 'runId', required: false }),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('owner')),
    __param(2, (0, common_1.Param)('repo')),
    __param(3, (0, common_1.Param)('workflowId', common_1.ParseIntPipe)),
    __param(4, (0, common_1.Query)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number, String]),
    __metadata("design:returntype", Promise)
], GraphController.prototype, "getWorkflowGraph", null);
exports.GraphController = GraphController = __decorate([
    (0, swagger_1.ApiTags)('Graph'),
    (0, common_1.Controller)('api/graph'),
    __metadata("design:paramtypes", [github_service_1.GithubService,
        parser_service_1.ParserService,
        graph_service_1.GraphService])
], GraphController);
//# sourceMappingURL=graph.controller.js.map