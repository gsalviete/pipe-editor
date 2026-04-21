import { Injectable } from '@nestjs/common';
import * as yaml from 'js-yaml';
import type {
  ParsedWorkflow,
  JobDefinition,
  StepDefinition,
  WorkflowTrigger,
  MatrixStrategy,
} from '../../common/types/pipeline.types';

// ─── Raw YAML shapes (loose types for parsing) ────────────────────────────────

interface RawStep {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  if?: string;
  'continue-on-error'?: boolean;
}

interface RawStrategy {
  matrix?: Record<string, unknown[]>;
  'fail-fast'?: boolean;
  'max-parallel'?: number;
}

interface RawJob {
  name?: string;
  'runs-on'?: string | string[];
  needs?: string | string[];
  steps?: RawStep[];
  if?: string;
  environment?: string | { name: string };
  strategy?: RawStrategy;
  'timeout-minutes'?: number;
  'continue-on-error'?: boolean;
  outputs?: Record<string, string>;
}

interface RawTrigger {
  branches?: string[];
  'branches-ignore'?: string[];
  paths?: string[];
  'paths-ignore'?: string[];
}

interface RawWorkflow {
  name?: string;
  on?:
    | string
    | string[]
    | Record<string, RawTrigger | null>;
  env?: Record<string, unknown>;
  jobs?: Record<string, RawJob>;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface ParseResult {
  workflow: ParsedWorkflow | null;
  errors: string[];
}

@Injectable()
export class ParserService {
  parse(filename: string, rawYaml: string): ParseResult {
    const errors: string[] = [];
    let raw: RawWorkflow;

    // ── 1. YAML parse ──────────────────────────────────────────────────────────
    try {
      const parsed = yaml.load(rawYaml);
      if (!parsed || typeof parsed !== 'object') {
        return { workflow: null, errors: ['YAML is empty or not an object'] };
      }
      raw = parsed as RawWorkflow;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { workflow: null, errors: [`YAML parse error: ${message}`] };
    }

    // ── 2. Validate top-level structure ────────────────────────────────────────
    if (!raw.jobs || typeof raw.jobs !== 'object') {
      errors.push('Workflow has no jobs defined');
    }

    // ── 3. Parse jobs ──────────────────────────────────────────────────────────
    const jobs = this.parseJobs(raw.jobs ?? {}, errors);

    // ── 4. Validate dependency graph (no unknown refs) ─────────────────────────
    const jobIds = new Set(jobs.map((j) => j.id));
    for (const job of jobs) {
      for (const dep of job.needs) {
        if (!jobIds.has(dep)) {
          errors.push(
            `Job "${job.id}" references unknown dependency "${dep}"`,
          );
        }
      }
    }

    const workflow: ParsedWorkflow = {
      id: this.deriveWorkflowId(filename),
      name: raw.name ?? filename,
      filename,
      trigger: this.parseTrigger(raw.on),
      jobs,
      env: this.normalizeEnv(raw.env),
      rawYaml,
    };

    return { workflow, errors };
  }

  // ─── Job parsing ─────────────────────────────────────────────────────────────

  private parseJobs(
    rawJobs: Record<string, RawJob>,
    errors: string[],
  ): JobDefinition[] {
    return Object.entries(rawJobs).map(([id, raw]) => {
      if (!raw || typeof raw !== 'object') {
        errors.push(`Job "${id}" is not a valid object`);
        return this.emptyJob(id);
      }

      const steps = this.parseSteps(id, raw.steps ?? [], errors);
      const needs = this.normalizeNeeds(raw.needs);
      const strategy = this.parseStrategy(raw.strategy);

      return {
        id,
        name: raw.name ?? id,
        runsOn: raw['runs-on'] ?? 'ubuntu-latest',
        needs,
        steps,
        if: raw.if,
        environment: this.parseEnvironment(raw.environment),
        strategy,
        timeoutMinutes: raw['timeout-minutes'],
        continueOnError: raw['continue-on-error'],
        outputs: raw.outputs,
      } satisfies JobDefinition;
    });
  }

  private parseSteps(
    jobId: string,
    rawSteps: RawStep[],
    errors: string[],
  ): StepDefinition[] {
    if (!Array.isArray(rawSteps)) {
      errors.push(`Job "${jobId}" has invalid steps (expected array)`);
      return [];
    }

    return rawSteps.map((s, idx) => {
      if (!s || typeof s !== 'object') {
        errors.push(`Job "${jobId}" step ${idx + 1} is not a valid object`);
        return {} as StepDefinition;
      }

      return {
        id: s.id,
        name: s.name,
        uses: s.uses,
        run: s.run,
        env: s.env ? this.stringifyValues(s.env) : undefined,
        with: s.with ? this.stringifyValues(s.with) : undefined,
        if: s.if,
        continueOnError: s['continue-on-error'],
      } satisfies StepDefinition;
    });
  }

  // ─── Trigger parsing ──────────────────────────────────────────────────────────

  private parseTrigger(
    on: RawWorkflow['on'],
  ): WorkflowTrigger {
    if (!on) return { events: [] };

    // on: push
    if (typeof on === 'string') return { events: [on] };

    // on: [push, pull_request]
    if (Array.isArray(on)) return { events: on as string[] };

    // on: { push: { branches: [...] }, pull_request: null }
    const events = Object.keys(on);
    const firstEvent = on[events[0]];
    const branches = firstEvent?.branches;
    const paths = firstEvent?.paths;

    return {
      events,
      branches,
      paths,
    };
  }

  // ─── Strategy parsing ─────────────────────────────────────────────────────────

  private parseStrategy(raw: RawStrategy | undefined): MatrixStrategy | undefined {
    if (!raw?.matrix) return undefined;

    const matrix: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(raw.matrix)) {
      if (Array.isArray(values)) {
        matrix[key] = values.map(String);
      }
    }

    return {
      matrix,
      failFast: raw['fail-fast'],
      maxParallel: raw['max-parallel'],
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private normalizeNeeds(needs: string | string[] | undefined): string[] {
    if (!needs) return [];
    if (typeof needs === 'string') return [needs];
    return needs;
  }

  private parseEnvironment(
    env: string | { name: string } | undefined,
  ): string | undefined {
    if (!env) return undefined;
    if (typeof env === 'string') return env;
    return env.name;
  }

  private normalizeEnv(
    env: Record<string, unknown> | undefined,
  ): Record<string, string> | undefined {
    if (!env) return undefined;
    return this.stringifyValues(env);
  }

  private stringifyValues(
    obj: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, String(v ?? '')]),
    );
  }

  private deriveWorkflowId(filename: string): string {
    return filename
      .replace(/^.*[/\\]/, '')
      .replace(/\.(yml|yaml)$/, '');
  }

  private emptyJob(id: string): JobDefinition {
    return {
      id,
      name: id,
      runsOn: 'ubuntu-latest',
      needs: [],
      steps: [],
    };
  }
}
