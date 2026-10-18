import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, AvatarUploadResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

describe('avatars', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('presigns an upload and accepts the resulting public url', async () => {
    const res = await http()
      .post('/v1/users/me/avatar-upload-url')
      .set(bearer(ann))
      .send({ contentType: 'image/jpeg', contentLength: 20_000 })
      .expect(201);
    const { uploadUrl, publicUrl } = res.body as AvatarUploadResponse;
    expect(new URL(uploadUrl).host).toBe('test-avatars.test-account.r2.cloudflarestorage.com');
    expect(publicUrl).toMatch(
      new RegExp(`^https://avatars\\.example\\.com/avatars/${ann.user.id}/.+\\.jpg$`),
    );

    const patched = await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ avatarUrl: publicUrl })
      .expect(200);
    expect(patched.body.avatarUrl).toBe(publicUrl);
    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ avatarUrl: null })
      .expect(200);
  });

  it('rejects avatar urls from elsewhere once R2 is configured', async () => {
    await http()
      .patch(`/v1/users/${ann.user.id}`)
      .set(bearer(ann))
      .send({ avatarUrl: 'https://tracker.example.net/pixel.png' })
      .expect(400);
  });

  it('validates type and size and requires auth', async () => {
    for (const body of [
      { contentType: 'image/gif', contentLength: 100 },
      { contentType: 'image/png', contentLength: 6 * 1024 * 1024 },
      { contentType: 'image/png', contentLength: 0 },
      { contentType: 'image/png' },
    ]) {
      await http().post('/v1/users/me/avatar-upload-url').set(bearer(ann)).send(body).expect(400);
    }
    await http()
      .post('/v1/users/me/avatar-upload-url')
      .send({ contentType: 'image/png', contentLength: 100 })
      .expect(401);
  });
});
