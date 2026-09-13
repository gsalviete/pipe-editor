// POST /api/advise — the Pipeline Doctor. Pure analysis, no side
// effects; the UI calls it automatically as the pipeline is edited.

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { analyzePipeline } from '../advisor';
import { PipelineIR, validate } from '../ir';
import { httpError } from './http-errors';

@ApiTags('Editor')
@Controller('api')
export class AdviseController {
  @Post('advise')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Analyze a PipelineIR against CI/CD best practices; returns a health score and prioritized findings.',
  })
  advise(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'INVALID_IR', 'Request body must be a JSON object with a single ir field.');
    }
    if (body.ir === null || body.ir === undefined || typeof body.ir !== 'object') {
      throw httpError(400, 'INVALID_IR', 'ir must be a PipelineIR object.');
    }
    const errors = validate(body.ir);
    if (errors.length > 0) {
      throw httpError(400, 'INVALID_IR', 'Supplied IR failed validate().', errors);
    }
    return analyzePipeline(body.ir as PipelineIR);
  }
}
