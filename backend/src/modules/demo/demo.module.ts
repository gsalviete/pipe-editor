import { Module } from '@nestjs/common';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';
import { ParserModule } from '../parser/parser.module';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [ParserModule, GraphModule],
  providers: [DemoService],
  controllers: [DemoController],
})
export class DemoModule {}
