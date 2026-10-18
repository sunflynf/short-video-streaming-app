import 'dotenv/config';
import { testDatabaseUrl, testRedisUrl } from './test-db-url.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.REDIS_URL = testRedisUrl();
process.env.NODE_ENV = 'test';
// Mux network calls are stubbed (test/stub-mux.provider.ts); webhooks are signed with this secret.
process.env.MUX_TOKEN_ID = 'test-token-id';
process.env.MUX_TOKEN_SECRET = 'test-token-secret';
process.env.MUX_WEBHOOK_SECRET = 'test-webhook-secret';
// Avatar presigning is local (no network), so dummy R2 credentials exercise the real code.
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.R2_BUCKET = 'test-avatars';
process.env.R2_PUBLIC_URL = 'https://avatars.example.com';
// Most suites make many requests from one IP; throttles.e2e-spec.ts turns limits back on.
process.env.THROTTLE_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
