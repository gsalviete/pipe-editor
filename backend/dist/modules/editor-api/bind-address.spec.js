"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const workspace_root_1 = require("./workspace-root");
describe('Backend listener bind (T-EDITOR-007 / EDITOR-AC-007)', () => {
    const REPO_ROOT = (0, path_1.resolve)(__dirname, '..', '..', '..', '..');
    let savedEnv;
    beforeAll(() => {
        savedEnv = process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV];
        process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV] = REPO_ROOT;
    });
    afterAll(() => {
        if (savedEnv === undefined) {
            delete process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV];
        }
        else {
            process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV] = savedEnv;
        }
    });
    it('binds 127.0.0.1 only — never 0.0.0.0', async () => {
        const { createApp, BIND_ADDRESS } = await Promise.resolve().then(() => require('../../main'));
        expect(BIND_ADDRESS).toBe('127.0.0.1');
        const app = await createApp();
        try {
            await app.listen(0, BIND_ADDRESS);
            const server = app.getHttpServer();
            const addr = server.address();
            expect(addr).not.toBeNull();
            expect(addr.address).toBe('127.0.0.1');
            expect(addr.family).toBe('IPv4');
        }
        finally {
            await app.close();
        }
    });
});
//# sourceMappingURL=bind-address.spec.js.map