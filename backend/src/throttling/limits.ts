import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Per-route limits that override the global default (THROTTLE_DEFAULT_PER_MIN per minute). */
export const Limit = {
  login: () => Throttle({ default: { limit: 5, ttl: MINUTE } }),
  signup: () => Throttle({ default: { limit: 3, ttl: MINUTE } }),
  passwordReset: () => Throttle({ default: { limit: 3, ttl: MINUTE } }),
  upload: () => Throttle({ default: { limit: 10, ttl: HOUR } }),
  comment: () => Throttle({ default: { limit: 10, ttl: MINUTE } }),
  follow: () => Throttle({ default: { limit: 30, ttl: MINUTE } }),
  engagement: () => Throttle({ default: { limit: 60, ttl: MINUTE } }),
};
