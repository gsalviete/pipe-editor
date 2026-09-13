import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { relative } from 'path';
import {
  generateWorkspaceBundle,
  inspectWorkspace,
  WorkspacePlanValidationError,
  type ComposeMode,
  type WorkspaceCiProvider,
  type WorkspacePlan,
} from '../workspace-bundle';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

const INSPECT_FIELDS = ['projectPath'] as const;
const GENERATE_FIELDS = ['plan', 'provider', 'composeMode'] as const;
const PROVIDERS = ['github-actions', 'gitlab-ci'] as const;
const COMPOSE_MODES = ['root', 'per-service'] as const;

@ApiTags('Workspace')
@Controller('api/workspace')
export class WorkspaceController {
  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
  ) {}

  @Post('inspect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Detect the Node services inside a local workspace folder.' })
  inspect(@Body() body: Record<string, unknown> | null | undefined) {
    requireObjectWithFields(body, INSPECT_FIELDS, 'INVALID_PROJECT_PATH');

    const result = checkProjectPath(
      body.projectPath,
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (result.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', result.reason);
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

    const relativePath = relative(this.wsRoot.realpath, result.realCandidate);
    return inspectWorkspace(
      result.realCandidate,
      relativePath === '' ? '.' : relativePath.split('\\').join('/'),
    );
  }

  @Post('generate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Validate a Workspace Plan and generate Docker, Compose, and basic CI files without writing to disk.',
  })
  generate(@Body() body: Record<string, unknown> | null | undefined) {
    requireObjectWithFields(body, GENERATE_FIELDS, 'INVALID_WORKSPACE_PLAN');
    if (!isWorkspacePlan(body.plan)) {
      throw httpError(
        400,
        'INVALID_WORKSPACE_PLAN',
        'plan must be a complete Workspace Plan object.',
      );
    }
    if (!isOneOf(body.provider, PROVIDERS)) {
      throw httpError(
        400,
        'INVALID_WORKSPACE_PLAN',
        'provider must be github-actions or gitlab-ci.',
      );
    }
    if (!isOneOf(body.composeMode, COMPOSE_MODES)) {
      throw httpError(
        400,
        'INVALID_WORKSPACE_PLAN',
        'composeMode must be root or per-service.',
      );
    }

    try {
      return generateWorkspaceBundle(
        body.plan,
        body.provider as WorkspaceCiProvider,
        body.composeMode as ComposeMode,
      );
    } catch (error) {
      if (error instanceof WorkspacePlanValidationError) {
        throw httpError(
          400,
          'INVALID_WORKSPACE_PLAN',
          error.message,
          error.checks,
        );
      }
      throw error;
    }
  }
}

function requireObjectWithFields(
  body: Record<string, unknown> | null | undefined,
  fields: readonly string[],
  code: 'INVALID_PROJECT_PATH' | 'INVALID_WORKSPACE_PLAN',
): asserts body is Record<string, unknown> {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, code, 'Request body must be a JSON object.');
  }
  const extras = Object.keys(body).filter((key) => !fields.includes(key));
  if (extras.length > 0) {
    throw httpError(400, code, `Unexpected fields in request body: ${extras.join(', ')}.`);
  }
}

function isWorkspacePlan(value: unknown): value is WorkspacePlan {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Partial<WorkspacePlan>;
  if (
    typeof plan.version !== 'string' ||
    typeof plan.name !== 'string' ||
    typeof plan.workspacePath !== 'string' ||
    !Array.isArray(plan.services) ||
    !Array.isArray(plan.existingComposeFiles) ||
    !plan.existingComposeFiles.every((path) => typeof path === 'string') ||
    !Array.isArray(plan.warnings)
  ) {
    return false;
  }
  return plan.services.every((service) => {
    if (service === null || typeof service !== 'object' || Array.isArray(service)) return false;
    return (
      typeof service.id === 'string' &&
      typeof service.name === 'string' &&
      typeof service.path === 'string' &&
      typeof service.enabled === 'boolean' &&
      ['vite', 'nestjs', 'node-generic'].includes(service.stack) &&
      ['frontend', 'backend', 'service'].includes(service.kind) &&
      typeof service.containerPort === 'number' &&
      typeof service.hostPort === 'number' &&
      typeof service.startCommand === 'string' &&
      service.ir !== null &&
      typeof service.ir === 'object'
    );
  });
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
