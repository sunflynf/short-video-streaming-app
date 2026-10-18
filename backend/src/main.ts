import './instrument.js';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { setupApp } from './setup-app.js';

async function bootstrap(): Promise<void> {
  // rawBody: webhook signatures are computed over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  setupApp(app);

  const config = app.get(ConfigService<Env, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ShortVid API')
        .setVersion('v1')
        .addBearerAuth()
        .addSecurityRequirements('bearer')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
