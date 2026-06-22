"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const github_module_1 = require("./modules/github/github.module");
const parser_module_1 = require("./modules/parser/parser.module");
const graph_module_1 = require("./modules/graph/graph.module");
const logs_module_1 = require("./modules/logs/logs.module");
const demo_module_1 = require("./modules/demo/demo.module");
const editor_api_1 = require("./modules/editor-api");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
                ignoreEnvFile: false,
            }),
            github_module_1.GithubModule,
            parser_module_1.ParserModule,
            graph_module_1.GraphModule,
            logs_module_1.LogsModule,
            demo_module_1.DemoModule,
            editor_api_1.EditorApiModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map