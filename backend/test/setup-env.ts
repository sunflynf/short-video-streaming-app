import 'dotenv/config';
import { testDatabaseUrl, testRedisUrl } from './test-db-url.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.REDIS_URL = testRedisUrl();
process.env.NODE_ENV = 'test';
// Mux network calls are stubbed (test/stub-mux.provider.ts); webhooks are signed with this secret.
process.env.MUX_TOKEN_ID = 'test-token-id';
process.env.MUX_TOKEN_SECRET = 'test-token-secret';
process.env.MUX_WEBHOOK_SECRET = 'test-webhook-secret';
