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

  describe('in production', () => {
    const prod = {
      ...valid,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'q'.repeat(64),
      CORS_ORIGINS: 'https://shortvid.app',
      PUBLIC_WEB_URL: 'https://shortvid.app',
      LEGAL_CONTACT_EMAIL: 'support@shortvid.app',
    };

    it('accepts a complete production config', () => {
      expect(validateEnv(prod).NODE_ENV).toBe('production');
    });

    it.each([
      [
        'a dev JWT secret',
        { JWT_ACCESS_SECRET: 'dev-only-secret-change-me-0123456789abcdef0123456789' },
        /JWT_ACCESS_SECRET/,
      ],
      ['a short JWT secret', { JWT_ACCESS_SECRET: 'x'.repeat(40) }, /JWT_ACCESS_SECRET/],
      ['no CORS allowlist', { CORS_ORIGINS: undefined }, /CORS_ORIGINS/],
      ['localhost share links', { PUBLIC_WEB_URL: 'http://localhost:3000' }, /PUBLIC_WEB_URL/],
      [
        'the placeholder contact email',
        { LEGAL_CONTACT_EMAIL: 'support@example.com' },
        /LEGAL_CONTACT_EMAIL/,
      ],
    ])('refuses to boot with %s', (_name, override, error) => {
      expect(() => validateEnv({ ...prod, ...override })).toThrow(error);
    });
  });
});
