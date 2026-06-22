export { Detector } from './engine';
export type { DetectorOptions } from './engine';
export { ALL_RULES } from './rules';
export type {
  Rule,
  Case,
  RuleCtx,
  Manifests,
  PartialPipelineIR,
  Emission,
  FieldEmission,
  StageEmission,
  Outcome,
  ManifestPath,
  ParsedManifests,
} from './types';
export {
  ENUMERATED_MANIFEST_SET,
  CANONICAL_STAGE_IDS,
  REQUIRED_NULLABLE_FIELDS,
  ALLOWED_FIELD_TARGETS,
} from './types';
export { emitOutcome } from './emit-outcome';
export {
  NoRootDirError,
  NoManifestError,
  MalformedPackageJsonError,
  RuleRegistrationError,
  RuleConflictError,
  RuleDefectError,
  InvalidProducedIRError,
} from './errors';
