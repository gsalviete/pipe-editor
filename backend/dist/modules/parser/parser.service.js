"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParserService = void 0;
const common_1 = require("@nestjs/common");
const yaml = require("js-yaml");
let ParserService = class ParserService {
    parse(filename, rawYaml) {
        const errors = [];
        let raw;
        try {
            const parsed = yaml.load(rawYaml);
            if (!parsed || typeof parsed !== 'object') {
                return { workflow: null, errors: ['YAML is empty or not an object'] };
            }
            raw = parsed;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { workflow: null, errors: [`YAML parse error: ${message}`] };
        }
        if (!raw.jobs || typeof raw.jobs !== 'object') {
            errors.push('Workflow has no jobs defined');
        }
        const jobs = this.parseJobs(raw.jobs ?? {}, errors);
        const jobIds = new Set(jobs.map((j) => j.id));
        for (const job of jobs) {
            for (const dep of job.needs) {
                if (!jobIds.has(dep)) {
                    errors.push(`Job "${job.id}" references unknown dependency "${dep}"`);
                }
            }
        }
        const workflow = {
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
    parseJobs(rawJobs, errors) {
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
            };
        });
    }
    parseSteps(jobId, rawSteps, errors) {
        if (!Array.isArray(rawSteps)) {
            errors.push(`Job "${jobId}" has invalid steps (expected array)`);
            return [];
        }
        return rawSteps.map((s, idx) => {
            if (!s || typeof s !== 'object') {
                errors.push(`Job "${jobId}" step ${idx + 1} is not a valid object`);
                return {};
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
            };
        });
    }
    parseTrigger(on) {
        if (!on)
            return { events: [] };
        if (typeof on === 'string')
            return { events: [on] };
        if (Array.isArray(on))
            return { events: on };
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
    parseStrategy(raw) {
        if (!raw?.matrix)
            return undefined;
        const matrix = {};
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
    normalizeNeeds(needs) {
        if (!needs)
            return [];
        if (typeof needs === 'string')
            return [needs];
        return needs;
    }
    parseEnvironment(env) {
        if (!env)
            return undefined;
        if (typeof env === 'string')
            return env;
        return env.name;
    }
    normalizeEnv(env) {
        if (!env)
            return undefined;
        return this.stringifyValues(env);
    }
    stringifyValues(obj) {
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v ?? '')]));
    }
    deriveWorkflowId(filename) {
        return filename
            .replace(/^.*[/\\]/, '')
            .replace(/\.(yml|yaml)$/, '');
    }
    emptyJob(id) {
        return {
            id,
            name: id,
            runsOn: 'ubuntu-latest',
            needs: [],
            steps: [],
        };
    }
};
exports.ParserService = ParserService;
exports.ParserService = ParserService = __decorate([
    (0, common_1.Injectable)()
], ParserService);
//# sourceMappingURL=parser.service.js.map