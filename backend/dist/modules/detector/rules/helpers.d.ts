import { Step } from '../../ir';
import { RuleCtx } from '../types';
export declare function extractMajor(version: string): string;
export declare function isNonEmptyString(v: unknown): v is string;
export declare function nodeImageFor(ctx: RuleCtx): string;
export declare function stepShape(id: string, run: string): Step;
