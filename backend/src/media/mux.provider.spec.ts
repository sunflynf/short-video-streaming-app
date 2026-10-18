import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Env } from '../config/env.js';
import { exceedsMaxDuration } from './media.processor.js';
import { MuxProvider } from './mux.provider.js';

const SECRET = 'whsec_test';

const config = (values: Partial<Env>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<Env, true>;

/** Builds a mux-signature header the way Mux does: HMAC-SHA256 of `${t}.${body}`. */
function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

describe('MuxProvider', () => {
  const provider = new MuxProvider(
    config({ MUX_TOKEN_ID: 'id', MUX_TOKEN_SECRET: 'secret', MUX_WEBHOOK_SECRET: SECRET }),
  );
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'video.upload.asset_created',
    data: { id: 'up_1', asset_id: 'as_1', new_asset_settings: { passthrough: 'vid_1' } },
  });

  it('reports whether it is configured', () => {
    expect(provider.uploadsEnabled).toBe(true);
    expect(provider.webhooksEnabled).toBe(true);
    const bare = new MuxProvider(config({}));
    expect(bare.uploadsEnabled).toBe(false);
    expect(bare.webhooksEnabled).toBe(false);
  });

  it('builds playback and thumbnail urls', () => {
    expect(provider.playbackUrl('pb1')).toBe('https://stream.mux.com/pb1.m3u8');
    expect(provider.thumbnailUrl('pb1')).toBe('https://image.mux.com/pb1/thumbnail.jpg?time=1');
  });

  it('accepts a correctly signed webhook', async () => {
    await expect(
      provider.verifyWebhook(Buffer.from(body), { 'mux-signature': sign(body) }),
    ).resolves.toMatchObject({ kind: 'asset_created', videoId: 'vid_1' });
  });

  it('rejects a tampered body, a wrong secret, a stale timestamp or no header', async () => {
    const header = sign(body);
    await expect(
      provider.verifyWebhook(Buffer.from(body.replace('vid_1', 'vid_2')), {
        'mux-signature': header,
      }),
    ).rejects.toThrow();
    await expect(
      provider.verifyWebhook(Buffer.from(body), { 'mux-signature': sign(body, 'other') }),
    ).rejects.toThrow();
    const stale = Math.floor(Date.now() / 1000) - 600;
    await expect(
      provider.verifyWebhook(Buffer.from(body), { 'mux-signature': sign(body, SECRET, stale) }),
    ).rejects.toThrow(/too old/);
    await expect(provider.verifyWebhook(Buffer.from(body), {})).rejects.toThrow();
  });
});

describe('exceedsMaxDuration', () => {
  it('allows a second of slack over the limit', () => {
    expect(exceedsMaxDuration(60.9, 60)).toBe(false);
    expect(exceedsMaxDuration(61.5, 60)).toBe(true);
    expect(exceedsMaxDuration(undefined, 60)).toBe(false);
  });
});
