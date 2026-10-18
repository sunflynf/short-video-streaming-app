import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db-url.js';

/** Creates the test database if needed and applies all migrations to it. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
