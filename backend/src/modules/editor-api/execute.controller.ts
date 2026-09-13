// Pipeline execution over HTTP — the Executor's UI surface.
//
//   GET  /api/execute/availability   → { available }  (docker probe, cached)
//   POST /api/execute                → 202 { runId }  (starts a run)
//   GET  /api/execute/:id/events     → Server-Sent Events stream:
//                                      stage-started / stage-output /
//                                      stage-finished / run-finished / run-error
//   GET  /api/execute/:id            → run summary (polling fallback)
//   POST /api/execute/:id/abort      → 202 (best-effort cancel)
//
// projectPath is validated with the SAME workspace-root containment as
// /api/detect; the IR is validated with the same validate() gate as
// /api/generate. The run itself executes in temp-copy containers (see
// the executor module's security notes).

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { dockerAvailable } from '../executor';
import { PipelineIR, validate } from '../ir';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import { isTerminalRunEvent, RunRegistry } from './run-registry';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

const ALLOWED_FIELDS = ['projectPath', 'ir'] as const;
const AVAILABILITY_CACHE_MS = 15_000;

@ApiTags('Editor')
@Controller('api')
export class ExecuteController {
  private availabilityCache: { at: number; available: boolean } | null = null;

  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
    private readonly registry: RunRegistry,
  ) {}

  @Get('execute/availability')
  @ApiOperation({ summary: 'Whether a working docker CLI is available for local runs.' })
  async availability() {
    const now = Date.now();
    if (
      this.availabilityCache === null ||
      now - this.availabilityCache.at > AVAILABILITY_CACHE_MS
    ) {
      this.availabilityCache = { at: now, available: await dockerAvailable() };
    }
    return { available: this.availabilityCache.available };
  }

  @Post('execute')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Start a local pipeline run for the supplied IR against a project under the workspace root.',
  })
  async start(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(
        400,
        'INVALID_IR',
        'Request body must be a JSON object with projectPath and ir fields.',
      );
    }
    const extras = Object.keys(body).filter(
      (k) => !(ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (extras.length > 0) {
      throw httpError(400, 'INVALID_IR', `Unexpected fields in request body: ${extras.join(', ')}.`);
    }

    const pathResult = checkProjectPath(
      body.projectPath,
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (pathResult.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', pathResult.reason);
    }
    if (pathResult.kind === 'not-found') {
      throw httpError(
        404,
        'PATH_NOT_FOUND',
        'The supplied projectPath does not exist within the workspace root.',
      );
    }
    if (pathResult.kind === 'outside') {
      throw httpError(
        403,
        'PATH_OUTSIDE_WORKSPACE',
        'The supplied projectPath resolves outside the workspace root.',
      );
    }

    if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
      throw httpError(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
    }
    const validationErrors = validate(body.ir);
    if (validationErrors.length > 0) {
      throw httpError(400, 'INVALID_IR', 'Supplied IR failed validate().', validationErrors);
    }

    if (!(await this.availability()).available) {
      throw httpError(
        409,
        'DOCKER_UNAVAILABLE',
        'Docker is not available (CLI missing or daemon not running). Start Docker to run pipelines locally.',
      );
    }

    const runId = this.registry.start(
      body.ir as PipelineIR,
      pathResult.realCandidate,
      String(body.projectPath),
    );
    return { runId };
  }

  @Get('execute')
  @ApiOperation({ summary: 'All retained runs, newest first (run history).' })
  list() {
    return { runs: this.registry.list() };
  }

  @Get('execute/:runId')
  @ApiOperation({ summary: 'Run summary — status and (when finished) the full result.' })
  summary(@Param('runId') runId: string) {
    const run = this.registry.get(runId);
    if (run === undefined) {
      throw httpError(404, 'RUN_NOT_FOUND', `No run with id ${runId}.`);
    }
    return run;
  }

  @Get('execute/:runId/events')
  @ApiOperation({
    summary:
      'Server-Sent Events stream of run progress. Buffered events are replayed on connect.',
  })
  events(
    @Param('runId') runId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (this.registry.get(runId) === undefined) {
      throw httpError(404, 'RUN_NOT_FOUND', `No run with id ${runId}.`);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable proxy buffering (nginx) so events flush immediately.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    // `unsubscribe` is assigned AFTER subscribe() returns, but subscribe()
    // replays buffered events synchronously — declare with let so the
    // listener can reference it safely during replay (it is undefined
    // then; the post-subscribe check below handles a buffered terminal).
    let closed = false;
    // Heartbeat comments keep the stream alive through proxies during
    // long silent stages (a docker pull can be quiet for minutes).
    const heartbeat = setInterval(() => {
      if (!closed) res.write(': heartbeat\n\n');
    }, 15_000);

    let unsubscribe: (() => void) | undefined;
    unsubscribe = this.registry.subscribe(runId, (event) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (isTerminalRunEvent(event)) {
        closed = true;
        clearInterval(heartbeat);
        res.end();
        unsubscribe?.();
      }
    });
    // SEC-09 — the run can be evicted between the get() above and this
    // subscribe(), in which case subscribe() returns undefined: no terminal
    // event would ever arrive, the heartbeat would run forever and the
    // response would stay open until the client happened to disconnect.
    // Close it ourselves and say why.
    if (unsubscribe === undefined) {
      closed = true;
      clearInterval(heartbeat);
      res.write(
        `data: ${JSON.stringify({
          type: 'stream-closed',
          runId,
          reason: 'run-evicted',
          message:
            'This run left the registry before its stream could attach. Its final result is in the run history.',
        })}\n\n`,
      );
      res.end();
      return;
    }
    if (closed) unsubscribe?.();

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe?.();
    });
  }

  @Post('execute/:runId/abort')
  @HttpCode(202)
  @ApiOperation({ summary: 'Best-effort cancellation of a running pipeline.' })
  abort(@Param('runId') runId: string) {
    if (!this.registry.abort(runId)) {
      throw httpError(404, 'RUN_NOT_FOUND', `No run with id ${runId}.`);
    }
    return { aborting: true };
  }
}
