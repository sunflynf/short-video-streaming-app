import type { AuthResponse } from '@app/shared';
import { ApiRequestError, apiFetch, configureSession, type SessionBridge } from './api';

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  }) as Response;

describe('apiFetch', () => {
  const fetchMock = jest.fn();
  let tokens: { access: string; refresh: string };
  let bridge: SessionBridge & { expired: jest.Mock; refreshed: jest.Mock };

  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    tokens = { access: 'old-access', refresh: 'refresh-1' };
    const expired = jest.fn();
    const refreshed = jest.fn((auth: AuthResponse) => {
      tokens = { access: auth.accessToken, refresh: auth.refreshToken };
    });
    bridge = {
      getAccessToken: () => tokens.access,
      getRefreshToken: () => tokens.refresh,
      onRefreshed: refreshed,
      onSessionExpired: expired,
      expired,
      refreshed,
    };
    configureSession(bridge);
  });

  afterAll(() => configureSession(undefined));

  const authHeader = (call: number) =>
    (fetchMock.mock.calls[call]![1] as RequestInit & { headers: Record<string, string> }).headers
      .Authorization;

  it('sends the access token and parses JSON', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(apiFetch('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:3000/v1/auth/me');
    expect(authHeader(0)).toBe('Bearer old-access');
  });

  it('serializes bodies and handles empty responses', async () => {
    fetchMock.mockResolvedValue(json(204));
    await expect(apiFetch('/notifications/read-all', { method: 'POST', body: {} })).resolves.toBe(
      undefined,
    );
    expect(fetchMock.mock.calls[0]![1].body).toBe('{}');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { statusCode: 401, error: 'Unauthorized', message: 'x' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(json(200, { id: 'me' }));
    await expect(apiFetch('/auth/me')).resolves.toEqual({ id: 'me' });
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost:3000/v1/auth/refresh');
    expect(fetchMock.mock.calls[1]![1].body).toBe(JSON.stringify({ refreshToken: 'refresh-1' }));
    expect(authHeader(1)).toBeUndefined();
    expect(authHeader(2)).toBe('Bearer new-access');
    expect(bridge.refreshed).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let resolveRefresh!: (r: Response) => void;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return new Promise((r) => (resolveRefresh = r));
      const auth = (init.headers as Record<string, string>).Authorization;
      return Promise.resolve(auth === 'Bearer new-access' ? json(200, { ok: url }) : json(401));
    });
    const calls = Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    await new Promise((r) => setTimeout(r, 0));
    resolveRefresh(json(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }));
    await expect(calls).resolves.toHaveLength(3);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('ends the session when the refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(401, { statusCode: 401, error: 'Unauthorized', message: 'no' }));
    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(bridge.expired).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for anonymous requests', async () => {
    fetchMock.mockResolvedValue(
      json(401, { statusCode: 401, error: 'Unauthorized', message: 'bad' }),
    );
    await expect(
      apiFetch('/auth/login', { method: 'POST', anonymous: true }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces validation messages', async () => {
    fetchMock.mockResolvedValue(
      json(400, { statusCode: 400, error: 'Bad Request', message: ['a is bad', 'b is bad'] }),
    );
    await expect(apiFetch('/x')).rejects.toThrow('a is bad, b is bad');
  });
});
