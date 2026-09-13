import type { PipelineIR } from '../ir';

export type ServiceStack = 'vite' | 'nestjs' | 'node-generic';
export type ServiceKind = 'frontend' | 'backend' | 'service';
export type ComposeMode = 'root' | 'per-service';
export type WorkspaceCiProvider = 'github-actions' | 'gitlab-ci';

export interface WorkspaceWarning {
  path: string;
  message: string;
}

export interface WorkspaceService {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  stack: ServiceStack;
  kind: ServiceKind;
  containerPort: number;
  hostPort: number;
  startCommand: string;
  ir: PipelineIR;
}

export interface WorkspacePlan {
  version: '0.1.0';
  name: string;
  workspacePath: string;
  services: WorkspaceService[];
  existingComposeFiles: string[];
  warnings: WorkspaceWarning[];
}

export type WorkspaceArtifactKind =
  | 'dockerfile'
  | 'dockerignore'
  | 'nginx-config'
  | 'compose'
  | 'ci';

export interface WorkspaceArtifact {
  path: string;
  kind: WorkspaceArtifactKind;
  serviceId?: string;
  content: string;
}

export interface WorkspaceCheck {
  id: string;
  status: 'passed' | 'failed';
  message: string;
}

export interface WorkspaceBundle {
  provider: WorkspaceCiProvider;
  composeMode: ComposeMode;
  artifacts: WorkspaceArtifact[];
  checks: WorkspaceCheck[];
}
