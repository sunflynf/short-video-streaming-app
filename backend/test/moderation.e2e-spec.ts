import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, Paginated, ReportGroupDto, VideoDto } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup, signupAdmin } from './utils.js';

describe('moderation', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse; // creator
  let ben: AuthResponse;
  let admin: AuthResponse;
  let videoId: string;
  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);
  const report = (auth: AuthResponse, id = videoId, reason = 'SPAM') =>
    http().post(`/v1/videos/${id}/report`).set(bearer(auth)).send({ reason });

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
    admin = await signupAdmin(app);
    videoId = await createReadyVideo(app, ann.user.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records one report per person and validates input', async () => {
    await report(ben).expect(204);
    await report(ben, videoId, 'HARASSMENT').expect(204);
    expect(await prisma().report.count()).toBe(1);

    await report(ann).expect(400); // own video
    await report(ben, videoId, 'BORING').expect(400);
    await report(ben, 'missing').expect(404);
    await http().post(`/v1/videos/${videoId}/report`).send({ reason: 'SPAM' }).expect(401);
  });

  it('hides a video automatically after five distinct reporters', async () => {
    const reporters = [ben];
    for (let i = 0; i < 4; i++) reporters.push(await signup(app, { username: `reporter${i}` }));
    for (const r of reporters.slice(0, 4)) await report(r).expect(204);
    expect((await prisma().video.findUniqueOrThrow({ where: { id: videoId } })).hidden).toBe(false);

    await report(reporters[4]!).expect(204);
    expect((await prisma().video.findUniqueOrThrow({ where: { id: videoId } })).hidden).toBe(true);

    // Gone from feeds and the public video page immediately; the creator still sees it.
    const feed = (await http().get('/v1/videos/feed').set(bearer(ben)).expect(200))
      .body as Paginated<VideoDto>;
    expect(feed.items.map((v) => v.id)).not.toContain(videoId);
    await http().get(`/v1/videos/${videoId}`).set(bearer(ben)).expect(404);
    await http().get(`/v1/videos/${videoId}`).set(bearer(ann)).expect(200);
  });

  it('lets admins review, resolve, hide and unhide', async () => {
    await report(ben, videoId, 'SPAM').expect(204);
    const comment = await prisma().comment.create({
      data: { videoId, authorId: ann.user.id, body: 'buy followers at spam.example' },
    });
    await http()
      .post(`/v1/comments/${comment.id}/report`)
      .set(bearer(ben))
      .send({ reason: 'SPAM', details: 'link spam' })
      .expect(204);

    const list = await http().get('/v1/admin/reports').set(bearer(admin)).expect(200);
    const groups = (list.body as Paginated<ReportGroupDto>).items;
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { type: 'video', id: videoId, hidden: false },
          owner: expect.objectContaining({ username: 'ann' }),
          reportCount: 1,
          reasons: { SPAM: 1 },
        }),
        expect.objectContaining({
          target: { type: 'comment', id: comment.id, videoId },
          latestDetails: 'link spam',
        }),
      ]),
    );

    await http().post(`/v1/admin/videos/${videoId}/hide`).set(bearer(admin)).expect(204);
    await http().get(`/v1/videos/${videoId}`).set(bearer(ben)).expect(404);
    await http().post(`/v1/admin/videos/${videoId}/unhide`).set(bearer(admin)).expect(204);
    await http().get(`/v1/videos/${videoId}`).set(bearer(ben)).expect(200);

    await http().post(`/v1/admin/comments/${comment.id}/remove`).set(bearer(admin)).expect(204);
    await http().post('/v1/admin/reports/resolve').set(bearer(admin)).send({ videoId }).expect(204);
    await http()
      .post('/v1/admin/reports/resolve')
      .set(bearer(admin))
      .send({ commentId: comment.id })
      .expect(204);
    const after = await http().get('/v1/admin/reports').set(bearer(admin)).expect(200);
    expect(after.body.items).toEqual([]);

    await http().get('/v1/admin/reports').set(bearer(ben)).expect(403);
  });

  it('bans: writes return 403, sessions end, reads still work', async () => {
    await http().post(`/v1/admin/users/${ben.user.id}/ban`).set(bearer(admin)).expect(204);

    await http().post(`/v1/videos/${videoId}/like`).set(bearer(ben)).expect(403);
    await http()
      .post(`/v1/videos/${videoId}/comments`)
      .set(bearer(ben))
      .send({ body: 'hi' })
      .expect(403);
    await http().get('/v1/videos/feed').set(bearer(ben)).expect(200);
    await http().post('/v1/auth/refresh').send({ refreshToken: ben.refreshToken }).expect(401);
    const login = await http()
      .post('/v1/auth/login')
      .send({ email: ben.user.email, password: 'password123' })
      .expect(403);
    expect(login.body.message).toBe('Your account has been suspended');

    await http().post(`/v1/admin/users/${admin.user.id}/ban`).set(bearer(admin)).expect(400);
    await http().post(`/v1/admin/users/${ann.user.id}/ban`).set(bearer(ben)).expect(403);

    await http().post(`/v1/admin/users/${ben.user.id}/unban`).set(bearer(admin)).expect(204);
    await http()
      .post('/v1/auth/login')
      .send({ email: ben.user.email, password: 'password123' })
      .expect(200);
  });
});
