import type { INestApplication } from '@nestjs/common';
import type { AdminQueuesResponse, AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, notificationsQueue, resetDb, signup, waitFor } from './utils.js';

describe('admin', () => {
  let app: INestApplication<App>;
  let admin: AuthResponse;
  let user: AuthResponse;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    user = await signup(app, { username: 'ann' });
    const created = await signup(app, { username: 'boss' });
    await app
      .get(PrismaService)
      .user.update({ where: { id: created.user.id }, data: { role: 'ADMIN' } });
    admin = (
      await http()
        .post('/v1/auth/login')
        .send({ email: created.user.email, password: 'password123' })
    ).body as AuthResponse;
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows queue counts and recent failures to admins only', async () => {
    // A notification job whose payload makes the processor throw, retried once then failed.
    await notificationsQueue(app).add(
      'like',
      { kind: 'like', actorId: 'x', videoId: 'v', authorId: 'missing-user' },
      { attempts: 1 },
    );
    await waitFor(async () => (await notificationsQueue(app).getFailedCount()) === 1);

    const res = await http().get('/v1/admin/queues').set(bearer(admin)).expect(200);
    const { queues } = res.body as AdminQueuesResponse;
    expect(queues.map((q) => q.name).sort()).toEqual(['media', 'notifications']);
    const notifications = queues.find((q) => q.name === 'notifications')!;
    expect(notifications.counts.failed).toBe(1);
    expect(notifications.recentFailures[0]).toMatchObject({ name: 'like', attemptsMade: 1 });

    await http().get('/v1/admin/queues').set(bearer(user)).expect(403);
    await http().get('/v1/admin/queues').expect(401);
  });

  it('lets admins trigger a test error, rendered as a plain 500', async () => {
    const res = await http().post('/v1/admin/sentry-test').set(bearer(admin)).expect(500);
    expect(res.body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(res.body.requestId).toEqual(expect.any(String));
    await http().post('/v1/admin/sentry-test').set(bearer(user)).expect(403);
  });
});
