import type { ApiError, HealthResponse } from '@app/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | undefined,
  ) {
    super(body?.error ?? `Request failed with status ${status}`);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiRequestError(res.status, body as ApiError | undefined);
  }
  return body as T;
}

export const getHealth = () => apiFetch<HealthResponse>('/health');
