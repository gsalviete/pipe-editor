export declare const PIPE_EDITOR_WORKSPACE_ROOT_ENV = "PIPE_EDITOR_WORKSPACE_ROOT";
export declare const WORKSPACE_ROOT_TOKEN = "EDITOR_WORKSPACE_ROOT";
export interface WorkspaceRoot {
    raw: string;
    realpath: string;
}
export declare class WorkspaceRootConfigError extends Error {
    constructor(message: string);
}
export declare function resolveWorkspaceRoot(envValue: string | undefined): WorkspaceRoot;
