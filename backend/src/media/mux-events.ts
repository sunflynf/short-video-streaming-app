import type { MediaEvent } from './media-provider.js';

/** The fields of a Mux webhook we read. See https://docs.mux.com/core/listen-for-webhooks */
export type MuxWebhook = {
  id: string;
  type: string;
  data: {
    id?: string;
    asset_id?: string;
    upload_id?: string;
    passthrough?: string;
    new_asset_settings?: { passthrough?: string };
    duration?: number;
    aspect_ratio?: string;
    playback_ids?: { id: string; policy: string }[];
    errors?: { messages?: string[] };
    error?: { message?: string };
  };
};

/**
 * Maps a Mux webhook to a MediaEvent, or null for types the pipeline ignores.
 * Upload events carry the upload as `data`; asset events carry the asset.
 */
export function resolveMuxEvent(event: MuxWebhook): MediaEvent | null {
  const { data } = event;
  switch (event.type) {
    case 'video.upload.asset_created':
      return {
        id: event.id,
        kind: 'asset_created',
        videoId: data.new_asset_settings?.passthrough,
        uploadId: data.id,
        assetId: data.asset_id,
      };
    case 'video.asset.ready':
      return {
        id: event.id,
        kind: 'ready',
        videoId: data.passthrough,
        uploadId: data.upload_id,
        assetId: data.id,
        playbackId: data.playback_ids?.find((p) => p.policy === 'public')?.id,
        durationSec: data.duration,
        aspectRatio: data.aspect_ratio,
      };
    case 'video.asset.errored':
      return {
        id: event.id,
        kind: 'failed',
        videoId: data.passthrough,
        uploadId: data.upload_id,
        assetId: data.id,
        error: data.errors?.messages?.join('; '),
      };
    case 'video.upload.errored':
    case 'video.upload.cancelled':
      return {
        id: event.id,
        kind: 'failed',
        videoId: data.new_asset_settings?.passthrough,
        uploadId: data.id,
        error: data.error?.message ?? event.type,
      };
    default:
      return null;
  }
}
