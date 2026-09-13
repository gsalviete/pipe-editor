import type { PipelineIR } from '../ir';

export type ImportProvider = 'github-actions' | 'gitlab-ci';

export interface ImportWarning {
  message: string;
}

export interface ImportResult {
  ir: PipelineIR;
  warnings: ImportWarning[];
  provider: ImportProvider;
}

export class CiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CiImportError';
  }
}
