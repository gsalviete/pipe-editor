"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readManifests = readManifests;
const fs_1 = require("fs");
const path_1 = require("path");
const yaml = require("js-yaml");
const types_1 = require("./types");
const errors_1 = require("./errors");
function readManifests(rootPath) {
    const out = {};
    const warnings = [];
    let anyPresent = false;
    for (const name of types_1.ENUMERATED_MANIFEST_SET) {
        const path = (0, path_1.join)(rootPath, name);
        if (!(0, fs_1.existsSync)(path))
            continue;
        if (!(0, fs_1.statSync)(path).isFile())
            continue;
        anyPresent = true;
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        if (name === 'package.json') {
            try {
                out['package.json'] = JSON.parse(raw);
            }
            catch (e) {
                throw new errors_1.MalformedPackageJsonError(path, e.message);
            }
            continue;
        }
        try {
            if (name === 'pnpm-lock.yaml') {
                const parsed = yaml.load(raw);
                out['pnpm-lock.yaml'] = parsed && typeof parsed === 'object' ? parsed : {};
            }
            else if (name === 'package-lock.json') {
                out['package-lock.json'] = JSON.parse(raw);
            }
            else if (name === 'yarn.lock') {
                out['yarn.lock'] = { __present: true };
            }
            else if (name === 'nest-cli.json') {
                out['nest-cli.json'] = JSON.parse(raw);
            }
            else if (name === 'tsconfig.json') {
                out['tsconfig.json'] = JSON.parse(stripJsonComments(raw));
            }
        }
        catch (e) {
            warnings.push({ manifest: name, message: e.message });
        }
    }
    return { manifests: out, warnings, anyPresent };
}
function stripJsonComments(input) {
    return input.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
//# sourceMappingURL=manifests.js.map