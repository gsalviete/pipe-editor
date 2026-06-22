import { PipelineIR } from '../ir';
import { Warning } from './manifests';
import { Rule } from './types';
export interface DetectorOptions {
    rules: Rule[];
    detectorVersion?: string;
}
export declare class Detector {
    private readonly rules;
    private readonly detectorVersion;
    constructor(opts: DetectorOptions);
    detect(rootPath: string): {
        ir: PipelineIR;
        warnings: Warning[];
    };
}
