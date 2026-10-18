import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import type { Env } from './config/env.js';

/** App-wide settings shared by main.ts and the e2e tests. */
export function setupApp(nestApp: INestApplication): void {
  const app = nestApp as NestExpressApplication;
  const config = app.get(ConfigService<Env, true>);

  // Share landing pages live at /v/:id so links stay short and API-version independent.
  app.setGlobalPrefix('v1', { exclude: [{ path: 'v/:id', method: RequestMethod.GET }] });
  // Behind a proxy (Railway), trust X-Forwarded-For for exactly that many hops, so rate limits
  // and view/share debouncing see the client's IP rather than the proxy's.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.useBodyParser('json', { limit: '100kb' });
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({ origin: corsOrigin(config) });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}

/**
 * Native apps don't send an Origin, so CORS only matters for browsers (the web build and admin
 * tools). Production allows only CORS_ORIGINS; development allows any origin unless it's set.
 */
function corsOrigin(config: ConfigService<Env, true>): string[] | boolean {
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins?.length) return origins;
  return config.get('NODE_ENV', { infer: true }) !== 'production';
}
