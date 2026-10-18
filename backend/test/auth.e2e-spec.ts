import type { INestApplication } from '@nestjs/common';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, resetDb, signup } from './utils.js';

describe('auth', () => {
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

  it('signs up, logs in, reads /me, refreshes and logs out', async () => {
    const created = await signup(app, { email: 'Ann@Example.com', username: 'Ann' });
    expect(created.user).toMatchObject({ email: 'ann@example.com', username: 'ann', role: 'USER' });
    expect(created.accessToken).toEqual(expect.any(String));
    expect(created.refreshToken).toEqual(expect.any(String));

    const login = await http()
      .post('/v1/auth/login')
      .send({ email: 'ann@example.com', password: 'password123' })
      .expect(200);
    const auth = login.body as AuthResponse;

    const me = await http()
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ id: created.user.id, email: 'ann@example.com' });
    expect(me.body).not.toHaveProperty('passwordHash');

    const refreshed = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(200);
    const next = refreshed.body as AuthResponse;
    expect(next.refreshToken).not.toBe(auth.refreshToken);

    await http()
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${next.accessToken}`)
      .send({ refreshToken: next.refreshToken })
      .expect(204);
    await http().post('/v1/auth/refresh').send({ refreshToken: next.refreshToken }).expect(401);
  });

  it('rejects requests without a valid access token', async () => {
    await http().get('/v1/auth/me').expect(401);
    const res = await http()
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, error: 'Unauthorized' });
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    await signup(app, { email: 'bob@example.com', username: 'bob' });
    const wrongPassword = await http()
      .post('/v1/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await http()
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('revokes every session when a rotated refresh token is reused', async () => {
    const first = await signup(app);
    const other = await http()
      .post('/v1/auth/login')
      .send({ email: first.user.email, password: 'password123' })
      .expect(200);

    const rotated = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    // Replaying the old token (e.g. by an attacker) fails...
    await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    // ...and kills the legitimate rotated token and the user's other sessions too.
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: (rotated.body as AuthResponse).refreshToken })
      .expect(401);
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: (other.body as AuthResponse).refreshToken })
      .expect(401);
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const auth = await signup(app);
    const results = await Promise.all([
      http().post('/v1/auth/refresh').send({ refreshToken: auth.refreshToken }),
      http().post('/v1/auth/refresh').send({ refreshToken: auth.refreshToken }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('validates signup input', async () => {
    const res = await http()
      .post('/v1/auth/signup')
      .send({ email: 'nope', username: 'X!', password: 'short', admin: true })
      .expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property admin should not exist',
        'email must be an email',
        'password must be longer than or equal to 8 characters',
      ]),
    );
  });

  it('returns 409 for a duplicate email or username', async () => {
    await signup(app, { email: 'dup@example.com', username: 'dup' });
    const email = await http()
      .post('/v1/auth/signup')
      .send({ email: 'DUP@example.com', username: 'fresh', password: 'password123' })
      .expect(409);
    expect(email.body.message).toBe('email already in use');
    const username = await http()
      .post('/v1/auth/signup')
      .send({ email: 'fresh@example.com', username: 'DUP', password: 'password123' })
      .expect(409);
    expect(username.body.message).toBe('username already in use');
  });

  it('resets the password with a single-use token and revokes sessions', async () => {
    const auth = await signup(app, { email: 'reset@example.com', username: 'resetter' });
    const { AuthService } = await import('../src/auth/auth.service.js');
    const service = app.get(AuthService);
    const logs: string[] = [];
    const logger = (service as unknown as { logger: { log: (m: string) => void } }).logger;
    const originalLog = logger.log.bind(logger);
    logger.log = (m: string) => logs.push(m);

    await http().post('/v1/auth/forgot-password').send({ email: 'reset@example.com' }).expect(204);
    await http().post('/v1/auth/forgot-password').send({ email: 'none@example.com' }).expect(204);
    logger.log = originalLog;
    expect(logs).toHaveLength(1);
    const token = logs[0]!.split(': ').pop()!;

    await http()
      .post('/v1/auth/reset-password')
      .send({ token, password: 'new-password-1' })
      .expect(204);
    await http()
      .post('/v1/auth/reset-password')
      .send({ token, password: 'new-password-2' })
      .expect(400);
    await http().post('/v1/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401);
    await http()
      .post('/v1/auth/login')
      .send({ email: 'reset@example.com', password: 'new-password-1' })
      .expect(200);
  });
});
