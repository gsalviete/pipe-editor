// Pipeline Doctor — static analysis of a PipelineIR against CI/CD
// best practices. Pure function; every finding carries a severity,
// an explanation and a concrete fix hint. The overall score gives
// users an at-a-glance health signal.

import { computeEffectiveChain, PipelineIR, Stage, Step } from '../ir';

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

export interface Diagnosis {
  score: number; // 0–100
  grade: 'A' | 'B' | 'C' | 'D';
  findings: Finding[];
}

const PENALTY: Record<Severity, number> = { critical: 25, warning: 10, info: 3 };

// Tags that move under you. `:latest` is handled separately (critical).
const FLOATING_TAGS = /:(lts|current|stable|lts-[a-z0-9.]+|current-[a-z0-9.]+)$/;

export function analyzePipeline(ir: PipelineIR): Diagnosis {
  const findings: Finding[] = [];
  const effective = computeEffectiveChain(ir);
  const live = effective.filter((s) => s.id !== 'docker-build');

  // ── Image hygiene ──
  for (const stage of ir.stages) {
    const image = stage.container.image;
    // UX-06 — `node:lts-alpine` is what this product's own detector emits
    // when the runtime version is unknown (DR-004 fallback). It is the most
    // common floating tag the tool produces, and the two rules below missed
    // it: it is not `:latest`, and the drift rule only matches `node:<digits>`.
    if (FLOATING_TAGS.test(image)) {
      findings.push({
        id: `image-floating-tag:${stage.id}`,
        severity: 'warning',
        title: `Stage "${stage.id}" uses a floating tag (${image})`,
        detail:
          'A tag like "lts", "lts-alpine", "current" or "stable" moves to a new major version without warning, ' +
          'so the same pipeline validates a different runtime over time. pipe-editor emits node:lts-alpine ' +
          'itself when the project declares no Node version.',
        fix: 'Resolve /project/runtime/version in the editor and set the stage image to node:<major>-alpine.',
      });
    }
    if (image.endsWith(':latest') || !image.includes(':')) {
      findings.push({
        id: `image-unpinned:${stage.id}`,
        severity: 'critical',
        title: `Stage "${stage.id}" uses an unpinned image (${image})`,
        detail:
          'Unpinned images make builds non-reproducible: the same pipeline can behave differently tomorrow.',
        fix: 'Pin at least the major version, e.g. node:20-alpine.',
      });
    }
  }

  // ── Runtime drift ──
  const rt = ir.project.runtime;
  if (rt.name === 'node' && rt.version !== null) {
    for (const stage of ir.stages) {
      const m = /^node:(\d+)/.exec(stage.container.image);
      if (m && m[1] !== rt.version) {
        findings.push({
          id: `runtime-drift:${stage.id}`,
          severity: 'warning',
          title: `Stage "${stage.id}" runs node:${m[1]} but the project targets node ${rt.version}`,
          detail: 'CI validating a different runtime than production erodes the point of CI.',
          fix: `Align the stage image with node:${rt.version}.`,
        });
      }
    }
  }

  // ── Chain composition ──
  const hasEnabled = (id: string) => effective.some((s) => s.id === id);
  if (live.length > 0 && !hasEnabled('install')) {
    findings.push({
      id: 'missing-install',
      severity: 'critical',
      title: 'No enabled install stage before command stages',
      detail:
        'Downstream stages (lint/test/build) will fail on a fresh workspace without dependency installation.',
      fix: 'Re-enable or add an install stage at the head of the chain.',
    });
  }
  if (!hasEnabled('test') && ir.stages.some((s) => s.id === 'test')) {
    findings.push({
      id: 'test-disabled',
      severity: 'warning',
      title: 'The test stage is disabled',
      detail: 'A pipeline that ships without running tests is a deployment pipeline, not a CI pipeline.',
      fix: 'Re-enable the test stage before exporting.',
    });
  } else if (!ir.stages.some((s) => s.id === 'test')) {
    findings.push({
      id: 'no-test-stage',
      severity: 'warning',
      title: 'No test stage in the pipeline',
      detail: 'Nothing validates behavior before artifacts are produced.',
      fix: 'Add a test script to package.json so detection emits a test stage, or add one manually.',
    });
  }
  if (!ir.stages.some((s) => s.id === 'lint')) {
    findings.push({
      id: 'no-lint-stage',
      severity: 'info',
      title: 'No lint stage',
      detail: 'Static analysis catches a class of defects tests rarely cover.',
      fix: 'Add a lint script to the project (e.g. eslint) and re-detect.',
    });
  }

  // ── Reproducible installs ──
  for (const stage of live) {
    for (const step of stage.steps) {
      const cmd = step.run;
      if (/\bnpm install\b/.test(cmd) && !/\bnpm ci\b/.test(cmd)) {
        findings.push(frozenFinding(stage, step, 'npm install', 'npm ci'));
      } else if (/\bpnpm install\b/.test(cmd) && !cmd.includes('--frozen-lockfile')) {
        findings.push(frozenFinding(stage, step, 'pnpm install', 'pnpm install --frozen-lockfile'));
      } else if (/\byarn install\b/.test(cmd) && !cmd.includes('--frozen-lockfile') && !cmd.includes('--immutable')) {
        findings.push(frozenFinding(stage, step, 'yarn install', 'yarn install --frozen-lockfile'));
      }
    }
  }

  // ── Secrets in the definition ──
  for (const stage of ir.stages) {
    for (const step of stage.steps) {
      for (const [key, value] of Object.entries(step.env)) {
        if (/(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)/i.test(key) && value !== '') {
          findings.push({
            id: `secret-in-env:${stage.id}:${key}`,
            severity: 'critical',
            title: `Possible secret "${key}" hardcoded in stage "${stage.id}"`,
            detail:
              'Pipeline definitions get committed and shared; secrets inside them leak. This value would also be baked into exports.',
            fix: 'Move the value to your CI provider’s secret store and reference it there.',
          });
        }
      }
    }
  }

  // ── docker-build sanity ──
  const dockerBuild = effective.find((s) => s.id === 'docker-build');
  if (dockerBuild && ir.project.language === 'typescript' && !hasEnabled('build')) {
    findings.push({
      id: 'docker-build-without-build',
      severity: 'warning',
      title: 'docker-build runs without a build stage',
      detail:
        'A TypeScript project image built without compiled output will only work if pre-built artifacts are committed.',
      fix: 'Re-enable the build stage, or verify dist/ is available at docker build time.',
    });
  }

  // ── Build-output assumption (GEN-03) ──
  // The Dockerfile generator's multi-stage path copies /app/dist and its CMD
  // points at dist/. The Pipeline IR carries no build-output directory and
  // detection is manifest-only, so that path is a convention the tool cannot
  // verify — and nothing in the product ever builds the image, so a project
  // that writes to build/ or out/ gets a broken image with every check green.
  if (hasEnabled('build') && effective.some((s) => s.id === 'build' && s.steps.length > 0)) {
    findings.push({
      id: 'build-output-assumed',
      severity: 'info',
      title: 'The generated image assumes your build writes to dist/',
      detail:
        'The multi-stage Dockerfile copies /app/dist from the builder and the CMD runs dist/main.js. ' +
        'pipe-editor reads manifests only, so it cannot confirm where your build actually writes.',
      fix: 'Confirm your build output directory; if it is not dist/, edit the COPY line and the CMD in the generated Dockerfile.',
    });
  }

  // ── Step ergonomics ──
  for (const stage of ir.stages) {
    for (const step of stage.steps) {
      if ((step.run.match(/&&/g) ?? []).length >= 3) {
        findings.push({
          id: `mega-step:${stage.id}:${step.id}`,
          severity: 'info',
          title: `Step "${step.id}" chains ${(step.run.match(/&&/g) ?? []).length + 1} commands`,
          detail: 'When a long && chain fails you only learn the aggregate exit code.',
          fix: 'Split it into separate steps for precise failure attribution.',
        });
      }
    }
  }

  // ── Unresolved fields ──
  if ((ir.unresolved ?? []).length > 0) {
    findings.push({
      id: 'unresolved-fields',
      severity: 'info',
      title: `${ir.unresolved!.length} project field(s) could not be determined`,
      detail: ir.unresolved!.map((u) => u.field).join(', '),
      fix: 'Generation and local runs stay blocked until these are resolved.',
    });
  }

  const score = Math.max(
    0,
    100 - findings.reduce((sum, f) => sum + PENALTY[f.severity], 0),
  );
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const order: Severity[] = ['critical', 'warning', 'info'];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { score, grade, findings };
}

// UX-05 — the id keys the stage AND the step. It used to key only the
// stage while being emitted per step, so a stage with two unfrozen install
// steps produced two findings sharing one id: duplicate React keys in the
// Doctor panel, and the score docked twice for what the UI showed once.
function frozenFinding(stage: Stage, step: Step, found: string, wanted: string): Finding {
  return {
    id: `unfrozen-install:${stage.id}:${step.id}`,
    severity: 'warning',
    title: `Stage "${stage.id}" installs dependencies without a lockfile guarantee`,
    detail: `"${found}" may resolve different dependency versions on every run.`,
    fix: `Use "${wanted}" so CI fails instead of drifting when the lockfile is stale.`,
  };
}
