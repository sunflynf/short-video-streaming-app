import { resolveMuxEvent, type MuxWebhook } from './mux-events.js';

const event = (type: string, data: MuxWebhook['data']): MuxWebhook => ({ id: 'evt_1', type, data });

describe('resolveMuxEvent', () => {
  it('maps upload.asset_created using the upload as data', () => {
    expect(
      resolveMuxEvent(
        event('video.upload.asset_created', {
          id: 'up_1',
          asset_id: 'as_1',
          new_asset_settings: { passthrough: 'vid_1' },
        }),
      ),
    ).toEqual({
      id: 'evt_1',
      kind: 'asset_created',
      videoId: 'vid_1',
      uploadId: 'up_1',
      assetId: 'as_1',
    });
  });

  it('maps asset.ready with the public playback id', () => {
    expect(
      resolveMuxEvent(
        event('video.asset.ready', {
          id: 'as_1',
          upload_id: 'up_1',
          passthrough: 'vid_1',
          duration: 14.5,
          aspect_ratio: '9:16',
          playback_ids: [
            { id: 'signed_pb', policy: 'signed' },
            { id: 'public_pb', policy: 'public' },
          ],
        }),
      ),
    ).toEqual({
      id: 'evt_1',
      kind: 'ready',
      videoId: 'vid_1',
      uploadId: 'up_1',
      assetId: 'as_1',
      playbackId: 'public_pb',
      durationSec: 14.5,
      aspectRatio: '9:16',
    });
  });

  it('maps asset and upload errors to failed', () => {
    expect(
      resolveMuxEvent(
        event('video.asset.errored', {
          id: 'as_1',
          passthrough: 'vid_1',
          errors: { messages: ['bad codec', 'no video track'] },
        }),
      ),
    ).toMatchObject({ kind: 'failed', videoId: 'vid_1', error: 'bad codec; no video track' });

    expect(
      resolveMuxEvent(
        event('video.upload.cancelled', {
          id: 'up_1',
          new_asset_settings: { passthrough: 'vid_1' },
        }),
      ),
    ).toMatchObject({ kind: 'failed', videoId: 'vid_1', uploadId: 'up_1' });
  });

  it('tolerates missing optional fields', () => {
    expect(resolveMuxEvent(event('video.asset.ready', { id: 'as_1' }))).toMatchObject({
      kind: 'ready',
      videoId: undefined,
      playbackId: undefined,
    });
  });

  it('ignores event types the pipeline does not use', () => {
    expect(resolveMuxEvent(event('video.asset.created', { id: 'as_1' }))).toBeNull();
    expect(resolveMuxEvent(event('video.live_stream.active', {}))).toBeNull();
  });
});
