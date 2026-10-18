import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: config.get('THROTTLE_DEFAULT_PER_MIN', { infer: true }),
          },
        ],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => !config.get('THROTTLE_ENABLED', { infer: true }),
        errorMessage: 'Too many requests, please slow down',
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottlingModule {}
