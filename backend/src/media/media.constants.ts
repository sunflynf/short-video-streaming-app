import type { MediaEvent } from './media-provider.js';

export const MEDIA_QUEUE = 'media';

export const MediaJob = {
  Event: 'media-event',
  DeleteAsset: 'delete-asset',
  CancelUpload: 'cancel-upload',
} as const;

export type MediaJobData =
  | { name: typeof MediaJob.Event; data: MediaEvent }
  | { name: typeof MediaJob.DeleteAsset; data: { assetId: string } }
  | { name: typeof MediaJob.CancelUpload; data: { uploadId: string } };
