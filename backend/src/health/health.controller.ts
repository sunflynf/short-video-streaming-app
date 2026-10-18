import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@app/shared';
import { Redis } from 'ioredis';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
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
    return { status: 'ok', db, redis };
  }
}
