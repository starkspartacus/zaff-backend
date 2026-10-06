"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('ZAFF / OTTAZIA STORE - Multi-Tenant API')
        .setDescription('API Multi-Tenant NestJS avec MongoDB (Base Globale + Base isolée par Établissement) pour la gestion commerciale, stocks, ventes, POS et SAV.')
        .setVersion('1.0')
        .addBearerAuth()
        .addGlobalParameters({
        name: 'x-tenant-slug',
        in: 'header',
        required: false,
        description: 'Slug de l\'établissement (ex: ottazia-plateau)',
        schema: { type: 'string' },
    })
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
    const port = configService.get('port') || 8000;
    await app.listen(port);
    logger.log(`=======================================================`);
    logger.log(`🚀 ZAFF Backend is running on: http://localhost:${port}/api`);
    logger.log(`📖 Swagger API Docs available at: http://localhost:${port}/api/docs`);
    logger.log(`=======================================================`);
}
bootstrap();
//# sourceMappingURL=main.js.map