import { HttpException } from '@nestjs/common';
export type DetectErrorCode = 'INVALID_PROJECT_PATH' | 'PATH_OUTSIDE_WORKSPACE' | 'PATH_NOT_FOUND' | 'NO_MANIFEST' | 'MALFORMED_PACKAGE_JSON' | 'INTERNAL_IR_DEFECT';
export type GenerateErrorCode = 'INVALID_IR' | 'UNRESOLVED_REQUIRED_FIELD' | 'UNSUPPORTED_RUNTIME' | 'INTERNAL_GENERATOR_DEFECT';
export type ErrorCode = DetectErrorCode | GenerateErrorCode;
export interface ErrorEnvelope {
    error: {
        code: ErrorCode;
        message: string;
        detail?: unknown;
    };
}
export declare function envelope(code: ErrorCode, message: string, detail?: unknown): ErrorEnvelope;
export declare function httpError(status: number, code: ErrorCode, message: string, detail?: unknown): HttpException;
