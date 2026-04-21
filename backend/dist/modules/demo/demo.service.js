"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const parser_service_1 = require("../parser/parser.service");
const graph_service_1 = require("../graph/graph.service");
const FIXTURE_META = {
    simple: {
        label: 'Simple CI/CD',
        description: 'Linear pipeline: Build → Deploy. Good starting point.',
    },
    parallel: {
        label: 'Parallel Test Suite',
        description: 'Fan-in pattern: Lint, Unit, Integration run in parallel then merge into Report.',
    },
    complex: {
        label: 'Complex Monorepo Pipeline',
        description: 'Matrix builds, diamond dependency, security scan, Docker push, and Kubernetes deploy.',
    },
};
const FIXTURES_DIR = (0, path_1.join)(__dirname, '..', '..', 'fixtures');
function makeTimestamp(baseMs, offsetMs) {
    return new Date(baseMs + offsetMs).toISOString().replace('Z', '0000Z');
}
function line(num, ts, content, isError = false) {
    return {
        lineNumber: num,
        timestamp: ts,
        level: isError ? 'error' : 'info',
        content,
        isError,
    };
}
function buildFakeSteps(jobName, hasFailure) {
    const base = Date.now() - 120_000;
    const setupStep = {
        stepName: 'Set up job',
        stepNumber: 0,
        hasErrors: false,
        errorCount: 0,
        lines: [
            line(1, makeTimestamp(base, 0), 'Current runner version: 2.319.1'),
            line(2, makeTimestamp(base, 10), `Operating System: Ubuntu 22.04.3 LTS`),
            line(3, makeTimestamp(base, 20), 'Runner Image: ubuntu-22.04'),
            line(4, makeTimestamp(base, 30), `Prepare workflow directory`),
            line(5, makeTimestamp(base, 40), `Prepare all required actions`),
        ],
    };
    const checkoutStep = {
        stepName: 'actions/checkout@v4',
        stepNumber: 1,
        hasErrors: false,
        errorCount: 0,
        lines: [
            line(1, makeTimestamp(base, 1000), `Syncing repository: demo-org/demo-repo`),
            line(2, makeTimestamp(base, 1100), `Getting Git version info`),
            line(3, makeTimestamp(base, 1200), `Initializing the repository`),
            line(4, makeTimestamp(base, 1300), `Disabling automatic garbage collection`),
            line(5, makeTimestamp(base, 1400), `Setting up auth`),
            line(6, makeTimestamp(base, 1500), `Fetching the repository`),
            line(7, makeTimestamp(base, 2000), `Determining the checkout info`),
            line(8, makeTimestamp(base, 2100), `Checking out the ref`),
            line(9, makeTimestamp(base, 2500), `HEAD is now at a1b2c3d Merge pull request #42`),
        ],
    };
    const mainStepLines = [
        line(1, makeTimestamp(base, 5000), `> ${jobName.toLowerCase().replace(/\s/g, '-')}@1.0.0 ${jobName.toLowerCase()}`),
        line(2, makeTimestamp(base, 5100), `> Running ${jobName}...`),
        line(3, makeTimestamp(base, 6000), `Loaded configuration from .config/app.json`),
    ];
    let mainHasError = false;
    if (hasFailure) {
        mainStepLines.push(line(4, makeTimestamp(base, 7000), `Processing module src/auth/service.ts`), line(5, makeTimestamp(base, 7100), `Processing module src/graph/engine.ts`), line(6, makeTimestamp(base, 7500), `Error: Type 'string | undefined' is not assignable to type 'string'`, true), line(7, makeTimestamp(base, 7510), `  at src/pipeline/parser.ts:142:18`, true), line(8, makeTimestamp(base, 7520), `  at src/pipeline/parser.ts:98:5`, true), line(9, makeTimestamp(base, 7600), `Found 1 error.`, true), line(10, makeTimestamp(base, 7700), `Process completed with exit code 1`, true));
        mainHasError = true;
    }
    else {
        mainStepLines.push(line(4, makeTimestamp(base, 7000), `Processed 42 files in 1.2s`), line(5, makeTimestamp(base, 7100), `✓ All checks passed`), line(6, makeTimestamp(base, 7200), `Output written to dist/`));
    }
    const mainStep = {
        stepName: jobName,
        stepNumber: 2,
        hasErrors: mainHasError,
        errorCount: mainHasError ? 4 : 0,
        lines: mainStepLines,
    };
    const teardownStep = {
        stepName: 'Complete job',
        stepNumber: 3,
        hasErrors: false,
        errorCount: 0,
        lines: [
            line(1, makeTimestamp(base, 8000), `Cleaning up orphan processes`),
            line(2, makeTimestamp(base, 8100), `Stopping docker services`),
        ],
    };
    return [setupStep, checkoutStep, mainStep, teardownStep];
}
let DemoService = class DemoService {
    constructor(parser, graph) {
        this.parser = parser;
        this.graph = graph;
    }
    listWorkflows() {
        try {
            const files = (0, fs_1.readdirSync)(FIXTURES_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
            return files.map((f) => {
                const name = f.replace(/\.(yml|yaml)$/, '');
                const meta = FIXTURE_META[name] ?? {
                    label: name,
                    description: 'Custom fixture',
                };
                return { name, ...meta };
            });
        }
        catch {
            return [];
        }
    }
    getGraph(name) {
        const yamlContent = this.loadFixture(name);
        const { workflow, errors: parseErrors } = this.parser.parse(`${name}.yml`, yamlContent);
        if (!workflow) {
            return {
                graph: {
                    workflowId: name,
                    workflowName: name,
                    nodes: [],
                    edges: [],
                    isValid: false,
                    validationErrors: parseErrors,
                },
                parseErrors,
            };
        }
        const graph = this.graph.buildGraph(workflow);
        return { graph, parseErrors };
    }
    getFakeJobLog(workflowName, jobId) {
        const hasFailure = workflowName === 'complex' && jobId === 'test-e2e';
        const jobLabel = jobId
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        const steps = buildFakeSteps(jobLabel, hasFailure);
        const hasErrors = steps.some((s) => s.hasErrors);
        const totalLines = steps.reduce((acc, s) => acc + s.lines.length, 0);
        return {
            jobId: 0,
            jobName: jobLabel,
            steps,
            totalLines,
            hasErrors,
        };
    }
    loadFixture(name) {
        if (!/^[a-z0-9-]+$/.test(name)) {
            throw new common_1.NotFoundException(`Fixture "${name}" not found`);
        }
        const candidates = [
            (0, path_1.join)(FIXTURES_DIR, `${name}.yml`),
            (0, path_1.join)(FIXTURES_DIR, `${name}.yaml`),
        ];
        for (const path of candidates) {
            try {
                return (0, fs_1.readFileSync)(path, 'utf-8');
            }
            catch {
            }
        }
        throw new common_1.NotFoundException(`Fixture "${name}" not found`);
    }
};
exports.DemoService = DemoService;
exports.DemoService = DemoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [parser_service_1.ParserService,
        graph_service_1.GraphService])
], DemoService);
//# sourceMappingURL=demo.service.js.map