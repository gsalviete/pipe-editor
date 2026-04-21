import { ParserService } from '../parser/parser.service';
import { GraphService } from '../graph/graph.service';
import type { PipelineGraph, JobLog } from '../../common/types/pipeline.types';
export interface DemoWorkflow {
    name: string;
    label: string;
    description: string;
}
export declare class DemoService {
    private readonly parser;
    private readonly graph;
    constructor(parser: ParserService, graph: GraphService);
    listWorkflows(): DemoWorkflow[];
    getGraph(name: string): {
        graph: PipelineGraph;
        parseErrors: string[];
    };
    getFakeJobLog(workflowName: string, jobId: string): JobLog;
    private loadFixture;
}
