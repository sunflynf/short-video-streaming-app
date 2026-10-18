import type { INestApplication } from '@nestjs/common';

/** App-wide settings shared by main.ts and the e2e tests. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.enableShutdownHooks();
}
