import { HttpException } from '@nestjs/common';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImportController } from './import.controller';

describe('ImportController bounds (PRODUCT-AC-011)', () => {
  let workspace: string;
  let controller: ImportController;

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'pipe-editor-import-')));
    controller = new ImportController({
      raw: workspace,
      realpath: workspace,
      displayRoot: workspace,
    });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function expectTooLarge(action: () => unknown): void {
    try {
      action();
      throw new Error('Expected the import to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).getResponse()).toMatchObject({
        error: { code: 'INVALID_IR', message: expect.stringContaining('512 KiB') },
      });
    }
  }

  it('T-CIIMPORT-010 (CIIMPORT-AC-010) — the 512 KiB bound is measured in bytes, not characters', () => {
    // 300k emoji = 600k UTF-16 code units but 1.2 MB when encoded as UTF-8.
    expectTooLarge(() => controller.import({ content: '🚀'.repeat(300_000) }));
  });

  it('applies the same bound to a CI file read from the workspace', () => {
    writeFileSync(join(workspace, '.gitlab-ci.yml'), 'x'.repeat(512 * 1024 + 1));
    expectTooLarge(() =>
      controller.fromProject({ projectPath: '.', file: '.gitlab-ci.yml' }),
    );
  });
});
