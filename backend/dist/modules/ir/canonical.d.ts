import { PipelineIR } from './types';
export declare function canonicalize(ir: PipelineIR): PipelineIR;
export declare function serializeCanonical(ir: PipelineIR): string;
export declare function canonicalDigest(ir: PipelineIR): string;
export declare function canonicalEquals(a: PipelineIR, b: PipelineIR): boolean;
