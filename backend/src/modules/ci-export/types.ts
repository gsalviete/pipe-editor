export type CiProvider = 'github-actions' | 'gitlab-ci';

export interface CiExportArtifact {
  provider: CiProvider;
  /** Suggested path inside the user's repository. */
  filename: string;
  content: string;
}
