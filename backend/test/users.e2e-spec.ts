import type { INestApplication } from '@nestjs/common';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('users', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves public profiles by id and username without private fields', async () => {
    const byId = await http().get(`/v1/users/${ann.user.id}`).expect(200);
    expect(byId.body).toMatchObject({ id: ann.user.id, username: 'ann', isFollowing: null });
    expect(byId.body).not.toHaveProperty('email');
    expect(byId.body).not.toHaveProperty('role');

    const byName = await http().get('/v1/users/by-username/ANN').expect(200);
    expect(byName.body.id).toBe(ann.user.id);

    await http().get('/v1/users/does-not-exist').expect(404);
  });

  it('reports isFollowing for a signed-in viewer', async () => {
    await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);
    const res = await http().get(`/v1/users/${ann.user.id}`).set(bearer(ben)).expect(200);
    expect(res.body.isFollowing).toBe(true);
    const own = await http().get(`/v1/users/${ann.user.id}`).set(bearer(ann)).expect(200);
    expect(own.body.isFollowing).toBeNull();
  });

  it('lets users edit only their own profile', async () => {
    const res = await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ displayName: '  Ann A.  ', bio: 'hello', username: 'Ann_A' })
      .expect(200);
    expect(res.body).toMatchObject({ displayName: 'Ann A.', bio: 'hello', username: 'ann_a' });

    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ben))
      .send({ bio: 'hacked' })
      .expect(403);
    await http().patch(`/v1/users/${ann.user.id}`).send({ bio: 'anon' }).expect(401);
  });

  it('lets admins edit any profile', async () => {
    await app
      .get(PrismaService)
      .user.update({ where: { id: ben.user.id }, data: { role: 'ADMIN' } });
    // Roles live in the access token, so log in again to pick up the new role.
    const login = await http()
      .post('/v1/auth/login')
      .send({ email: ben.user.email, password: 'password123' })
      .expect(200);
    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(login.body as AuthResponse))
      .send({ bio: 'moderated' })
      .expect(200);
  });

  it('clears nullable fields and rejects invalid ones', async () => {
    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ bio: 'temp' })
      .expect(200);
    const cleared = await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ bio: null })
      .expect(200);
    expect(cleared.body.bio).toBeNull();

    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ bio: 'x'.repeat(161) })
      .expect(400);
    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ avatarUrl: 'http://insecure.example.com/a.png' })
      .expect(400);
  });

  it('returns 409 when taking an existing username', async () => {
    const res = await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ username: 'ben' })
      .expect(409);
    expect(res.body.message).toBe('username already in use');
  });

  it('returns an empty video list until uploads exist', async () => {
    const res = await http().get(`/v1/users/${ann.user.id}/videos`).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });
});
