import * as Sentry from '@sentry/nestjs';

/**
 * Sends an unexpected error to Sentry with the request or job context. A no-op unless
 * SENTRY_DSN is set (Sentry.init ran in instrument.ts).
 */
export function reportError(
  error: unknown,
  context: { requestId?: string; userId?: string; tags?: Record<string, string> } = {},
): void {
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('requestId', context.requestId);
    if (context.userId) scope.setUser({ id: context.userId });
    for (const [key, value] of Object.entries(context.tags ?? {})) scope.setTag(key, value);
    Sentry.captureException(error);
  });
}
