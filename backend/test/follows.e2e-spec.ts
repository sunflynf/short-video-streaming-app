import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResponse, Paginated, UserSummary } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { FOLLOW_CREATED } from '../src/follows/follow.events.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('follows', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  const http = () => request(app.getHttpServer());
  const profile = async (id: string) => (await http().get(`/v1/users/${id}`).expect(200)).body;

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

  it('follows and unfollows idempotently with correct counts', async () => {
    const events: unknown[] = [];
    app.get(EventEmitter2).on(FOLLOW_CREATED, (e) => events.push(e));

    for (let i = 0; i < 2; i++) {
      const res = await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);
      expect(res.body).toEqual({ following: true });
    }
    expect(await profile(ann.user.id)).toMatchObject({ followerCount: 1, followingCount: 0 });
    expect(await profile(ben.user.id)).toMatchObject({ followerCount: 0, followingCount: 1 });
    expect(events).toEqual([{ followerId: ben.user.id, followingId: ann.user.id }]);

    for (let i = 0; i < 2; i++) {
      const res = await http()
        .delete(`/v1/users/${ann.user.id}/follow`)
        .set(bearer(ben))
        .expect(200);
      expect(res.body).toEqual({ following: false });
    }
    expect(await profile(ann.user.id)).toMatchObject({ followerCount: 0 });
    expect(await profile(ben.user.id)).toMatchObject({ followingCount: 0 });
  });

  it('keeps counts consistent under concurrent requests', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)),
      ),
    );
    expect(await profile(ann.user.id)).toMatchObject({ followerCount: 1 });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        http().delete(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)),
      ),
    );
    expect(await profile(ann.user.id)).toMatchObject({ followerCount: 0 });
    expect(await profile(ben.user.id)).toMatchObject({ followingCount: 0 });
  });

  it('rejects following yourself, unknown users and anonymous requests', async () => {
    await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ann)).expect(400);
    await http().post('/v1/users/nobody/follow').set(bearer(ann)).expect(404);
    await http().post(`/v1/users/${ann.user.id}/follow`).expect(401);
  });

  it('paginates followers and following newest first', async () => {
    const fans: AuthResponse[] = [];
    for (let i = 0; i < 5; i++) {
      const fan = await signup(app, { username: `fan_${i}` });
      await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(fan)).expect(200);
      fans.push(fan);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await http()
        .get(`/v1/users/${ann.user.id}/followers`)
        .query({ limit: 2, ...(cursor && { cursor }) })
        .expect(200);
      const page = res.body as Paginated<UserSummary>;
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((u) => u.username));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['fan_4', 'fan_3', 'fan_2', 'fan_1', 'fan_0']);

    const following = await http().get(`/v1/users/${fans[0]!.user.id}/following`).expect(200);
    expect(following.body).toEqual({
      items: [{ id: ann.user.id, username: 'ann', displayName: null, avatarUrl: null }],
      nextCursor: null,
    });

    await http().get(`/v1/users/${ann.user.id}/followers`).query({ limit: 51 }).expect(400);
  });
});
