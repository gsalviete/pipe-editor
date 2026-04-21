import { DemoService } from './demo.service';
export declare class DemoController {
    private readonly demo;
    constructor(demo: DemoService);
    listWorkflows(): import("./demo.service").DemoWorkflow[];
    getGraph(name: string): {
        graph: import("../../common/types/pipeline.types").PipelineGraph;
        parseErrors: string[];
    };
    getLogs(name: string, jobId: string): import("../../common/types/pipeline.types").JobLog;
}
