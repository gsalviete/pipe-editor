"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphService = void 0;
const common_1 = require("@nestjs/common");
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const H_GAP = 80;
const V_GAP = 60;
let GraphService = class GraphService {
    buildGraph(workflow) {
        const errors = [];
        const cycleErrors = this.detectCycles(workflow.jobs);
        errors.push(...cycleErrors);
        const levels = this.computeLevels(workflow.jobs);
        const nodes = workflow.jobs.map((job) => this.createNode(job, workflow.id, levels.get(job.id) ?? 0));
        this.applyLayout(nodes);
        const edges = this.buildEdges(workflow.jobs);
        return {
            workflowId: workflow.id,
            workflowName: workflow.name,
            nodes,
            edges,
            isValid: errors.length === 0,
            validationErrors: errors,
        };
    }
    mergeRunStatus(graph, jobRuns) {
        const runsByName = new Map(jobRuns.map((j) => [j.name.toLowerCase(), j]));
        const nodes = graph.nodes.map((node) => {
            const run = runsByName.get(node.label.toLowerCase());
            if (!run)
                return node;
            return {
                ...node,
                status: this.mapStatus(run.status, run.conclusion),
                conclusion: run.conclusion,
                runJobId: run.id,
                startedAt: run.startedAt ?? undefined,
                completedAt: run.completedAt ?? undefined,
                durationSeconds: run.startedAt && run.completedAt
                    ? Math.round((new Date(run.completedAt).getTime() -
                        new Date(run.startedAt).getTime()) /
                        1000)
                    : undefined,
            };
        });
        return { ...graph, nodes };
    }
    detectCycles(jobs) {
        const errors = [];
        const visited = new Set();
        const inStack = new Set();
        const dfs = (jobId, path) => {
            if (inStack.has(jobId)) {
                errors.push(`Cycle detected: ${[...path, jobId].join(' → ')}`);
                return true;
            }
            if (visited.has(jobId))
                return false;
            visited.add(jobId);
            inStack.add(jobId);
            const job = jobs.find((j) => j.id === jobId);
            for (const dep of job?.needs ?? []) {
                if (dfs(dep, [...path, jobId]))
                    return true;
            }
            inStack.delete(jobId);
            return false;
        };
        for (const job of jobs) {
            if (!visited.has(job.id))
                dfs(job.id, []);
        }
        return errors;
    }
    computeLevels(jobs) {
        const levels = new Map();
        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const getLevel = (jobId, visited) => {
            if (levels.has(jobId))
                return levels.get(jobId);
            if (visited.has(jobId))
                return 0;
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
    applyLayout(nodes) {
        const byLevel = new Map();
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
    buildEdges(jobs) {
        const edges = [];
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
    createNode(job, workflowId, level) {
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
            position: { x: 0, y: 0 },
        };
    }
    mapStatus(status, conclusion) {
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
        if (status === 'in_progress')
            return 'running';
        if (status === 'queued')
            return 'queued';
        if (status === 'waiting')
            return 'queued';
        return 'idle';
    }
};
exports.GraphService = GraphService;
exports.GraphService = GraphService = __decorate([
    (0, common_1.Injectable)()
], GraphService);
//# sourceMappingURL=graph.service.js.map