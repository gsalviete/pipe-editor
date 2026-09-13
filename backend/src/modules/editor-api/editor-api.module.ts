// NestJS module wiring the Editor HTTP layer:
//   POST /api/detect              — detect a project into a PipelineIR
//   POST /api/generate            — Dockerfile + .dockerignore from an IR
//   GET  /api/projects            — workspace project discovery (picker)
//   /api/execute/*                — local pipeline runs (start/SSE/abort)
//
// The workspace-root token resolves the PIPE_EDITOR_WORKSPACE_ROOT env
// var at module-init time and short-circuits start-up if it is unset
// or invalid (EDITOR-API-FR-003).

import { Module } from '@nestjs/common';
import { AdviseController } from './advise.controller';
import { DetectController } from './detect.controller';
import { ExecuteController } from './execute.controller';
import { ExportController } from './export.controller';
import { GenerateController } from './generate.controller';
import { HealthController } from './health.controller';
import { ImportController } from './import.controller';
import { ProjectsController } from './projects.controller';
import { RunRegistry } from './run-registry';
import { STATE_STORE_TOKEN, StateController } from './state.controller';
import { WorkspaceController } from './workspace.controller';
import { defaultDataDir, StateStore } from '../state-store';
import { execute } from '../executor';
import {
  PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT_ENV,
  PIPE_EDITOR_WORKSPACE_ROOT_ENV,
  resolveWorkspaceRoot,
  WORKSPACE_ROOT_TOKEN,
  type WorkspaceRoot,
} from './workspace-root';

@Module({
  controllers: [
    AdviseController,
    DetectController,
    GenerateController,
    HealthController,
    ExportController,
    ImportController,
    ProjectsController,
    ExecuteController,
    StateController,
    WorkspaceController,
  ],
  providers: [
    {
      provide: WORKSPACE_ROOT_TOKEN,
      useFactory: (): WorkspaceRoot =>
        resolveWorkspaceRoot(
          process.env[PIPE_EDITOR_WORKSPACE_ROOT_ENV],
          process.env[PIPE_EDITOR_WORKSPACE_DISPLAY_ROOT_ENV],
        ),
    },
    {
      provide: STATE_STORE_TOKEN,
      useFactory: (wsRoot: WorkspaceRoot): StateStore =>
        new StateStore(defaultDataDir(), wsRoot.realpath),
      inject: [WORKSPACE_ROOT_TOKEN],
    },
    {
      provide: RunRegistry,
      useFactory: (store: StateStore): RunRegistry =>
        new RunRegistry(execute, 20, store),
      inject: [STATE_STORE_TOKEN],
    },
  ],
  exports: [WORKSPACE_ROOT_TOKEN],
})
export class EditorApiModule {}
