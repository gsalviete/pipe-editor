import { create } from 'zustand';
import type {
  GitHubUser,
  RepoSummary,
  WorkflowSummary,
  WorkflowRun,
  PipelineGraph,
  GraphNode,
  JobLog,
  DemoWorkflow,
} from '../types/pipeline';

// ─── State shape ──────────────────────────────────────────────────────────────

interface PipelineState {
  // Auth
  token: string | null;
  user: GitHubUser | null;

  // Demo mode
  isDemoMode: boolean;
  demoWorkflows: DemoWorkflow[];
  selectedDemoWorkflow: DemoWorkflow | null;

  // Repository selection
  repos: RepoSummary[];
  selectedRepo: RepoSummary | null;

  // Workflow selection
  workflows: WorkflowSummary[];
  selectedWorkflow: WorkflowSummary | null;

  // Run selection
  runs: WorkflowRun[];
  selectedRun: WorkflowRun | null;

  // Graph
  graph: PipelineGraph | null;
  parseErrors: string[];

  // Node interaction
  selectedNode: GraphNode | null;

  // Logs
  jobLog: JobLog | null;
  loadingLog: boolean;

  // Loading states
  loadingRepos: boolean;
  loadingWorkflows: boolean;
  loadingRuns: boolean;
  loadingGraph: boolean;

  // Error
  error: string | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

interface PipelineActions {
  setToken: (token: string) => void;
  clearAuth: () => void;
  setUser: (user: GitHubUser) => void;

  enterDemoMode: () => void;
  exitDemoMode: () => void;
  setDemoWorkflows: (workflows: DemoWorkflow[]) => void;
  selectDemoWorkflow: (workflow: DemoWorkflow | null) => void;

  setRepos: (repos: RepoSummary[]) => void;
  setLoadingRepos: (v: boolean) => void;
  selectRepo: (repo: RepoSummary | null) => void;

  setWorkflows: (workflows: WorkflowSummary[]) => void;
  setLoadingWorkflows: (v: boolean) => void;
  selectWorkflow: (workflow: WorkflowSummary | null) => void;

  setRuns: (runs: WorkflowRun[]) => void;
  setLoadingRuns: (v: boolean) => void;
  selectRun: (run: WorkflowRun | null) => void;

  setGraph: (graph: PipelineGraph, parseErrors: string[]) => void;
  setLoadingGraph: (v: boolean) => void;

  selectNode: (node: GraphNode | null) => void;

  setJobLog: (log: JobLog | null) => void;
  setLoadingLog: (v: boolean) => void;

  setError: (msg: string | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePipelineStore = create<PipelineState & PipelineActions>(
  (set) => ({
    // Auth
    token: localStorage.getItem('gh_token'),
    user: null,

    // Demo mode
    isDemoMode: false,
    demoWorkflows: [],
    selectedDemoWorkflow: null,
    enterDemoMode: () =>
      set({
        isDemoMode: true,
        token: null,
        user: null,
        repos: [],
        selectedRepo: null,
        workflows: [],
        selectedWorkflow: null,
        runs: [],
        selectedRun: null,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
        error: null,
      }),
    exitDemoMode: () =>
      set({
        isDemoMode: false,
        demoWorkflows: [],
        selectedDemoWorkflow: null,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
        error: null,
      }),
    setDemoWorkflows: (demoWorkflows) => set({ demoWorkflows }),
    selectDemoWorkflow: (workflow) =>
      set({
        selectedDemoWorkflow: workflow,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
      }),
    setToken: (token) => {
      localStorage.setItem('gh_token', token);
      set({ token, error: null });
    },
    clearAuth: () => {
      localStorage.removeItem('gh_token');
      set({
        token: null,
        user: null,
        repos: [],
        selectedRepo: null,
        workflows: [],
        selectedWorkflow: null,
        runs: [],
        selectedRun: null,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
      });
    },
    setUser: (user) => set({ user }),

    // Repos
    repos: [],
    selectedRepo: null,
    loadingRepos: false,
    setRepos: (repos) => set({ repos }),
    setLoadingRepos: (v) => set({ loadingRepos: v }),
    selectRepo: (repo) =>
      set({
        selectedRepo: repo,
        workflows: [],
        selectedWorkflow: null,
        runs: [],
        selectedRun: null,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
      }),

    // Workflows
    workflows: [],
    selectedWorkflow: null,
    loadingWorkflows: false,
    setWorkflows: (workflows) => set({ workflows }),
    setLoadingWorkflows: (v) => set({ loadingWorkflows: v }),
    selectWorkflow: (workflow) =>
      set({
        selectedWorkflow: workflow,
        runs: [],
        selectedRun: null,
        graph: null,
        selectedNode: null,
        jobLog: null,
        parseErrors: [],
      }),

    // Runs
    runs: [],
    selectedRun: null,
    loadingRuns: false,
    setRuns: (runs) => set({ runs }),
    setLoadingRuns: (v) => set({ loadingRuns: v }),
    selectRun: (run) =>
      set({ selectedRun: run, selectedNode: null, jobLog: null }),

    // Graph
    graph: null,
    parseErrors: [],
    loadingGraph: false,
    setGraph: (graph, parseErrors) => set({ graph, parseErrors }),
    setLoadingGraph: (v) => set({ loadingGraph: v }),

    // Node
    selectedNode: null,
    selectNode: (node) => set({ selectedNode: node, jobLog: null }),

    // Logs
    jobLog: null,
    loadingLog: false,
    setJobLog: (log) => set({ jobLog: log }),
    setLoadingLog: (v) => set({ loadingLog: v }),

    // Error
    error: null,
    setError: (msg) => set({ error: msg }),
  }),
);
