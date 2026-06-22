export type PathCheckResult = {
    kind: 'ok';
    realCandidate: string;
} | {
    kind: 'invalid';
    reason: string;
} | {
    kind: 'not-found';
} | {
    kind: 'outside';
};
export declare function checkProjectPath(projectPath: unknown, wsRootRealpath: string): PathCheckResult;
