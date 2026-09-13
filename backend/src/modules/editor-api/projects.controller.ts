// GET /api/projects — list candidate projects under the workspace
// root so the frontend can offer a picker instead of a hand-typed
// path. Read-only; the same containment boundary as /api/detect (the
// scan never leaves the workspace root).

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { statSync } from 'fs';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import {
  findWorkspaceDirectoriesByName,
  listWorkspaceDirectory,
  scanProjects,
} from './project-scan';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

@ApiTags('Editor')
@Controller('api')
export class ProjectsController {
  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
  ) {}

  @Get('projects')
  @ApiOperation({
    summary:
      'Discover projects (directories with a package.json) under PIPE_EDITOR_WORKSPACE_ROOT.',
  })
  projects() {
    return {
      workspaceRoot: this.wsRoot.displayRoot,
      projects: scanProjects(this.wsRoot.realpath),
    };
  }

  @Get('directories')
  @ApiOperation({
    summary: 'Browse directories contained by PIPE_EDITOR_WORKSPACE_ROOT.',
  })
  directories(@Query('path') requestedPath?: string) {
    const result = checkProjectPath(
      requestedPath ?? '.',
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (result.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', result.reason, {
        workspaceRoot: this.wsRoot.displayRoot,
      });
    }
    if (result.kind === 'not-found') {
      throw httpError(
        404,
        'PATH_NOT_FOUND',
        `That folder does not exist. Choose a folder inside ${this.wsRoot.displayRoot}.`,
        { workspaceRoot: this.wsRoot.displayRoot },
      );
    }
    if (result.kind === 'outside') {
      throw httpError(
        403,
        'PATH_OUTSIDE_WORKSPACE',
        `That folder is outside the configured workspace root: ${this.wsRoot.displayRoot}.`,
        { workspaceRoot: this.wsRoot.displayRoot },
      );
    }
    if (!statSync(result.realCandidate).isDirectory()) {
      throw httpError(400, 'INVALID_PROJECT_PATH', 'Choose a directory, not a file.');
    }
    return listWorkspaceDirectory(
      this.wsRoot.realpath,
      result.realCandidate,
      this.wsRoot.displayRoot,
    );
  }

  @Get('directories/resolve')
  @ApiOperation({
    summary: 'Resolve a browser-dropped folder name inside the workspace root.',
  })
  resolveDroppedDirectory(@Query('name') requestedName?: string) {
    const name = requestedName?.trim() ?? '';
    if (
      name === '' ||
      name === '.' ||
      name === '..' ||
      name.includes('/') ||
      name.includes('\\') ||
      name.includes('\0')
    ) {
      throw httpError(
        400,
        'INVALID_PROJECT_PATH',
        'Dropped folder name must be one plain directory name.',
      );
    }
    return {
      workspaceRoot: this.wsRoot.displayRoot,
      matches: findWorkspaceDirectoriesByName(this.wsRoot.realpath, name),
    };
  }
}
