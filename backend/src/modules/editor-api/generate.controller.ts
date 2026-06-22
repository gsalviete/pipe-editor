// POST /api/generate — Dockerfile + .dockerignore from a (possibly
// client-supplied) PipelineIR.
//
// Covers EDITOR-API-FR-011…017 and the "Generate error mapping"
// table in docs/specs/visual-editor.spec.md. The controller calls
// validate(ir) BEFORE invoking the generator (the validate gate is
// the trust boundary for client-supplied IRs — see the Trust
// boundary section of the spec).

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { generate, UnsupportedRuntimeError } from '../dockerfile-generator';
import { PipelineIR, validate } from '../ir';
import { httpError } from './http-errors';

const ALLOWED_FIELDS = ['ir'] as const;

function findUnresolvedRequiredField(ir: PipelineIR): string | null {
  if (ir.project?.packageManager?.name == null) return '/project/packageManager/name';
  if (ir.project?.runtime?.version == null) return '/project/runtime/version';
  return null;
}

@ApiTags('Editor')
@Controller('api')
export class GenerateController {
  @Post('generate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Generate a Dockerfile and .dockerignore from a (possibly edited) PipelineIR. Read-only — no server-side disk writes.',
  })
  generate(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(
        400,
        'INVALID_IR',
        'Request body must be a JSON object with a single ir field.',
      );
    }
    const extras = Object.keys(body).filter(
      (k) => !(ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (extras.length > 0) {
      throw httpError(
        400,
        'INVALID_IR',
        `Unexpected fields in request body: ${extras.join(', ')}.`,
      );
    }
    if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
      throw httpError(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
    }

    const validationErrors = validate(body.ir);
    if (validationErrors.length > 0) {
      throw httpError(
        400,
        'INVALID_IR',
        'Supplied IR failed validate().',
        validationErrors,
      );
    }
    const ir = body.ir as PipelineIR;

    const unresolvedField = findUnresolvedRequiredField(ir);
    if (unresolvedField !== null) {
      throw httpError(
        422,
        'UNRESOLVED_REQUIRED_FIELD',
        `Required field ${unresolvedField} is unresolved; resolve it before generating.`,
        { field: unresolvedField },
      );
    }

    try {
      const { dockerfile, dockerignore } = generate(ir);
      return { dockerfile, dockerignore };
    } catch (err) {
      if (err instanceof UnsupportedRuntimeError) {
        throw httpError(422, 'UNSUPPORTED_RUNTIME', err.message, {
          field: '/project/runtime/name',
          supported: ['node'],
        });
      }
      throw httpError(
        500,
        'INTERNAL_GENERATOR_DEFECT',
        (err as Error).message ?? 'Unknown generator error.',
      );
    }
  }
}
