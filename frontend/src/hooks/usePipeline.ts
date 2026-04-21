import { useCallback } from 'react';
import { usePipelineStore } from '../store/usePipelineStore';
import * as api from '../services/api';
import type { RepoSummary, WorkflowSummary, WorkflowRun, GraphNode, DemoWorkflow } from '../types/pipeline';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const { token, user, setToken, setUser, clearAuth, setError } =
    usePipelineStore();

  const login = useCallback(async () => {
    try {
      const url = await api.getOAuthUrl();
      window.location.href = url;
    } catch {
      setError('Failed to initiate GitHub login');
    }
  }, [setError]);

  const handleCallback = useCallback(
    async (code: string) => {
      try {
        const accessToken = await api.exchangeCode(code);
        setToken(accessToken);
        const me = await api.getUser();
        setUser(me);
        return true;
      } catch {
        setError('OAuth authentication failed');
        return false;
      }
    },
    [setToken, setUser, setError],
  );

  const loadUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.getUser();
      setUser(me);
    } catch {
      clearAuth();
    }
  }, [token, setUser, clearAuth]);

  return { token, user, login, handleCallback, loadUser, logout: clearAuth };
}

// ─── Repos ────────────────────────────────────────────────────────────────────

export function useRepos() {
  const { repos, selectedRepo, loadingRepos, setRepos, setLoadingRepos, selectRepo, setError } =
    usePipelineStore();

  const loadRepos = useCallback(async () => {
    setError(null);
    setLoadingRepos(true);
    try {
      const data = await api.listRepos();
      setRepos(data);
    } catch {
      setError('Failed to load repositories');
    } finally {
      setLoadingRepos(false);
    }
  }, [setRepos, setLoadingRepos, setError]);

  const handleSelect = useCallback(
    (repo: RepoSummary) => selectRepo(repo),
    [selectRepo],
  );

  return { repos, selectedRepo, loadingRepos, loadRepos, selectRepo: handleSelect };
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export function useWorkflows() {
  const {
    workflows,
    selectedWorkflow,
    selectedRepo,
    loadingWorkflows,
    setWorkflows,
    setLoadingWorkflows,
    selectWorkflow,
    setError,
  } = usePipelineStore();

  const loadWorkflows = useCallback(async () => {
    if (!selectedRepo) return;
    setError(null);
    setLoadingWorkflows(true);
    try {
      const data = await api.listWorkflows(selectedRepo.owner, selectedRepo.name);
      setWorkflows(data);
    } catch {
      setError('Failed to load workflows');
    } finally {
      setLoadingWorkflows(false);
    }
  }, [selectedRepo, setWorkflows, setLoadingWorkflows, setError]);

  const handleSelect = useCallback(
    (wf: WorkflowSummary) => selectWorkflow(wf),
    [selectWorkflow],
  );

  return {
    workflows,
    selectedWorkflow,
    loadingWorkflows,
    loadWorkflows,
    selectWorkflow: handleSelect,
  };
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export function useRuns() {
  const {
    runs,
    selectedRun,
    selectedRepo,
    selectedWorkflow,
    loadingRuns,
    setRuns,
    setLoadingRuns,
    selectRun,
    setError,
  } = usePipelineStore();

  const loadRuns = useCallback(async () => {
    if (!selectedRepo || !selectedWorkflow) return;
    setError(null);
    setLoadingRuns(true);
    try {
      const data = await api.listWorkflowRuns(
        selectedRepo.owner,
        selectedRepo.name,
        selectedWorkflow.id,
      );
      setRuns(data);
    } catch {
      setError('Failed to load workflow runs');
    } finally {
      setLoadingRuns(false);
    }
  }, [selectedRepo, selectedWorkflow, setRuns, setLoadingRuns, setError]);

  const handleSelect = useCallback(
    (run: WorkflowRun) => selectRun(run),
    [selectRun],
  );

  return { runs, selectedRun, loadingRuns, loadRuns, selectRun: handleSelect };
}

// ─── Graph ────────────────────────────────────────────────────────────────────

export function useGraph() {
  const {
    graph,
    parseErrors,
    loadingGraph,
    selectedRepo,
    selectedWorkflow,
    selectedRun,
    setGraph,
    setLoadingGraph,
    setError,
  } = usePipelineStore();

  const loadGraph = useCallback(async () => {
    if (!selectedRepo || !selectedWorkflow) return;
    setError(null);
    setLoadingGraph(true);
    try {
      const { graph: g, parseErrors: pe } = await api.getWorkflowGraph(
        selectedRepo.owner,
        selectedRepo.name,
        selectedWorkflow.id,
        selectedRun?.id,
      );
      setGraph(g, pe);
    } catch {
      setError('Failed to build pipeline graph');
    } finally {
      setLoadingGraph(false);
    }
  }, [selectedRepo, selectedWorkflow, selectedRun, setGraph, setLoadingGraph, setError]);

  return { graph, parseErrors, loadingGraph, loadGraph };
}

// ─── Node interaction + Logs ──────────────────────────────────────────────────

export function useNodeInteraction() {
  const {
    selectedNode,
    jobLog,
    loadingLog,
    selectedRepo,
    selectedRun,
    selectNode,
    setJobLog,
    setLoadingLog,
    setError,
  } = usePipelineStore();

  const handleNodeClick = useCallback(
    async (node: GraphNode) => {
      selectNode(node);
      setError(null);

      // Load logs if there's a real run job to fetch
      if (!node.runJobId || !selectedRepo || !selectedRun) return;

      setLoadingLog(true);
      try {
        const log = await api.getJobLogs(
          selectedRepo.owner,
          selectedRepo.name,
          selectedRun.id,
          node.runJobId,
        );
        setJobLog(log);
      } catch {
        setError(`Failed to load logs for job "${node.label}"`);
      } finally {
        setLoadingLog(false);
      }
    },
    [selectedRepo, selectedRun, selectNode, setJobLog, setLoadingLog, setError],
  );

  return { selectedNode, jobLog, loadingLog, handleNodeClick, clearNode: () => selectNode(null) };
}

// ─── Demo mode ────────────────────────────────────────────────────────────────

export function useDemo() {
  const {
    isDemoMode,
    demoWorkflows,
    selectedDemoWorkflow,
    enterDemoMode,
    exitDemoMode,
    setDemoWorkflows,
    selectDemoWorkflow,
    setGraph,
    setLoadingGraph,
    selectedNode,
    jobLog,
    loadingLog,
    selectNode,
    setJobLog,
    setLoadingLog,
    setError,
  } = usePipelineStore();

  const startDemo = useCallback(async () => {
    enterDemoMode();
    try {
      const workflows = await api.listDemoWorkflows();
      setDemoWorkflows(workflows);
    } catch {
      setError('Failed to load demo workflows');
    }
  }, [enterDemoMode, setDemoWorkflows, setError]);

  const pickWorkflow = useCallback(
    async (workflow: DemoWorkflow) => {
      selectDemoWorkflow(workflow);
      setError(null);
      setLoadingGraph(true);
      try {
        const { graph, parseErrors } = await api.getDemoGraph(workflow.name);
        setGraph(graph, parseErrors);
      } catch {
        setError('Failed to load demo graph');
      } finally {
        setLoadingGraph(false);
      }
    },
    [selectDemoWorkflow, setGraph, setLoadingGraph, setError],
  );

  const handleDemoNodeClick = useCallback(
    async (node: GraphNode) => {
      if (!selectedDemoWorkflow) return;
      selectNode(node);
      setError(null);
      setLoadingLog(true);
      try {
        const log = await api.getDemoJobLogs(selectedDemoWorkflow.name, node.jobId);
        setJobLog(log);
      } catch {
        setError(`Failed to load logs for "${node.label}"`);
      } finally {
        setLoadingLog(false);
      }
    },
    [selectedDemoWorkflow, selectNode, setJobLog, setLoadingLog, setError],
  );

  return {
    isDemoMode,
    demoWorkflows,
    selectedDemoWorkflow,
    selectedNode,
    jobLog,
    loadingLog,
    startDemo,
    exitDemo: exitDemoMode,
    pickWorkflow,
    handleDemoNodeClick,
    clearNode: () => selectNode(null),
  };
}
