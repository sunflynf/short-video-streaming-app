import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsListener } from './notifications.listener.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NotificationsService } from './notifications.service.js';

const WEEK_SEC = 7 * 24 * 60 * 60;

@Module({
  imports: [
    MediaModule,
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: WEEK_SEC },
        removeOnFail: { age: 4 * WEEK_SEC },
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener, NotificationsProcessor],
})
export class NotificationsModule {}
