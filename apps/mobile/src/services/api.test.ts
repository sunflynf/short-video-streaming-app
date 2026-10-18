import { ApiRequestError, apiFetch } from './api';

describe('apiFetch', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });

  it('returns the parsed body on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/v1/health', expect.any(Object));
  });

  it('throws ApiRequestError with the status on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ statusCode: 503, error: 'Service Unavailable', message: 'down' }),
    });
    await expect(apiFetch('/health')).rejects.toMatchObject({ status: 503 });
    await expect(apiFetch('/health')).rejects.toBeInstanceOf(ApiRequestError);
  });
});
