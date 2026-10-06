import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Préfixe global d'API
  app.setGlobalPrefix('api');

  // CORS pour le frontend React et les applications clientes
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Pipes et filtres globaux
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZAFF - Multi-Tenant API')
    .setDescription(
      'API Multi-Tenant NestJS avec MongoDB (Base Globale + Base isolée par Établissement) pour la gestion commerciale, stocks, ventes, POS et SAV.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'x-tenant-slug',
      in: 'header',
      required: false,
      description: 'Slug de l\'établissement (ex: zaff-plateau)',
      schema: { type: 'string' },
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = configService.get<number>('port') || 8000;
  await app.listen(port);
  logger.log(`=======================================================`);
  logger.log(`🚀 ZAFF Backend is running on: http://localhost:${port}/api`);
  logger.log(`📖 Swagger API Docs available at: http://localhost:${port}/api/docs`);
  logger.log(`=======================================================`);
}

bootstrap();
