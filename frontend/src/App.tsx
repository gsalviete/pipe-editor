import { useEffect, useCallback, useState } from 'react';
import { usePipelineStore } from './store/usePipelineStore';
import { useAuth, useRepos, useWorkflows, useRuns, useGraph, useNodeInteraction, useDemo } from './hooks/usePipeline';
import { RepoSelector } from './components/RepoSelector/RepoSelector';
import { WorkflowList, RunSelector } from './components/WorkflowSelector/WorkflowSelector';
import { PipelineGraph } from './components/PipelineGraph/PipelineGraph';
import { NodePanel } from './components/NodePanel/NodePanel';
import { DemoSelector } from './components/DemoSelector/DemoSelector';
import type { GraphNode } from './types/pipeline';

// ─── Auth callback handler ────────────────────────────────────────────────────

function useOAuthCallback() {
  const { handleCallback } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    window.history.replaceState({}, document.title, window.location.pathname);
    handleCallback(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Demo sidebar ─────────────────────────────────────────────────────────────

function DemoSidebar() {
  const { demoWorkflows, selectedDemoWorkflow, pickWorkflow } = useDemo();

  return (
    <aside
      className="flex flex-col border-r border-[#30363d] overflow-hidden"
      style={{ width: 280, background: '#0f1117' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-[#30363d]"
        style={{ background: '#161b22' }}
      >
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(88,166,255,0.15)', color: '#58a6ff' }}
        >
          DEMO
        </span>
        <span className="text-xs text-[#6e7681]">No login required</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <DemoSelector
          workflows={demoWorkflows}
          selected={selectedDemoWorkflow}
          onSelect={pickWorkflow}
        />
      </div>
    </aside>
  );
}

// ─── GitHub sidebar ───────────────────────────────────────────────────────────

type SidebarTab = 'repos' | 'workflows' | 'runs';

function GithubSidebar() {
  const { selectedRepo } = usePipelineStore();
  const { selectedWorkflow } = usePipelineStore();
  const { activeTab, setTab } = useSidebarTab();

  const { repos, loadingRepos, loadRepos, selectRepo } = useRepos();
  const { workflows, loadingWorkflows, loadWorkflows, selectWorkflow } = useWorkflows();
  const { runs, loadingRuns, loadRuns, selectRun } = useRuns();
  const { loadGraph } = useGraph();
  const { selectedRun } = usePipelineStore();

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    if (selectedRepo) {
      loadWorkflows();
      setTab('workflows');
    }
  }, [selectedRepo, loadWorkflows, setTab]);

  useEffect(() => {
    if (selectedWorkflow) {
      loadRuns();
      setTab('runs');
      loadGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflow]);

  useEffect(() => {
    if (selectedRun) {
      loadGraph();
    }
  }, [selectedRun, loadGraph]);

  return (
    <aside
      className="flex flex-col border-r border-[#30363d] overflow-hidden"
      style={{ width: 280, background: '#0f1117' }}
    >
      <div className="flex border-b border-[#30363d]" style={{ background: '#161b22' }}>
        {(['repos', 'workflows', 'runs'] as SidebarTab[]).map((tab) => {
          const labels: Record<SidebarTab, string> = {
            repos: 'Repos',
            workflows: 'Workflows',
            runs: 'Runs',
          };
          const disabled =
            (tab === 'workflows' && !selectedRepo) ||
            (tab === 'runs' && !selectedWorkflow);

          return (
            <button
              key={tab}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{
                color: activeTab === tab ? '#c9d1d9' : '#6e7681',
                borderBottom: activeTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              onClick={() => !disabled && setTab(tab)}
              disabled={disabled}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'repos' && (
          <RepoSelector
            repos={repos}
            selectedRepo={selectedRepo}
            loading={loadingRepos}
            onSelect={(repo) => selectRepo(repo)}
          />
        )}
        {activeTab === 'workflows' && (
          <WorkflowList
            workflows={workflows}
            selected={selectedWorkflow}
            loading={loadingWorkflows}
            onSelect={(wf) => selectWorkflow(wf)}
          />
        )}
        {activeTab === 'runs' && (
          <RunSelector
            runs={runs}
            selected={selectedRun}
            loading={loadingRuns}
            onSelect={(run) => selectRun(run)}
          />
        )}
      </div>

      {selectedRepo && (
        <div className="px-3 py-2 border-t border-[#21262d] text-xs text-[#6e7681] font-mono truncate">
          {selectedRepo.fullName}
          {selectedWorkflow && <> / {selectedWorkflow.name}</>}
        </div>
      )}
    </aside>
  );
}

function useSidebarTab() {
  const [activeTab, setActiveTabState] = useLocalState<SidebarTab>('repos');
  return { activeTab, setTab: setActiveTabState };
}

function useLocalState<T>(initial: T): [T, (v: T) => void] {
  return useState<T>(initial);
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const { user, login, logout } = useAuth();
  const { graph } = usePipelineStore();
  const { isDemoMode, exitDemo } = useDemo();

  return (
    <header
      className="flex items-center gap-4 px-4 py-2 border-b border-[#30363d] flex-shrink-0"
      style={{ background: '#161b22', height: 48 }}
    >
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-[#58a6ff]" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 3a2 2 0 0 1 2-2h6.586a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 5.414V13a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3Zm2-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6h-2.5A1.5 1.5 0 0 1 9 4.5V2H3Z" />
        </svg>
        <span className="font-mono font-bold text-[#c9d1d9] text-sm">
          pipe<span className="text-[#58a6ff]">-editor</span>
        </span>
        {isDemoMode && (
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(88,166,255,0.15)', color: '#58a6ff' }}
          >
            DEMO
          </span>
        )}
      </div>

      {graph && (
        <div className="flex items-center gap-2 text-xs text-[#6e7681]">
          <span className="font-mono">{graph.workflowName}</span>
          <span>·</span>
          <span>{graph.nodes.length} jobs</span>
          <span>·</span>
          <span>{graph.edges.length} edges</span>
          {!graph.isValid && (
            <>
              <span>·</span>
              <span className="text-[#f85149]">{graph.validationErrors.length} error(s)</span>
            </>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {isDemoMode ? (
          <button
            onClick={exitDemo}
            className="text-xs text-[#6e7681] hover:text-[#c9d1d9] transition-colors"
          >
            Exit Demo
          </button>
        ) : user ? (
          <>
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="w-6 h-6 rounded-full border border-[#30363d]"
            />
            <span className="text-sm text-[#c9d1d9] font-mono">{user.login}</span>
            <button
              onClick={logout}
              className="text-xs text-[#6e7681] hover:text-[#c9d1d9] transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={login}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
            style={{ background: '#238636', color: '#fff' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.67 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            Sign in with GitHub
          </button>
        )}
      </div>
    </header>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyCanvas({ token }: { token: string | null }) {
  const { login } = useAuth();
  const { startDemo } = useDemo();

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <svg className="w-16 h-16 text-[#30363d]" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 3a2 2 0 0 1 2-2h6.586a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 5.414V13a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3Z" />
        </svg>
        <div>
          <h2 className="text-[#c9d1d9] font-semibold text-lg mb-1">
            Visualize your CI/CD pipelines
          </h2>
          <p className="text-[#6e7681] text-sm max-w-xs">
            Sign in with GitHub to load your workflows, or try the demo to explore the visualizer.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={login}
            className="flex items-center gap-2 px-4 py-2 rounded font-semibold transition-colors text-sm"
            style={{ background: '#238636', color: '#fff' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.67 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            Sign in with GitHub
          </button>
          <button
            onClick={startDemo}
            className="flex items-center gap-2 px-4 py-2 rounded font-semibold transition-colors text-sm"
            style={{ background: 'transparent', color: '#58a6ff', border: '1px solid #30363d' }}
          >
            Try Demo Mode
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <svg className="w-12 h-12 text-[#30363d]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" />
      </svg>
      <p className="text-[#6e7681] text-sm">
        Select a repository and workflow to visualize the pipeline.
      </p>
    </div>
  );
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-[#c9d1d9]"
        style={{ background: 'rgba(22,27,34,0.9)', border: '1px solid #30363d' }}
      >
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="#58a6ff" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
        Building graph…
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  useOAuthCallback();

  const { token, loadUser } = useAuth();
  const { graph, loadingGraph } = useGraph();
  const { selectedNode, jobLog, loadingLog, handleNodeClick, clearNode } = useNodeInteraction();
  const {
    isDemoMode,
    selectedNode: demoSelectedNode,
    jobLog: demoJobLog,
    loadingLog: demoLoadingLog,
    handleDemoNodeClick,
    clearNode: demoClearNode,
  } = useDemo();
  const { error } = usePipelineStore();

  useEffect(() => {
    if (token) loadUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNode = isDemoMode ? demoSelectedNode : selectedNode;
  const activeLog = isDemoMode ? demoJobLog : jobLog;
  const activeLoadingLog = isDemoMode ? demoLoadingLog : loadingLog;
  const activeClearNode = isDemoMode ? demoClearNode : clearNode;

  const handleNodeClickCb = useCallback(
    (node: GraphNode) => {
      if (isDemoMode) {
        handleDemoNodeClick(node);
      } else {
        handleNodeClick(node);
      }
    },
    [isDemoMode, handleDemoNodeClick, handleNodeClick],
  );

  const showSidebar = isDemoMode || !!token;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: '#0f1117' }}>
      <Header />

      {error && (
        <div
          className="px-4 py-2 text-sm text-[#ff7b72] flex items-center gap-2 flex-shrink-0"
          style={{ background: 'rgba(248,81,73,0.1)', borderBottom: '1px solid rgba(248,81,73,0.3)' }}
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (isDemoMode ? <DemoSidebar /> : <GithubSidebar />)}

        <main className="flex-1 relative overflow-hidden">
          {loadingGraph && <LoadingOverlay />}

          {graph ? (
            <PipelineGraph graph={graph} onNodeClick={handleNodeClickCb} />
          ) : (
            <EmptyCanvas token={token} />
          )}
        </main>

        {activeNode && (
          <NodePanel
            node={activeNode}
            jobLog={activeLog}
            loadingLog={activeLoadingLog}
            onClose={activeClearNode}
          />
        )}
      </div>
    </div>
  );
}
