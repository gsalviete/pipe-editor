import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [GithubModule],
  providers: [LogsService],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}
