// Errors raised by the Detector Engine. Each maps to an "Errors" case
// in the Engine spec's Input/output contract.

export class NoRootDirError extends Error {
  constructor(rootPath: string) {
    super(`detect: rootPath does not exist or is not a directory: ${rootPath}`);
    this.name = 'NoRootDirError';
  }
}

export class NoManifestError extends Error {
  constructor(rootPath: string) {
    super(`detect: no manifest from the enumerated set found at ${rootPath}`);
    this.name = 'NoManifestError';
  }
}

export class MalformedPackageJsonError extends Error {
  constructor(path: string, diagnostic: string) {
    super(`detect: package.json is present but unparseable (${path}): ${diagnostic}`);
    this.name = 'MalformedPackageJsonError';
  }
}

export class RuleRegistrationError extends Error {
  constructor(ruleId: string, message: string) {
    super(`Rule registration failed for ${ruleId}: ${message}`);
    this.name = 'RuleRegistrationError';
  }
}

export class RuleConflictError extends Error {
  constructor(ruleAId: string, ruleBId: string, conflictTarget: string) {
    super(
      `Rule conflict: rules ${ruleAId} and ${ruleBId} both emit at ${conflictTarget}`,
    );
    this.name = 'RuleConflictError';
  }
}

export class RuleDefectError extends Error {
  constructor(ruleId: string, message: string) {
    super(`Rule ${ruleId} is defective: ${message}`);
    this.name = 'RuleDefectError';
  }
}

export class InvalidProducedIRError extends Error {
  constructor(errors: { acId: string; path: string; message: string }[]) {
    super(
      `detect: produced IR failed validate(): ${errors.map((e) => `[${e.acId} ${e.path}] ${e.message}`).join('; ')}`,
    );
    this.name = 'InvalidProducedIRError';
  }
}
