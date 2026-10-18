import type { INestApplication } from '@nestjs/common';
import type {
  AuthResponse,
  CreateUploadResponse,
  NotificationDto,
  Paginated,
  VideoDto,
} from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { assetCreated, assetReady, waitForStatus } from './media-helpers.js';
import {
  bearer,
  createTestApp,
  notificationsQueue,
  postMuxWebhook,
  resetDb,
  waitFor,
} from './utils.js';

/**
 * The MVP's core loop end to end, through the public API only:
 * signup → upload (Mux webhooks simulated) → READY → in another user's feed → like →
 * comment → notifications → follow → Following feed.
 */
describe('golden path', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const signupAs = async (username: string) =>
    (
      await http()
        .post('/v1/auth/signup')
        .send({ email: `${username}@example.com`, username, password: 'password123' })
        .expect(201)
    ).body as AuthResponse;

  const settleNotifications = () =>
    waitFor(async () => {
      const c = await notificationsQueue(app).getJobCounts('waiting', 'active', 'delayed');
      return Object.values(c).every((n) => n === 0);
    });

  it('works from signup to the Following feed', async () => {
    // Two people join.
    const creator = await signupAs('creator');
    const viewer = await signupAs('viewer');

    // The creator uploads a clip; Mux reports it processed.
    const upload = (
      await http()
        .post('/v1/videos/upload')
        .set(bearer(creator))
        .send({ caption: 'My first clip' })
        .expect(201)
    ).body as CreateUploadResponse;
    await postMuxWebhook(app, assetCreated(upload.videoId)).expect(200);
    await postMuxWebhook(app, assetReady(upload.videoId, 22)).expect(200);
    await waitForStatus(app, upload.videoId, 'READY');

    // The viewer finds it in For You.
    const forYou = (await http().get('/v1/videos/feed').set(bearer(viewer)).expect(200))
      .body as Paginated<VideoDto>;
    const video = forYou.items.find((v) => v.id === upload.videoId);
    expect(video).toMatchObject({
      caption: 'My first clip',
      likedByMe: false,
      followingAuthor: false,
      playbackUrl: expect.stringContaining('.m3u8'),
      author: { username: 'creator' },
    });

    // Watches it, likes it, comments on it.
    await http()
      .post(`/v1/videos/${upload.videoId}/view`)
      .set(bearer(viewer))
      .send({ watchedMs: 5000 })
      .expect(204);
    await http().post(`/v1/videos/${upload.videoId}/like`).set(bearer(viewer)).expect(200);
    await http()
      .post(`/v1/videos/${upload.videoId}/comments`)
      .set(bearer(viewer))
      .send({ body: 'Great clip!' })
      .expect(201);

    // The creator is notified.
    await settleNotifications();
    const inbox = (await http().get('/v1/notifications').set(bearer(creator)).expect(200))
      .body as Paginated<NotificationDto>;
    expect(inbox.items.map((n) => `${n.type}:${n.actor.username}`)).toEqual([
      'COMMENT:viewer',
      'LIKE:viewer',
    ]);
    expect(inbox.items[0]!.commentSnippet).toBe('Great clip!');

    // The viewer follows the creator and sees the clip in Following.
    await http().post(`/v1/users/${creator.user.id}/follow`).set(bearer(viewer)).expect(200);
    const following = (
      await http()
        .get('/v1/videos/feed')
        .query({ tab: 'following' })
        .set(bearer(viewer))
        .expect(200)
    ).body as Paginated<VideoDto>;
    expect(following.items).toEqual([
      expect.objectContaining({
        id: upload.videoId,
        likeCount: 1,
        commentCount: 1,
        likedByMe: true,
        followingAuthor: true,
      }),
    ]);

    // Counters and the follow notification line up.
    await settleNotifications();
    const profile = await http().get(`/v1/users/${creator.user.id}`).expect(200);
    expect(profile.body).toMatchObject({ followerCount: 1, videoCount: 1 });
    const unread = await http()
      .get('/v1/notifications/unread-count')
      .set(bearer(creator))
      .expect(200);
    expect(unread.body).toEqual({ count: 3 });
  });
});
