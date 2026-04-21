import type { ParsedWorkflow, PipelineGraph, JobRun } from '../../common/types/pipeline.types';
export declare class GraphService {
    buildGraph(workflow: ParsedWorkflow): PipelineGraph;
    mergeRunStatus(graph: PipelineGraph, jobRuns: JobRun[]): PipelineGraph;
    private detectCycles;
    private computeLevels;
    private applyLayout;
    private buildEdges;
    private createNode;
    private mapStatus;
}
