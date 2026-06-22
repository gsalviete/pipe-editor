import { Rule } from '../types';
import { DR_001_PROJECT_NAME } from './dr-001-project-name';
import { DR_002_LANGUAGE } from './dr-002-language';
import { DR_003_RUNTIME_NAME } from './dr-003-runtime-name';
import { DR_004_RUNTIME_VERSION } from './dr-004-runtime-version';
import { DR_005_PACKAGE_MANAGER_NAME } from './dr-005-package-manager-name';
import { DR_006_PACKAGE_MANAGER_VERSION } from './dr-006-package-manager-version';
import { DR_007_INSTALL } from './dr-007-install';
import { DR_008_LINT } from './dr-008-lint';
import { DR_009_TEST } from './dr-009-test';
import { DR_010_BUILD } from './dr-010-build';
import { DR_011_DOCKER_BUILD } from './dr-011-docker-build';

export const ALL_RULES: Rule[] = [
  DR_001_PROJECT_NAME,
  DR_002_LANGUAGE,
  DR_003_RUNTIME_NAME,
  DR_004_RUNTIME_VERSION,
  DR_005_PACKAGE_MANAGER_NAME,
  DR_006_PACKAGE_MANAGER_VERSION,
  DR_007_INSTALL,
  DR_008_LINT,
  DR_009_TEST,
  DR_010_BUILD,
  DR_011_DOCKER_BUILD,
];

export {
  DR_001_PROJECT_NAME,
  DR_002_LANGUAGE,
  DR_003_RUNTIME_NAME,
  DR_004_RUNTIME_VERSION,
  DR_005_PACKAGE_MANAGER_NAME,
  DR_006_PACKAGE_MANAGER_VERSION,
  DR_007_INSTALL,
  DR_008_LINT,
  DR_009_TEST,
  DR_010_BUILD,
  DR_011_DOCKER_BUILD,
};
