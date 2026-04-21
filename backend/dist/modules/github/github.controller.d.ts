import { GithubService } from './github.service';
export declare class GithubController {
    private readonly github;
    constructor(github: GithubService);
    getAuthUrl(state?: string): {
        url: string;
    };
    handleCallback(body: {
        code: string;
    }): Promise<{
        accessToken: string;
    }>;
    getUser(auth: string | undefined): Promise<import("./github.types").GitHubUser>;
    listRepos(auth: string | undefined): Promise<import("../../common/types/pipeline.types").RepoSummary[]>;
    listWorkflows(auth: string | undefined, owner: string, repo: string): Promise<import("../../common/types/pipeline.types").WorkflowSummary[]>;
    listRuns(auth: string | undefined, owner: string, repo: string, workflowId: number, perPage?: string): Promise<import("../../common/types/pipeline.types").WorkflowRun[]>;
    listJobs(auth: string | undefined, owner: string, repo: string, runId: number): Promise<import("../../common/types/pipeline.types").JobRun[]>;
}
