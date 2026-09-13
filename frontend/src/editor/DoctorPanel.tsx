// Pipeline Doctor panel — automatic best-practice analysis. Re-runs
// (debounced) on every edit; shows a health score and prioritized,
// actionable findings.

import { useEffect, useRef, useState } from 'react';
import { serializeCanonical, type PipelineIR } from '@modules/ir';
import { Diagnosis, postAdvise } from './api';

const SEVERITY_ICON = { critical: '⛔', warning: '⚠', info: 'ℹ' } as const;

export function DoctorPanel({
  workingIR,
  irValid,
}: {
  workingIR: PipelineIR;
  irValid: boolean;
}) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [open, setOpen] = useState(false);
  const digest = irValid ? serializeCanonical(workingIR) : null;

  // The request is keyed on the canonical digest, not on the IR's object
  // identity: every edit produces a new object, but only a change in
  // canonical content is a different pipeline to diagnose. The linter
  // cannot know that `digest` determines `workingIR`'s relevant content,
  // so the IR travels through a ref — which is what "read the latest value
  // without depending on it" means — instead of behind a suppression.
  const latestIR = useRef(workingIR);
  latestIR.current = workingIR;

  useEffect(() => {
    if (digest === null) return;
    let cancelled = false;
    const t = setTimeout(() => {
      postAdvise(latestIR.current)
        .then((d) => {
          if (!cancelled) setDiagnosis(d);
        })
        .catch(() => undefined); // advisory only — never block the editor
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [digest]);

  if (!irValid || diagnosis === null) return null;

  const { score, grade, findings } = diagnosis;
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  return (
    <section className="doctor" data-testid="doctor-panel">
      <button
        type="button"
        className="doctor__header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`doctor__grade doctor__grade--${grade.toLowerCase()}`}>{grade}</span>
        <span className="doctor__title">Pipeline doctor</span>
        <span className="doctor__score">{score}/100</span>
        <span className="doctor__counts">
          {counts.critical > 0 && <span className="doctor__count doctor__count--critical">⛔ {counts.critical}</span>}
          {counts.warning > 0 && <span className="doctor__count doctor__count--warning">⚠ {counts.warning}</span>}
          {counts.info > 0 && <span className="doctor__count doctor__count--info">ℹ {counts.info}</span>}
          {findings.length === 0 && <span className="doctor__count doctor__count--clean">no findings — ship it</span>}
        </span>
        <span className="doctor__chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && findings.length > 0 && (
        <ul className="doctor__list">
          {findings.map((f) => (
            <li key={f.id} className={`doctor__finding doctor__finding--${f.severity}`}>
              <div className="doctor__finding-title">
                <span aria-hidden="true">{SEVERITY_ICON[f.severity]}</span> {f.title}
              </div>
              <div className="doctor__finding-detail">{f.detail}</div>
              <div className="doctor__finding-fix">Fix: {f.fix}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
