import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { MediaEvent } from './media-provider.js';
import { MEDIA_QUEUE, MediaJob } from './media.constants.js';

@Injectable()
export class MediaQueue {
  constructor(@InjectQueue(MEDIA_QUEUE) private readonly queue: Queue) {}

  /**
   * The job id is the provider event id, so a redelivered webhook is dropped while the
   * first job is still retained (completed jobs are kept for 7 days).
   */
  async enqueueEvent(event: MediaEvent): Promise<void> {
    await this.queue.add(MediaJob.Event, event, { jobId: `event-${event.id}` });
  }

  async enqueueDeleteAsset(assetId: string): Promise<void> {
    await this.queue.add(MediaJob.DeleteAsset, { assetId });
  }

  async enqueueCancelUpload(uploadId: string): Promise<void> {
    await this.queue.add(MediaJob.CancelUpload, { uploadId });
  }
}
