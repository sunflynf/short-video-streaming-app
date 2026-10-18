type Analytics = typeof import('./analytics');

const load = (key?: string): Analytics => {
  if (key) process.env.EXPO_PUBLIC_POSTHOG_KEY = key;
  else delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  let mod!: Analytics;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module per env
    mod = require('./analytics');
  });
  return mod;
};

describe('analytics', () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => delete process.env.EXPO_PUBLIC_POSTHOG_KEY);

  it('does nothing without a key', async () => {
    const a = load();
    a.identify('u1');
    a.track('like');
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', async () => {
    const a = load('phc_test');
    a.track('like');
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('batches events with the user id only', async () => {
    const a = load('phc_test');
    a.identify('u1');
    a.track('like', { videoId: 'v1' });
    a.track('follow', { userId: 'u2' });
    await a.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://us.i.posthog.com/batch/');
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe('phc_test');
    expect(body.batch.map((e: { event: string }) => e.event)).toEqual(['like', 'follow']);
    expect(body.batch[0]).toMatchObject({ distinct_id: 'u1', properties: { videoId: 'v1' } });
  });

  it('flushes the previous user’s events when the account changes', async () => {
    const a = load('phc_test');
    a.identify('u1');
    a.track('share');
    a.identify('u2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).batch[0].distinct_id).toBe('u1');
    await a.flush();
  });

  it('never throws when sending fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const a = load('phc_test');
    a.identify('u1');
    a.track('comment');
    await expect(a.flush()).resolves.toBeUndefined();
  });
});
