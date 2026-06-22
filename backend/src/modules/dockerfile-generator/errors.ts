// Errors raised by the Dockerfile Generator. Only one v1 error path:
// unsupported runtime (DOCKER-FR-010 / DOCKER-AC-005).

import { SUPPORTED_RUNTIMES } from './types';

export class UnsupportedRuntimeError extends Error {
  readonly path = '/project/runtime/name';
  constructor(actual: unknown) {
    super(
      `Dockerfile Generator v1 only supports runtimes { ${SUPPORTED_RUNTIMES.join(', ')} }; ` +
        `got ${JSON.stringify(actual)} at ${'/project/runtime/name'}`,
    );
    this.name = 'UnsupportedRuntimeError';
  }
}
