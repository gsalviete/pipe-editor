"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRootConfigError = exports.WORKSPACE_ROOT_TOKEN = exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV = void 0;
exports.resolveWorkspaceRoot = resolveWorkspaceRoot;
const fs_1 = require("fs");
const path_1 = require("path");
exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV = 'PIPE_EDITOR_WORKSPACE_ROOT';
exports.WORKSPACE_ROOT_TOKEN = 'EDITOR_WORKSPACE_ROOT';
class WorkspaceRootConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WorkspaceRootConfigError';
    }
}
exports.WorkspaceRootConfigError = WorkspaceRootConfigError;
function resolveWorkspaceRoot(envValue) {
    if (envValue === undefined || envValue === '') {
        throw new WorkspaceRootConfigError(`${exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV} must be set to an absolute path to an existing directory before the backend can start. See docs/adr/0008-workspace-root-containment-for-detect-endpoint.md.`);
    }
    if (!(0, path_1.isAbsolute)(envValue)) {
        throw new WorkspaceRootConfigError(`${exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV} must be an absolute path; got ${JSON.stringify(envValue)}.`);
    }
    if (!(0, fs_1.existsSync)(envValue)) {
        throw new WorkspaceRootConfigError(`${exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV} must point at an existing directory; ${JSON.stringify(envValue)} does not exist.`);
    }
    if (!(0, fs_1.statSync)(envValue).isDirectory()) {
        throw new WorkspaceRootConfigError(`${exports.PIPE_EDITOR_WORKSPACE_ROOT_ENV} must point at a directory; ${JSON.stringify(envValue)} is not a directory.`);
    }
    return { raw: envValue, realpath: (0, fs_1.realpathSync)(envValue) };
}
//# sourceMappingURL=workspace-root.js.map