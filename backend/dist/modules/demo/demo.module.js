"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoModule = void 0;
const common_1 = require("@nestjs/common");
const demo_service_1 = require("./demo.service");
const demo_controller_1 = require("./demo.controller");
const parser_module_1 = require("../parser/parser.module");
const graph_module_1 = require("../graph/graph.module");
let DemoModule = class DemoModule {
};
exports.DemoModule = DemoModule;
exports.DemoModule = DemoModule = __decorate([
    (0, common_1.Module)({
        imports: [parser_module_1.ParserModule, graph_module_1.GraphModule],
        providers: [demo_service_1.DemoService],
        controllers: [demo_controller_1.DemoController],
    })
], DemoModule);
//# sourceMappingURL=demo.module.js.map