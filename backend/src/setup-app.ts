import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

/** App-wide settings shared by main.ts and the e2e tests. */
export function setupApp(app: INestApplication): void {
  // Share landing pages live at /v/:id so links stay short and API-version independent.
  app.setGlobalPrefix('v1', { exclude: [{ path: 'v/:id', method: RequestMethod.GET }] });
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
