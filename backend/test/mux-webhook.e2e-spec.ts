import type { INestApplication } from '@nestjs/common';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  assetCreated,
  assetReady,
  startUpload,
  videoStatus,
  waitForStatus,
} from './media-helpers.js';
import {
  createTestApp,
  mediaQueue,
  mediaStub,
  postMuxWebhook,
  resetDb,
  signedMuxWebhook,
  signup,
  waitFor,
} from './utils.js';

describe('Mux webhooks', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  const prisma = () => app.get(PrismaService);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('moves a video UPLOADING -> PROCESSING -> READY', async () => {
    const { videoId } = await startUpload(app, ann);
    expect(await videoStatus(app, videoId)).toBe('UPLOADING');

    await postMuxWebhook(app, assetCreated(videoId)).expect(200);
    await waitForStatus(app, videoId, 'PROCESSING');

    await postMuxWebhook(app, assetReady(videoId, 14.2)).expect(200);
    await waitForStatus(app, videoId, 'READY');

    const video = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    expect(video).toMatchObject({
      muxUploadId: `up_${videoId}`,
      muxAssetId: `as_${videoId}`,
      muxPlaybackId: `pb_${videoId}`,
      durationSec: 14.2,
      aspectRatio: '9:16',
    });
    expect(video.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects unsigned or tampered webhooks', async () => {
    const { videoId } = await startUpload(app, ann);
    await request(app.getHttpServer())
      .post('/v1/webhooks/mux')
      .send(assetReady(videoId))
      .expect(401);

    const { body, signature } = signedMuxWebhook(assetReady(videoId));
    await request(app.getHttpServer())
      .post('/v1/webhooks/mux')
      .set('content-type', 'application/json')
      .set('mux-signature', signature)
      .send(body.replace('"duration":15', '"duration":16'))
      .expect(401);

    expect(await mediaQueue(app).count()).toBe(0);
    expect(await videoStatus(app, videoId)).toBe('UPLOADING');
  });

  it('returns 503 when the webhook secret is not configured', async () => {
    const stub = mediaStub(app) as unknown as { hasWebhookSecret: boolean };
    stub.hasWebhookSecret = false;
    try {
      await postMuxWebhook(app, assetCreated('x')).expect(503);
    } finally {
      stub.hasWebhookSecret = true;
    }
  });

  it('acknowledges but ignores event types it does not use', async () => {
    await postMuxWebhook(app, { id: 'evt_x', type: 'video.asset.created', data: {} }).expect(200);
    expect(await mediaQueue(app).count()).toBe(0);
  });

  it('processes a redelivered event only once', async () => {
    const { videoId } = await startUpload(app, ann);
    const ready = assetReady(videoId);
    await postMuxWebhook(app, ready).expect(200);
    await waitForStatus(app, videoId, 'READY');
    const first = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });

    await postMuxWebhook(app, ready).expect(200);
    const jobs = await mediaQueue(app).getJobs(['completed', 'waiting', 'active']);
    expect(jobs).toHaveLength(1);
    const second = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    expect(second.publishedAt).toEqual(first.publishedAt);
  });

  it('ends READY when asset.ready arrives before upload.asset_created', async () => {
    const { videoId } = await startUpload(app, ann);
    await postMuxWebhook(app, assetReady(videoId)).expect(200);
    await waitForStatus(app, videoId, 'READY');
    await postMuxWebhook(app, assetCreated(videoId)).expect(200);
    await waitFor(async () => (await mediaQueue(app).getCompletedCount()) === 2);
    expect(await videoStatus(app, videoId)).toBe('READY');
  });

  it('fails clips over the duration limit and deletes the asset', async () => {
    const { videoId } = await startUpload(app, ann);
    await postMuxWebhook(app, assetReady(videoId, 70)).expect(200);
    await waitForStatus(app, videoId, 'FAILED');
    await waitFor(async () => mediaStub(app).deletedAssets.includes(`as_${videoId}`));
    const video = await prisma().video.findUniqueOrThrow({ where: { id: videoId } });
    expect(video.durationSec).toBe(70);
    expect(video.publishedAt).toBeNull();
  });

  it('marks errored assets and cancelled uploads as FAILED', async () => {
    const a = await startUpload(app, ann);
    await postMuxWebhook(app, {
      id: 'evt_err',
      type: 'video.asset.errored',
      data: { id: 'as_err', passthrough: a.videoId, errors: { messages: ['bad file'] } },
    }).expect(200);
    await waitForStatus(app, a.videoId, 'FAILED');

    const b = await startUpload(app, ann);
    await postMuxWebhook(app, {
      id: 'evt_cancel',
      type: 'video.upload.cancelled',
      data: { id: `up_${b.videoId}`, new_asset_settings: { passthrough: b.videoId } },
    }).expect(200);
    await waitForStatus(app, b.videoId, 'FAILED');
  });

  it('never downgrades a READY video on a late failure event', async () => {
    const { videoId } = await startUpload(app, ann);
    await postMuxWebhook(app, assetReady(videoId)).expect(200);
    await waitForStatus(app, videoId, 'READY');
    await postMuxWebhook(app, {
      id: 'evt_late',
      type: 'video.upload.errored',
      data: { id: `up_${videoId}`, new_asset_settings: { passthrough: videoId } },
    }).expect(200);
    await waitFor(async () => (await mediaQueue(app).getCompletedCount()) === 2);
    expect(await videoStatus(app, videoId)).toBe('READY');
  });

  it('deletes the asset of a video that no longer exists', async () => {
    await postMuxWebhook(app, assetReady('deleted-video', 10, 'as_orphan')).expect(200);
    await waitFor(async () => mediaStub(app).deletedAssets.includes('as_orphan'));
  });

  it('finds the video by upload id when passthrough is missing', async () => {
    const { videoId } = await startUpload(app, ann);
    const event = assetCreated(videoId);
    delete (event.data as { new_asset_settings?: unknown }).new_asset_settings;
    await postMuxWebhook(app, event).expect(200);
    await waitForStatus(app, videoId, 'PROCESSING');
  });
});
