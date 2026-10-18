import { Platform } from 'react-native';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 30_000;

export type AnalyticsEvent =
  | 'signup'
  | 'video_view'
  | 'like'
  | 'comment'
  | 'follow'
  | 'upload_started'
  | 'upload_ready'
  | 'share';

type Queued = { event: string; distinct_id: string; timestamp: string; properties: object };

let distinctId: string | null = null;
let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Product analytics via PostHog's batch capture API, with no SDK.
 * A no-op unless EXPO_PUBLIC_POSTHOG_KEY is set at build time. Events are only
 * sent for a signed-in user and carry the user ID, never an email or username.
 */
export const analyticsEnabled = !!KEY;

export function identify(userId: string | undefined): void {
  if (distinctId && distinctId !== userId) void flush();
  distinctId = userId ?? null;
}

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  if (!KEY || !distinctId) return;
  queue.push({
    event,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: { ...properties, $os: Platform.OS },
  });
  if (queue.length >= FLUSH_AT) void flush();
  else timer ??= setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

/** Lost batches aren't retried: analytics must never get in the user's way. */
export async function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!KEY || !queue.length) return;
  const batch = queue;
  queue = [];
  await fetch(`${HOST}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: KEY, batch }),
  }).catch(() => {});
}
