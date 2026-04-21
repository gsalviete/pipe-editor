import {
  Controller,
  Get,
  Param,
  Query,
  Headers,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GithubService } from '../github/github.service';
import { ParserService } from '../parser/parser.service';
import { GraphService } from './graph.service';
import type { PipelineGraph } from '../../common/types/pipeline.types';

function extractToken(authHeader: string | undefined): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new BadRequestException('Missing or malformed Authorization header');
  }
  return authHeader.slice(7);
}

@ApiTags('Graph')
@Controller('api/graph')
export class GraphController {
  constructor(
    private readonly github: GithubService,
    private readonly parser: ParserService,
    private readonly graph: GraphService,
  ) {}

  /**
   * Get the pipeline graph for a specific workflow.
   * Optionally accepts a runId to merge live execution status.
   */
  @Get('repos/:owner/:repo/workflows/:workflowId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Build DAG graph for a workflow' })
  @ApiQuery({ name: 'runId', required: false })
  async getWorkflowGraph(
    @Headers('authorization') auth: string | undefined,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Query('runId') runIdStr?: string,
  ): Promise<{ graph: PipelineGraph; parseErrors: string[] }> {
    const token = extractToken(auth);

    // 1. Find workflow path
    const workflows = await this.github.listWorkflows(token, owner, repo);
    const wf = workflows.find((w) => w.id === workflowId);
    if (!wf) throw new BadRequestException(`Workflow ${workflowId} not found`);

    // 2. Fetch YAML
    const file = await this.github.fetchWorkflowFile(token, owner, repo, wf.path);

    // 3. Parse YAML
    const { workflow, errors: parseErrors } = this.parser.parse(file.name, file.content);
    if (!workflow) {
      return {
        graph: {
          workflowId: String(workflowId),
          workflowName: wf.name,
          nodes: [],
          edges: [],
          isValid: false,
          validationErrors: parseErrors,
        },
        parseErrors,
      };
    }

    // 4. Build graph
    let graph = this.graph.buildGraph(workflow);

    // 5. Optionally merge run status
    if (runIdStr) {
      const runId = Number(runIdStr);
      if (!isNaN(runId)) {
        const jobRuns = await this.github.listRunJobs(token, owner, repo, runId);
        graph = this.graph.mergeRunStatus(graph, jobRuns);
        graph = { ...graph, runId };
      }
    }

    return { graph, parseErrors };
  }
}
