import 'dotenv/config';
import { testDatabaseUrl } from './test-db-url.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
