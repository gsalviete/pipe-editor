"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const parser_service_1 = require("./parser.service");
describe('ParserService', () => {
    let service;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [parser_service_1.ParserService],
        }).compile();
        service = module.get(parser_service_1.ParserService);
    });
    it('parses a minimal workflow', () => {
        const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
`;
        const { workflow, errors } = service.parse('ci.yml', yaml);
        expect(errors).toHaveLength(0);
        expect(workflow).not.toBeNull();
        expect(workflow.name).toBe('CI');
        expect(workflow.jobs).toHaveLength(1);
        expect(workflow.jobs[0].id).toBe('build');
        expect(workflow.jobs[0].needs).toHaveLength(0);
    });
    it('parses job dependencies (needs)', () => {
        const yaml = `
name: Pipeline
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: make build
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: make test
  deploy:
    runs-on: ubuntu-latest
    needs: [build, test]
    steps:
      - run: make deploy
`;
        const { workflow, errors } = service.parse('pipeline.yml', yaml);
        expect(errors).toHaveLength(0);
        expect(workflow.jobs).toHaveLength(3);
        const test = workflow.jobs.find((j) => j.id === 'test');
        expect(test.needs).toEqual(['build']);
        const deploy = workflow.jobs.find((j) => j.id === 'deploy');
        expect(deploy.needs).toEqual(['build', 'test']);
    });
    it('parses matrix strategy', () => {
        const yaml = `
name: Matrix CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [16, 18, 20]
        os: [ubuntu-latest, windows-latest]
    steps:
      - run: npm test
`;
        const { workflow, errors } = service.parse('matrix.yml', yaml);
        expect(errors).toHaveLength(0);
        const job = workflow.jobs[0];
        expect(job.strategy?.matrix.node).toEqual(['16', '18', '20']);
        expect(job.strategy?.matrix.os).toHaveLength(2);
    });
    it('parses conditional steps and jobs', () => {
        const yaml = `
name: Conditional
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy
        run: ./deploy.sh
        if: success()
`;
        const { workflow, errors } = service.parse('conditional.yml', yaml);
        expect(errors).toHaveLength(0);
        const job = workflow.jobs[0];
        expect(job.if).toBe("github.ref == 'refs/heads/main'");
        expect(job.steps[0].if).toBe('success()');
    });
    it('parses push trigger with branches', () => {
        const yaml = `
name: Branch CI
on:
  push:
    branches:
      - main
      - develop
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
        const { workflow, errors } = service.parse('branch.yml', yaml);
        expect(errors).toHaveLength(0);
        expect(workflow.trigger.events).toContain('push');
        expect(workflow.trigger.branches).toEqual(['main', 'develop']);
    });
    it('returns error for invalid YAML', () => {
        const yaml = `this: is: not: valid: yaml: [`;
        const { workflow, errors } = service.parse('bad.yml', yaml);
        expect(workflow).toBeNull();
        expect(errors[0]).toMatch(/YAML parse error/);
    });
    it('returns error for workflow without jobs', () => {
        const yaml = `
name: Empty
on: push
`;
        const { errors } = service.parse('empty.yml', yaml);
        expect(errors).toContain('Workflow has no jobs defined');
    });
    it('flags unknown dependency references', () => {
        const yaml = `
name: Bad deps
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    needs: nonexistent
    steps:
      - run: echo test
`;
        const { errors } = service.parse('baddeps.yml', yaml);
        expect(errors.some((e) => e.includes('nonexistent'))).toBe(true);
    });
    it('handles steps with uses (action references)', () => {
        const yaml = `
name: Actions
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
`;
        const { workflow } = service.parse('actions.yml', yaml);
        const steps = workflow.jobs[0].steps;
        expect(steps[0].uses).toBe('actions/checkout@v4');
        expect(steps[1].uses).toBe('actions/setup-node@v4');
        expect(steps[1].with?.['node-version']).toBe('20');
        expect(steps[2].run).toBe('npm ci');
    });
});
//# sourceMappingURL=parser.service.spec.js.map