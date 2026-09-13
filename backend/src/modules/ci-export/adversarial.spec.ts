// T-ADV-003…006 (GEN-02, TEST-02, TEST-03) — every value below is
// reachable from the editor's own controls, and every one of them used to
// produce a broken or semantically different YAML document, with nothing
// on the single-service export path re-parsing the result.
//
// The contract these tests enforce: whatever goes into the IR, the exported
// bytes parse back to a document that still says what the IR said.

import { load as yamlLoad } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PipelineIR, Stage } from '../ir';
import { generateGithubActions } from './github-actions';
import { generateGitlabCi } from './gitlab-ci';

const FIXTURE = join(
  __dirname, '..', '..', '..', '..', 'test', 'fixtures',
  'node-pnpm-nest-basic', 'expected-ir.json',
);

function loadIr(): PipelineIR {
  return JSON.parse(readFileSync(FIXTURE, 'utf-8')) as PipelineIR;
}

function withStage(mutate: (s: Stage) => Stage, stageId = 'test'): PipelineIR {
  const ir = loadIr();
  ir.stages = ir.stages.map((s) => (s.id === stageId ? mutate(s) : s));
  return ir;
}

const EXPORTERS = [
  ['github-actions', generateGithubActions] as const,
  ['gitlab-ci', generateGitlabCi] as const,
];

describe('T-ADV-003 (TEST-03) — every exported document parses back', () => {
  it.each(EXPORTERS)('%s output is valid YAML', (_name, exporter) => {
    const doc = yamlLoad(exporter(loadIr()).content);
    expect(doc).toBeTruthy();
    expect(typeof doc).toBe('object');
  });
});

describe('T-ADV-004 (GEN-02) — hostile stage names', () => {
  // `Build: prod` used to emit `- name: Build: prod`, which is either
  // invalid YAML or a nested mapping — never the string the user typed.
  it.each([
    'Build: prod',
    'Test #1',
    'Release [beta]',
    '- leading dash',
    'quote"and\'both',
    'trailing space ',
    '*',
    'yes',
  ])('a stage named %p survives the GitHub Actions round trip', (name) => {
    const ir = withStage((s) => ({ ...s, name }));
    const doc = yamlLoad(generateGithubActions(ir).content) as any;
    const names = doc.jobs.pipeline.steps.map((s: any) => s.name);
    expect(names).toContain(name);
  });

  it.each(['Build: prod', 'Test #1', '*'])(
    'a stage named %p does not break the GitLab document',
    (name) => {
      const ir = withStage((s) => ({ ...s, name }));
      const doc = yamlLoad(generateGitlabCi(ir).content) as any;
      // GitLab keys jobs by stage id, so the name is not in the output —
      // what matters is that the document still parses and is complete.
      expect(Object.keys(doc)).toContain('test');
      expect(doc.test.script.length).toBeGreaterThan(0);
    },
  );
});

describe('T-ADV-005 (GEN-02, IMP-01) — multi-line commands', () => {
  const SCRIPT = [
    '# install the deps',
    'npm ci',
    'if [ -f .env ]; then',
    '  echo "using .env"',
    'fi',
  ].join('\n');

  it('GitHub Actions emits a block scalar, not a quoted scalar with newlines', () => {
    const ir = withStage((s) => ({ ...s, steps: [{ ...s.steps[0], run: SCRIPT }] }));
    const content = generateGithubActions(ir).content;
    const doc = yamlLoad(content) as any;
    const step = doc.jobs.pipeline.steps.find((s: any) => s.name === 'Test');
    expect(step.run).toBe(SCRIPT);
    // The comment must still be a comment on its own line, not something
    // that swallowed the rest of the block.
    expect(step.run.split('\n')[0]).toBe('# install the deps');
    expect(content).toContain('run: |-');
  });

  it('GitLab keeps a multi-line command as one script entry', () => {
    const ir = withStage((s) => ({ ...s, steps: [{ ...s.steps[0], run: SCRIPT }] }));
    const doc = yamlLoad(generateGitlabCi(ir).content) as any;
    expect(doc.test.script).toContain(SCRIPT);
  });

  it('multiple IR steps become separate lines, never a && chain', () => {
    const ir = withStage((s) => ({
      ...s,
      steps: [
        { ...s.steps[0], id: 'a', run: '# first' },
        { ...s.steps[0], id: 'b', run: 'npm test' },
      ],
    }));
    const doc = yamlLoad(generateGithubActions(ir).content) as any;
    const step = doc.jobs.pipeline.steps.find((s: any) => s.name === 'Test');
    // Under ` && ` the leading `#` commented out `npm test` entirely.
    expect(step.run).toBe('# first\nnpm test');
    expect(step.run).not.toContain('&&');
  });
});

describe('T-ADV-006 (GEN-02) — hostile branches and env', () => {
  it.each(['*', 'release: x', 'feat/**', 'yes', 'null', '- dash'])(
    'a branch literal %p survives the round trip',
    (branch) => {
      const ir = loadIr();
      ir.triggers = [{ kind: 'on-push', branches: [branch] }];
      const doc = yamlLoad(generateGithubActions(ir).content) as any;
      // `on` is quoted by js-yaml then normalized back to the bare key.
      expect(doc.on.push.branches).toEqual([branch]);
    },
  );

  it('the on: key is the bare form a human would write', () => {
    expect(generateGithubActions(loadIr()).content).toContain('\non:\n');
  });

  it.each([
    ['A_KEY', 'plain'],
    ['B_KEY', 'has: colon'],
    ['C_KEY', 'line one\nline two'],
    ['D_KEY', '*star'],
    ['E_KEY', ''],
  ])('env %p=%p survives both exporters', (key, value) => {
    const ir = withStage((s) => ({
      ...s,
      steps: [{ ...s.steps[0], env: { [key]: value } }],
    }));
    const gha = yamlLoad(generateGithubActions(ir).content) as any;
    expect(gha.jobs.pipeline.steps.find((s: any) => s.name === 'Test').env[key]).toBe(value);
    const gitlab = yamlLoad(generateGitlabCi(ir).content) as any;
    expect(gitlab.test.variables[key]).toBe(value);
  });

  it('does not share one env object between steps (IMP-02)', () => {
    const ir = withStage((s) => ({
      ...s,
      steps: [
        { ...s.steps[0], id: 'a', env: { SHARED: '1' } as Record<string, string> },
        { ...s.steps[0], id: 'b', env: { OTHER: '2' } as Record<string, string> },
      ],
    }));
    const doc = yamlLoad(generateGithubActions(ir).content) as any;
    const step = doc.jobs.pipeline.steps.find((s: any) => s.name === 'Test');
    expect(step.env).toEqual({ SHARED: '1', OTHER: '2' });
    // The source steps keep their own objects.
    expect(ir.stages.find((s) => s.id === 'test')!.steps[0].env).toEqual({ SHARED: '1' });
  });
});

describe('T-ADV-007 (GEN-01) — a hostile project name in the header', () => {
  it('cannot inject YAML through the comment header', () => {
    const ir = loadIr();
    ir.project.name = 'app\njobs:\n  evil:\n    runs-on: ubuntu-latest\n';
    for (const [, exporter] of EXPORTERS) {
      const content = exporter(ir).content;
      const doc = yamlLoad(content) as any;
      expect(doc.jobs?.evil).toBeUndefined();
      expect(doc.evil).toBeUndefined();
    }
  });
});
