// Loaded first by main.ts: Sentry must initialise before the modules it instruments.
import * as Sentry from '@sentry/nestjs';

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: rely on the real environment.
  }
}

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Railway exposes the deployed commit; SENTRY_RELEASE overrides it.
    release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    // Errors only for now; performance tracing can be sampled in later.
    tracesSampleRate: 0,
    // Keep user ids (useful for triage) but not client IP addresses.
    beforeSend(event) {
      if (event.user) delete event.user.ip_address;
      return event;
    },
  });
}
