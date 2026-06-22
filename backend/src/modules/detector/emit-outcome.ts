// emitOutcome implements IR-FR-009's truth table executably, plus the
// required-field collapse from Engine Decision 2.
//
// Returns one of:
//   { kind: 'committed', value }         — FieldEmission committed
//   { kind: 'committed-stage', stage }   — StageEmission committed
//   { kind: 'unresolved', field, message } — paired unresolved entry
//   { kind: 'nothing' }                  — no emission (omit, optional field)
//
// Required-field collapse: when emission targets one of the required
// nullable project fields and the Outcome would be 'nothing', the engine
// converts it to 'unresolved' with a synthesized non-empty message if
// none was supplied.

import { Case, Emission, Outcome, REQUIRED_NULLABLE_FIELDS, RuleCtx } from './types';

export function emitOutcome(c: Case, ctx: RuleCtx): Outcome {
  if (c.confidence === 'high') {
    return outcomeFromEmission(c.emit(ctx));
  }
  // medium | low — directive applies (low flattens to medium per Engine spec)
  switch (c.onUncertainty) {
    case 'omit':
      return collapseIfRequired(c, ctx, { kind: 'nothing' });
    case 'assume-default':
      return collapseIfRequired(c, ctx, defaultedCommitted(c, ctx));
    case 'needs-user-input': {
      const emission = c.emit(ctx);
      if (emission.kind !== 'field') {
        // unresolved is only meaningful for field paths
        return collapseIfRequired(c, ctx, { kind: 'nothing' });
      }
      return {
        kind: 'unresolved',
        field: emission.target,
        message: messageOrSynthesized(c.message, emission.target),
      };
    }
  }
}

function outcomeFromEmission(em: Emission): Outcome {
  return em.kind === 'field'
    ? { kind: 'committed', value: em.value }
    : { kind: 'committed-stage', stage: em.stage };
}

function defaultedCommitted(c: Case, ctx: RuleCtx): Outcome {
  if (c.default !== undefined) {
    return { kind: 'committed', value: c.default };
  }
  // Fallback: invoke emit (some rules carry the default inside the emission)
  return outcomeFromEmission(c.emit(ctx));
}

function collapseIfRequired(c: Case, ctx: RuleCtx, candidate: Outcome): Outcome {
  if (candidate.kind !== 'nothing') return candidate;
  if (c.emit === undefined) return candidate;
  // Probe the emission's target — emit is pure, so calling it for the target
  // is safe even when condition was uncertain.
  let target: string | undefined;
  try {
    const em = c.emit(ctx);
    if (em.kind === 'field') target = em.target;
  } catch {
    return candidate;
  }
  if (target === undefined) return candidate;
  if (!(REQUIRED_NULLABLE_FIELDS as readonly string[]).includes(target)) return candidate;
  return {
    kind: 'unresolved',
    field: target,
    message: messageOrSynthesized(c.message, target),
  };
}

function messageOrSynthesized(message: string | undefined, field: string): string {
  if (message !== undefined && message.length > 0) return message;
  return `Could not determine value for ${field}; please specify.`;
}
