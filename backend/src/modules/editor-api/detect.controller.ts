// POST /api/detect — the Detector's HTTP entry point.
//
// Covers EDITOR-API-FR-001…010 and the error-mapping table in
// docs/specs/visual-editor.spec.md. The controller is a thin layer:
// path validation + containment, then a verbatim passthrough of
// `detect(rootPath)`'s `{ ir, warnings }` to the HTTP response.

import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ALL_RULES,
  Detector,
  InvalidProducedIRError,
  MalformedPackageJsonError,
  NoManifestError,
  NoRootDirError,
  RuleConflictError,
  RuleDefectError,
  RuleRegistrationError,
} from '../detector';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

const ALLOWED_FIELDS = ['projectPath'] as const;

@ApiTags('Editor')
@Controller('api')
export class DetectController {
  private readonly detector: Detector;

  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
  ) {
    this.detector = new Detector({ rules: ALL_RULES });
  }

  @Post('detect')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Detect a PipelineIR from a project under PIPE_EDITOR_WORKSPACE_ROOT.',
  })
  detect(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(
        400,
        'INVALID_PROJECT_PATH',
        'Request body must be a JSON object with a single projectPath field.',
      );
    }
    const extras = Object.keys(body).filter(
      (k) => !(ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (extras.length > 0) {
      throw httpError(
        400,
        'INVALID_PROJECT_PATH',
        `Unexpected fields in request body: ${extras.join(', ')}.`,
      );
    }

    const result = checkProjectPath(
      body.projectPath,
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (result.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', result.reason);
    }
    if (result.kind === 'not-found') {
      throw httpError(
        404,
        'PATH_NOT_FOUND',
        `That folder does not exist. Choose a folder inside ${this.wsRoot.displayRoot}.`,
        { workspaceRoot: this.wsRoot.displayRoot },
      );
    }
    if (result.kind === 'outside') {
      throw httpError(
        403,
        'PATH_OUTSIDE_WORKSPACE',
        `That folder is outside the configured workspace root: ${this.wsRoot.displayRoot}.`,
        { workspaceRoot: this.wsRoot.displayRoot },
      );
    }

    try {
      const { ir, warnings } = this.detector.detect(result.realCandidate);
      return { ir, warnings };
    } catch (err) {
      if (err instanceof NoRootDirError) {
        throw httpError(404, 'PATH_NOT_FOUND', err.message);
      }
      if (err instanceof NoManifestError) {
        throw httpError(422, 'NO_MANIFEST', err.message);
      }
      if (err instanceof MalformedPackageJsonError) {
        throw httpError(
          422,
          'MALFORMED_PACKAGE_JSON',
          err.message,
          { diagnostic: err.message },
        );
      }
      if (
        err instanceof RuleRegistrationError ||
        err instanceof RuleConflictError ||
        err instanceof RuleDefectError ||
        err instanceof InvalidProducedIRError
      ) {
        throw httpError(500, 'INTERNAL_IR_DEFECT', err.message);
      }
      throw err;
    }
  }
}
