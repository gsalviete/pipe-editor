// HTTP error envelope for /api/detect and /api/generate, per the
// "Error response" sections of docs/specs/visual-editor.spec.md.
// All 4xx/5xx responses share the same envelope shape:
//   { error: { code, message, detail? } }

import { HttpException } from '@nestjs/common';

export type DetectErrorCode =
  | 'INVALID_PROJECT_PATH'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'PATH_NOT_FOUND'
  | 'NO_MANIFEST'
  | 'MALFORMED_PACKAGE_JSON'
  | 'INTERNAL_IR_DEFECT';

export type GenerateErrorCode =
  | 'INVALID_IR'
  | 'UNRESOLVED_REQUIRED_FIELD'
  | 'UNSUPPORTED_RUNTIME'
  | 'INTERNAL_GENERATOR_DEFECT';

export type ExecuteErrorCode = 'DOCKER_UNAVAILABLE' | 'RUN_NOT_FOUND';

export type ImportErrorCode = 'UNSUPPORTED_CI_CONFIG';

export type WorkspaceErrorCode = 'INVALID_WORKSPACE_PLAN';

export type ErrorCode =
  | DetectErrorCode
  | GenerateErrorCode
  | ExecuteErrorCode
  | ImportErrorCode
  | WorkspaceErrorCode;

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    detail?: unknown;
  };
}

export function envelope(
  code: ErrorCode,
  message: string,
  detail?: unknown,
): ErrorEnvelope {
  return detail === undefined
    ? { error: { code, message } }
    : { error: { code, message, detail } };
}

export function httpError(
  status: number,
  code: ErrorCode,
  message: string,
  detail?: unknown,
): HttpException {
  return new HttpException(envelope(code, message, detail), status);
}
