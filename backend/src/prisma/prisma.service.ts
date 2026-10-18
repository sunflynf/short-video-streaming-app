import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly slowQueries = new Logger('SlowQuery');

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
      log: [{ emit: 'event', level: 'query' }],
    });
    const slowMs = config.get('SLOW_QUERY_MS', { infer: true });
    (this as unknown as PrismaClient<'query'>).$on('query', (e) => {
      if (e.duration >= slowMs)
        this.slowQueries.warn(`${Math.round(e.duration)} ms: ${e.query.slice(0, 500)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
