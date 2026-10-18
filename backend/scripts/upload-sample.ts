// End-to-end check against real Mux: log in, get a direct-upload URL, PUT a clip, poll until READY.
// Needs MUX_* keys in backend/.env and a public URL forwarding Mux webhooks to the API
// (see docs/plans/phase-2-media.md). Usage: pnpm upload:sample ./clip.mp4 ["caption"]
import type { AuthResponse, CreateUploadResponse, VideoDto } from '@app/shared';
import { readFile } from 'node:fs/promises';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/v1';
const EMAIL = process.env.SAMPLE_EMAIL ?? 'alice@example.com';
const PASSWORD = process.env.SAMPLE_PASSWORD ?? 'password123';
const TIMEOUT_MS = 5 * 60 * 1000;

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

async function main(): Promise<void> {
  const [file, caption] = process.argv.slice(2);
  if (!file) throw new Error('Usage: pnpm upload:sample <file.mp4> [caption]');

  const auth = await api<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { videoId, uploadUrl } = await api<CreateUploadResponse>(
    '/videos/upload',
    { method: 'POST', body: JSON.stringify(caption ? { caption } : {}) },
    auth.accessToken,
  );
  console.log(`Video ${videoId}: uploading ${file}`);

  const put = await fetch(uploadUrl, { method: 'PUT', body: await readFile(file) });
  if (!put.ok) throw new Error(`Upload PUT failed: ${put.status} ${await put.text()}`);
  console.log('Uploaded; waiting for Mux to process (needs webhooks reaching the API)...');

  const deadline = Date.now() + TIMEOUT_MS;
  let status = '';
  while (Date.now() < deadline) {
    const video = await api<VideoDto>(`/videos/${videoId}`, {}, auth.accessToken);
    if (video.status !== status) console.log(`  status: ${(status = video.status)}`);
    if (video.status === 'READY') {
      console.log(`Playback:  ${video.playbackUrl}\nThumbnail: ${video.thumbnailUrl}`);
      return;
    }
    if (video.status === 'FAILED') throw new Error('Processing failed (see API logs)');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Timed out. Are Mux webhooks reaching /v1/webhooks/mux?');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
