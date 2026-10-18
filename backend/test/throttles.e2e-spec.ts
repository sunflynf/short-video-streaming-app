import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

// Env is validated when app.module is imported, so it must be set before the imports run.
vi.hoisted(() => {
  process.env.THROTTLE_ENABLED = 'true';
  process.env.THROTTLE_DEFAULT_PER_MIN = '20';
  process.env.TRUST_PROXY = '1';
});

describe('rate limits', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (email: string, ip = '203.0.113.1') =>
    http()
      .post('/v1/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, password: 'wrong-password' });

  it('throttles login brute force per IP + email with Retry-After', async () => {
    for (let i = 0; i < 5; i++) await login('victim@example.com').expect(401);
    const blocked = await login('victim@example.com').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests, please slow down',
    });

    // A different account from the same IP, and the same account from another IP, still work.
    await login('someone-else@example.com').expect(401);
    await login('victim@example.com', '198.51.100.7').expect(401);
  });

  it('applies the global default per client and skips health checks', async () => {
    for (let i = 0; i < 20; i++) {
      await http().get('/v1/videos/feed').set('x-forwarded-for', '203.0.113.9').expect(200);
    }
    await http().get('/v1/videos/feed').set('x-forwarded-for', '203.0.113.9').expect(429);
    await http().get('/v1/videos/feed').set('x-forwarded-for', '203.0.113.10').expect(200);
    for (let i = 0; i < 25; i++) {
      await http().get('/v1/health').set('x-forwarded-for', '203.0.113.9').expect(200);
    }
  });

  it('keys signed-in users by account rather than IP', async () => {
    const ann = await signup(app, { username: 'ann' });
    for (let i = 0; i < 20; i++) {
      await http()
        .get('/v1/auth/me')
        .set(bearer(ann))
        .set('x-forwarded-for', `203.0.113.${i}`)
        .expect(200);
    }
    await http()
      .get('/v1/auth/me')
      .set(bearer(ann))
      .set('x-forwarded-for', '203.0.113.99')
      .expect(429);
  });
});
