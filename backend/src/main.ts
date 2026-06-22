import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// EDITOR-API-NFR-001: backend binds 127.0.0.1 only. Defense-in-depth on
// top of ADR-0008's workspace-root containment. See
// docs/specs/visual-editor.spec.md "Security model".
export const BIND_ADDRESS = '127.0.0.1';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);

  // EDITOR-API-NFR-002: narrow CORS, never wildcard.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Pipe Editor API')
    .setDescription('CI/CD Pipeline Visualizer and Debugger')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  return app;
}

async function bootstrap(): Promise<void> {
  let app: INestApplication;
  try {
    app = await createApp();
  } catch (err) {
    // PIPE_EDITOR_WORKSPACE_ROOT misconfiguration surfaces here
    // (EDITOR-API-FR-003 / EDITOR-AC-001).
    console.error('Backend refused to start.');
    console.error((err as Error).message);
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, BIND_ADDRESS);
  // eslint-disable-next-line no-console
  console.log(`Backend running at http://${BIND_ADDRESS}:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs: http://${BIND_ADDRESS}:${port}/api/docs`);
}

if (require.main === module) {
  void bootstrap();
}
