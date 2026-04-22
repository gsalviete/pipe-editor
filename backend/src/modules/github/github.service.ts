import { Injectable, UnauthorizedException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import type {
  RepoSummary,
  WorkflowSummary,
  WorkflowRun,
  JobRun,
  StepRun,
  JobStatus,
  JobConclusion,
} from '../../common/types/pipeline.types';
import type { GitHubUser, RawWorkflowFile } from './github.types';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    this.clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled. Demo mode only.',
      );
    }
  }

  private requireCredentials(): { clientId: string; clientSecret: string } {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException(
        'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable.',
      );
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret };
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  getOAuthRedirectUrl(state: string): string {
    const { clientId } = this.requireCredentials();
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const redirectUri = `${frontendUrl}/`;
    const scopes = ['repo', 'read:user'].join(',');
    return (
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}` +
      `&state=${state}`
    );
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const { clientId, clientSecret } = this.requireCredentials();
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const redirectUri = `${frontendUrl}/`;
    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      this.logger.error('GitHub OAuth error', data.error_description);
      throw new UnauthorizedException(
        data.error_description ?? 'OAuth exchange failed',
      );
    }

    return data.access_token;
  }

  // ─── User ────────────────────────────────────────────────────────────────────

  async getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
    const octokit = this.createClient(accessToken);
    const { data } = await octokit.users.getAuthenticated();
    return {
      id: data.id,
      login: data.login,
      name: data.name ?? null,
      email: data.email ?? null,
      avatarUrl: data.avatar_url,
    };
  }

  // ─── Repositories ────────────────────────────────────────────────────────────

  async listRepositories(accessToken: string): Promise<RepoSummary[]> {
    const octokit = this.createClient(accessToken);
    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'updated',
      type: 'all',
    });

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      private: r.private,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
      updatedAt: r.updated_at ?? new Date().toISOString(),
    }));
  }

  // ─── Workflows ───────────────────────────────────────────────────────────────

  async listWorkflows(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<WorkflowSummary[]> {
    const octokit = this.createClient(accessToken);
    const { data } = await octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 });

    return data.workflows.map((w) => ({
      id: w.id,
      name: w.name,
      path: w.path,
      state: w.state as WorkflowSummary['state'],
    }));
  }

  async fetchWorkflowFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
  ): Promise<RawWorkflowFile> {
    const octokit = this.createClient(accessToken);
    const { data } = await octokit.repos.getContent({ owner, repo, path });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { name: data.name, path: data.path, content };
  }

  // ─── Workflow Runs ───────────────────────────────────────────────────────────

  async listWorkflowRuns(
    accessToken: string,
    owner: string,
    repo: string,
    workflowId: number,
    perPage = 10,
  ): Promise<WorkflowRun[]> {
    const octokit = this.createClient(accessToken);
    const { data } = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
      per_page: perPage,
    });

    return data.workflow_runs.map((r) => ({
      id: r.id,
      name: r.name ?? 'Unnamed run',
      status: (r.status ?? 'queued') as JobStatus,
      conclusion: (r.conclusion ?? null) as JobConclusion,
      headBranch: r.head_branch ?? '',
      headSha: r.head_sha,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      url: r.html_url,
      triggerEvent: r.event,
      actor: r.actor?.login ?? 'unknown',
    }));
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────────

  async listRunJobs(
    accessToken: string,
    owner: string,
    repo: string,
    runId: number,
  ): Promise<JobRun[]> {
    const octokit = this.createClient(accessToken);
    const { data } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
      per_page: 100,
    });

    return data.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status as JobStatus,
      conclusion: (j.conclusion ?? null) as JobConclusion,
      startedAt: j.started_at ?? null,
      completedAt: j.completed_at ?? null,
      runnerName: j.runner_name ?? undefined,
      steps: (j.steps ?? []).map((s) => ({
        name: s.name,
        number: s.number,
        status: s.status as JobStatus,
        conclusion: (s.conclusion ?? null) as JobConclusion,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null,
      })) satisfies StepRun[],
    }));
  }

  // ─── Logs ────────────────────────────────────────────────────────────────────

  async downloadJobLogs(
    accessToken: string,
    owner: string,
    repo: string,
    jobId: number,
  ): Promise<string> {
    const octokit = this.createClient(accessToken);

    // GitHub's API returns a 302 redirect to a temporary S3 URL.
    // Node.js fetch (used by @octokit/request) follows redirects by default.
    // The redirect target responds with content-type: text/plain, so
    // @octokit/request calls response.text() and resolves data as a string.
    // The typed wrapper method types data as `never` (it's a redirect endpoint),
    // so we use octokit.request<string> to express the real runtime return type.
    const { data } = await octokit.request<string>(
      'GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs',
      { owner, repo, job_id: jobId },
    );

    return data;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private createClient(accessToken: string): Octokit {
    return new Octokit({ auth: accessToken });
  }
}
