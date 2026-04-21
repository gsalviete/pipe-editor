"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogsService = void 0;
const common_1 = require("@nestjs/common");
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s/;
const GROUP_RE = /^##\[group\]/;
const ENDGROUP_RE = /^##\[endgroup\]/;
const ERROR_RE = /^##\[error\]/;
const WARNING_RE = /^##\[warning\]/;
const DEBUG_RE = /^##\[debug\]/;
const COMMAND_RE = /^##\[command\]/;
const STEP_MARKER_RE = /^##\[group\]Run\s+(.+)$/;
const ERROR_HEURISTICS = [
    /\bError:\s/i,
    /\bFATAL\b/i,
    /\bFailed with exit code [^0]/i,
    /\bProcess completed with exit code [^0]/i,
    /\bnpm ERR!/i,
    /\bCould not find\b/i,
    /\bPermission denied\b/i,
    /\bConnection refused\b/i,
    /\bSyntaxError\b/,
    /\bTypeError\b/,
    /\bReferenceError\b/,
    /\bAssertionError\b/,
    /\bEACCES\b/,
    /\bENOENT\b/,
];
let LogsService = class LogsService {
    parseJobLog(jobId, jobName, rawLog) {
        const lines = rawLog.split('\n');
        const steps = this.splitIntoSteps(lines);
        const hasErrors = steps.some((s) => s.hasErrors);
        const totalLines = lines.length;
        return { jobId, jobName, steps, totalLines, hasErrors };
    }
    splitIntoSteps(rawLines) {
        const steps = [];
        let currentStepLines = [];
        let currentStepName = 'Setup';
        let stepNumber = 0;
        for (const line of rawLines) {
            const stripped = this.stripTimestamp(line);
            if (GROUP_RE.test(stripped)) {
                if (currentStepLines.length > 0) {
                    steps.push(this.buildStepLog(stepNumber, currentStepName, currentStepLines));
                    stepNumber++;
                }
                const match = STEP_MARKER_RE.exec(stripped);
                currentStepName = match ? match[1].trim() : stripped.replace(GROUP_RE, '').trim();
                currentStepLines = [];
            }
            else if (ENDGROUP_RE.test(stripped)) {
            }
            else {
                currentStepLines.push(line);
            }
        }
        if (currentStepLines.length > 0) {
            steps.push(this.buildStepLog(stepNumber, currentStepName, currentStepLines));
        }
        return steps;
    }
    buildStepLog(number, name, rawLines) {
        const lines = rawLines.map((raw, idx) => this.parseLine(idx + 1, raw));
        const hasErrors = lines.some((l) => l.isError);
        const errorCount = lines.filter((l) => l.isError).length;
        return { stepName: name, stepNumber: number, lines, hasErrors, errorCount };
    }
    parseLine(lineNumber, raw) {
        const timestampMatch = TIMESTAMP_RE.exec(raw);
        const timestamp = timestampMatch ? timestampMatch[1] : null;
        const content = timestamp
            ? raw.slice(timestampMatch[0].length)
            : raw;
        const level = this.classifyLevel(content);
        const isError = level === 'error' || this.matchesErrorHeuristic(content);
        const displayContent = content
            .replace(/^##\[(error|warning|debug|command|group|endgroup)\]/i, '')
            .trim();
        return { lineNumber, timestamp, level, content: displayContent, isError };
    }
    classifyLevel(content) {
        if (ERROR_RE.test(content))
            return 'error';
        if (WARNING_RE.test(content))
            return 'warning';
        if (DEBUG_RE.test(content))
            return 'debug';
        if (COMMAND_RE.test(content))
            return 'command';
        return 'info';
    }
    matchesErrorHeuristic(content) {
        return ERROR_HEURISTICS.some((re) => re.test(content));
    }
    stripTimestamp(line) {
        return line.replace(TIMESTAMP_RE, '');
    }
};
exports.LogsService = LogsService;
exports.LogsService = LogsService = __decorate([
    (0, common_1.Injectable)()
], LogsService);
//# sourceMappingURL=logs.service.js.map