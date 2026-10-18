import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };

  it('applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      PASSWORD_RESET_TTL_SECONDS: 900,
      MAX_VIDEO_DURATION_SEC: 60,
      MAX_ACTIVE_UPLOADS: 3,
      MAX_DAILY_UPLOADS: 20,
      FEED_SNAPSHOT_SIZE: 200,
      FEED_WINDOW_DAYS: 14,
      FEED_SNAPSHOT_TTL_SEC: 1800,
      ANON_FEED_CACHE_SEC: 60,
      PUBLIC_WEB_URL: 'http://localhost:3000',
    });
  });

  it('throws when a required var is missing', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('treats blank optional values as unset', () => {
    expect(validateEnv({ ...valid, MUX_TOKEN_ID: '' }).MUX_TOKEN_ID).toBeUndefined();
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});
