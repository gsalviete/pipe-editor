import type { ParsedWorkflow } from '../../common/types/pipeline.types';
export interface ParseResult {
    workflow: ParsedWorkflow | null;
    errors: string[];
}
export declare class ParserService {
    parse(filename: string, rawYaml: string): ParseResult;
    private parseJobs;
    private parseSteps;
    private parseTrigger;
    private parseStrategy;
    private normalizeNeeds;
    private parseEnvironment;
    private normalizeEnv;
    private stringifyValues;
    private deriveWorkflowId;
    private emptyJob;
}
