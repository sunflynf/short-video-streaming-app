import type { INestApplication } from '@nestjs/common';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReadyVideo, startUpload } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('views', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  const http = () => request(app.getHttpServer());
  const viewCount = async (id: string) =>
    (await app.get(PrismaService).video.findUniqueOrThrow({ where: { id } })).viewCount;

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

  it('counts a qualified view once per viewer per hour', async () => {
    const id = await createReadyVideo(app, ben.user.id);
    for (let i = 0; i < 3; i++) {
      await http()
        .post(`/v1/videos/${id}/view`)
        .set(bearer(ann))
        .send({ watchedMs: 4000 })
        .expect(204);
    }
    expect(await viewCount(id)).toBe(1);
    await http()
      .post(`/v1/videos/${id}/view`)
      .set(bearer(ben))
      .send({ watchedMs: 4000 })
      .expect(204);
    expect(await viewCount(id)).toBe(2);
  });

  it('ignores views that were too short', async () => {
    const id = await createReadyVideo(app, ben.user.id, { durationSec: 30 });
    await http()
      .post(`/v1/videos/${id}/view`)
      .set(bearer(ann))
      .send({ watchedMs: 2500 })
      .expect(204);
    expect(await viewCount(id)).toBe(0);
    const short = await createReadyVideo(app, ben.user.id, { durationSec: 4 });
    await http()
      .post(`/v1/videos/${short}/view`)
      .set(bearer(ann))
      .send({ watchedMs: 2000 })
      .expect(204);
    expect(await viewCount(short)).toBe(1);
  });

  it('debounces anonymous views per IP', async () => {
    const id = await createReadyVideo(app, ben.user.id);
    for (let i = 0; i < 3; i++) {
      await http().post(`/v1/videos/${id}/view`).send({ watchedMs: 3000 }).expect(204);
    }
    expect(await viewCount(id)).toBe(1);
  });

  it('validates input and only accepts published videos', async () => {
    const id = await createReadyVideo(app, ben.user.id);
    await http().post(`/v1/videos/${id}/view`).send({}).expect(400);
    await http().post(`/v1/videos/${id}/view`).send({ watchedMs: -1 }).expect(400);
    const { videoId } = await startUpload(app, ben);
    await http().post(`/v1/videos/${videoId}/view`).send({ watchedMs: 5000 }).expect(404);
  });
});
