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
var GithubService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rest_1 = require("@octokit/rest");
let GithubService = GithubService_1 = class GithubService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(GithubService_1.name);
        this.clientId = this.config.get('GITHUB_CLIENT_ID');
        this.clientSecret = this.config.get('GITHUB_CLIENT_SECRET');
        if (!this.clientId || !this.clientSecret) {
            this.logger.warn('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled. Demo mode only.');
        }
    }
    requireCredentials() {
        if (!this.clientId || !this.clientSecret) {
            throw new common_1.ServiceUnavailableException('GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable.');
        }
        return { clientId: this.clientId, clientSecret: this.clientSecret };
    }
    getOAuthRedirectUrl(state) {
        const { clientId } = this.requireCredentials();
        const scopes = ['repo', 'read:user'].join(',');
        return (`https://github.com/login/oauth/authorize` +
            `?client_id=${clientId}` +
            `&scope=${scopes}` +
            `&state=${state}`);
    }
    async exchangeCodeForToken(code) {
        const { clientId, clientSecret } = this.requireCredentials();
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        });
        const data = (await response.json());
        if (data.error || !data.access_token) {
            this.logger.error('GitHub OAuth error', data.error_description);
            throw new common_1.UnauthorizedException(data.error_description ?? 'OAuth exchange failed');
        }
        return data.access_token;
    }
    async getAuthenticatedUser(accessToken) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.users.getAuthenticated();
        return {
            id: data.id,
            login: data.login,
            name: data.name ?? null,
            email: data.email ?? null,
            avatarUrl: data.avatar_url,
        };
    }
    async listRepositories(accessToken) {
        const octokit = this.createClient(accessToken);
        const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
            per_page: 100,
            sort: 'updated',
            type: 'all',
        });
        return repos.map((r) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            owner: r.owner.login,
            private: r.private,
            defaultBranch: r.default_branch,
            description: r.description ?? null,
            updatedAt: r.updated_at ?? new Date().toISOString(),
        }));
    }
    async listWorkflows(accessToken, owner, repo) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
        return data.workflows.map((w) => ({
            id: w.id,
            name: w.name,
            path: w.path,
            state: w.state,
        }));
    }
    async fetchWorkflowFile(accessToken, owner, repo, path) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.repos.getContent({ owner, repo, path });
        if (Array.isArray(data) || data.type !== 'file') {
            throw new Error(`Path ${path} is not a file`);
        }
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { name: data.name, path: data.path, content };
    }
    async listWorkflowRuns(accessToken, owner, repo, workflowId, perPage = 10) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflowId,
            per_page: perPage,
        });
        return data.workflow_runs.map((r) => ({
            id: r.id,
            name: r.name ?? 'Unnamed run',
            status: (r.status ?? 'queued'),
            conclusion: (r.conclusion ?? null),
            headBranch: r.head_branch ?? '',
            headSha: r.head_sha,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            url: r.html_url,
            triggerEvent: r.event,
            actor: r.actor?.login ?? 'unknown',
        }));
    }
    async listRunJobs(accessToken, owner, repo, runId) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: runId,
            per_page: 100,
        });
        return data.jobs.map((j) => ({
            id: j.id,
            name: j.name,
            status: j.status,
            conclusion: (j.conclusion ?? null),
            startedAt: j.started_at ?? null,
            completedAt: j.completed_at ?? null,
            runnerName: j.runner_name ?? undefined,
            steps: (j.steps ?? []).map((s) => ({
                name: s.name,
                number: s.number,
                status: s.status,
                conclusion: (s.conclusion ?? null),
                startedAt: s.started_at ?? null,
                completedAt: s.completed_at ?? null,
            })),
        }));
    }
    async downloadJobLogs(accessToken, owner, repo, jobId) {
        const octokit = this.createClient(accessToken);
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs', { owner, repo, job_id: jobId });
        return data;
    }
    createClient(accessToken) {
        return new rest_1.Octokit({ auth: accessToken });
    }
};
exports.GithubService = GithubService;
exports.GithubService = GithubService = GithubService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GithubService);
//# sourceMappingURL=github.service.js.map