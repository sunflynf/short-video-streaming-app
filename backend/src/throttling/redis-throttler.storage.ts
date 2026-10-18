import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

/** The record shape ThrottlerGuard expects (times in seconds). */
type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

// One atomic round trip: count the hit in a fixed window and block the key once over the limit.
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return { hits, ttl, blockTtl }
`;

/**
 * Throttler storage shared by every API instance via Redis. (The community package for this
 * doesn't support Nest 12 yet, and the logic is small.)
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'throttle',
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    const [hits, ttlMs, blockMs] = (await this.redis.eval(
      INCREMENT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      blockDuration || ttl,
    )) as [number, number, number];
    const isBlocked = blockMs > 0;
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockMs / 1000) : 0,
    };
  }
}
