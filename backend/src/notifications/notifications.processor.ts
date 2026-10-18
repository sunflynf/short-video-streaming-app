import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { onJobFailed } from '../observability/job-failures.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import { planNotifications, type NotificationTrigger } from './plan-notifications.js';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    onJobFailed(this.logger, NOTIFICATIONS_QUEUE, job, error);
  }

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationTrigger>): Promise<void> {
    for (const plan of planNotifications(job.data)) {
      const { dedupe, ...data } = plan;
      if (dedupe) {
        // e.g. like -> unlike -> like, or follow spam: keep one unread notification.
        const existing = await this.prisma.notification.findFirst({
          where: {
            recipientId: data.recipientId,
            actorId: data.actorId,
            type: data.type,
            videoId: data.videoId ?? null,
            readAt: null,
          },
          select: { id: true },
        });
        if (existing) continue;
      }
      await this.prisma.notification.create({ data });
    }
  }
}
