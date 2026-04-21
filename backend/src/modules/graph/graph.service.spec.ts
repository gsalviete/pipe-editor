import { Test } from '@nestjs/testing';
import { GraphService } from './graph.service';
import { ParserService } from '../parser/parser.service';
import type { ParsedWorkflow } from '../../common/types/pipeline.types';

function parseWorkflow(yaml: string): ParsedWorkflow {
  const parser = new ParserService();
  const { workflow } = parser.parse('test.yml', yaml);
  if (!workflow) throw new Error('Parse failed');
  return workflow;
}

describe('GraphService', () => {
  let service: GraphService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GraphService],
    }).compile();
    service = module.get(GraphService);
  });

  // ─── Node creation ────────────────────────────────────────────────────────────

  it('creates one node per job', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
  test:
    runs-on: ubuntu-latest
    needs: build
    steps: []
`);
    const graph = service.buildGraph(wf);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(['build', 'test']),
    );
  });

  // ─── Edge creation ────────────────────────────────────────────────────────────

  it('creates edges for dependencies', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps: []
  b:
    runs-on: ubuntu-latest
    needs: a
    steps: []
  c:
    runs-on: ubuntu-latest
    needs: [a, b]
    steps: []
`);
    const graph = service.buildGraph(wf);
    expect(graph.edges).toHaveLength(3); // a→b, a→c, b→c
    expect(graph.edges.find((e) => e.source === 'a' && e.target === 'b')).toBeDefined();
    expect(graph.edges.find((e) => e.source === 'b' && e.target === 'c')).toBeDefined();
    expect(graph.edges.find((e) => e.source === 'a' && e.target === 'c')).toBeDefined();
  });

  // ─── Level assignment ─────────────────────────────────────────────────────────

  it('assigns correct depth levels', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps: []
  b:
    runs-on: ubuntu-latest
    needs: a
    steps: []
  c:
    runs-on: ubuntu-latest
    needs: b
    steps: []
`);
    const graph = service.buildGraph(wf);
    const levels = Object.fromEntries(graph.nodes.map((n) => [n.id, n.level]));
    expect(levels['a']).toBe(0);
    expect(levels['b']).toBe(1);
    expect(levels['c']).toBe(2);
  });

  it('parallel jobs get the same level', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
  lint:
    runs-on: ubuntu-latest
    steps: []
  typecheck:
    runs-on: ubuntu-latest
    steps: []
`);
    const graph = service.buildGraph(wf);
    // All root-level jobs should be at level 0
    expect(graph.nodes.every((n) => n.level === 0)).toBe(true);
  });

  // ─── Cycle detection ──────────────────────────────────────────────────────────

  it('detects cycles and marks graph as invalid', () => {
    // Bypass parser validation to inject a cycle
    const wf: ParsedWorkflow = {
      id: 'cycle-test',
      name: 'Cycle Test',
      filename: 'cycle.yml',
      trigger: { events: ['push'] },
      rawYaml: '',
      jobs: [
        { id: 'a', name: 'A', runsOn: 'ubuntu-latest', needs: ['b'], steps: [] },
        { id: 'b', name: 'B', runsOn: 'ubuntu-latest', needs: ['a'], steps: [] },
      ],
    };
    const graph = service.buildGraph(wf);
    expect(graph.isValid).toBe(false);
    expect(graph.validationErrors.some((e) => e.includes('Cycle'))).toBe(true);
  });

  // ─── Jobs without dependencies ────────────────────────────────────────────────

  it('handles jobs without any dependencies (parallel start)', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps: []
  backend:
    runs-on: ubuntu-latest
    steps: []
  mobile:
    runs-on: ubuntu-latest
    steps: []
`);
    const graph = service.buildGraph(wf);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(0);
    expect(graph.isValid).toBe(true);
  });

  // ─── Status merging ───────────────────────────────────────────────────────────

  it('merges run status onto graph nodes', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
  test:
    runs-on: ubuntu-latest
    needs: build
    steps: []
`);
    const graph = service.buildGraph(wf);
    const merged = service.mergeRunStatus(graph, [
      {
        id: 101,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T10:05:00Z',
        steps: [],
      },
      {
        id: 102,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        startedAt: '2024-01-01T10:05:30Z',
        completedAt: '2024-01-01T10:08:00Z',
        steps: [],
      },
    ]);

    const buildNode = merged.nodes.find((n) => n.id === 'build')!;
    const testNode = merged.nodes.find((n) => n.id === 'test')!;

    expect(buildNode.status).toBe('success');
    expect(buildNode.runJobId).toBe(101);
    expect(buildNode.durationSeconds).toBe(300);

    expect(testNode.status).toBe('failure');
    expect(testNode.runJobId).toBe(102);
  });

  // ─── Layout ───────────────────────────────────────────────────────────────────

  it('assigns non-zero positions to all nodes', () => {
    const wf = parseWorkflow(`
name: Test
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps: []
  b:
    runs-on: ubuntu-latest
    needs: a
    steps: []
`);
    const graph = service.buildGraph(wf);
    for (const node of graph.nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
    // Level 1 node should be to the right of level 0
    const a = graph.nodes.find((n) => n.id === 'a')!;
    const b = graph.nodes.find((n) => n.id === 'b')!;
    expect(b.position.x).toBeGreaterThan(a.position.x);
  });
});
