// Workspace state endpoints — pipeline autosave/restore.
//
//   GET    /api/state/pipelines                 → { pipelines: { path: { savedAt } } }
//   GET    /api/state/pipeline?projectPath=…    → { saved: SavedPipeline | null }
//   PUT    /api/state/pipeline                  → autosave { projectPath, ir }
//   DELETE /api/state/pipeline                  → discard  { projectPath }
//
// projectPath is validated with the same workspace containment as
// /api/detect; the IR with the same validate() gate as /api/generate.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PipelineIR, validate } from '../ir';
import { StateStore } from '../state-store';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

export const STATE_STORE_TOKEN = 'EDITOR_STATE_STORE';

@ApiTags('Editor')
@Controller('api')
export class StateController {
  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
    @Inject(STATE_STORE_TOKEN) private readonly store: StateStore,
  ) {}

  @Get('state/pipelines')
  @ApiOperation({ summary: 'Projects with saved (edited) pipelines — for picker badges.' })
  listPipelines() {
    return { pipelines: this.store.listPipelines() };
  }

  @Get('state/pipeline')
  @ApiOperation({ summary: 'The saved working pipeline for a project, if any.' })
  getPipeline(@Query('projectPath') projectPath: string | undefined) {
    this.checkPath(projectPath);
    return { saved: this.store.getPipeline(projectPath as string) };
  }

  @Put('state/pipeline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Autosave the working pipeline for a project.' })
  savePipeline(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'INVALID_IR', 'Request body must be a JSON object with projectPath and ir.');
    }
    this.checkPath(body.projectPath);
    if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
      throw httpError(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
    }
    const errors = validate(body.ir);
    if (errors.length > 0) {
      throw httpError(400, 'INVALID_IR', 'Supplied IR failed validate().', errors);
    }
    return { saved: this.store.savePipeline(String(body.projectPath), body.ir as PipelineIR) };
  }

  @Delete('state/pipeline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Discard the saved working pipeline for a project.' })
  deletePipeline(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'INVALID_PROJECT_PATH', 'Request body must be a JSON object with projectPath.');
    }
    this.checkPath(body.projectPath);
    return { deleted: this.store.deletePipeline(String(body.projectPath)) };
  }

  private checkPath(projectPath: unknown): void {
    const result = checkProjectPath(
      projectPath,
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (result.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', result.reason);
    }
    if (result.kind === 'not-found') {
      throw httpError(404, 'PATH_NOT_FOUND', 'The supplied projectPath does not exist within the workspace root.');
    }
    if (result.kind === 'outside') {
      throw httpError(403, 'PATH_OUTSIDE_WORKSPACE', 'The supplied projectPath resolves outside the workspace root.');
    }
  }
}
