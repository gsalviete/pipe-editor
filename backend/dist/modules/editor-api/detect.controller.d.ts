import { type WorkspaceRoot } from './workspace-root';
export declare class DetectController {
    private readonly wsRoot;
    private readonly detector;
    constructor(wsRoot: WorkspaceRoot);
    detect(body: Record<string, unknown> | null | undefined): {
        ir: import("../ir").PipelineIR;
        warnings: import("../detector/manifests").Warning[];
    };
}
