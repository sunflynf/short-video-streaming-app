import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, CommentDto, NotificationDto, Paginated } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo } from './media-helpers.js';
import { bearer, createTestApp, notificationsQueue, resetDb, signup, waitFor } from './utils.js';

describe('notifications', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse; // video author
  let ben: AuthResponse;
  let cat: AuthResponse;
  let videoId: string;
  const http = () => request(app.getHttpServer());

  /** Waits until every queued notification job has been processed. */
  const settle = () =>
    waitFor(async () => {
      const counts = await notificationsQueue(app).getJobCounts('waiting', 'active', 'delayed');
      return Object.values(counts).every((n) => n === 0);
    });

  const list = async (auth: AuthResponse, query: Record<string, unknown> = {}) => {
    await settle();
    return (await http().get('/v1/notifications').query(query).set(bearer(auth)).expect(200))
      .body as Paginated<NotificationDto>;
  };

  const comment = async (auth: AuthResponse, body: string, parentId?: string) =>
    (
      await http()
        .post(`/v1/videos/${videoId}/comments`)
        .set(bearer(auth))
        .send({ body, ...(parentId && { parentId }) })
        .expect(201)
    ).body as CommentDto;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
    cat = await signup(app, { username: 'cat' });
    videoId = await createReadyVideo(app, ann.user.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('notifies about follows, likes and comments with hydrated details', async () => {
    await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);
    await settle();
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
    await settle();
    const c = await comment(cat, 'Great clip! '.repeat(20));

    const { items } = await list(ann);
    expect(items.map((n) => [n.type, n.actor.username])).toEqual([
      ['COMMENT', 'cat'],
      ['LIKE', 'ben'],
      ['FOLLOW', 'ben'],
    ]);
    const [commentN, likeN, followN] = items;
    expect(commentN).toMatchObject({
      video: { id: videoId, thumbnailUrl: expect.stringContaining('image.mux.com') },
      commentId: c.id,
      read: false,
    });
    expect(commentN!.commentSnippet).toHaveLength(100);
    expect(likeN).toMatchObject({ video: { id: videoId }, commentId: null, commentSnippet: null });
    expect(followN).toMatchObject({ video: null, commentId: null });

    // Nobody else was notified.
    expect((await list(ben)).items).toEqual([]);
  });

  it('routes replies to the replied-to author and the video author', async () => {
    const root = await comment(ben, 'root'); // ann: COMMENT
    await comment(cat, 'reply', root.id); // ben: REPLY, ann: COMMENT
    await comment(ann, 'author reply', root.id); // ben: REPLY (ann acted, no self)

    expect((await list(ann)).items.map((n) => `${n.type}:${n.actor.username}`)).toEqual([
      'COMMENT:cat',
      'COMMENT:ben',
    ]);
    expect((await list(ben)).items.map((n) => `${n.type}:${n.actor.username}`)).toEqual([
      'REPLY:ann',
      'REPLY:cat',
    ]);
    expect((await list(cat)).items).toEqual([]);
  });

  it('never notifies people about their own actions', async () => {
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
    await comment(ann, 'my own video');
    expect((await list(ann)).items).toEqual([]);
  });

  it('keeps one unread LIKE across like, unlike, like', async () => {
    for (let i = 0; i < 2; i++) {
      await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
      await settle();
      await http().delete(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
    }
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
    expect((await list(ann)).items.filter((n) => n.type === 'LIKE')).toHaveLength(1);

    // Once read, a new like produces a fresh notification.
    await http().post('/v1/notifications/read-all').set(bearer(ann)).expect(204);
    await http().delete(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(200);
    expect((await list(ann)).items.filter((n) => n.type === 'LIKE')).toHaveLength(2);
  });

  it('tracks unread counts and read state', async () => {
    await comment(ben, 'one');
    await comment(cat, 'two');
    await settle();
    const count = () =>
      http()
        .get('/v1/notifications/unread-count')
        .set(bearer(ann))
        .then((r) => r.body.count as number);
    expect(await count()).toBe(2);

    const { items } = await list(ann);
    await http().patch(`/v1/notifications/${items[0]!.id}/read`).set(bearer(ann)).expect(204);
    await http().patch(`/v1/notifications/${items[0]!.id}/read`).set(bearer(ann)).expect(204);
    expect(await count()).toBe(1);
    // Someone else's notification looks like it doesn't exist.
    await http().patch(`/v1/notifications/${items[1]!.id}/read`).set(bearer(ben)).expect(404);

    await http().post('/v1/notifications/read-all').set(bearer(ann)).expect(204);
    expect(await count()).toBe(0);
    expect((await list(ann)).items.every((n) => n.read)).toBe(true);
    await http().get('/v1/notifications').expect(401);
  });

  it('hides snippets of deleted comments and survives a deleted video', async () => {
    const c = await comment(ben, 'soon gone');
    await http().delete(`/v1/comments/${c.id}`).set(bearer(ben)).expect(204);
    let [n] = (await list(ann)).items;
    expect(n).toMatchObject({ commentId: c.id, commentSnippet: null });

    await app.get(PrismaService).video.delete({ where: { id: videoId } });
    [n] = (await list(ann)).items;
    expect(n!.video).toBeNull();
  });

  it('paginates newest first', async () => {
    for (let i = 0; i < 5; i++) await comment(ben, `c${i}`);
    const first = await list(ann, { limit: 3 });
    expect(first.items.map((n) => n.commentSnippet)).toEqual(['c4', 'c3', 'c2']);
    const second = await list(ann, { limit: 3, cursor: first.nextCursor });
    expect(second).toMatchObject({
      items: [{ commentSnippet: 'c1' }, { commentSnippet: 'c0' }],
      nextCursor: null,
    });
  });
});
