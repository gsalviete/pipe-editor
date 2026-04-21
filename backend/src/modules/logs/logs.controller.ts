import {
  Controller,
  Get,
  Param,
  Headers,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GithubService } from '../github/github.service';
import { LogsService } from './logs.service';
import type { JobLog } from '../../common/types/pipeline.types';

function extractToken(authHeader: string | undefined): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new BadRequestException('Missing or malformed Authorization header');
  }
  return authHeader.slice(7);
}

@ApiTags('Logs')
@Controller('api/logs')
export class LogsController {
  constructor(
    private readonly github: GithubService,
    private readonly logs: LogsService,
  ) {}

  @Get('repos/:owner/:repo/runs/:runId/jobs/:jobId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get structured logs for a job in a run (with name enrichment)' })
  async getJobLogsWithName(
    @Headers('authorization') auth: string | undefined,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('runId', ParseIntPipe) runId: number,
    @Param('jobId', ParseIntPipe) jobId: number,
  ): Promise<JobLog> {
    const token = extractToken(auth);

    // Get job name from run
    const [rawLog, jobRuns] = await Promise.all([
      this.github.downloadJobLogs(token, owner, repo, jobId),
      this.github.listRunJobs(token, owner, repo, runId),
    ]);

    const job = jobRuns.find((j) => j.id === jobId);
    const jobName = job?.name ?? `Job #${jobId}`;

    return this.logs.parseJobLog(jobId, jobName, rawLog);
  }
}
