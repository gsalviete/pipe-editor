// CI import / migration endpoints.
//
//   POST /api/import                 { content, provider? }  → { ir, warnings, provider }
//   POST /api/import/from-project    { projectPath, file }   → { ir, warnings, provider }
//
// from-project reads a CI config that lives INSIDE a workspace
// project (same containment as /api/detect) so the UI can offer
// "visualize this project's existing CI" — and, because the project
// is local, the imported pipeline is immediately runnable.

import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { readFileSync, realpathSync, statSync } from 'fs';
import { resolve, sep } from 'path';
import { CiImportError, importCiConfig, mergeDetectedProjectFacts } from '../ci-import';
import { ALL_RULES, Detector } from '../detector';
import { validate } from '../ir';
import { httpError } from './http-errors';
import { checkProjectPath } from './path-security';
import { WORKSPACE_ROOT_TOKEN, type WorkspaceRoot } from './workspace-root';

const CI_FILE_RE = /^(\.gitlab-ci\.ya?ml|\.github\/workflows\/[^/]+\.ya?ml)$/;
const MAX_CONTENT_BYTES = 512 * 1024;

@ApiTags('Editor')
@Controller('api')
export class ImportController {
  constructor(
    @Inject(WORKSPACE_ROOT_TOKEN) private readonly wsRoot: WorkspaceRoot,
  ) {}

  @Post('import')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Convert a GitHub Actions workflow or GitLab CI config into a PipelineIR (provider auto-detected unless specified).',
  })
  import(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'INVALID_IR', 'Request body must be a JSON object with a content field.');
    }
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      throw httpError(400, 'INVALID_IR', 'content must be a non-empty string.');
    }
    this.assertContentSize(body.content);
    const provider = body.provider ?? 'auto';
    if (provider !== 'auto' && provider !== 'github-actions' && provider !== 'gitlab-ci') {
      throw httpError(400, 'INVALID_IR', 'provider must be github-actions, gitlab-ci or auto.');
    }
    return this.convert(body.content, provider);
  }

  @Post('import/from-project')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Import a CI config file that lives inside a workspace project (e.g. .github/workflows/ci.yml) — the result is runnable against that project.",
  })
  fromProject(@Body() body: Record<string, unknown> | null | undefined) {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(
        400,
        'INVALID_PROJECT_PATH',
        'Request body must be a JSON object with projectPath and file fields.',
      );
    }
    const pathResult = checkProjectPath(
      body.projectPath,
      this.wsRoot.realpath,
      this.wsRoot.displayRoot,
    );
    if (pathResult.kind === 'invalid') {
      throw httpError(400, 'INVALID_PROJECT_PATH', pathResult.reason);
    }
    if (pathResult.kind === 'not-found') {
      throw httpError(404, 'PATH_NOT_FOUND', 'The supplied projectPath does not exist within the workspace root.');
    }
    if (pathResult.kind === 'outside') {
      throw httpError(403, 'PATH_OUTSIDE_WORKSPACE', 'The supplied projectPath resolves outside the workspace root.');
    }

    if (typeof body.file !== 'string' || !CI_FILE_RE.test(body.file)) {
      throw httpError(
        400,
        'INVALID_PROJECT_PATH',
        'file must be .gitlab-ci.yml or .github/workflows/<name>.yml, relative to the project.',
      );
    }
    let content: string;
    try {
      const candidate = realpathSync(resolve(pathResult.realCandidate, body.file));
      if (
        candidate !== pathResult.realCandidate &&
        !candidate.startsWith(pathResult.realCandidate + sep)
      ) {
        throw httpError(403, 'PATH_OUTSIDE_WORKSPACE', 'The CI file resolves outside the project.');
      }
      if (statSync(candidate).size > MAX_CONTENT_BYTES) {
        throw httpError(400, 'INVALID_IR', 'content is too large (limit 512 KiB).');
      }
      content = readFileSync(candidate, 'utf-8');
    } catch (err) {
      if ((err as { status?: number }).status !== undefined) throw err;
      throw httpError(404, 'PATH_NOT_FOUND', `Could not read ${body.file} in the project.`);
    }
    this.assertContentSize(content);
    const result = this.convert(content, 'auto');

    // The project is on disk — let the Detector fill whatever the CI
    // config alone could not infer (language, exact versions…), so the
    // imported pipeline is immediately runnable and generatable.
    try {
      const detected = new Detector({ rules: ALL_RULES }).detect(pathResult.realCandidate);
      const merged = mergeDetectedProjectFacts(result.ir, detected.ir);
      if (validate(merged).length === 0) {
        return { ...result, ir: merged };
      }
    } catch {
      /* detection failed (e.g. exotic manifest) — the unmerged import is still useful */
    }
    return result;
  }

  private convert(content: string, provider: 'auto' | 'github-actions' | 'gitlab-ci') {
    try {
      const result = importCiConfig(content, provider);
      const errors = validate(result.ir);
      if (errors.length > 0) {
        // A converter defect, not a user error — surface loudly.
        throw httpError(
          500,
          'INTERNAL_IR_DEFECT',
          'The imported configuration converted to an invalid pipeline.',
          errors,
        );
      }
      return result;
    } catch (err) {
      if (err instanceof CiImportError) {
        throw httpError(422, 'UNSUPPORTED_CI_CONFIG', err.message);
      }
      throw err;
    }
  }

  private assertContentSize(content: string): void {
    if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
      throw httpError(400, 'INVALID_IR', 'content is too large (limit 512 KiB).');
    }
  }
}
