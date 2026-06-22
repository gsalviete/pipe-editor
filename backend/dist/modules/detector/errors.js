"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidProducedIRError = exports.RuleDefectError = exports.RuleConflictError = exports.RuleRegistrationError = exports.MalformedPackageJsonError = exports.NoManifestError = exports.NoRootDirError = void 0;
class NoRootDirError extends Error {
    constructor(rootPath) {
        super(`detect: rootPath does not exist or is not a directory: ${rootPath}`);
        this.name = 'NoRootDirError';
    }
}
exports.NoRootDirError = NoRootDirError;
class NoManifestError extends Error {
    constructor(rootPath) {
        super(`detect: no manifest from the enumerated set found at ${rootPath}`);
        this.name = 'NoManifestError';
    }
}
exports.NoManifestError = NoManifestError;
class MalformedPackageJsonError extends Error {
    constructor(path, diagnostic) {
        super(`detect: package.json is present but unparseable (${path}): ${diagnostic}`);
        this.name = 'MalformedPackageJsonError';
    }
}
exports.MalformedPackageJsonError = MalformedPackageJsonError;
class RuleRegistrationError extends Error {
    constructor(ruleId, message) {
        super(`Rule registration failed for ${ruleId}: ${message}`);
        this.name = 'RuleRegistrationError';
    }
}
exports.RuleRegistrationError = RuleRegistrationError;
class RuleConflictError extends Error {
    constructor(ruleAId, ruleBId, conflictTarget) {
        super(`Rule conflict: rules ${ruleAId} and ${ruleBId} both emit at ${conflictTarget}`);
        this.name = 'RuleConflictError';
    }
}
exports.RuleConflictError = RuleConflictError;
class RuleDefectError extends Error {
    constructor(ruleId, message) {
        super(`Rule ${ruleId} is defective: ${message}`);
        this.name = 'RuleDefectError';
    }
}
exports.RuleDefectError = RuleDefectError;
class InvalidProducedIRError extends Error {
    constructor(errors) {
        super(`detect: produced IR failed validate(): ${errors.map((e) => `[${e.acId} ${e.path}] ${e.message}`).join('; ')}`);
        this.name = 'InvalidProducedIRError';
    }
}
exports.InvalidProducedIRError = InvalidProducedIRError;
//# sourceMappingURL=errors.js.map