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
