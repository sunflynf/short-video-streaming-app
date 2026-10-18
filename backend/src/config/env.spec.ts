import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('applies defaults', () => {
    expect(validateEnv(valid)).toEqual({ ...valid, NODE_ENV: 'development', PORT: 3000 });
  });

  it('throws when a required var is missing', () => {
    expect(() => validateEnv({ REDIS_URL: valid.REDIS_URL })).toThrow(/DATABASE_URL/);
  });
});
