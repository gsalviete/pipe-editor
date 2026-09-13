import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EditorApiModule } from './modules/editor-api';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // .env is optional — every setting has a documented default or is
      // supplied via the environment (compose, CI).
      ignoreEnvFile: false,
    }),
    EditorApiModule,
  ],
})
export class AppModule {}
