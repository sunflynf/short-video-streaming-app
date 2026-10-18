import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, resetDb } from './utils.js';

describe('GET /v1/health', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports db and redis as ok without auth', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
    expect(res.body.queues).toEqual({
      media: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      notifications: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    });
  });

  it('echoes or assigns a request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('x-request-id', 'abc-123')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('request body errors', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('rejects bodies over 100 kB with 413', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'a@example.com', password: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body).toMatchObject({ statusCode: 413, message: 'Request body too large' });
  });
});
