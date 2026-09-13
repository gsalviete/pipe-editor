// T-IMP-101…104 — the four import defects from the adversarial review.
// The importer is a headline feature ("turn an existing CI file into an
// editable pipeline"), so a silent mistranslation is worse here than a
// refusal would be.

import { importCiConfig, importGithubActions, importGitlabCi, sniffProvider } from './index';
import { packageManagerFromInstallCommand } from './infer';

describe('T-IMP-101 (IMP-01) — multi-line run blocks keep their newlines', () => {
  const WORKFLOW = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-alpine
    steps:
      - uses: actions/checkout@v4
      - name: Install and build
        run: |
          # install dependencies
          npm ci
          npm run build
`;

  it('does not comment out the block with a && join', () => {
    const { ir } = importGithubActions(WORKFLOW);
    const run = ir.stages[0].steps[0].run;
    // Under the old ` && ` join this was
    //   `# install dependencies && npm ci && npm run build`
    // i.e. one comment line and nothing executed at all.
    expect(run).toBe('# install dependencies\nnpm ci\nnpm run build');
    expect(run).not.toContain('&&');
  });

  it('warns that the step is a script, so the user knows to edit it whole', () => {
    const { warnings } = importGithubActions(WORKFLOW);
    expect(warnings.some((w) => /multi-line run block/i.test(w.message))).toBe(true);
    expect(warnings.some((w) => /comments/i.test(w.message))).toBe(true);
  });

  it('preserves shell control flow verbatim', () => {
    const workflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-alpine
    steps:
      - name: Conditional
        run: |
          if [ -f .env ]; then
            echo "found"
          fi
`;
    const { ir, warnings } = importGithubActions(workflow);
    expect(ir.stages[0].steps[0].run).toBe(
      'if [ -f .env ]; then\n  echo "found"\nfi',
    );
    expect(warnings.some((w) => /control flow/i.test(w.message))).toBe(true);
  });

  it('leaves an ordinary single-line command alone and does not warn', () => {
    const workflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-alpine
    steps:
      - run: npm ci
`;
    const { ir, warnings } = importGithubActions(workflow);
    expect(ir.stages[0].steps[0].run).toBe('npm ci');
    expect(warnings.some((w) => /multi-line/i.test(w.message))).toBe(false);
  });
});

describe('T-IMP-102 (IMP-02) — no shared env object across steps', () => {
  const CONFIG = `
stages: [build]
variables:
  SHARED: "1"
build:
  stage: build
  image: node:20-alpine
  script:
    - npm ci
    - npm test
`;

  it('gives each step its own env object', () => {
    const { ir } = importGitlabCi(CONFIG);
    const [first, second] = ir.stages[0].steps;
    expect(first.env).toEqual({ SHARED: '1' });
    expect(second.env).toEqual({ SHARED: '1' });
    // The point: editing one must not edit the other.
    expect(first.env).not.toBe(second.env);
    first.env.ADDED = 'x';
    expect(second.env.ADDED).toBeUndefined();
  });
});

describe('T-IMP-103 (IMP-03) — package manager comes from the install command', () => {
  it('is not fooled by a mention of another manager', () => {
    // The old rule scanned all text for \bpnpm\b first, so this workflow —
    // which installs with npm — was classified as pnpm, and that drove the
    // install command, the Dockerfile lockfile line and the corepack prefix.
    const workflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-alpine
    steps:
      - name: Restore cache
        run: 'echo cache-key-pnpm-store-v1'
      - name: Install
        run: npm ci
`;
    const { ir, warnings } = importGithubActions(workflow);
    expect(ir.project.packageManager.name).toBe('npm');
    expect(warnings.some((w) => /inferred as "npm" from the install command/i.test(w.message))).toBe(
      true,
    );
  });

  it('says so when it had to guess from loose text', () => {
    const workflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-alpine
    steps:
      - run: pnpm build
`;
    const { ir, warnings } = importGithubActions(workflow);
    expect(ir.project.packageManager.name).toBe('pnpm');
    expect(warnings.some((w) => /guessed as "pnpm"/i.test(w.message))).toBe(true);
  });

  it.each([
    [['npm ci'], 'npm'],
    [['pnpm install --frozen-lockfile'], 'pnpm'],
    [['yarn install'], 'yarn'],
    [['corepack enable && pnpm install'], 'pnpm'],
    [['echo pnpm', 'npm ci'], 'npm'],
    [['npm run build'], null],
    [['npm ci', 'pnpm install'], null],
    [[], null],
  ])('packageManagerFromInstallCommand(%p) is %p', (commands, expected) => {
    expect(packageManagerFromInstallCommand(commands as string[])).toBe(expected);
  });
});

describe('T-IMP-104 (IMP-04) — provider detection is structural', () => {
  it.each([
    [
      'a Kubernetes manifest',
      `apiVersion: batch/v1
kind: Job
metadata:
  name: jobs
spec:
  template:
    spec:
      containers:
        - name: c
          image: busybox
`,
    ],
    [
      'an Azure Pipelines file',
      `trigger:
  - main
pool:
  vmImage: ubuntu-latest
steps:
  - script: npm ci
`,
    ],
    [
      'a Docker Compose file',
      `services:
  api:
    image: node:20-alpine
    command: npm start
`,
    ],
    ['plain prose', 'this file mentions jobs: and steps: but is not YAML mapping at all\n'],
  ])('refuses %s rather than picking a converter', (_label, content) => {
    expect(sniffProvider(content)).toBeNull();
    expect(() => importCiConfig(content, 'auto')).toThrow(/could not recognize/i);
  });

  it.each([
    [
      'github-actions',
      `name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
`,
    ],
    [
      'gitlab-ci',
      `stages: [build]
build:
  stage: build
  script:
    - npm ci
`,
    ],
  ])('still recognizes a real %s file', (provider, content) => {
    expect(sniffProvider(content)).toBe(provider);
  });

  it('recognizes a GitLab file with no top-level stages list', () => {
    expect(sniffProvider('test:\n  script:\n    - npm test\n')).toBe('gitlab-ci');
  });
});
