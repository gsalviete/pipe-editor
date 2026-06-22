// Manifest reading. Implements pipeline step 2 of detect():
// - package.json: hard-throw on parse failure (DET-FR-019).
// - all others: warn-and-skip on parse failure.

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import {
  ENUMERATED_MANIFEST_SET,
  ParsedManifests,
  PackageJson,
  TsConfigJson,
} from './types';
import { MalformedPackageJsonError } from './errors';

export interface Warning {
  manifest: string;
  message: string;
}

export interface ReadResult {
  manifests: ParsedManifests;
  warnings: Warning[];
  anyPresent: boolean;
}

export function readManifests(rootPath: string): ReadResult {
  const out: ParsedManifests = {};
  const warnings: Warning[] = [];
  let anyPresent = false;

  for (const name of ENUMERATED_MANIFEST_SET) {
    const path = join(rootPath, name);
    if (!existsSync(path)) continue;
    if (!statSync(path).isFile()) continue;
    anyPresent = true;
    const raw = readFileSync(path, 'utf-8');

    if (name === 'package.json') {
      try {
        out['package.json'] = JSON.parse(raw) as PackageJson;
      } catch (e) {
        throw new MalformedPackageJsonError(path, (e as Error).message);
      }
      continue;
    }

    try {
      if (name === 'pnpm-lock.yaml') {
        const parsed = yaml.load(raw) as { lockfileVersion?: number | string } | undefined;
        out['pnpm-lock.yaml'] = parsed && typeof parsed === 'object' ? parsed : {};
      } else if (name === 'package-lock.json') {
        out['package-lock.json'] = JSON.parse(raw) as { lockfileVersion?: number };
      } else if (name === 'yarn.lock') {
        out['yarn.lock'] = { __present: true };
      } else if (name === 'nest-cli.json') {
        out['nest-cli.json'] = JSON.parse(raw) as Record<string, unknown>;
      } else if (name === 'tsconfig.json') {
        out['tsconfig.json'] = JSON.parse(stripJsonComments(raw)) as TsConfigJson;
      }
    } catch (e) {
      warnings.push({ manifest: name, message: (e as Error).message });
    }
  }

  return { manifests: out, warnings, anyPresent };
}

// tsconfig.json frequently has `//` comments; strip them tolerantly.
function stripJsonComments(input: string): string {
  return input.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
