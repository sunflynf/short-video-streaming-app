import { Controller, Get, Inject, Post } from '@nestjs/common';
import type { AdminQueuesResponse } from '@app/shared';
import type { Queue } from 'bullmq';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ALL_QUEUES, queueCounts } from '../common/queues.js';

const RECENT_FAILURES = 10;

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(@Inject(ALL_QUEUES) private readonly queues: Queue[]) {}

  /** Backlog and the latest failed jobs per queue (what Bull Board would show, as JSON). */
  @Get('queues')
  async queueStatus(): Promise<AdminQueuesResponse> {
    return {
      queues: await Promise.all(
        this.queues.map(async (queue) => {
          const [counts, completed, failed] = await Promise.all([
            queueCounts(queue),
            queue.getCompletedCount(),
            queue.getFailed(0, RECENT_FAILURES - 1),
          ]);
          return {
            name: queue.name,
            counts: { ...counts, completed },
            recentFailures: failed.map((job) => ({
              id: String(job.id),
              name: job.name,
              failedReason: job.failedReason,
              attemptsMade: job.attemptsMade,
              failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
            })),
          };
        }),
      ),
    };
  }

  /** Throws on purpose so an admin can confirm errors reach Sentry after a deploy. */
  @Post('sentry-test')
  sentryTest(): never {
    throw new Error('Sentry test error (triggered by an admin)');
  }
}
