import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResponse, Paginated, VideoDto } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { LIKE_CREATED } from '../src/likes/like.events.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo, startUpload } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('likes', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  let videoId: string;
  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
    videoId = await createReadyVideo(app, ben.user.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('likes and unlikes idempotently and emits like.created once', async () => {
    const events: unknown[] = [];
    app.get(EventEmitter2).on(LIKE_CREATED, (e) => events.push(e));

    for (let i = 0; i < 2; i++) {
      const res = await http().post(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
      expect(res.body).toEqual({ liked: true, likeCount: 1 });
    }
    expect(events).toEqual([{ actorId: ann.user.id, videoId, authorId: ben.user.id }]);

    const video = await http().get(`/v1/videos/${videoId}`).set(bearer(ann)).expect(200);
    expect(video.body).toMatchObject({ likeCount: 1, likedByMe: true });
    const anon = await http().get(`/v1/videos/${videoId}`).expect(200);
    expect(anon.body.likedByMe).toBe(false);

    for (let i = 0; i < 2; i++) {
      const res = await http().delete(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
      expect(res.body).toEqual({ liked: false, likeCount: 0 });
    }
  });

  it('keeps likeCount equal to the like rows under concurrent requests', async () => {
    const users = [ann, ben, await signup(app, { username: 'cat' })];
    await Promise.all(
      users.flatMap((u) =>
        Array.from({ length: 10 }, () => http().post(`/v1/videos/${videoId}/like`).set(bearer(u))),
      ),
    );
    const afterLikes = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    expect(afterLikes.likeCount).toBe(3);
    expect(await prisma().like.count({ where: { videoId } })).toBe(3);

    await Promise.all(
      users.flatMap((u) =>
        Array.from({ length: 10 }, () =>
          http().delete(`/v1/videos/${videoId}/like`).set(bearer(u)),
        ),
      ),
    );
    const afterUnlikes = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    expect(afterUnlikes.likeCount).toBe(0);
    expect(await prisma().like.count({ where: { videoId } })).toBe(0);
  });

  it('only allows liking published videos, but always allows unliking', async () => {
    const { videoId: uploading } = await startUpload(app, ben);
    await http().post(`/v1/videos/${uploading}/like`).set(bearer(ann)).expect(404);
    await http().post('/v1/videos/nope/like').set(bearer(ann)).expect(404);
    await http().post(`/v1/videos/${videoId}/like`).expect(401);

    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
    await prisma().video.update({ where: { id: videoId }, data: { hidden: true } });
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(404);
    const res = await http().delete(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
    expect(res.body).toEqual({ liked: false, likeCount: 0 });
    await http().delete('/v1/videos/nope/like').set(bearer(ann)).expect(404);
  });

  it('marks likedByMe on profile video lists', async () => {
    await createReadyVideo(app, ben.user.id);
    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ann)).expect(200);
    const res = await http().get(`/v1/users/${ben.user.id}/videos`).set(bearer(ann)).expect(200);
    const page = res.body as Paginated<VideoDto>;
    expect(page.items.map((v) => [v.id === videoId, v.likedByMe])).toEqual(
      expect.arrayContaining([
        [true, true],
        [false, false],
      ]),
    );
  });

  it('lists the viewer’s own liked videos, most recent first, with paging', async () => {
    const second = await createReadyVideo(app, ben.user.id);
    const hidden = await createReadyVideo(app, ben.user.id);
    for (const id of [videoId, hidden, second]) {
      await http().post(`/v1/videos/${id}/like`).set(bearer(ann)).expect(200);
    }
    await prisma().video.update({ where: { id: hidden }, data: { hidden: true } });

    const first = await http()
      .get(`/v1/users/${ann.user.id}/liked`)
      .query({ limit: 1 })
      .set(bearer(ann))
      .expect(200);
    expect(first.body.items.map((v: VideoDto) => [v.id, v.likedByMe])).toEqual([[second, true]]);
    const next = await http()
      .get(`/v1/users/${ann.user.id}/liked`)
      .query({ limit: 1, cursor: first.body.nextCursor })
      .set(bearer(ann))
      .expect(200);
    expect(next.body).toMatchObject({ items: [{ id: videoId }], nextCursor: null });

    await http().get(`/v1/users/${ann.user.id}/liked`).set(bearer(ben)).expect(403);
    await http().get(`/v1/users/${ann.user.id}/liked`).expect(401);
  });
});
