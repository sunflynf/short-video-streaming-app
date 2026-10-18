// Gives alice something in her inbox: bob likes and comments on her newest video, dave comments.
// Run after `pnpm prisma:seed` (with SEED_MUX_PLAYBACK_IDS so videos exist) against a running API.
// Usage: pnpm demo:activity
import type { AuthResponse, Paginated, VideoDto } from '@app/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/v1';

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const login = async (name: string) =>
  (
    await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `${name}@example.com`, password: 'password123' }),
    })
  ).accessToken;

async function main(): Promise<void> {
  const alice = await api<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alice@example.com', password: 'password123' }),
  });
  const videos = await api<Paginated<VideoDto>>(`/users/${alice.user.id}/videos?limit=1`);
  const video = videos.items[0];
  if (!video)
    throw new Error(
      'alice has no videos: run `SEED_MUX_PLAYBACK_IDS=a,b,c pnpm prisma:seed` first',
    );

  const [bob, dave] = await Promise.all([login('bob'), login('dave')]);
  await api(`/videos/${video.id}/like`, { method: 'POST' }, bob);
  const comment = (token: string, body: string) =>
    api(`/videos/${video.id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }, token);
  await comment(bob, 'This is so good! How long did it take to film?');
  await comment(dave, 'Love the music choice 🔥');
  console.log(`Added a like and two comments on alice's video ${video.id}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
