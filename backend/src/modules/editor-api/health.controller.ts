import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller('api')
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Lightweight API liveness check.' })
  health() {
    return {
      status: 'ok' as const,
      service: 'pipe-editor-api',
      version: '0.1.0',
    };
  }
}
