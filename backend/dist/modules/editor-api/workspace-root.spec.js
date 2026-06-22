"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const workspace_root_1 = require("./workspace-root");
describe('Editor API — workspace-root configuration (T-EDITOR-001 / EDITOR-AC-001)', () => {
    it('rejects undefined env value', () => {
        expect(() => (0, workspace_root_1.resolveWorkspaceRoot)(undefined)).toThrow(workspace_root_1.WorkspaceRootConfigError);
        expect(() => (0, workspace_root_1.resolveWorkspaceRoot)(undefined)).toThrow(/PIPE_EDITOR_WORKSPACE_ROOT/);
    });
    it('rejects empty env value', () => {
        expect(() => (0, workspace_root_1.resolveWorkspaceRoot)('')).toThrow(workspace_root_1.WorkspaceRootConfigError);
    });
    it('rejects relative paths', () => {
        expect(() => (0, workspace_root_1.resolveWorkspaceRoot)('relative/path')).toThrow(/absolute/);
    });
    it('rejects an absolute path that does not exist', () => {
        expect(() => (0, workspace_root_1.resolveWorkspaceRoot)('/this/path/does/not/exist/anywhere/at/all')).toThrow(/does not exist/);
    });
    it('rejects an absolute path that is a file rather than a directory', () => {
        const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-wsroot-file-'));
        try {
            const filePath = (0, path_1.join)(dir, 'just-a-file');
            (0, fs_1.writeFileSync)(filePath, '');
            expect(() => (0, workspace_root_1.resolveWorkspaceRoot)(filePath)).toThrow(/not a directory/);
        }
        finally {
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
    it('accepts a valid existing absolute directory and caches its realpath', () => {
        const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-wsroot-ok-'));
        try {
            const ws = (0, workspace_root_1.resolveWorkspaceRoot)(dir);
            expect(ws.raw).toBe(dir);
            expect(typeof ws.realpath).toBe('string');
            expect(ws.realpath.length).toBeGreaterThan(0);
        }
        finally {
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=workspace-root.spec.js.map