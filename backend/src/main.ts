import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { json, NextFunction, Request, Response } from 'express';
import { hostGuard } from './modules/editor-api/host-guard';

// EDITOR-API-NFR-001: backend binds 127.0.0.1 only by default. Defense-in-
// depth on top of ADR-0008's workspace-root containment. See
// docs/specs/visual-editor.spec.md "Security model".
//
// In a container, 127.0.0.1 is the container's loopback and is not
// reachable from sibling containers (e.g. the frontend's nginx); when
// running via docker-compose, set BIND_ADDRESS=0.0.0.0 and gate the
// host's LAN exposure at the port-mapping layer instead (the compose
// stack maps `127.0.0.1:3000:3000`). The two-layer rule is documented
// in ADR-0009.
export const BIND_ADDRESS = process.env.BIND_ADDRESS ?? '127.0.0.1';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // CI import accepts documents up to 512 KiB. Express defaults to 100 KiB,
  // which made the controller's documented limit unreachable.
  app.use(json({ limit: '1mb' }));

  // SEC-01 — reject requests not addressed to this machine (DNS rebinding)
  // and cross-site state-changing requests. Runs before everything else so a
  // rejected request never reaches a controller or the filesystem.
  app.use(hostGuard());

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // EDITOR-API-NFR-002: narrow CORS, never wildcard.
  //
  // SEC-08 — no `credentials: true`. The API has no cookies, no session and
  // no token, so allowing credentials bought nothing and widened what a
  // permitted origin could do.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
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
    .setDescription(
      'Spec-driven pipeline editor — detect a project into a Pipeline IR, edit it, generate portable artifacts.',
    )
    .setVersion('0.1.0')
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
