import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubModule } from './modules/github/github.module';
import { ParserModule } from './modules/parser/parser.module';
import { GraphModule } from './modules/graph/graph.module';
import { LogsModule } from './modules/logs/logs.module';
import { DemoModule } from './modules/demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Don't throw if .env is missing — demo mode works without OAuth credentials
      ignoreEnvFile: false,
    }),
    GithubModule,
    ParserModule,
    GraphModule,
    LogsModule,
    DemoModule,
  ],
})
export class AppModule {}
