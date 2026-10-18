import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { avatarKey, isOwnAvatarUrl } from './avatar-key.js';
import { AvatarsService } from './avatars.service.js';

const config = (values: Partial<Env>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;

const r2 = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'avatars-bucket',
  R2_PUBLIC_URL: 'https://pub-abc.r2.dev/',
};

describe('avatar keys', () => {
  it('maps content types to extensions under the user prefix', () => {
    expect(avatarKey('u1', 'image/jpeg')).toMatch(/^avatars\/u1\/[A-Za-z0-9_-]{12}\.jpg$/);
    expect(avatarKey('u1', 'image/webp')).toMatch(/\.webp$/);
    expect(avatarKey('u1', 'image/png')).not.toBe(avatarKey('u1', 'image/png'));
  });

  it('only accepts urls under our public avatar prefix', () => {
    expect(
      isOwnAvatarUrl('https://pub-abc.r2.dev/avatars/u1/x.jpg', 'https://pub-abc.r2.dev/'),
    ).toBe(true);
    expect(isOwnAvatarUrl('https://evil.example.com/avatars/x.jpg', 'https://pub-abc.r2.dev')).toBe(
      false,
    );
    expect(
      isOwnAvatarUrl('https://pub-abc.r2.dev.evil.com/avatars/x', 'https://pub-abc.r2.dev'),
    ).toBe(false);
  });
});

describe('AvatarsService', () => {
  it('is disabled without full R2 config', async () => {
    const service = new AvatarsService(config({ ...r2, R2_BUCKET: undefined }));
    expect(service.enabled).toBe(false);
    await expect(
      service.createUploadUrl('u1', { contentType: 'image/png', contentLength: 10 }),
    ).rejects.toThrow(/not configured/);
  });

  it('presigns a PUT bound to the content type and length', async () => {
    const service = new AvatarsService(config(r2));
    const { uploadUrl, publicUrl } = await service.createUploadUrl('u1', {
      contentType: 'image/png',
      contentLength: 1234,
    });
    const url = new URL(uploadUrl);
    expect(url.host).toBe('avatars-bucket.acct123.r2.cloudflarestorage.com');
    expect(url.pathname).toMatch(/^\/avatars\/u1\/.+\.png$/);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(publicUrl).toBe(`https://pub-abc.r2.dev${url.pathname}`);
  });
});
