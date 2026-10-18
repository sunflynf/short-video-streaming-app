import { z } from 'zod';

/** Blank values (`MUX_TOKEN_ID=` in .env) count as unset. */
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Optional so the API boots without Mux; uploads and webhooks return 503 until they're set.
  MUX_TOKEN_ID: optionalString,
  MUX_TOKEN_SECRET: optionalString,
  MUX_WEBHOOK_SECRET: optionalString,
  MAX_VIDEO_DURATION_SEC: z.coerce.number().positive().default(60),
  MAX_ACTIVE_UPLOADS: z.coerce.number().int().positive().default(3),
  MAX_DAILY_UPLOADS: z.coerce.number().int().positive().default(20),
  FEED_SNAPSHOT_SIZE: z.coerce.number().int().positive().default(200),
  FEED_WINDOW_DAYS: z.coerce.number().positive().default(14),
  FEED_SNAPSHOT_TTL_SEC: z.coerce.number().int().positive().default(1800),
  ANON_FEED_CACHE_SEC: z.coerce.number().int().positive().default(60),
  // Cloudflare R2 for avatars. Optional: without it, avatar uploads return 503.
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_PUBLIC_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Prisma queries slower than this are logged as warnings. */
  SLOW_QUERY_MS: z.coerce.number().int().positive().default(200),
  /** Optional: errors are reported to Sentry when set (see src/instrument.ts). */
  SENTRY_DSN: optionalString,
  SENTRY_RELEASE: optionalString,
  // Rate limiting (Redis-backed). Disable only in tests.
  THROTTLE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  THROTTLE_DEFAULT_PER_MIN: z.coerce.number().int().positive().default(100),
  /** Proxy hops in front of the API (1 on Railway) so req.ip is the client from X-Forwarded-For. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Comma-separated browser origins allowed by CORS. Empty: any origin outside production, none in it. */
  CORS_ORIGINS: optionalString,
  LEGAL_CONTACT_EMAIL: z.email().default('support@example.com'),
  /** Base URL for share links (`${PUBLIC_WEB_URL}/v/:id`). */
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
});

const DEV_JWT_SECRET_MARKER = 'dev-only';

/**
 * Production must not boot with development defaults: a dev or short JWT secret, no CORS
 * allowlist for the web build, or share links pointing at localhost.
 */
const productionSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (env.JWT_ACCESS_SECRET.includes(DEV_JWT_SECRET_MARKER) || env.JWT_ACCESS_SECRET.length < 48) {
    issue('JWT_ACCESS_SECRET', 'Use a random secret of at least 48 characters in production');
  }
  if (!env.CORS_ORIGINS) issue('CORS_ORIGINS', 'Required in production');
  if (/localhost|127\.0\.0\.1/.test(env.PUBLIC_WEB_URL)) {
    issue('PUBLIC_WEB_URL', 'Must be the public URL in production');
  }
  if (env.LEGAL_CONTACT_EMAIL.endsWith('@example.com')) {
    issue('LEGAL_CONTACT_EMAIL', 'Set a real contact address in production');
  }
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at boot when required env vars are missing or invalid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = productionSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
