// Errors thrown by execute(). Stage-level failures are reported via
// StageResult.status === 'failed' and do NOT throw. These two are the
// only thrown rejections; both signal programmer / infra issues.

export class InvalidExecuteOptionsError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'InvalidExecuteOptionsError';
  }
}

export class DockerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerUnavailableError';
  }
}
