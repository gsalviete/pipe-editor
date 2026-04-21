import { GithubService } from '../github/github.service';
import { ParserService } from '../parser/parser.service';
import { GraphService } from './graph.service';
import type { PipelineGraph } from '../../common/types/pipeline.types';
export declare class GraphController {
    private readonly github;
    private readonly parser;
    private readonly graph;
    constructor(github: GithubService, parser: ParserService, graph: GraphService);
    getWorkflowGraph(auth: string | undefined, owner: string, repo: string, workflowId: number, runIdStr?: string): Promise<{
        graph: PipelineGraph;
        parseErrors: string[];
    }>;
}
