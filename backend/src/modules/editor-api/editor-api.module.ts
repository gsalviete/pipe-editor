// NestJS module wiring the Editor HTTP layer (POST /api/detect and
// POST /api/generate). The workspace-root token resolves the
// PIPE_EDITOR_WORKSPACE_ROOT env var at module-init time and
// short-circuits start-up if it is unset or invalid (EDITOR-API-FR-003).

import { Module } from '@nestjs/common';
import { DetectController } from './detect.controller';
import { GenerateController } from './generate.controller';
import {
  PIPE_EDITOR_WORKSPACE_ROOT_ENV,
  resolveWorkspaceRoot,
  WORKSPACE_ROOT_TOKEN,
  type WorkspaceRoot,
} from './workspace-root';

@Module({
  controllers: [DetectController, GenerateController],
  providers: [
    {
      provide: WORKSPACE_ROOT_TOKEN,
      useFactory: (): WorkspaceRoot =>
        resolveWorkspaceRoot(process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV]),
    },
  ],
  exports: [WORKSPACE_ROOT_TOKEN],
})
export class EditorApiModule {}
