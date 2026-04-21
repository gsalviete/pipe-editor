import type { JobLog } from '../../common/types/pipeline.types';
export declare class LogsService {
    parseJobLog(jobId: number, jobName: string, rawLog: string): JobLog;
    private splitIntoSteps;
    private buildStepLog;
    private parseLine;
    private classifyLevel;
    private matchesErrorHeuristic;
    private stripTimestamp;
}
