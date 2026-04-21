import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';
import { GithubModule } from '../github/github.module';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [GithubModule, ParserModule],
  providers: [GraphService],
  controllers: [GraphController],
  exports: [GraphService],
})
export class GraphModule {}
