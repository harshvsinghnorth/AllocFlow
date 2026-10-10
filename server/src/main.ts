import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Response-Time'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown keys and reject the request if any were sent: a client
      // that submits fields the DTO does not declare is a client that has
      // misunderstood the contract, and silently ignoring them hides bugs.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('AllocFlow API')
    .setDescription(
      'Hostel Room Booking & Management System — REST API implementing the SRS v1.0 requirements.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`AllocFlow API listening on http://localhost:${env.PORT}/api`);
  logger.log(`API documentation at http://localhost:${env.PORT}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start AllocFlow API:', err);
  process.exit(1);
});
