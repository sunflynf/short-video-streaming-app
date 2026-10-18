import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Crash and error reporting; a no-op unless EXPO_PUBLIC_SENTRY_DSN is set at build time. */
export const sentryEnabled = !!dsn;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production'),
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

/** Tag reports with the signed-in account (id only). */
export function setSentryUser(userId: string | undefined): void {
  if (sentryEnabled) Sentry.setUser(userId ? { id: userId } : null);
}

export { Sentry };
