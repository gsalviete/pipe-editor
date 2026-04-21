import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DemoService } from './demo.service';

@ApiTags('Demo')
@Controller('api/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('workflows')
  @ApiOperation({ summary: 'List available demo workflows (no auth required)' })
  listWorkflows() {
    return this.demo.listWorkflows();
  }

  @Get('workflows/:name/graph')
  @ApiOperation({ summary: 'Get parsed DAG graph for a demo workflow' })
  getGraph(@Param('name') name: string) {
    return this.demo.getGraph(name);
  }

  @Get('workflows/:name/logs/:jobId')
  @ApiOperation({ summary: 'Get fake structured logs for a demo job' })
  getLogs(@Param('name') name: string, @Param('jobId') jobId: string) {
    return this.demo.getFakeJobLog(name, jobId);
  }
}
