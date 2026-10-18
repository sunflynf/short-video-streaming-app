import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MEDIA_PROVIDER, type MediaEvent, type MediaProvider } from './media-provider.js';
import { MEDIA_QUEUE, MediaJob, type MediaJobData } from './media.constants.js';
import { MediaQueue } from './media.queue.js';

/** Clips may run slightly over the limit after encoding, so allow a second of slack. */
export const DURATION_SLACK_SEC = 1;

export function exceedsMaxDuration(durationSec: number | undefined, maxSec: number): boolean {
  return durationSec !== undefined && durationSec > maxSec + DURATION_SLACK_SEC;
}

/**
 * Applies media events to videos. Every transition is a conditional update, so redelivered
 * and out-of-order events are harmless: READY is never downgraded and FAILED is final.
 */
@Processor(MEDIA_QUEUE)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: MediaQueue,
    private readonly config: ConfigService<Env, true>,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { name, data } = job as unknown as MediaJobData;
    switch (name) {
      case MediaJob.Event:
        return this.handleEvent(data);
      case MediaJob.DeleteAsset:
        return this.media.deleteAsset(data.assetId);
      case MediaJob.CancelUpload:
        return this.media.cancelUpload(data.uploadId);
    }
  }

  private async handleEvent(event: MediaEvent): Promise<void> {
    const video = await this.findVideo(event);
    if (!video) {
      // The video was deleted (or never ours): don't leave a billable asset behind.
      if (event.assetId && event.kind !== 'failed') {
        await this.queue.enqueueDeleteAsset(event.assetId);
      }
      this.logger.warn(`No video for media event ${event.id} (${event.kind})`);
      return;
    }

    switch (event.kind) {
      case 'asset_created':
        await this.prisma.video.updateMany({
          where: { id: video.id, status: 'UPLOADING' },
          data: { status: 'PROCESSING', muxAssetId: event.assetId },
        });
        await this.prisma.video.updateMany({
          where: { id: video.id, muxAssetId: null },
          data: { muxAssetId: event.assetId },
        });
        return;

      case 'ready': {
        const maxSec = this.config.get('MAX_VIDEO_DURATION_SEC', { infer: true });
        if (exceedsMaxDuration(event.durationSec, maxSec) || !event.playbackId) {
          await this.fail(video.id, event.assetId, { durationSec: event.durationSec });
          if (event.assetId) await this.queue.enqueueDeleteAsset(event.assetId);
          return;
        }
        await this.prisma.video.updateMany({
          where: { id: video.id, status: { in: ['UPLOADING', 'PROCESSING'] } },
          data: {
            status: 'READY',
            muxAssetId: event.assetId,
            muxPlaybackId: event.playbackId,
            durationSec: event.durationSec,
            aspectRatio: event.aspectRatio,
            publishedAt: new Date(),
          },
        });
        return;
      }

      case 'failed':
        this.logger.warn(`Video ${video.id} failed: ${event.error ?? 'unknown error'}`);
        await this.fail(video.id, event.assetId);
        return;
    }
  }

  private async fail(
    videoId: string,
    assetId: string | undefined,
    extra: Prisma.VideoUpdateManyMutationInput = {},
  ): Promise<void> {
    await this.prisma.video.updateMany({
      where: { id: videoId, status: { in: ['UPLOADING', 'PROCESSING'] } },
      data: { status: 'FAILED', ...(assetId && { muxAssetId: assetId }), ...extra },
    });
  }

  /** Passthrough (our video id) first, then the provider's upload or asset id. */
  private async findVideo(event: MediaEvent): Promise<{ id: string } | null> {
    const or: Prisma.VideoWhereInput[] = [];
    if (event.videoId) or.push({ id: event.videoId });
    if (event.uploadId) or.push({ muxUploadId: event.uploadId });
    if (event.assetId) or.push({ muxAssetId: event.assetId });
    if (!or.length) return null;
    return this.prisma.video.findFirst({ where: { OR: or }, select: { id: true } });
  }
}
