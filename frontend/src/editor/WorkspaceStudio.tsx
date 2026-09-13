import { useMemo, useState } from 'react';
import type { PipelineIR } from '@modules/ir';
import {
  ApiError,
  postGenerateWorkspace,
  type ComposeMode,
  type WorkspaceArtifact,
  type WorkspaceBundle,
  type WorkspaceCiProvider,
  type WorkspacePlan,
  type WorkspaceService,
} from './api';
import { CopyButton, download } from './ui';

const EDITABLE_STAGE_IDS = new Set(['install', 'lint', 'test', 'build']);

function Glyph({ children, spin = false }: { children: string; spin?: boolean }) {
  return <span className={`workspace-glyph ${spin ? 'spin' : ''}`} aria-hidden="true">{children}</span>;
}

export function WorkspaceStudio({
  initialPlan,
  onBack,
}: {
  initialPlan: WorkspacePlan;
  onBack: () => void;
}) {
  const [plan, setPlan] = useState<WorkspacePlan>(() => clonePlan(initialPlan));
  const [provider, setProvider] = useState<WorkspaceCiProvider>('github-actions');
  const [composeMode, setComposeMode] = useState<ComposeMode>('root');
  const [bundle, setBundle] = useState<WorkspaceBundle | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => plan.services.filter((service) => service.enabled).length,
    [plan.services],
  );
  const activeArtifact =
    bundle?.artifacts.find((artifact) => artifact.path === activePath) ??
    bundle?.artifacts[0] ??
    null;

  function updateService(
    serviceId: string,
    updater: (service: WorkspaceService) => WorkspaceService,
  ) {
    setPlan((current) => ({
      ...current,
      services: current.services.map((service) =>
        service.id === serviceId ? updater(service) : service,
      ),
    }));
    setBundle(null);
    setActivePath(null);
    setError(null);
  }

  function updateCommand(
    service: WorkspaceService,
    stageId: string,
    stepIndex: number,
    command: string,
  ): WorkspaceService {
    const ir: PipelineIR = {
      ...service.ir,
      stages: service.ir.stages.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              steps: stage.steps.map((step, index) =>
                index === stepIndex ? { ...step, run: command } : step,
              ),
            }
          : stage,
      ),
    };
    return { ...service, ir };
  }

  async function generate() {
    if (selectedCount === 0) return;
    setLoading(true);
    setError(null);
    try {
      const generated = await postGenerateWorkspace(plan, provider, composeMode);
      setBundle(generated);
      setActivePath(generated.artifacts[0]?.path ?? null);
    } catch (cause) {
      setBundle(null);
      setError(
        cause instanceof ApiError
          ? `${cause.code}: ${cause.message}`
          : cause instanceof TypeError
            ? 'The local API is offline. Start it with "pnpm dev:backend" and try again.'
            : (cause as Error).message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="workspace-studio" data-testid="workspace-studio">
      <section className="workspace-hero">
        <div>
          <span className="workspace-kicker">Multi-service workspace</span>
          <h2>{plan.name}</h2>
          <p>
            We found {plan.services.length} service(s). Review commands and ports,
            then generate Docker, Compose, and basic CI files in one pass.
          </p>
        </div>
        <div className="workspace-hero__stats" aria-label="Workspace summary">
          <span><Glyph>◫</Glyph> {selectedCount} selected</span>
          <span><Glyph>◇</Glyph> no cloud, no deploy</span>
        </div>
      </section>

      {plan.warnings.length > 0 && (
        <section className="workspace-warnings" role="status">
          <strong>A few items need attention</strong>
          {plan.warnings.map((warning, index) => (
            <p key={`${warning.path}-${index}`}>
              <code>{warning.path}</code> {warning.message}
            </p>
          ))}
        </section>
      )}

      {plan.existingComposeFiles.length > 0 && (
        <section className="workspace-file-protection" aria-label="Existing Compose files">
          <div>
            <Glyph>◈</Glyph>
            <strong>Existing Compose files are protected</strong>
          </div>
          <p>
            Pipe Editor found {plan.existingComposeFiles.length} file(s) and will generate a
            separate <code>docker-compose.pipe-editor*.yml</code> file instead of replacing them.
          </p>
          <div className="workspace-file-protection__paths">
            {plan.existingComposeFiles.map((path) => <code key={path}>{path}</code>)}
          </div>
        </section>
      )}

      <div className="workspace-layout">
        <section className="workspace-services" aria-label="Detected services">
          <div className="workspace-section-heading">
            <div>
              <span>01</span>
              <h3>Detected services</h3>
            </div>
            <small>You control what goes into the bundle.</small>
          </div>

          {plan.services.length === 0 ? (
            <div className="workspace-empty">
              <Glyph>▦</Glyph>
              <strong>No supported Node services found</strong>
              <p>Choose a folder with package.json files up to three levels deep.</p>
            </div>
          ) : (
            plan.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onUpdate={(updater) => updateService(service.id, updater)}
                onCommand={(stageId, stepIndex, command) =>
                  updateService(service.id, (current) =>
                    updateCommand(current, stageId, stepIndex, command),
                  )
                }
              />
            ))
          )}
        </section>

        <aside className="workspace-output">
          <div className="workspace-section-heading">
            <div>
              <span>02</span>
              <h3>Delivery format</h3>
            </div>
          </div>

          <fieldset className="workspace-choice">
            <legend><Glyph>⑂</Glyph> CI</legend>
            <label className={provider === 'github-actions' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="workspace-provider"
                value="github-actions"
                checked={provider === 'github-actions'}
                onChange={() => {
                  setProvider('github-actions');
                  setBundle(null);
                }}
              />
              <span><strong>GitHub Actions</strong><small>.github/workflows/ci.yml</small></span>
            </label>
            <label className={provider === 'gitlab-ci' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="workspace-provider"
                value="gitlab-ci"
                checked={provider === 'gitlab-ci'}
                onChange={() => {
                  setProvider('gitlab-ci');
                  setBundle(null);
                }}
              />
              <span><strong>GitLab CI</strong><small>.gitlab-ci.yml</small></span>
            </label>
          </fieldset>

          <fieldset className="workspace-choice">
            <legend><Glyph>◇</Glyph> Docker Compose</legend>
            <label className={composeMode === 'root' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="compose-mode"
                value="root"
                checked={composeMode === 'root'}
                onChange={() => {
                  setComposeMode('root');
                  setBundle(null);
                }}
              />
              <span><strong>One at the root</strong><small>Start everything together</small></span>
            </label>
            <label className={composeMode === 'per-service' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="compose-mode"
                value="per-service"
                checked={composeMode === 'per-service'}
                onChange={() => {
                  setComposeMode('per-service');
                  setBundle(null);
                }}
              />
              <span><strong>One per service</strong><small>Each folder stays independent</small></span>
            </label>
          </fieldset>

          <button
            type="button"
            className="btn workspace-generate"
            disabled={loading || selectedCount === 0}
            onClick={() => void generate()}
          >
            {loading ? <Glyph spin>◌</Glyph> : <Glyph>&lt;/&gt;</Glyph>}
            {loading ? 'Validating and generating…' : 'Generate bundle'}
          </button>
          <p className="workspace-readonly-note">
            Preview and download only. Your project is never changed silently.
          </p>
          {error && <div className="editor__error" role="alert">{error}</div>}
        </aside>
      </div>

      {bundle && activeArtifact && (
        <ArtifactBrowser
          bundle={bundle}
          active={activeArtifact}
          onSelect={setActivePath}
        />
      )}

      <button type="button" className="btn btn--ghost workspace-back" onClick={onBack}>
        ← Choose another folder
      </button>
    </main>
  );
}

function ServiceCard({
  service,
  onUpdate,
  onCommand,
}: {
  service: WorkspaceService;
  onUpdate: (updater: (service: WorkspaceService) => WorkspaceService) => void;
  onCommand: (stageId: string, stepIndex: number, command: string) => void;
}) {
  const editableStages = service.ir.stages.filter(
    (stage) => EDITABLE_STAGE_IDS.has(stage.id) && stage.steps.length > 0,
  );
  return (
    <article className={`workspace-service ${service.enabled ? '' : 'is-disabled'}`}>
      <header>
        <label className="workspace-service__toggle">
          <input
            type="checkbox"
            checked={service.enabled}
            aria-label={`Include ${service.name}`}
            onChange={(event) =>
              onUpdate((current) => ({ ...current, enabled: event.target.checked }))
            }
          />
          <span aria-hidden="true" />
        </label>
        <div className="workspace-service__identity">
          <span className={`stack-icon stack-icon--${service.kind}`}>
            {service.kind === 'frontend' ? <Glyph>&lt;/&gt;</Glyph> : <Glyph>▦</Glyph>}
          </span>
          <div>
            <h4>{service.name}</h4>
            <code>{service.path}</code>
          </div>
        </div>
        <span className="workspace-stack">{stackLabel(service.stack)}</span>
      </header>

      <div className="workspace-service__ports">
        <label>
          Host port
          <input
            type="number"
            min="1"
            max="65535"
            value={service.hostPort}
            aria-label={`${service.name} host port`}
            disabled={!service.enabled}
            onChange={(event) =>
              onUpdate((current) => ({ ...current, hostPort: Number(event.target.value) }))
            }
          />
        </label>
        <span aria-hidden="true">→</span>
        <label>
          Container port
          <input
            type="number"
            min="1"
            max="65535"
            value={service.containerPort}
            aria-label={`${service.name} container port`}
            disabled={!service.enabled}
            onChange={(event) =>
              onUpdate((current) => ({ ...current, containerPort: Number(event.target.value) }))
            }
          />
        </label>
      </div>

      {service.stack !== 'vite' && (
        <label className="workspace-command workspace-command--start">
          <span>Runtime start command</span>
          <input
            type="text"
            value={service.startCommand}
            aria-label={`${service.name} start command`}
            disabled={!service.enabled}
            onChange={(event) =>
              onUpdate((current) => ({ ...current, startCommand: event.target.value }))
            }
          />
        </label>
      )}

      <details className="workspace-commands">
        <summary>Customize build and tests <span>{editableStages.length} stage(s)</span></summary>
        <div>
          {editableStages.map((stage) =>
            stage.steps.map((step, stepIndex) => (
              <label className="workspace-command" key={`${stage.id}-${step.id}`}>
                <span>{stage.name}</span>
                <input
                  type="text"
                  value={step.run}
                  aria-label={`${service.name} ${stage.id} command ${stepIndex + 1}`}
                  disabled={!service.enabled}
                  onChange={(event) => onCommand(stage.id, stepIndex, event.target.value)}
                />
              </label>
            )),
          )}
        </div>
      </details>
    </article>
  );
}

function ArtifactBrowser({
  bundle,
  active,
  onSelect,
}: {
  bundle: WorkspaceBundle;
  active: WorkspaceArtifact;
  onSelect: (path: string) => void;
}) {
  const passed = bundle.checks.filter((check) => check.status === 'passed').length;
  return (
    <section className="workspace-artifacts" data-testid="workspace-artifacts">
      <header className="workspace-artifacts__header">
        <div>
          <span className="workspace-kicker">Bundle ready</span>
          <h3>{bundle.artifacts.length} files generated</h3>
        </div>
        <span className="workspace-check-summary">
          <Glyph>✓</Glyph> {passed} checks passed
        </span>
      </header>
      <div className="workspace-artifacts__body">
        <nav aria-label="Generated files">
          {bundle.artifacts.map((artifact) => (
            <button
              type="button"
              key={artifact.path}
              className={artifact.path === active.path ? 'is-active' : ''}
              onClick={() => onSelect(artifact.path)}
            >
              <Glyph>‹/›</Glyph>
              <span>{artifact.path}</span>
            </button>
          ))}
        </nav>
        <div className="workspace-artifact-preview">
          <div className="workspace-artifact-preview__toolbar">
            <code>{active.path}</code>
            <span />
            <CopyButton text={active.content} />
            <button
              type="button"
              className="btn btn--small"
              onClick={() =>
                download(active.path.replace(/\//g, '__'), active.content, 'text/plain')
              }
            >
              <Glyph>↓</Glyph> Download
            </button>
          </div>
          <pre><code>{active.content}</code></pre>
        </div>
      </div>
      <details className="workspace-checks">
        <summary>View the full validation report</summary>
        <ul>
          {bundle.checks.map((check) => (
            <li key={check.id} className={`is-${check.status}`}>
              {check.status === 'passed' ? <Glyph>✓</Glyph> : <Glyph>×</Glyph>}
              {check.message}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function stackLabel(stack: WorkspaceService['stack']): string {
  if (stack === 'vite') return 'Vite frontend';
  if (stack === 'nestjs') return 'NestJS API';
  return 'Node service';
}

function clonePlan(plan: WorkspacePlan): WorkspacePlan {
  return JSON.parse(JSON.stringify(plan)) as WorkspacePlan;
}
