import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResponse, CommentDto, Paginated } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { COMMENT_CREATED } from '../src/comments/comment.events.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo, startUpload } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('comments', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse; // video author
  let ben: AuthResponse;
  let cat: AuthResponse;
  let videoId: string;
  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);

  const comment = async (auth: AuthResponse, body: string, parentId?: string) =>
    (
      await http()
        .post(`/v1/videos/${videoId}/comments`)
        .set(bearer(auth))
        .send({ body, ...(parentId && { parentId }) })
        .expect(201)
    ).body as CommentDto;

  const counts = async () => {
    const video = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    return video.commentCount;
  };

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

  it('creates comments and lists them newest first with paging', async () => {
    const first = await comment(ben, 'first');
    expect(first).toMatchObject({
      videoId,
      parentId: null,
      body: 'first',
      deleted: false,
      replyCount: 0,
      author: { id: ben.user.id, username: 'ben' },
    });
    const second = await comment(cat, 'second');
    const third = await comment(ben, 'third');
    expect(await counts()).toBe(3);

    const page1 = await http()
      .get(`/v1/videos/${videoId}/comments`)
      .query({ limit: 2 })
      .expect(200);
    expect(page1.body.items.map((c: CommentDto) => c.id)).toEqual([third.id, second.id]);
    const page2 = await http()
      .get(`/v1/videos/${videoId}/comments`)
      .query({ limit: 2, cursor: page1.body.nextCursor })
      .expect(200);
    expect(page2.body).toMatchObject({ items: [{ id: first.id }], nextCursor: null });

    const video = await http().get(`/v1/videos/${videoId}`).expect(200);
    expect(video.body.commentCount).toBe(3);
  });

  it('flattens replies to one level and lists them oldest first', async () => {
    const root = await comment(ben, 'root');
    const reply = await comment(cat, 'reply', root.id);
    const nested = await comment(ann, 'reply to reply', reply.id);
    expect(reply.parentId).toBe(root.id);
    expect(nested.parentId).toBe(root.id);

    const top = await http().get(`/v1/videos/${videoId}/comments`).expect(200);
    expect(top.body.items).toEqual([expect.objectContaining({ id: root.id, replyCount: 2 })]);
    const replies = await http().get(`/v1/comments/${root.id}/replies`).expect(200);
    expect((replies.body as Paginated<CommentDto>).items.map((c) => c.body)).toEqual([
      'reply',
      'reply to reply',
    ]);
    expect(await counts()).toBe(3);
  });

  it('emits comment.created with the replied-to author', async () => {
    const events: unknown[] = [];
    app.get(EventEmitter2).on(COMMENT_CREATED, (e) => events.push(e));
    const root = await comment(ben, 'root');
    const reply = await comment(cat, 'reply', root.id);
    const nested = await comment(ann, 'nested', reply.id);
    expect(events).toEqual([
      { actorId: ben.user.id, videoId, videoAuthorId: ann.user.id, commentId: root.id },
      {
        actorId: cat.user.id,
        videoId,
        videoAuthorId: ann.user.id,
        commentId: reply.id,
        parentAuthorId: ben.user.id,
      },
      {
        actorId: ann.user.id,
        videoId,
        videoAuthorId: ann.user.id,
        commentId: nested.id,
        parentAuthorId: cat.user.id,
      },
    ]);
  });

  it('sanitizes and validates the body and parent', async () => {
    const res = await http()
      .post(`/v1/videos/${videoId}/comments`)
      .set(bearer(ben))
      .send({ body: '  hi\r\n\n\n\nthere  ' })
      .expect(201);
    expect(res.body.body).toBe('hi\n\nthere');

    for (const body of ['', '   \n  ', 'x'.repeat(501)]) {
      await http()
        .post(`/v1/videos/${videoId}/comments`)
        .set(bearer(ben))
        .send({ body })
        .expect(400);
    }
    const otherVideo = await createReadyVideo(app, ben.user.id);
    const elsewhere = (
      await http()
        .post(`/v1/videos/${otherVideo}/comments`)
        .set(bearer(ann))
        .send({ body: 'x' })
        .expect(201)
    ).body as CommentDto;
    await http()
      .post(`/v1/videos/${videoId}/comments`)
      .set(bearer(ben))
      .send({ body: 'x', parentId: elsewhere.id })
      .expect(400);
    await http()
      .post(`/v1/videos/${videoId}/comments`)
      .set(bearer(ben))
      .send({ body: 'x', parentId: 'missing' })
      .expect(400);
    await http().post(`/v1/videos/${videoId}/comments`).send({ body: 'anon' }).expect(401);
  });

  it('only allows comments on visible videos', async () => {
    const { videoId: uploading } = await startUpload(app, ann);
    await http()
      .post(`/v1/videos/${uploading}/comments`)
      .set(bearer(ben))
      .send({ body: 'x' })
      .expect(404);
    await http().get(`/v1/videos/${uploading}/comments`).expect(404);
    await prisma().video.update({ where: { id: videoId }, data: { hidden: true } });
    await http().get(`/v1/videos/${videoId}/comments`).expect(404);
  });

  it('soft-deletes idempotently and keeps the counters right', async () => {
    const root = await comment(ben, 'root');
    const reply = await comment(cat, 'reply', root.id);
    expect(await counts()).toBe(2);

    for (let i = 0; i < 2; i++) {
      await http().delete(`/v1/comments/${reply.id}`).set(bearer(cat)).expect(204);
    }
    expect(await counts()).toBe(1);
    const top = await http().get(`/v1/videos/${videoId}/comments`).expect(200);
    expect(top.body.items[0]).toMatchObject({ id: root.id, replyCount: 0 });
    const replies = await http().get(`/v1/comments/${root.id}/replies`).expect(200);
    expect(replies.body.items).toEqual([]);

    // Replying to a deleted comment is refused.
    await http()
      .post(`/v1/videos/${videoId}/comments`)
      .set(bearer(ben))
      .send({ body: 'x', parentId: reply.id })
      .expect(400);
  });

  it('keeps a deleted top-level comment while it has replies', async () => {
    const withReplies = await comment(ben, 'has replies');
    await comment(cat, 'reply', withReplies.id);
    const alone = await comment(ben, 'alone');
    await http().delete(`/v1/comments/${withReplies.id}`).set(bearer(ben)).expect(204);
    await http().delete(`/v1/comments/${alone.id}`).set(bearer(ben)).expect(204);

    const top = await http().get(`/v1/videos/${videoId}/comments`).expect(200);
    expect(top.body.items).toEqual([
      expect.objectContaining({
        id: withReplies.id,
        body: '[deleted]',
        deleted: true,
        replyCount: 1,
      }),
    ]);
  });

  it('lets the comment author, the video author and admins delete', async () => {
    const c1 = await comment(ben, 'by ben');
    const c2 = await comment(ben, 'by ben 2');
    const c3 = await comment(ben, 'by ben 3');
    await http().delete(`/v1/comments/${c1.id}`).set(bearer(cat)).expect(403);
    await http().delete(`/v1/comments/${c1.id}`).expect(401);
    await http().delete(`/v1/comments/${c1.id}`).set(bearer(ben)).expect(204);
    await http().delete(`/v1/comments/${c2.id}`).set(bearer(ann)).expect(204);

    await prisma().user.update({ where: { id: cat.user.id }, data: { role: 'ADMIN' } });
    const admin = await http()
      .post('/v1/auth/login')
      .send({ email: cat.user.email, password: 'password123' });
    await http()
      .delete(`/v1/comments/${c3.id}`)
      .set(bearer(admin.body as AuthResponse))
      .expect(204);
    await http().delete('/v1/comments/missing').set(bearer(ann)).expect(404);
    expect(await counts()).toBe(0);
  });
});
