import { Injectable } from '@nestjs/common';
import type {
  ParsedWorkflow,
  JobDefinition,
  PipelineGraph,
  GraphNode,
  GraphEdge,
  JobRun,
  NodeStatus,
  JobConclusion,
} from '../../common/types/pipeline.types';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const H_GAP = 80;
const V_GAP = 60;

@Injectable()
export class GraphService {
  // ─── Build graph from parsed workflow ────────────────────────────────────────

  buildGraph(workflow: ParsedWorkflow): PipelineGraph {
    const errors: string[] = [];

    // 1. Detect cycles
    const cycleErrors = this.detectCycles(workflow.jobs);
    errors.push(...cycleErrors);

    // 2. Compute level (depth) for each job via topological analysis
    const levels = this.computeLevels(workflow.jobs);

    // 3. Create nodes
    const nodes: GraphNode[] = workflow.jobs.map((job) =>
      this.createNode(job, workflow.id, levels.get(job.id) ?? 0),
    );

    // 4. Apply grid layout
    this.applyLayout(nodes);

    // 5. Create edges
    const edges: GraphEdge[] = this.buildEdges(workflow.jobs);

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodes,
      edges,
      isValid: errors.length === 0,
      validationErrors: errors,
    };
  }

  // ─── Merge real run data into graph ──────────────────────────────────────────

  mergeRunStatus(graph: PipelineGraph, jobRuns: JobRun[]): PipelineGraph {
    // Match by job name (GitHub uses job names in the API)
    const runsByName = new Map(jobRuns.map((j) => [j.name.toLowerCase(), j]));

    const nodes = graph.nodes.map((node) => {
      const run = runsByName.get(node.label.toLowerCase());
      if (!run) return node;

      return {
        ...node,
        status: this.mapStatus(run.status, run.conclusion),
        conclusion: run.conclusion,
        runJobId: run.id,
        startedAt: run.startedAt ?? undefined,
        completedAt: run.completedAt ?? undefined,
        durationSeconds:
          run.startedAt && run.completedAt
            ? Math.round(
                (new Date(run.completedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1000,
              )
            : undefined,
      } satisfies GraphNode;
    });

    return { ...graph, nodes };
  }

  // ─── Cycle detection (DFS) ───────────────────────────────────────────────────

  private detectCycles(jobs: JobDefinition[]): string[] {
    const errors: string[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (jobId: string, path: string[]): boolean => {
      if (inStack.has(jobId)) {
        errors.push(`Cycle detected: ${[...path, jobId].join(' → ')}`);
        return true;
      }
      if (visited.has(jobId)) return false;

      visited.add(jobId);
      inStack.add(jobId);

      const job = jobs.find((j) => j.id === jobId);
      for (const dep of job?.needs ?? []) {
        if (dfs(dep, [...path, jobId])) return true;
      }

      inStack.delete(jobId);
      return false;
    };

    for (const job of jobs) {
      if (!visited.has(job.id)) dfs(job.id, []);
    }

    return errors;
  }

  // ─── Level computation (longest path = critical path) ────────────────────────

  private computeLevels(jobs: JobDefinition[]): Map<string, number> {
    const levels = new Map<string, number>();
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const getLevel = (jobId: string, visited: Set<string>): number => {
      if (levels.has(jobId)) return levels.get(jobId)!;
      if (visited.has(jobId)) return 0; // cycle guard

      visited.add(jobId);
      const job = jobMap.get(jobId);
      if (!job || job.needs.length === 0) {
        levels.set(jobId, 0);
        return 0;
      }

      const depLevels = job.needs.map((dep) => getLevel(dep, new Set(visited)));
      const level = Math.max(...depLevels) + 1;
      levels.set(jobId, level);
      return level;
    };

    for (const job of jobs) {
      getLevel(job.id, new Set());
    }

    return levels;
  }

  // ─── Layout (column per level, row per position within level) ────────────────

  private applyLayout(nodes: GraphNode[]): void {
    // Group nodes by level
    const byLevel = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const group = byLevel.get(node.level) ?? [];
      group.push(node);
      byLevel.set(node.level, group);
    }

    const maxInLevel = Math.max(...Array.from(byLevel.values()).map((g) => g.length));

    for (const [level, group] of byLevel) {
      const totalHeight = group.length * (NODE_HEIGHT + V_GAP) - V_GAP;
      const startY = ((maxInLevel * (NODE_HEIGHT + V_GAP)) - totalHeight) / 2;

      group.forEach((node, idx) => {
        node.position = {
          x: level * (NODE_WIDTH + H_GAP),
          y: startY + idx * (NODE_HEIGHT + V_GAP),
        };
      });
    }
  }

  // ─── Edges ───────────────────────────────────────────────────────────────────

  private buildEdges(jobs: JobDefinition[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const job of jobs) {
      for (const dep of job.needs) {
        edges.push({
          id: `${dep}→${job.id}`,
          source: dep,
          target: job.id,
          label: job.if ? `if: ${job.if}` : undefined,
        });
      }
    }

    return edges;
  }

  // ─── Node construction ────────────────────────────────────────────────────────

  private createNode(
    job: JobDefinition,
    workflowId: string,
    level: number,
  ): GraphNode {
    return {
      id: job.id,
      label: job.name,
      jobId: job.id,
      workflowId,
      runsOn: job.runsOn,
      steps: job.steps,
      if: job.if,
      strategy: job.strategy,
      status: 'idle',
      conclusion: null,
      level,
      position: { x: 0, y: 0 }, // set by layout
    };
  }

  // ─── Status mapping ───────────────────────────────────────────────────────────

  private mapStatus(
    status: string,
    conclusion: JobConclusion,
  ): NodeStatus {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return 'success';
        case 'failure': return 'failure';
        case 'cancelled': return 'cancelled';
        case 'skipped': return 'skipped';
        case 'timed_out': return 'timed_out';
        default: return 'failure';
      }
    }
    if (status === 'in_progress') return 'running';
    if (status === 'queued') return 'queued';
    if (status === 'waiting') return 'queued';
    return 'idle';
  }
}
