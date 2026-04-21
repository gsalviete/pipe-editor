import { GithubService } from '../github/github.service';
import { LogsService } from './logs.service';
import type { JobLog } from '../../common/types/pipeline.types';
export declare class LogsController {
    private readonly github;
    private readonly logs;
    constructor(github: GithubService, logs: LogsService);
    getJobLogsWithName(auth: string | undefined, owner: string, repo: string, runId: number, jobId: number): Promise<JobLog>;
}
