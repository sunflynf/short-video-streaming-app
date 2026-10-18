import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MEDIA_PROVIDER } from './media-provider.js';
import { MEDIA_QUEUE } from './media.constants.js';
import { MediaProcessor } from './media.processor.js';
import { MediaQueue } from './media.queue.js';
import { MuxWebhookController } from './mux-webhook.controller.js';
import { MuxProvider } from './mux.provider.js';

const WEEK_SEC = 7 * 24 * 60 * 60;

@Module({
  imports: [
    BullModule.registerQueue({
      name: MEDIA_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: WEEK_SEC },
        removeOnFail: { age: 4 * WEEK_SEC },
      },
    }),
  ],
  controllers: [MuxWebhookController],
  providers: [{ provide: MEDIA_PROVIDER, useClass: MuxProvider }, MediaQueue, MediaProcessor],
  exports: [MEDIA_PROVIDER, MediaQueue],
})
export class MediaModule {}
