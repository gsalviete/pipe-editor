import { ParsedManifests } from './types';
export interface Warning {
    manifest: string;
    message: string;
}
export interface ReadResult {
    manifests: ParsedManifests;
    warnings: Warning[];
    anyPresent: boolean;
}
export declare function readManifests(rootPath: string): ReadResult;
