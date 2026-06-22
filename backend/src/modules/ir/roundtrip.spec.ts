// T-IR-002 (IR-AC-002) — the IR round-trips through JSON and YAML with
// structural equality preserved (same field values, same array orderings).

import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { canonicalDigest, PipelineIR, validate } from './index';

const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'node-pnpm-nest-basic',
  'expected-ir.json',
);

function loadFixture(): PipelineIR {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as PipelineIR;
}

describe('T-IR-002 (IR-AC-002) — JSON / YAML round-trip', () => {
  it('JSON round-trip preserves canonical digest', () => {
    const original = loadFixture();
    const round = JSON.parse(JSON.stringify(original)) as PipelineIR;
    expect(canonicalDigest(round)).toBe(canonicalDigest(original));
  });

  it('YAML round-trip preserves canonical digest', () => {
    const original = loadFixture();
    const dumped = yaml.dump(original);
    const round = yaml.load(dumped) as PipelineIR;
    expect(canonicalDigest(round)).toBe(canonicalDigest(original));
  });

  it('YAML round-trip preserves stage array order', () => {
    const original = loadFixture();
    const round = yaml.load(yaml.dump(original)) as PipelineIR;
    expect(round.stages.map((s) => s.id)).toEqual(original.stages.map((s) => s.id));
  });

  it('round-tripped document validates', () => {
    const original = loadFixture();
    const round = yaml.load(yaml.dump(original)) as PipelineIR;
    expect(validate(round)).toEqual([]);
  });
});
