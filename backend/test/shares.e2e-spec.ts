import type { INestApplication } from '@nestjs/common';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo, startUpload } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('shares', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  const http = () => request(app.getHttpServer());
  const shareCount = async (id: string) =>
    (await app.get(PrismaService).video.findUniqueOrThrow({ where: { id } })).shareCount;

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

  it('returns a share link and counts once per viewer per hour', async () => {
    const id = await createReadyVideo(app, ann.user.id);
    for (let i = 0; i < 3; i++) {
      const res = await http()
        .post(`/v1/videos/${id}/share`)
        .set(bearer(ben))
        .send({ channel: 'copy_link' })
        .expect(200);
      expect(res.body).toEqual({ shareUrl: `http://localhost:3000/v/${id}` });
    }
    expect(await shareCount(id)).toBe(1);

    await http().post(`/v1/videos/${id}/share`).send({}).expect(200);
    await http().post(`/v1/videos/${id}/share`).send({}).expect(200);
    expect(await shareCount(id)).toBe(2);
  });

  it('validates the channel and only shares visible videos', async () => {
    const id = await createReadyVideo(app, ann.user.id);
    await http().post(`/v1/videos/${id}/share`).send({ channel: 'fax' }).expect(400);
    const { videoId } = await startUpload(app, ann);
    await http().post(`/v1/videos/${videoId}/share`).send({}).expect(404);
  });

  it('serves an escaped landing page at /v/:id outside the API prefix', async () => {
    const id = await createReadyVideo(app, ann.user.id, { caption: '<b>hi</b> & bye' });
    const res = await http().get(`/v/${id}`).expect(200).expect('content-type', /html/);
    expect(res.text).toContain('<title>&lt;b&gt;hi&lt;/b&gt; &amp; bye · ShortVid</title>');
    expect(res.text).toContain('og:image');
    expect(res.text).toContain(`href="shortvid://video/${id}"`);
    expect(res.headers['content-security-policy']).toContain('img-src https://image.mux.com');

    await app.get(PrismaService).video.update({ where: { id }, data: { hidden: true } });
    await http().get(`/v/${id}`).expect(404);
    await http().get('/v/missing').expect(404);
    await http().get(`/v1/v/${id}`).expect(404);
  });
});
