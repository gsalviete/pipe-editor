// Validation error type. Every error cites the spec clause it violates
// (`acId`) so tests can assert against the spec directly.

export type AcceptanceCriterionId =
  | 'IR-AC-001'
  | 'IR-AC-003'
  | 'IR-AC-007'
  | 'IR-AC-009'
  | 'IR-AC-016'
  | 'IR-AC-017'
  | 'IR-AC-018';

export type LinearChainClause =
  | 'acyclic'
  | 'single-chain'
  | 'single-head'
  | 'single-tail'
  | 'connected'
  | 'well-formed-references'
  | 'missing-dependsOn';

export interface ValidationError {
  acId: AcceptanceCriterionId;
  path: string;
  message: string;
  clause?: LinearChainClause;
}
