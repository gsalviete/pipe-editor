export declare class NoRootDirError extends Error {
    constructor(rootPath: string);
}
export declare class NoManifestError extends Error {
    constructor(rootPath: string);
}
export declare class MalformedPackageJsonError extends Error {
    constructor(path: string, diagnostic: string);
}
export declare class RuleRegistrationError extends Error {
    constructor(ruleId: string, message: string);
}
export declare class RuleConflictError extends Error {
    constructor(ruleAId: string, ruleBId: string, conflictTarget: string);
}
export declare class RuleDefectError extends Error {
    constructor(ruleId: string, message: string);
}
export declare class InvalidProducedIRError extends Error {
    constructor(errors: {
        acId: string;
        path: string;
        message: string;
    }[]);
}
