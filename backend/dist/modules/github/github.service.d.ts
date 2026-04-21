import { ConfigService } from '@nestjs/config';
import type { RepoSummary, WorkflowSummary, WorkflowRun, JobRun } from '../../common/types/pipeline.types';
import type { GitHubUser, RawWorkflowFile } from './github.types';
export declare class GithubService {
    private readonly config;
    private readonly logger;
    private readonly clientId;
    private readonly clientSecret;
    constructor(config: ConfigService);
    private requireCredentials;
    getOAuthRedirectUrl(state: string): string;
    exchangeCodeForToken(code: string): Promise<string>;
    getAuthenticatedUser(accessToken: string): Promise<GitHubUser>;
    listRepositories(accessToken: string): Promise<RepoSummary[]>;
    listWorkflows(accessToken: string, owner: string, repo: string): Promise<WorkflowSummary[]>;
    fetchWorkflowFile(accessToken: string, owner: string, repo: string, path: string): Promise<RawWorkflowFile>;
    listWorkflowRuns(accessToken: string, owner: string, repo: string, workflowId: number, perPage?: number): Promise<WorkflowRun[]>;
    listRunJobs(accessToken: string, owner: string, repo: string, runId: number): Promise<JobRun[]>;
    downloadJobLogs(accessToken: string, owner: string, repo: string, jobId: number): Promise<string>;
    private createClient;
}
