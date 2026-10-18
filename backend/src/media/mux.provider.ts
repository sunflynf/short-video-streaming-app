import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mux from '@mux/mux-node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Env } from '../config/env.js';
import type { MediaEvent, MediaProvider } from './media-provider.js';
import { resolveMuxEvent, type MuxWebhook } from './mux-events.js';

@Injectable()
export class MuxProvider implements MediaProvider {
  protected readonly mux: Mux;
  private readonly hasCredentials: boolean;
  private readonly hasWebhookSecret: boolean;

  constructor(config: ConfigService<Env, true>) {
    const tokenId = config.get('MUX_TOKEN_ID', { infer: true });
    const tokenSecret = config.get('MUX_TOKEN_SECRET', { infer: true });
    const webhookSecret = config.get('MUX_WEBHOOK_SECRET', { infer: true });
    this.hasCredentials = !!tokenId && !!tokenSecret;
    this.hasWebhookSecret = !!webhookSecret;
    this.mux = new Mux({
      tokenId: tokenId ?? null,
      tokenSecret: tokenSecret ?? null,
      webhookSecret: webhookSecret ?? null,
    });
  }

  get uploadsEnabled(): boolean {
    return this.hasCredentials;
  }

  get webhooksEnabled(): boolean {
    return this.hasWebhookSecret;
  }

  async createDirectUpload(opts: {
    passthrough: string;
  }): Promise<{ uploadId: string; uploadUrl: string }> {
    const upload = await this.mux.video.uploads.create({
      // The app uploads from native code, not a browser, so CORS doesn't restrict it.
      cors_origin: '*',
      new_asset_settings: {
        playback_policies: ['public'],
        passthrough: opts.passthrough,
        video_quality: 'basic',
        max_resolution_tier: '1080p',
      },
    });
    if (!upload.url) throw new Error(`Mux upload ${upload.id} has no upload URL`);
    return { uploadId: upload.id, uploadUrl: upload.url };
  }

  async cancelUpload(uploadId: string): Promise<void> {
    await this.mux.video.uploads.cancel(uploadId);
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.mux.video.assets.delete(assetId);
  }

  async verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<MediaEvent | null> {
    const event = (await this.mux.webhooks.unwrap(
      rawBody.toString('utf8'),
      headers as Record<string, string | string[] | undefined>,
    )) as unknown as MuxWebhook;
    return resolveMuxEvent(event);
  }

  playbackUrl(playbackId: string): string {
    return `https://stream.mux.com/${playbackId}.m3u8`;
  }

  thumbnailUrl(playbackId: string): string {
    return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
  }
}
