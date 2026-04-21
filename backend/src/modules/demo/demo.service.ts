import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ParserService } from '../parser/parser.service';
import { GraphService } from '../graph/graph.service';
import type { PipelineGraph, JobLog, StepLog, LogLine } from '../../common/types/pipeline.types';

// ─── Fixture metadata ─────────────────────────────────────────────────────────

export interface DemoWorkflow {
  name: string;
  label: string;
  description: string;
}

const FIXTURE_META: Record<string, Omit<DemoWorkflow, 'name'>> = {
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

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

// ─── Fake log builder ─────────────────────────────────────────────────────────

function makeTimestamp(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString().replace('Z', '0000Z');
}

function line(
  num: number,
  ts: string,
  content: string,
  isError = false,
): LogLine {
  return {
    lineNumber: num,
    timestamp: ts,
    level: isError ? 'error' : 'info',
    content,
    isError,
  };
}

function buildFakeSteps(jobName: string, hasFailure: boolean): StepLog[] {
  const base = Date.now() - 120_000;

  const setupStep: StepLog = {
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

  const checkoutStep: StepLog = {
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

  const mainStepLines: LogLine[] = [
    line(1, makeTimestamp(base, 5000), `> ${jobName.toLowerCase().replace(/\s/g, '-')}@1.0.0 ${jobName.toLowerCase()}`),
    line(2, makeTimestamp(base, 5100), `> Running ${jobName}...`),
    line(3, makeTimestamp(base, 6000), `Loaded configuration from .config/app.json`),
  ];

  let mainHasError = false;
  if (hasFailure) {
    mainStepLines.push(
      line(4, makeTimestamp(base, 7000), `Processing module src/auth/service.ts`),
      line(5, makeTimestamp(base, 7100), `Processing module src/graph/engine.ts`),
      line(6, makeTimestamp(base, 7500), `Error: Type 'string | undefined' is not assignable to type 'string'`, true),
      line(7, makeTimestamp(base, 7510), `  at src/pipeline/parser.ts:142:18`, true),
      line(8, makeTimestamp(base, 7520), `  at src/pipeline/parser.ts:98:5`, true),
      line(9, makeTimestamp(base, 7600), `Found 1 error.`, true),
      line(10, makeTimestamp(base, 7700), `Process completed with exit code 1`, true),
    );
    mainHasError = true;
  } else {
    mainStepLines.push(
      line(4, makeTimestamp(base, 7000), `Processed 42 files in 1.2s`),
      line(5, makeTimestamp(base, 7100), `✓ All checks passed`),
      line(6, makeTimestamp(base, 7200), `Output written to dist/`),
    );
  }

  const mainStep: StepLog = {
    stepName: jobName,
    stepNumber: 2,
    hasErrors: mainHasError,
    errorCount: mainHasError ? 4 : 0,
    lines: mainStepLines,
  };

  const teardownStep: StepLog = {
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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DemoService {
  constructor(
    private readonly parser: ParserService,
    private readonly graph: GraphService,
  ) {}

  listWorkflows(): DemoWorkflow[] {
    try {
      const files = readdirSync(FIXTURES_DIR).filter((f) =>
        f.endsWith('.yml') || f.endsWith('.yaml'),
      );
      return files.map((f) => {
        const name = f.replace(/\.(yml|yaml)$/, '');
        const meta = FIXTURE_META[name] ?? {
          label: name,
          description: 'Custom fixture',
        };
        return { name, ...meta };
      });
    } catch {
      return [];
    }
  }

  getGraph(name: string): { graph: PipelineGraph; parseErrors: string[] } {
    const yamlContent = this.loadFixture(name);
    const { workflow, errors: parseErrors } = this.parser.parse(
      `${name}.yml`,
      yamlContent,
    );

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

  getFakeJobLog(workflowName: string, jobId: string): JobLog {
    // For the complex workflow, simulate a failure on the 'test-e2e' job
    const hasFailure =
      workflowName === 'complex' && jobId === 'test-e2e';

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

  // ─── Private ─────────────────────────────────────────────────────────────────

  private loadFixture(name: string): string {
    // Sanitize: only allow alphanumeric and hyphens to prevent path traversal
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new NotFoundException(`Fixture "${name}" not found`);
    }

    const candidates = [
      join(FIXTURES_DIR, `${name}.yml`),
      join(FIXTURES_DIR, `${name}.yaml`),
    ];

    for (const path of candidates) {
      try {
        return readFileSync(path, 'utf-8');
      } catch {
        // try next extension
      }
    }

    throw new NotFoundException(`Fixture "${name}" not found`);
  }
}
