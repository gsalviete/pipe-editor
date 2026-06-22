"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const path_security_1 = require("./path-security");
function setupWorkspace() {
    const dir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-ws-'));
    const ws = (0, fs_1.realpathSync)(dir);
    return {
        wsRoot: ws,
        cleanup: () => (0, fs_1.rmSync)(dir, { recursive: true, force: true }),
    };
}
describe('checkProjectPath — security model rules', () => {
    it('rejects non-string projectPath (EDITOR-AC-005 family)', () => {
        expect((0, path_security_1.checkProjectPath)(undefined, '/tmp').kind).toBe('invalid');
        expect((0, path_security_1.checkProjectPath)(null, '/tmp').kind).toBe('invalid');
        expect((0, path_security_1.checkProjectPath)(42, '/tmp').kind).toBe('invalid');
    });
    it('rejects empty projectPath', () => {
        expect((0, path_security_1.checkProjectPath)('', '/tmp').kind).toBe('invalid');
    });
    it('rejects projectPath containing NUL bytes (EDITOR-AC-005)', () => {
        expect((0, path_security_1.checkProjectPath)('safe\0../etc', '/tmp').kind).toBe('invalid');
    });
    it('rejects absolute projectPath (EDITOR-AC-003)', () => {
        expect((0, path_security_1.checkProjectPath)('/etc', '/tmp').kind).toBe('invalid');
        expect((0, path_security_1.checkProjectPath)('/Users/anyone', '/tmp').kind).toBe('invalid');
    });
    it('returns not-found for a non-existing relative path', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        try {
            expect((0, path_security_1.checkProjectPath)('definitely-not-here', wsRoot).kind).toBe('not-found');
        }
        finally {
            cleanup();
        }
    });
    it('rejects `..` traversals that escape the workspace (EDITOR-AC-004)', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        try {
            const result = (0, path_security_1.checkProjectPath)('../../../../etc', wsRoot);
            expect(result.kind).not.toBe('ok');
        }
        finally {
            cleanup();
        }
    });
    it('rejects symlinks whose realpath escapes the workspace (EDITOR-AC-006)', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        const outside = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'pipe-editor-outside-'));
        try {
            (0, fs_1.symlinkSync)((0, fs_1.realpathSync)(outside), (0, path_1.join)(wsRoot, 'escape-link'));
            const result = (0, path_security_1.checkProjectPath)('escape-link', wsRoot);
            expect(result.kind).toBe('outside');
        }
        finally {
            cleanup();
            (0, fs_1.rmSync)(outside, { recursive: true, force: true });
        }
    });
    it('accepts symlinks whose realpath stays inside the workspace', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        try {
            (0, fs_1.mkdirSync)((0, path_1.join)(wsRoot, 'real'));
            (0, fs_1.symlinkSync)((0, path_1.join)(wsRoot, 'real'), (0, path_1.join)(wsRoot, 'alias'));
            const result = (0, path_security_1.checkProjectPath)('alias', wsRoot);
            expect(result.kind).toBe('ok');
            if (result.kind === 'ok') {
                expect(result.realCandidate.startsWith(wsRoot)).toBe(true);
            }
        }
        finally {
            cleanup();
        }
    });
    it('accepts a path that resolves to the workspace root itself (EDITOR-AC-025)', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        try {
            for (const candidate of ['.', './']) {
                const result = (0, path_security_1.checkProjectPath)(candidate, wsRoot);
                expect(result.kind).toBe('ok');
                if (result.kind === 'ok') {
                    expect(result.realCandidate).toBe(wsRoot);
                }
            }
        }
        finally {
            cleanup();
        }
    });
    it('accepts a path that resolves to a subdirectory of the workspace root', () => {
        const { wsRoot, cleanup } = setupWorkspace();
        try {
            (0, fs_1.mkdirSync)((0, path_1.join)(wsRoot, 'sub'));
            (0, fs_1.writeFileSync)((0, path_1.join)(wsRoot, 'sub', 'marker'), '');
            const result = (0, path_security_1.checkProjectPath)('sub', wsRoot);
            expect(result.kind).toBe('ok');
            if (result.kind === 'ok') {
                expect(result.realCandidate).toBe((0, path_1.join)(wsRoot, 'sub'));
            }
        }
        finally {
            cleanup();
        }
    });
});
//# sourceMappingURL=path-security.spec.js.map