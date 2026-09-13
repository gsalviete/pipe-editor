// POST /api/export/:provider — CI provider exports from a (possibly
// edited) PipelineIR. Same validate() + unresolved gates as
// /api/generate; read-only, no server-side disk writes.

import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CiExportArtifact,
  generateGithubActions,
  generateGitlabCi,
} from '../ci-export';
import { findUnrunnableReason, PipelineIR, validate } from '../ir';
import { httpError } from './http-errors';

const ALLOWED_FIELDS = ['ir'] as const;
const PROVIDERS = ['github-actions', 'gitlab-ci'] as const;

@ApiTags('Editor')
@Controller('api')
export class ExportController {
  @Post('export/:provider')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Export the IR as a CI provider configuration (github-actions → .github/workflows/ci.yml, gitlab-ci → .gitlab-ci.yml).',
  })
  export(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown> | null | undefined,
  ): CiExportArtifact {
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      throw httpError(
        400,
        'INVALID_IR',
        `Unknown provider "${provider}". Supported: ${PROVIDERS.join(', ')}.`,
      );
    }
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'INVALID_IR', 'Request body must be a JSON object with a single ir field.');
    }
    const extras = Object.keys(body).filter(
      (k) => !(ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (extras.length > 0) {
      throw httpError(400, 'INVALID_IR', `Unexpected fields in request body: ${extras.join(', ')}.`);
    }
    if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
      throw httpError(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
    }
    const validationErrors = validate(body.ir);
    if (validationErrors.length > 0) {
      throw httpError(400, 'INVALID_IR', 'Supplied IR failed validate().', validationErrors);
    }
    const ir = body.ir as PipelineIR;

    const unrunnable = findUnrunnableReason(ir);
    if (unrunnable !== null && unrunnable.kind === 'unresolved-required-field') {
      throw httpError(
        422,
        'UNRESOLVED_REQUIRED_FIELD',
        `Required field ${unrunnable.field} is unresolved; resolve it before exporting.`,
        { field: unrunnable.field },
      );
    }

    return provider === 'github-actions'
      ? generateGithubActions(ir)
      : generateGitlabCi(ir);
  }
}
