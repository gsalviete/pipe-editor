"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DR_011_DOCKER_BUILD = exports.DR_010_BUILD = exports.DR_009_TEST = exports.DR_008_LINT = exports.DR_007_INSTALL = exports.DR_006_PACKAGE_MANAGER_VERSION = exports.DR_005_PACKAGE_MANAGER_NAME = exports.DR_004_RUNTIME_VERSION = exports.DR_003_RUNTIME_NAME = exports.DR_002_LANGUAGE = exports.DR_001_PROJECT_NAME = exports.ALL_RULES = void 0;
const dr_001_project_name_1 = require("./dr-001-project-name");
Object.defineProperty(exports, "DR_001_PROJECT_NAME", { enumerable: true, get: function () { return dr_001_project_name_1.DR_001_PROJECT_NAME; } });
const dr_002_language_1 = require("./dr-002-language");
Object.defineProperty(exports, "DR_002_LANGUAGE", { enumerable: true, get: function () { return dr_002_language_1.DR_002_LANGUAGE; } });
const dr_003_runtime_name_1 = require("./dr-003-runtime-name");
Object.defineProperty(exports, "DR_003_RUNTIME_NAME", { enumerable: true, get: function () { return dr_003_runtime_name_1.DR_003_RUNTIME_NAME; } });
const dr_004_runtime_version_1 = require("./dr-004-runtime-version");
Object.defineProperty(exports, "DR_004_RUNTIME_VERSION", { enumerable: true, get: function () { return dr_004_runtime_version_1.DR_004_RUNTIME_VERSION; } });
const dr_005_package_manager_name_1 = require("./dr-005-package-manager-name");
Object.defineProperty(exports, "DR_005_PACKAGE_MANAGER_NAME", { enumerable: true, get: function () { return dr_005_package_manager_name_1.DR_005_PACKAGE_MANAGER_NAME; } });
const dr_006_package_manager_version_1 = require("./dr-006-package-manager-version");
Object.defineProperty(exports, "DR_006_PACKAGE_MANAGER_VERSION", { enumerable: true, get: function () { return dr_006_package_manager_version_1.DR_006_PACKAGE_MANAGER_VERSION; } });
const dr_007_install_1 = require("./dr-007-install");
Object.defineProperty(exports, "DR_007_INSTALL", { enumerable: true, get: function () { return dr_007_install_1.DR_007_INSTALL; } });
const dr_008_lint_1 = require("./dr-008-lint");
Object.defineProperty(exports, "DR_008_LINT", { enumerable: true, get: function () { return dr_008_lint_1.DR_008_LINT; } });
const dr_009_test_1 = require("./dr-009-test");
Object.defineProperty(exports, "DR_009_TEST", { enumerable: true, get: function () { return dr_009_test_1.DR_009_TEST; } });
const dr_010_build_1 = require("./dr-010-build");
Object.defineProperty(exports, "DR_010_BUILD", { enumerable: true, get: function () { return dr_010_build_1.DR_010_BUILD; } });
const dr_011_docker_build_1 = require("./dr-011-docker-build");
Object.defineProperty(exports, "DR_011_DOCKER_BUILD", { enumerable: true, get: function () { return dr_011_docker_build_1.DR_011_DOCKER_BUILD; } });
exports.ALL_RULES = [
    dr_001_project_name_1.DR_001_PROJECT_NAME,
    dr_002_language_1.DR_002_LANGUAGE,
    dr_003_runtime_name_1.DR_003_RUNTIME_NAME,
    dr_004_runtime_version_1.DR_004_RUNTIME_VERSION,
    dr_005_package_manager_name_1.DR_005_PACKAGE_MANAGER_NAME,
    dr_006_package_manager_version_1.DR_006_PACKAGE_MANAGER_VERSION,
    dr_007_install_1.DR_007_INSTALL,
    dr_008_lint_1.DR_008_LINT,
    dr_009_test_1.DR_009_TEST,
    dr_010_build_1.DR_010_BUILD,
    dr_011_docker_build_1.DR_011_DOCKER_BUILD,
];
//# sourceMappingURL=index.js.map