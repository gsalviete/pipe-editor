// SEC-02 — the command-review gate for a pipeline the user did not author.
//
// Three paths load an IR from outside: a `#ir=` share link, a dropped or
// imported JSON/YAML file, and CI text sent to /api/import. After loading,
// one click on ▶ Run posts that IR to /api/execute, which runs
// `sh -c "<the steps>"` in a container with a copy of the project mounted
// read-write and network access.
//
// `validate()` is a SCHEMA gate. It says the document is well-formed; it
// says nothing about what the commands do. The editor did display the
// commands, but nothing marked an imported pipeline as untrusted and the
// Run button was exactly as prominent as for a detected one.
//
// This component is the missing step: before the first run of a pipeline
// that arrived from elsewhere, every command is listed and the user has to
// say they have read them.

import type { PipelineCommand } from './working-ir';

export function CommandList({ commands }: { commands: PipelineCommand[] }) {
  if (commands.length === 0) {
    return <p className="command-review__empty">This pipeline contains no commands.</p>;
  }
  return (
    <ol className="command-review__list" data-testid="command-review-list">
      {commands.map((command) => (
        <li
          key={`${command.stageId}:${command.stepId}`}
          className={
            command.willRun
              ? 'command-review__item'
              : 'command-review__item command-review__item--skipped'
          }
        >
          <span className="command-review__stage">{command.stageName}</span>
          <pre className="command-review__run">{command.run}</pre>
          {!command.willRun && (
            <span className="command-review__skipped-tag">
              disabled — not part of this run
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The blocking review shown before a share link is loaded at all.
 *
 * A link is the least trustworthy of the three sources — it can be sent to
 * someone and opened without any deliberate act of importing — so it never
 * loads on its own.
 */
export function ShareLinkReview({
  commands,
  onLoad,
  onDiscard,
}: {
  commands: PipelineCommand[];
  onLoad: () => void;
  onDiscard: () => void;
}) {
  return (
    <section
      className="command-review command-review--blocking"
      role="alertdialog"
      aria-label="Review shared pipeline"
      data-testid="share-link-review"
    >
      <h2>A pipeline arrived in this link</h2>
      <p>
        It was not detected from your project — someone sent it to you. These
        are the commands it would run, in a container with a copy of your
        project mounted and network access. Read them before loading.
      </p>
      <CommandList commands={commands} />
      <div className="command-review__actions">
        <button type="button" className="btn" onClick={onLoad}>
          I have read these commands — load the pipeline
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDiscard}>
          Discard it
        </button>
      </div>
    </section>
  );
}

/** The confirmation shown in the run panel before the first untrusted run. */
export function UntrustedRunConfirm({
  source,
  commands,
  onConfirm,
  onCancel,
}: {
  source: string;
  commands: PipelineCommand[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      className="command-review"
      role="alertdialog"
      aria-label="Review commands before running"
      data-testid="untrusted-run-confirm"
    >
      <h3>This pipeline came from {source}</h3>
      <p>
        pipe-editor will run these commands in a container with a copy of your
        project mounted read-write and network access. Nothing here has been
        checked for what it does.
      </p>
      <CommandList commands={commands} />
      <div className="command-review__actions">
        <button type="button" className="btn" onClick={onConfirm}>
          I reviewed these commands — run them
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
