// Manifest reading. Implements pipeline step 2 of detect():
// - package.json: hard-throw on parse failure (DET-FR-019).
// - all others: warn-and-skip on parse failure.

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import {
  ENUMERATED_MANIFEST_SET,
  NON_QUALIFYING_MANIFESTS,
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
    // `.nvmrc`/`.node-version` are evidence for DR-004 but do not by
    // themselves make a folder a project (see NON_QUALIFYING_MANIFESTS).
    if (!NON_QUALIFYING_MANIFESTS.includes(name)) anyPresent = true;
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
      } else if (name === '.nvmrc' || name === '.node-version') {
        const line = firstMeaningfulLine(raw);
        if (line !== null) out[name] = { raw: line };
      }
    } catch (e) {
      warnings.push({ manifest: name, message: (e as Error).message });
    }
  }

  return { manifests: out, warnings, anyPresent };
}

// `.nvmrc` and `.node-version` are single-value text files. nvm tolerates
// blank lines and `#` comments, so take the first line that is neither.
function firstMeaningfulLine(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return null;
}

// tsconfig.json frequently has `//` comments; strip them tolerantly.
function stripJsonComments(input: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < input.length && input[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        if (input[index] === '\n') output += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }
    output += current;
  }
  return output;
}
