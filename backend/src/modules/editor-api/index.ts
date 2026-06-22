export { EditorApiModule } from './editor-api.module';
export {
  PIPE_EDITOR_WORKSPACE_ROOT_ENV,
  WORKSPACE_ROOT_TOKEN,
  WorkspaceRootConfigError,
  resolveWorkspaceRoot,
} from './workspace-root';
export type { WorkspaceRoot } from './workspace-root';
export { checkProjectPath } from './path-security';
export type { PathCheckResult } from './path-security';
export { envelope, httpError } from './http-errors';
export type {
  DetectErrorCode,
  ErrorCode,
  ErrorEnvelope,
  GenerateErrorCode,
} from './http-errors';
