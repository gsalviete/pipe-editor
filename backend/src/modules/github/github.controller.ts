import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GithubService } from './github.service';

function extractToken(authHeader: string | undefined): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new BadRequestException('Missing or malformed Authorization header');
  }
  return authHeader.slice(7);
}

@ApiTags('GitHub')
@Controller('api/github')
export class GithubController {
  constructor(private readonly github: GithubService) {}

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  @Get('auth/url')
  @ApiOperation({ summary: 'Get GitHub OAuth redirect URL' })
  getAuthUrl(@Query('state') state = 'default'): { url: string } {
    return { url: this.github.getOAuthRedirectUrl(state) };
  }

  @Post('auth/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange OAuth code for access token' })
  async handleCallback(
    @Body() body: { code: string },
  ): Promise<{ accessToken: string }> {
    if (!body.code) throw new BadRequestException('code is required');
    const accessToken = await this.github.exchangeCodeForToken(body.code);
    return { accessToken };
  }

  // ─── User ────────────────────────────────────────────────────────────────────

  @Get('user')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated GitHub user' })
  async getUser(@Headers('authorization') auth: string | undefined) {
    return this.github.getAuthenticatedUser(extractToken(auth));
  }

  // ─── Repositories ────────────────────────────────────────────────────────────

  @Get('repos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List repositories for the authenticated user' })
  async listRepos(@Headers('authorization') auth: string | undefined) {
    return this.github.listRepositories(extractToken(auth));
  }

  // ─── Workflows ───────────────────────────────────────────────────────────────

  @Get('repos/:owner/:repo/workflows')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List workflows for a repository' })
  async listWorkflows(
    @Headers('authorization') auth: string | undefined,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.github.listWorkflows(extractToken(auth), owner, repo);
  }

  @Get('repos/:owner/:repo/workflows/:workflowId/runs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recent runs for a workflow' })
  @ApiQuery({ name: 'perPage', required: false })
  async listRuns(
    @Headers('authorization') auth: string | undefined,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Query('perPage') perPage = '10',
  ) {
    return this.github.listWorkflowRuns(
      extractToken(auth),
      owner,
      repo,
      workflowId,
      Number(perPage),
    );
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────────

  @Get('repos/:owner/:repo/runs/:runId/jobs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List jobs for a workflow run' })
  async listJobs(
    @Headers('authorization') auth: string | undefined,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.github.listRunJobs(extractToken(auth), owner, repo, runId);
  }
}
