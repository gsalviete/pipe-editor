import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { generateWorkspaceBundle, WorkspacePlanValidationError } from './generate';
import { inspectWorkspace } from './inspect';
import type { WorkspacePlan } from './types';

describe('workspace bundle', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pipe-editor-workspace-'));
    writePackage(root, {
      name: 'acme-platform',
      private: true,
      workspaces: ['frontend', 'backend', 'worker'],
    });
    writePackage(join(root, 'frontend'), {
      name: 'web-app',
      engines: { node: '>=20' },
      packageManager: 'npm@10.8.0',
      scripts: { build: 'vite build', test: 'vitest run' },
      devDependencies: { vite: '^6.0.0' },
    }, true);
    writePackage(join(root, 'backend'), {
      name: 'api',
      engines: { node: '20.x' },
      packageManager: 'npm@10.8.0',
      scripts: { build: 'nest build', test: 'jest', start: 'node dist/main.js' },
      dependencies: { '@nestjs/core': '^10.0.0' },
    }, true);
    writePackage(join(root, 'worker'), {
      name: 'email-worker',
      engines: { node: '20' },
      packageManager: 'npm@10.8.0',
      scripts: { test: 'node --test', start: 'node index.js' },
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('T-WORKSPACE-001/003 (WORKSPACE-AC-001/003) discovers independent Vite, NestJS, and generic Node services', () => {
    const plan = inspectWorkspace(root, '.');

    expect(plan.name).toBe('acme-platform');
    expect(plan.services).toHaveLength(3);
    expect(plan.warnings).toEqual([]);
    expect(plan.services.map(({ path, stack }) => ({ path, stack }))).toEqual([
      { path: 'backend', stack: 'nestjs' },
      { path: 'frontend', stack: 'vite' },
      { path: 'worker', stack: 'node-generic' },
    ]);
    expect(plan.services.every((service) => service.ir.project.rootPath !== root)).toBe(true);
    expect(new Set(plan.services.map((service) => service.hostPort)).size).toBe(3);
  });

  it('T-WORKSPACE-004/005/006/008 (WORKSPACE-AC-004/005/006/008) generates a root Docker, Compose, and GitHub bundle', () => {
    const plan = inspectWorkspace(root, '.');
    const bundle = generateWorkspaceBundle(plan, 'github-actions', 'root');
    const paths = bundle.artifacts.map((artifact) => artifact.path);

    expect(paths).toEqual(expect.arrayContaining([
      'frontend/Dockerfile',
      'frontend/.dockerignore',
      'frontend/nginx.conf',
      'backend/Dockerfile',
      'backend/.dockerignore',
      'worker/Dockerfile',
      'worker/.dockerignore',
      'docker-compose.yml',
      '.github/workflows/ci.yml',
    ]));
    expect(paths).not.toContain('.gitlab-ci.yml');

    const viteDockerfile = contentAt(bundle.artifacts, 'frontend/Dockerfile');
    expect(viteDockerfile).toContain('FROM nginx:alpine AS runtime');
    expect(viteDockerfile).toContain('RUN npm run build');
    expect(contentAt(bundle.artifacts, 'backend/Dockerfile')).toContain(
      'CMD ["node","dist/main.js"]',
    );

    const compose = yaml.load(contentAt(bundle.artifacts, 'docker-compose.yml')) as {
      services: Record<string, { build: { context: string }; ports: string[] }>;
    };
    expect(Object.keys(compose.services)).toEqual(['api', 'web-app', 'email-worker']);
    expect(compose.services['web-app'].build.context).toBe('./frontend');
    expect(new Set(Object.values(compose.services).flatMap((service) => service.ports)).size).toBe(3);

    const ci = contentAt(bundle.artifacts, '.github/workflows/ci.yml');
    expect(ci).toContain('npm test');
    expect(ci).toContain('docker build -t web-app:ci .');
    expect(ci).not.toMatch(/docker\s+push|kubectl|terraform|gcloud/i);
    expect(bundle.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('T-WORKSPACE-007/008 (WORKSPACE-AC-007/008) emits standalone Compose files and one GitLab pipeline', () => {
    const plan = inspectWorkspace(root, '.');
    const bundle = generateWorkspaceBundle(plan, 'gitlab-ci', 'per-service');
    const paths = bundle.artifacts.map((artifact) => artifact.path);

    expect(paths.filter((path) => path.endsWith('docker-compose.yml'))).toEqual([
      'backend/docker-compose.yml',
      'frontend/docker-compose.yml',
      'worker/docker-compose.yml',
    ]);
    expect(paths).toContain('.gitlab-ci.yml');
    expect(paths).not.toContain('docker-compose.yml');
    const ci = contentAt(bundle.artifacts, '.gitlab-ci.yml');
    expect(ci).toContain('api-verify:');
    expect(ci).toContain('web-app-containerize:');
    expect(ci).not.toMatch(/docker\s+push|kubectl|terraform|gcloud/i);
  });

  it('T-WORKSPACE-009 (WORKSPACE-AC-009) rejects duplicated IDs and unsafe paths before emitting', () => {
    const plan = inspectWorkspace(root, '.');
    const invalid: WorkspacePlan = {
      ...plan,
      services: plan.services.map((service, index) => ({
        ...service,
        id: 'duplicate',
        path: index === 0 ? '../outside' : service.path,
      })),
    };

    expect(() => generateWorkspaceBundle(invalid, 'github-actions', 'root')).toThrow(
      WorkspacePlanValidationError,
    );
  });

  it('T-WORKSPACE-012 (WORKSPACE-AC-012) tracks Compose variants and chooses collision-free output paths', () => {
    const existingRoot = join(root, 'docker-compose.yml');
    const existingDev = join(root, 'docker-compose.dev.yml');
    const existingPipeEditor = join(root, 'docker-compose.pipe-editor.yml');
    const existingService = join(root, 'backend', 'compose.override.yaml');
    writeFileSync(existingRoot, 'services: {}\n');
    writeFileSync(existingDev, 'services: {}\n');
    writeFileSync(existingPipeEditor, 'services: {}\n');
    writeFileSync(existingService, 'services: {}\n');

    const plan = inspectWorkspace(root, '.');
    expect(plan.existingComposeFiles).toEqual([
      'backend/compose.override.yaml',
      'docker-compose.dev.yml',
      'docker-compose.pipe-editor.yml',
      'docker-compose.yml',
    ]);

    const rootBundle = generateWorkspaceBundle(plan, 'github-actions', 'root');
    expect(rootBundle.artifacts.map((artifact) => artifact.path)).toContain(
      'docker-compose.pipe-editor-2.yml',
    );

    const serviceBundle = generateWorkspaceBundle(plan, 'gitlab-ci', 'per-service');
    const composePaths = serviceBundle.artifacts
      .filter((artifact) => artifact.kind === 'compose')
      .map((artifact) => artifact.path);
    expect(composePaths).toEqual([
      'backend/docker-compose.pipe-editor.yml',
      'frontend/docker-compose.yml',
      'worker/docker-compose.yml',
    ]);
    expect(rootBundle.artifacts.some((artifact) => plan.existingComposeFiles.includes(artifact.path))).toBe(false);
    expect(readFileSync(existingRoot, 'utf-8')).toBe('services: {}\n');
    expect(readFileSync(existingService, 'utf-8')).toBe('services: {}\n');
  });
});

function writePackage(
  path: string,
  manifest: Record<string, unknown>,
  typescript = false,
): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
  if ('packageManager' in manifest) writeFileSync(join(path, 'package-lock.json'), '{}');
  if (typescript) {
    writeFileSync(
      join(path, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    );
  }
}

function contentAt(
  artifacts: { path: string; content: string }[],
  path: string,
): string {
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (artifact === undefined) throw new Error(`Missing generated artifact: ${path}`);
  return artifact.content;
}

// ─────────────────────────────────────────────────────────────────────────
// T-WS-101 (GEN-07) — a multi-line command in a workspace CI bundle.
//
// The block scalar used to indent only the first line of each step, so a
// multi-line command de-indented its continuations and broke the block.
// The bundle re-parses its own YAML, so the symptom was a hard generation
// failure with an obscure check message rather than a bad file — but it is
// the same defect class as GEN-02.
// ─────────────────────────────────────────────────────────────────────────
describe('T-WS-101 (GEN-07) — multi-line commands in the workspace CI file', () => {
  const SCRIPT = '# prepare\nnpm ci\nif [ -f .env ]; then\n  echo ok\nfi';
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pipe-editor-ws-gen07-'));
    writePackage(root, { name: 'acme', private: true, workspaces: ['api'] });
    writePackage(join(root, 'api'), {
      name: 'api',
      engines: { node: '20' },
      packageManager: 'npm@10.8.0',
      scripts: { build: 'nest build', test: 'jest', start: 'node dist/main.js' },
      dependencies: { '@nestjs/core': '^10.0.0' },
    }, true);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function planWithScript(): WorkspacePlan {
    const plan = inspectWorkspace(root, '.');
    for (const service of plan.services) {
      service.ir.stages = service.ir.stages.map((stage) =>
        stage.id === 'test' ? { ...stage, steps: [{ ...stage.steps[0], run: SCRIPT }] } : stage,
      );
    }
    return plan;
  }

  it.each(['github-actions', 'gitlab-ci'] as const)(
    'produces a %s file that still parses',
    (provider) => {
      const bundle = generateWorkspaceBundle(planWithScript(), provider, 'root');
      const ci = bundle.artifacts.find((a) => a.kind === 'ci');
      expect(ci).toBeDefined();
      const doc = yaml.load(ci!.content);
      expect(doc).toBeTruthy();
      expect(typeof doc).toBe('object');
    },
  );

  it('keeps every line of the script inside the GitHub Actions block', () => {
    const bundle = generateWorkspaceBundle(planWithScript(), 'github-actions', 'root');
    const ci = bundle.artifacts.find((a) => a.kind === 'ci')!;
    const doc = yaml.load(ci.content) as Record<string, any>;
    const runs: string[] = Object.values(doc.jobs)
      .flatMap((job: any) => job.steps as any[])
      .filter((step: any) => typeof step.run === 'string')
      .map((step: any) => step.run as string);
    const carrying = runs.find((r) => r.includes('# prepare'));
    expect(carrying).toBeDefined();
    // The `fi` must still belong to the command, not have become a key.
    expect(carrying).toContain('if [ -f .env ]; then');
    expect(carrying).toContain('fi');
    expect(doc.fi).toBeUndefined();
  });
});
