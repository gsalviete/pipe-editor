"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkProjectPath = checkProjectPath;
const fs_1 = require("fs");
const path_1 = require("path");
function checkProjectPath(projectPath, wsRootRealpath) {
    if (typeof projectPath !== 'string') {
        return { kind: 'invalid', reason: 'projectPath must be a string.' };
    }
    if (projectPath === '') {
        return { kind: 'invalid', reason: 'projectPath must not be empty.' };
    }
    if (projectPath.includes('\0')) {
        return { kind: 'invalid', reason: 'projectPath must not contain a NUL byte.' };
    }
    if ((0, path_1.isAbsolute)(projectPath)) {
        return {
            kind: 'invalid',
            reason: 'projectPath must be a path relative to PIPE_EDITOR_WORKSPACE_ROOT; absolute paths are rejected.',
        };
    }
    const candidate = (0, path_1.resolve)(wsRootRealpath, projectPath);
    let realCandidate;
    try {
        realCandidate = (0, fs_1.realpathSync)(candidate);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { kind: 'not-found' };
        }
        throw err;
    }
    if (realCandidate === wsRootRealpath) {
        return { kind: 'ok', realCandidate };
    }
    if (realCandidate.startsWith(wsRootRealpath + path_1.sep)) {
        return { kind: 'ok', realCandidate };
    }
    return { kind: 'outside' };
}
//# sourceMappingURL=path-security.js.map