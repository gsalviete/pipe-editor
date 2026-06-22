"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIND_ADDRESS = void 0;
exports.createApp = createApp;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
exports.BIND_ADDRESS = '127.0.0.1';
async function createApp() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Pipe Editor API')
        .setDescription('CI/CD Pipeline Visualizer and Debugger')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    return app;
}
async function bootstrap() {
    let app;
    try {
        app = await createApp();
    }
    catch (err) {
        console.error('Backend refused to start.');
        console.error(err.message);
        process.exit(1);
    }
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, exports.BIND_ADDRESS);
    console.log(`Backend running at http://${exports.BIND_ADDRESS}:${port}`);
    console.log(`Swagger docs: http://${exports.BIND_ADDRESS}:${port}/api/docs`);
}
if (require.main === module) {
    void bootstrap();
}
//# sourceMappingURL=main.js.map