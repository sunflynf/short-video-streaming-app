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
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at boot when required env vars are missing or invalid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
