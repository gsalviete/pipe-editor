import { Injectable } from '@nestjs/common';
import type {
  JobLog,
  StepLog,
  LogLine,
  LogLevel,
} from '../../common/types/pipeline.types';

// ─── Regex patterns ───────────────────────────────────────────────────────────

/**
 * GitHub Actions log lines look like:
 *   2024-01-15T10:23:45.1234567Z ##[group]Run actions/checkout@v4
 *   2024-01-15T10:23:45.1234567Z   with:
 *   2024-01-15T10:23:45.1234567Z ##[error]Error: Process completed with exit code 1
 */
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s/;
const GROUP_RE = /^##\[group\]/;
const ENDGROUP_RE = /^##\[endgroup\]/;
const ERROR_RE = /^##\[error\]/;
const WARNING_RE = /^##\[warning\]/;
const DEBUG_RE = /^##\[debug\]/;
const COMMAND_RE = /^##\[command\]/;
const STEP_MARKER_RE = /^##\[group\]Run\s+(.+)$/;

// Heuristics for error detection (without explicit ##[error] marker)
const ERROR_HEURISTICS: RegExp[] = [
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

@Injectable()
export class LogsService {
  parseJobLog(jobId: number, jobName: string, rawLog: string): JobLog {
    const lines = rawLog.split('\n');
    const steps = this.splitIntoSteps(lines);

    const hasErrors = steps.some((s) => s.hasErrors);
    const totalLines = lines.length;

    return { jobId, jobName, steps, totalLines, hasErrors };
  }

  // ─── Split raw log into steps ─────────────────────────────────────────────────

  private splitIntoSteps(rawLines: string[]): StepLog[] {
    const steps: StepLog[] = [];
    let currentStepLines: string[] = [];
    let currentStepName = 'Setup';
    let stepNumber = 0;

    for (const line of rawLines) {
      const stripped = this.stripTimestamp(line);

      if (GROUP_RE.test(stripped)) {
        // Flush previous step
        if (currentStepLines.length > 0) {
          steps.push(this.buildStepLog(stepNumber, currentStepName, currentStepLines));
          stepNumber++;
        }

        // Start a new step
        const match = STEP_MARKER_RE.exec(stripped);
        currentStepName = match ? match[1].trim() : stripped.replace(GROUP_RE, '').trim();
        currentStepLines = [];
      } else if (ENDGROUP_RE.test(stripped)) {
        // Ignore end-group markers; they close sections handled by groups
      } else {
        currentStepLines.push(line);
      }
    }

    // Flush the last step
    if (currentStepLines.length > 0) {
      steps.push(this.buildStepLog(stepNumber, currentStepName, currentStepLines));
    }

    return steps;
  }

  // ─── Build StepLog from raw lines ─────────────────────────────────────────────

  private buildStepLog(
    number: number,
    name: string,
    rawLines: string[],
  ): StepLog {
    const lines: LogLine[] = rawLines.map((raw, idx) =>
      this.parseLine(idx + 1, raw),
    );

    const hasErrors = lines.some((l) => l.isError);
    const errorCount = lines.filter((l) => l.isError).length;

    return { stepName: name, stepNumber: number, lines, hasErrors, errorCount };
  }

  // ─── Parse a single log line ──────────────────────────────────────────────────

  private parseLine(lineNumber: number, raw: string): LogLine {
    const timestampMatch = TIMESTAMP_RE.exec(raw);
    const timestamp = timestampMatch ? timestampMatch[1] : null;

    const content = timestamp
      ? raw.slice(timestampMatch![0].length)
      : raw;

    const level = this.classifyLevel(content);
    const isError = level === 'error' || this.matchesErrorHeuristic(content);

    // Strip control markers from content for display
    const displayContent = content
      .replace(/^##\[(error|warning|debug|command|group|endgroup)\]/i, '')
      .trim();

    return { lineNumber, timestamp, level, content: displayContent, isError };
  }

  // ─── Level classification ─────────────────────────────────────────────────────

  private classifyLevel(content: string): LogLevel {
    if (ERROR_RE.test(content)) return 'error';
    if (WARNING_RE.test(content)) return 'warning';
    if (DEBUG_RE.test(content)) return 'debug';
    if (COMMAND_RE.test(content)) return 'command';
    return 'info';
  }

  private matchesErrorHeuristic(content: string): boolean {
    return ERROR_HEURISTICS.some((re) => re.test(content));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private stripTimestamp(line: string): string {
    return line.replace(TIMESTAMP_RE, '');
  }
}
