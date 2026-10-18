import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Videos a user watched in the last 24 h, kept as a sorted set scored by time so each
 * entry ages out on its own. Filled by the view endpoint, read when building a feed.
 */
@Injectable()
export class SeenStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async add(userId: string, videoId: string): Promise<void> {
    const key = this.key(userId);
    const now = Date.now();
    await this.redis
      .multi()
      .zadd(key, now, videoId)
      .zremrangebyscore(key, 0, now - WINDOW_MS)
      .pexpire(key, WINDOW_MS)
      .exec();
  }

  async list(userId: string): Promise<string[]> {
    return this.redis.zrangebyscore(this.key(userId), Date.now() - WINDOW_MS, '+inf');
  }

  private key(userId: string): string {
    return `seen:${userId}`;
  }
}
