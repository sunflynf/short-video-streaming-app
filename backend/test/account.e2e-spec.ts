import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, CreatorStats } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo } from './media-helpers.js';
import { bearer, createTestApp, mediaStub, resetDb, signup, waitFor } from './utils.js';

describe('account', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);

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

  describe('DELETE /users/me', () => {
    it('requires the password', async () => {
      await http()
        .delete('/v1/users/me')
        .set(bearer(ben))
        .send({ password: 'wrong-password' })
        .expect(403);
      await http().delete('/v1/users/me').set(bearer(ben)).send({}).expect(400);
      await http().delete('/v1/users/me').send({ password: 'password123' }).expect(401);
    });

    it('deletes everything the user owns and fixes everyone else’s counters', async () => {
      const annVideo = await createReadyVideo(app, ann.user.id);
      const benVideo = await prisma().video.create({
        data: {
          authorId: ben.user.id,
          status: 'READY',
          muxAssetId: 'as_ben',
          muxPlaybackId: 'pb_ben',
          publishedAt: new Date(),
        },
      });

      // Ben follows and is followed by Ann, likes and comments on Ann's video, and Ann replies.
      await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);
      await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
      await http().post(`/v1/videos/${annVideo}/like`).set(bearer(ben)).expect(200);
      const benComment = (
        await http()
          .post(`/v1/videos/${annVideo}/comments`)
          .set(bearer(ben))
          .send({ body: 'ben top' })
          .expect(201)
      ).body;
      await http()
        .post(`/v1/videos/${annVideo}/comments`)
        .set(bearer(ann))
        .send({ body: 'ann replies to ben', parentId: benComment.id })
        .expect(201);
      const annComment = (
        await http()
          .post(`/v1/videos/${annVideo}/comments`)
          .set(bearer(ann))
          .send({ body: 'ann top' })
          .expect(201)
      ).body;
      await http()
        .post(`/v1/videos/${annVideo}/comments`)
        .set(bearer(ben))
        .send({ body: 'ben replies to ann', parentId: annComment.id })
        .expect(201);
      await http().post(`/v1/videos/${benVideo.id}/like`).set(bearer(ann)).expect(200);

      await http()
        .delete('/v1/users/me')
        .set(bearer(ben))
        .send({ password: 'password123' })
        .expect(204);

      expect(await prisma().user.findUnique({ where: { id: ben.user.id } })).toBeNull();
      expect(await prisma().video.findUnique({ where: { id: benVideo.id } })).toBeNull();
      await waitFor(async () => mediaStub(app).deletedAssets.includes('as_ben'));

      const annUser = await prisma().user.findUniqueOrThrow({ where: { id: ann.user.id } });
      expect(annUser).toMatchObject({ followerCount: 0, followingCount: 0 });
      const video = await prisma().video.findUniqueOrThrow({ where: { id: annVideo } });
      // Left: only Ann's own top-level comment.
      expect(video).toMatchObject({ likeCount: 0, commentCount: 1 });
      const remaining = await prisma().comment.findMany({ where: { videoId: annVideo } });
      expect(remaining.map((c) => [c.body, c.replyCount])).toEqual([['ann top', 0]]);

      await http()
        .post('/v1/auth/login')
        .send({ email: ben.user.email, password: 'password123' })
        .expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken: ben.refreshToken }).expect(401);
    });
  });

  describe('GET /users/me/stats', () => {
    it('sums the creator’s published videos and counts follower gains per day', async () => {
      await createReadyVideo(app, ann.user.id, { likeCount: 3, commentCount: 2 });
      const second = await createReadyVideo(app, ann.user.id, { likeCount: 1 });
      await prisma().video.update({ where: { id: second }, data: { viewCount: 40 } });
      await http().post(`/v1/users/${ann.user.id}/follow`).set(bearer(ben)).expect(200);

      const res = await http().get('/v1/users/me/stats').set(bearer(ann)).expect(200);
      const stats = res.body as CreatorStats;
      expect(stats.totals).toEqual({ views: 40, likes: 4, comments: 2, followers: 1, videos: 2 });
      expect(stats.followerGains).toHaveLength(7);
      expect(stats.followerGains.at(-1)).toEqual({
        date: new Date().toISOString().slice(0, 10),
        count: 1,
      });
      expect(stats.followerGains.slice(0, 6).every((d) => d.count === 0)).toBe(true);
    });
  });

  describe('legal pages', () => {
    it('serves terms and privacy outside /v1', async () => {
      const terms = await http().get('/legal/terms').expect(200).expect('content-type', /html/);
      expect(terms.text).toContain('Terms of Service');
      expect(terms.text).toContain('Draft for legal review');
      const privacy = await http().get('/legal/privacy').expect(200);
      expect(privacy.text).toContain('Delete account');
    });
  });
});
