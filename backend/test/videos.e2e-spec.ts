import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, Paginated, VideoDto } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { publishVideo, startUpload, videoStatus } from './media-helpers.js';
import { bearer, createTestApp, mediaStub, resetDb, signup, waitFor } from './utils.js';

describe('videos', () => {
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

  describe('POST /videos/upload', () => {
    it('creates an UPLOADING video and returns a direct-upload url', async () => {
      const res = await http()
        .post('/v1/videos/upload')
        .set(bearer(ann))
        .send({ caption: '  first clip  ' })
        .expect(201);
      expect(res.body).toEqual({
        videoId: expect.any(String),
        uploadUrl: `https://storage.example.com/upload/up_${res.body.videoId}`,
      });
      const video = await prisma().video.findUniqueOrThrow({ where: { id: res.body.videoId } });
      expect(video).toMatchObject({
        authorId: ann.user.id,
        caption: 'first clip',
        status: 'UPLOADING',
        muxUploadId: `up_${res.body.videoId}`,
      });
      expect(mediaStub(app).uploads).toEqual([res.body.videoId]);
    });

    it('requires auth and validates the caption', async () => {
      await http().post('/v1/videos/upload').send({}).expect(401);
      await http()
        .post('/v1/videos/upload')
        .set(bearer(ann))
        .send({ caption: 'x'.repeat(301) })
        .expect(400);
    });

    it('limits uploads in progress', async () => {
      for (let i = 0; i < 3; i++) await startUpload(app, ann);
      const res = await http().post('/v1/videos/upload').set(bearer(ann)).send({}).expect(429);
      expect(res.body.message).toMatch(/in progress/);
      // Other users are unaffected.
      await startUpload(app, ben);
    });

    it('limits uploads per day', async () => {
      await prisma().video.createMany({
        data: Array.from({ length: 20 }, () => ({
          authorId: ann.user.id,
          status: 'READY' as const,
        })),
      });
      const res = await http().post('/v1/videos/upload').set(bearer(ann)).send({}).expect(429);
      expect(res.body.message).toMatch(/Daily/);
    });

    it('returns 503 when uploads are not configured', async () => {
      mediaStub(app).configured = false;
      await http().post('/v1/videos/upload').set(bearer(ann)).send({}).expect(503);
      expect(await prisma().video.count()).toBe(0);
    });

    it('cleans up and returns 502 when the provider fails', async () => {
      mediaStub(app).failNextUpload = true;
      await http().post('/v1/videos/upload').set(bearer(ann)).send({}).expect(502);
      expect(await prisma().video.count()).toBe(0);
    });
  });

  describe('GET /videos/:id', () => {
    it('returns a published video to anyone, with playback urls', async () => {
      const videoId = await publishVideo(app, ann, 'hello');
      const res = await http().get(`/v1/videos/${videoId}`).expect(200);
      const video = res.body as VideoDto;
      expect(video).toMatchObject({
        id: videoId,
        caption: 'hello',
        status: 'READY',
        playbackUrl: `https://stream.mux.com/pb_${videoId}.m3u8`,
        thumbnailUrl: `https://image.mux.com/pb_${videoId}/thumbnail.jpg?time=1`,
        durationSec: 15,
        aspectRatio: '9:16',
        likeCount: 0,
        likedByMe: false,
        author: { id: ann.user.id, username: 'ann', displayName: null, avatarUrl: null },
      });
      expect(video.publishedAt).toEqual(expect.any(String));
    });

    it('hides unpublished and hidden videos from everyone but the author and admins', async () => {
      const { videoId } = await startUpload(app, ann);
      await http().get(`/v1/videos/${videoId}`).expect(404);
      await http().get(`/v1/videos/${videoId}`).set(bearer(ben)).expect(404);
      const own = await http().get(`/v1/videos/${videoId}`).set(bearer(ann)).expect(200);
      expect(own.body).toMatchObject({ status: 'UPLOADING', playbackUrl: null });

      const published = await publishVideo(app, ann);
      await prisma().video.update({ where: { id: published }, data: { hidden: true } });
      await http().get(`/v1/videos/${published}`).set(bearer(ben)).expect(404);

      await prisma().user.update({ where: { id: ben.user.id }, data: { role: 'ADMIN' } });
      const admin = await http()
        .post('/v1/auth/login')
        .send({ email: ben.user.email, password: 'password123' });
      await http()
        .get(`/v1/videos/${published}`)
        .set(bearer(admin.body as AuthResponse))
        .expect(200);
    });

    it('returns 404 for unknown ids', async () => {
      await http().get('/v1/videos/nope').expect(404);
    });
  });

  describe('PATCH /videos/:id', () => {
    it('lets the author edit or clear the caption', async () => {
      const videoId = await publishVideo(app, ann, 'old');
      const res = await http()
        .patch(`/v1/videos/${videoId}`)
        .set(bearer(ann))
        .send({ caption: 'new caption' })
        .expect(200);
      expect(res.body.caption).toBe('new caption');
      const cleared = await http()
        .patch(`/v1/videos/${videoId}`)
        .set(bearer(ann))
        .send({ caption: '   ' })
        .expect(200);
      expect(cleared.body.caption).toBeNull();
    });

    it('forbids other users', async () => {
      const videoId = await publishVideo(app, ann);
      await http()
        .patch(`/v1/videos/${videoId}`)
        .set(bearer(ben))
        .send({ caption: 'mine now' })
        .expect(403);
    });
  });

  describe('DELETE /videos/:id', () => {
    it('deletes a published video and its Mux asset', async () => {
      const videoId = await publishVideo(app, ann);
      await http().delete(`/v1/videos/${videoId}`).set(bearer(ben)).expect(403);
      await http().delete(`/v1/videos/${videoId}`).set(bearer(ann)).expect(204);
      expect(await videoStatus(app, videoId)).toBeUndefined();
      await waitFor(async () => mediaStub(app).deletedAssets.includes(`as_${videoId}`));
      await http().delete(`/v1/videos/${videoId}`).set(bearer(ann)).expect(404);
    });

    it('cancels the Mux upload of a video still uploading', async () => {
      const { videoId } = await startUpload(app, ann);
      await http().delete(`/v1/videos/${videoId}`).set(bearer(ann)).expect(204);
      await waitFor(async () => mediaStub(app).cancelledUploads.includes(`up_${videoId}`));
    });
  });

  describe('GET /users/:id/videos', () => {
    it('lists published videos newest first with cursor paging', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push(await publishVideo(app, ann, `clip ${i}`));
      await startUpload(app, ann); // not published
      const hidden = await publishVideo(app, ann, 'hidden');
      await prisma().video.update({ where: { id: hidden }, data: { hidden: true } });

      const first = await http()
        .get(`/v1/users/${ann.user.id}/videos`)
        .query({ limit: 2 })
        .expect(200);
      const page1 = first.body as Paginated<VideoDto>;
      expect(page1.items.map((v) => v.caption)).toEqual(['clip 2', 'clip 1']);
      const second = await http()
        .get(`/v1/users/${ann.user.id}/videos`)
        .query({ limit: 2, cursor: page1.nextCursor })
        .expect(200);
      expect(second.body).toMatchObject({ items: [{ caption: 'clip 0' }], nextCursor: null });

      const profile = await http().get(`/v1/users/${ann.user.id}`).expect(200);
      expect(profile.body.videoCount).toBe(3);
    });

    it('returns 404 for unknown users', async () => {
      await http().get('/v1/users/nobody/videos').expect(404);
    });
  });
});
