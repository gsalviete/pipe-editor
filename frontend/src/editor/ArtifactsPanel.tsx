// Artifacts panel — one click generates EVERY portable artifact
// (Dockerfile, .dockerignore, GitHub Actions workflow, GitLab CI
// config) and presents them in tabs with copy/download. A staleness
// badge appears when the pipeline changes after generation.

import { useMemo, useState } from 'react';
import { computeEffectiveChain, serializeCanonical, type PipelineIR } from '@modules/ir';
import { ApiError, postExport, postGenerate } from './api';
import { CopyButton, download } from './ui';

type TabId = 'dockerfile' | 'dockerignore' | 'github-actions' | 'gitlab-ci';

interface ArtifactBundle {
  digest: string;
  files: Record<TabId, { label: string; filename: string; content: string }>;
}

const TAB_ORDER: TabId[] = ['dockerfile', 'dockerignore', 'github-actions', 'gitlab-ci'];

export function ArtifactsPanel({
  workingIR,
  irValid,
  blockingUnresolved,
}: {
  workingIR: PipelineIR;
  irValid: boolean;
  blockingUnresolved: string | null;
}) {
  const [bundle, setBundle] = useState<ArtifactBundle | null>(null);
  const [tab, setTab] = useState<TabId>('dockerfile');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digest = useMemo(
    () => (irValid ? serializeCanonical(workingIR) : null),
    [workingIR, irValid],
  );
  const stale = bundle !== null && digest !== null && digest !== bundle.digest;

  // GEN-06 — a stage that asks for a different image does not get one in
  // the GitHub Actions export: one shared workspace needs one container, so
  // every live stage runs in the first stage's image. The generated file
  // says so in its header, but the review's point stands — "the comment is
  // in the file, not in the UI", and the user decides here, before opening
  // the file. This is the same fact, in front of them while they edit.
  const divergentImages = useMemo(() => {
    const live = computeEffectiveChain(workingIR).filter((s) => s.id !== 'docker-build');
    const jobImage = live[0]?.container.image;
    if (jobImage === undefined) return [];
    return live
      .filter((s) => s.container.image !== jobImage)
      .map((s) => ({ stageId: s.id, requested: s.container.image, used: jobImage }));
  }, [workingIR]);

  const disabledReason =
    blockingUnresolved !== null
      ? `Resolve ${blockingUnresolved} before generating.`
      : !irValid
        ? 'Fix the pipeline validation errors first.'
        : null;

  async function onGenerate() {
    if (workingIR === null) return;
    setLoading(true);
    setError(null);
    try {
      const [docker, gha, gitlab] = await Promise.all([
        postGenerate(workingIR),
        postExport('github-actions', workingIR),
        postExport('gitlab-ci', workingIR),
      ]);
      setBundle({
        digest: serializeCanonical(workingIR),
        files: {
          dockerfile: { label: 'Dockerfile', filename: 'Dockerfile', content: docker.dockerfile },
          dockerignore: {
            label: '.dockerignore',
            filename: '.dockerignore',
            content: docker.dockerignore,
          },
          'github-actions': {
            label: 'GitHub Actions',
            filename: 'ci.yml',
            content: gha.content,
          },
          'gitlab-ci': {
            label: 'GitLab CI',
            filename: '.gitlab-ci.yml',
            content: gitlab.content,
          },
        },
      });
    } catch (err) {
      setBundle(null);
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const active = bundle?.files[tab] ?? null;

  return (
    <section className="editor__artifacts" data-testid="artifacts-panel">
      <div className="artifact__header">
        <button
          type="button"
          className="btn"
          onClick={() => void onGenerate()}
          disabled={loading || disabledReason !== null}
          title={disabledReason ?? 'Dockerfile + .dockerignore + GitHub Actions + GitLab CI'}
        >
          {loading ? 'Generating…' : bundle ? 'Regenerate artifacts' : '⚙ Generate artifacts'}
        </button>
        {disabledReason !== null && <span className="editor__hint">{disabledReason}</span>}
        {stale && (
          <span
            className="badge badge--stale"
            title="The pipeline changed since these were generated"
          >
            outdated — regenerate
          </span>
        )}
      </div>

      {divergentImages.length > 0 && (
        <div className="editor__hint editor__hint--block" data-testid="image-divergence-note">
          <strong>GitHub Actions runs every stage in one container.</strong>{' '}
          {divergentImages.map((d) => (
            <span key={d.stageId}>
              <code>{d.stageId}</code> asks for <code>{d.requested}</code>;{' '}
            </span>
          ))}
          the workflow uses <code>{divergentImages[0].used}</code> so the stages
          share a workspace, the way a local run does. GitLab keeps per-stage
          images. Split the stages into separate jobs if that isolation matters.
        </div>
      )}

      {error && (
        <div className="editor__error" role="alert">
          {error}
        </div>
      )}

      {bundle && (
        <div data-testid="artifacts">
          <div className="artifact-tabs" role="tablist">
            {TAB_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`artifact-tab ${tab === id ? 'artifact-tab--active' : ''}`}
                onClick={() => setTab(id)}
              >
                {bundle.files[id].label}
              </button>
            ))}
          </div>
          {active && (
            <div className="artifact-body" role="tabpanel">
              <div className="artifact__header">
                <code className="artifact-filename">{active.filename}</code>
                <CopyButton text={active.content} />
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => download(active.filename, active.content, 'text/plain')}
                >
                  Download
                </button>
              </div>
              <pre>
                <code>{active.content}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
