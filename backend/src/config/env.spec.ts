import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };

  it('applies defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      MAX_VIDEO_DURATION_SEC: 60,
      FEED_SNAPSHOT_SIZE: 200,
      PUBLIC_WEB_URL: 'http://localhost:3000',
      LOG_LEVEL: 'info',
      SLOW_QUERY_MS: 200,
      THROTTLE_ENABLED: true,
      THROTTLE_DEFAULT_PER_MIN: 100,
      TRUST_PROXY: 0,
    });
  });

  it('parses the throttle switch', () => {
    expect(validateEnv({ ...valid, THROTTLE_ENABLED: 'false' }).THROTTLE_ENABLED).toBe(false);
    expect(() => validateEnv({ ...valid, THROTTLE_ENABLED: 'nope' })).toThrow(/THROTTLE_ENABLED/);
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
