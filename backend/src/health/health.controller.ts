import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse, QueueCounts } from '@app/shared';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Public } from '../common/decorators/public.decorator.js';
import { ALL_QUEUES, queueCounts } from '../common/queues.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ALL_QUEUES) private readonly queues: Queue[],
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'ok' as const,
        () => 'error' as const,
      ),
      this.redis.ping().then(
        () => 'ok' as const,
        () => 'error' as const,
      ),
    ]);
    if (db !== 'ok' || redis !== 'ok') {
      throw new ServiceUnavailableException(`Health check failed (db: ${db}, redis: ${redis})`);
    }
    const queues: Record<string, QueueCounts> = {};
    for (const queue of this.queues) queues[queue.name] = await queueCounts(queue);
    return { status: 'ok', db, redis, queues };
  }
}
