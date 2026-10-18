import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, CreateUploadResponse, VideoStatus } from '@app/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, postMuxWebhook, waitFor } from './utils.js';

export async function startUpload(
  app: INestApplication<App>,
  auth: AuthResponse,
  caption?: string,
): Promise<CreateUploadResponse> {
  const res = await request(app.getHttpServer())
    .post('/v1/videos/upload')
    .set(bearer(auth))
    .send(caption === undefined ? {} : { caption })
    .expect(201);
  return res.body as CreateUploadResponse;
}

export const assetCreated = (videoId: string, assetId = `as_${videoId}`) => ({
  id: randomUUID(),
  type: 'video.upload.asset_created',
  data: { id: `up_${videoId}`, asset_id: assetId, new_asset_settings: { passthrough: videoId } },
});

export const assetReady = (videoId: string, durationSec = 15, assetId = `as_${videoId}`) => ({
  id: randomUUID(),
  type: 'video.asset.ready',
  data: {
    id: assetId,
    upload_id: `up_${videoId}`,
    passthrough: videoId,
    duration: durationSec,
    aspect_ratio: '9:16',
    playback_ids: [{ id: `pb_${videoId}`, policy: 'public' }],
  },
});

export async function videoStatus(
  app: INestApplication,
  videoId: string,
): Promise<VideoStatus | undefined> {
  const video = await app
    .get(PrismaService)
    .video.findUnique({ where: { id: videoId }, select: { status: true } });
  return video?.status;
}

export async function waitForStatus(
  app: INestApplication,
  videoId: string,
  status: VideoStatus,
): Promise<void> {
  await waitFor(async () => (await videoStatus(app, videoId)) === status);
}

/** Uploads a clip and drives it to READY through signed webhooks. */
export async function publishVideo(
  app: INestApplication<App>,
  auth: AuthResponse,
  caption?: string,
): Promise<string> {
  const { videoId } = await startUpload(app, auth, caption);
  await postMuxWebhook(app, assetCreated(videoId)).expect(200);
  await postMuxWebhook(app, assetReady(videoId)).expect(200);
  await waitForStatus(app, videoId, 'READY');
  return videoId;
}

let readyCounter = 0;

/** Inserts a READY video directly (much faster than driving uploads through webhooks). */
export async function createReadyVideo(
  app: INestApplication,
  authorId: string,
  overrides: Partial<{
    likeCount: number;
    commentCount: number;
    shareCount: number;
    publishedAt: Date;
    hidden: boolean;
    durationSec: number;
    caption: string;
  }> = {},
): Promise<string> {
  readyCounter += 1;
  const video = await app.get(PrismaService).video.create({
    data: {
      authorId,
      status: 'READY',
      muxPlaybackId: `pb_ready_${readyCounter}`,
      durationSec: 15,
      publishedAt: new Date(),
      caption: `ready ${readyCounter}`,
      ...overrides,
    },
    select: { id: true },
  });
  return video.id;
}

export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
