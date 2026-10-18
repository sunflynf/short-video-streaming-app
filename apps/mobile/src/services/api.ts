import type { ApiError, AuthResponse, HealthResponse } from '@app/shared';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | undefined,
  ) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    super(message ?? body?.error ?? `Request failed with status ${status}`);
  }
}

/** Supplied by the auth store, so this module stays free of React and storage concerns. */
export type SessionBridge = {
  getAccessToken(): string | undefined;
  getRefreshToken(): string | undefined;
  onRefreshed(auth: AuthResponse): void;
  onSessionExpired(): void;
};

let session: SessionBridge | undefined;
let refreshing: Promise<boolean> | undefined;

export function configureSession(bridge: SessionBridge | undefined): void {
  session = bridge;
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip the Authorization header and the refresh-on-401 logic (auth endpoints). */
  anonymous?: boolean;
};

/**
 * JSON fetch against the API. With a session, sends the access token; on a 401 it refreshes
 * once (shared between concurrent requests) and retries. If the refresh fails, the session
 * is ended.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 401 && !options.anonymous && session?.getRefreshToken()) {
    if (await refreshSession()) return parse<T>(await send(path, options));
    session.onSessionExpired();
  }
  return parse<T>(res);
}

function send(
  path: string,
  { body, anonymous, headers, ...init }: RequestOptions,
): Promise<Response> {
  const token = anonymous ? undefined : session?.getAccessToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | undefined);
  return body as T;
}

function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = session?.getRefreshToken();
      if (!refreshToken) return false;
      const res = await send('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        anonymous: true,
      });
      if (!res.ok) return false;
      session?.onRefreshed((await res.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}

export const getHealth = () => apiFetch<HealthResponse>('/health', { anonymous: true });
