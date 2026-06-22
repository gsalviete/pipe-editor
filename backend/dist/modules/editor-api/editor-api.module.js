"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorApiModule = void 0;
const common_1 = require("@nestjs/common");
const detect_controller_1 = require("./detect.controller");
const generate_controller_1 = require("./generate.controller");
const workspace_root_1 = require("./workspace-root");
let EditorApiModule = class EditorApiModule {
};
exports.EditorApiModule = EditorApiModule;
exports.EditorApiModule = EditorApiModule = __decorate([
    (0, common_1.Module)({
        controllers: [detect_controller_1.DetectController, generate_controller_1.GenerateController],
        providers: [
            {
                provide: workspace_root_1.WORKSPACE_ROOT_TOKEN,
                useFactory: () => (0, workspace_root_1.resolveWorkspaceRoot)(process.env[workspace_root_1.PIPE_EDITOR_WORKSPACE_ROOT_ENV]),
            },
        ],
        exports: [workspace_root_1.WORKSPACE_ROOT_TOKEN],
    })
], EditorApiModule);
//# sourceMappingURL=editor-api.module.js.map