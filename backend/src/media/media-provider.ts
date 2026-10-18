import type { IncomingHttpHeaders } from 'node:http';

export const MEDIA_PROVIDER = Symbol('MEDIA_PROVIDER');

/** A provider webhook reduced to what the pipeline acts on. */
export type MediaEvent = {
  /** Provider event id, used to dedupe redeliveries. */
  id: string;
  kind: 'asset_created' | 'ready' | 'failed';
  /** Our Video id, sent to the provider as passthrough when the upload was created. */
  videoId?: string;
  uploadId?: string;
  assetId?: string;
  playbackId?: string;
  durationSec?: number;
  aspectRatio?: string;
  error?: string;
};

/** Video hosting behind an interface so Mux can be swapped (e.g. for Cloudflare Stream). */
export interface MediaProvider {
  /** False when credentials are missing; uploads then return 503. */
  readonly uploadsEnabled: boolean;
  /** False when the webhook secret is missing; webhooks then return 503. */
  readonly webhooksEnabled: boolean;
  createDirectUpload(opts: {
    passthrough: string;
  }): Promise<{ uploadId: string; uploadUrl: string }>;
  cancelUpload(uploadId: string): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
  /** Verifies the signature and normalizes the event; null for event types we ignore. */
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<MediaEvent | null>;
  playbackUrl(playbackId: string): string;
  thumbnailUrl(playbackId: string): string;
}
