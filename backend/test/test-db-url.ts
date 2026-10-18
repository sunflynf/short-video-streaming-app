/**
 * E2E tests run against a separate database so truncating tables never touches dev data:
 * TEST_DATABASE_URL if set, otherwise DATABASE_URL with `_test` appended to the db name.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set');
  const url = new URL(env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

/**
 * E2E tests use Redis db 1 (or TEST_REDIS_URL) so flushing it between tests never touches
 * the dev queue, feed snapshots or rate-limit keys in db 0.
 */
export function testRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TEST_REDIS_URL) return env.TEST_REDIS_URL;
  if (!env.REDIS_URL) throw new Error('REDIS_URL or TEST_REDIS_URL must be set');
  const url = new URL(env.REDIS_URL);
  url.pathname = '/1';
  return url.toString();
}
