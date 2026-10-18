import type { INestApplication } from '@nestjs/common';
import type {
  AuthResponse,
  CommentDto,
  NotificationDto,
  Paginated,
  UserSummary,
  VideoDto,
} from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createReadyVideo } from './media-helpers.js';
import { bearer, createTestApp, notificationsQueue, resetDb, signup, waitFor } from './utils.js';

describe('blocks', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  let cat: AuthResponse;
  const http = () => request(app.getHttpServer());
  const settle = () =>
    waitFor(async () => {
      const c = await notificationsQueue(app).getJobCounts('waiting', 'active', 'delayed');
      return Object.values(c).every((n) => n === 0);
    });

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
    cat = await signup(app, { username: 'cat' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('removes follows both ways with counters and prevents re-following', async () => {
    await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
    await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);

    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);
    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204); // idempotent

    const annProfile = await http().get(`/v1/users/${ann.user.id}`).expect(200);
    expect(annProfile.body).toMatchObject({ followerCount: 0, followingCount: 0 });
    const benSeenByAnn = await http().get(`/v1/users/${ben.user.id}`).set(bearer(ann)).expect(200);
    expect(benSeenByAnn.body).toMatchObject({
      followerCount: 0,
      followingCount: 0,
      blockedByMe: true,
    });

    await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(403);
    await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(403);
    await http().post(`/v1/users/${ann.user.id}/block`).set(bearer(ann)).expect(400);

    const list = await http().get('/v1/users/me/blocks').set(bearer(ann)).expect(200);
    expect((list.body as Paginated<UserSummary>).items.map((u) => u.username)).toEqual(['ben']);

    await http().delete(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);
    await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
  });

  it('hides each other’s videos and comments, in both directions', async () => {
    const benVideo = await createReadyVideo(app, ben.user.id);
    const catVideo = await createReadyVideo(app, cat.user.id);
    await http()
      .post(`/v1/videos/${catVideo}/comments`)
      .set(bearer(ben))
      .send({ body: 'from ben' })
      .expect(201);
    await http()
      .post(`/v1/videos/${catVideo}/comments`)
      .set(bearer(cat))
      .send({ body: 'from cat' })
      .expect(201);

    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);

    const feedIds = async (auth: AuthResponse) =>
      (
        (await http().get('/v1/videos/feed').set(bearer(auth)).expect(200))
          .body as Paginated<VideoDto>
      ).items.map((v) => v.id);
    expect(await feedIds(ann)).toEqual([catVideo]);
    await http().get(`/v1/videos/${benVideo}`).set(bearer(ann)).expect(404);
    const profileVideos = await http()
      .get(`/v1/users/${ben.user.id}/videos`)
      .set(bearer(ann))
      .expect(200);
    expect(profileVideos.body.items).toEqual([]);

    const comments = await http()
      .get(`/v1/videos/${catVideo}/comments`)
      .set(bearer(ann))
      .expect(200);
    expect((comments.body as Paginated<CommentDto>).items.map((c) => c.body)).toEqual(['from cat']);

    // The blocked user can't see the blocker's content either.
    const annVideo = await createReadyVideo(app, ann.user.id);
    await http().get(`/v1/videos/${annVideo}`).set(bearer(ben)).expect(404);
    await http()
      .post(`/v1/videos/${annVideo}/comments`)
      .set(bearer(ben))
      .send({ body: 'hey' })
      .expect(404);
    // Third parties are unaffected.
    expect(await feedIds(cat)).toEqual(expect.arrayContaining([benVideo, annVideo]));
  });

  it('removes and suppresses notifications between the two', async () => {
    const annVideo = await createReadyVideo(app, ann.user.id);
    await http().post(`/v1/videos/${annVideo}/like`).set(bearer(ben)).expect(200);
    await settle();
    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);
    // The old LIKE notification is gone, and ben can no longer like or comment on ann's videos.
    await http().delete(`/v1/videos/${annVideo}/like`).set(bearer(ben)).expect(200);
    await http().post(`/v1/videos/${annVideo}/like`).set(bearer(ben)).expect(404);
    await settle();
    const inbox = await http().get('/v1/notifications').set(bearer(ann)).expect(200);
    expect((inbox.body as Paginated<NotificationDto>).items).toEqual([]);
  });

  it('lists blocks, reports them on the profile, and unblocking restores visibility', async () => {
    const benVideo = await createReadyVideo(app, ben.user.id);
    await http().post(`/v1/users/${ann.user.id}/block`).set(bearer(ann)).expect(400);
    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);
    // Blocking twice is harmless.
    await http().post(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);

    const list = await http().get('/v1/users/me/blocks').set(bearer(ann)).expect(200);
    expect((list.body as Paginated<UserSummary>).items.map((u) => u.username)).toEqual(['ben']);
    const profile = await http().get(`/v1/users/${ben.user.id}`).set(bearer(ann)).expect(200);
    expect(profile.body).toMatchObject({ blockedByMe: true, isFollowing: false });

    await http().delete(`/v1/users/${ben.user.id}/block`).set(bearer(ann)).expect(204);
    await http().get(`/v1/videos/${benVideo}`).set(bearer(ann)).expect(200);
    await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
    const after = await http().get(`/v1/users/${ben.user.id}`).set(bearer(ann)).expect(200);
    expect(after.body).toMatchObject({ blockedByMe: false, isFollowing: true });
  });
});
