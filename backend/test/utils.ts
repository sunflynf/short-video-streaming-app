import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { createHmac } from 'node:crypto';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { Env } from '../src/config/env.js';
import { MEDIA_PROVIDER } from '../src/media/media-provider.js';
import { MEDIA_QUEUE } from '../src/media/media.constants.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.module.js';
import { setupApp } from '../src/setup-app.js';
import { StubMuxProvider } from './stub-mux.provider.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MEDIA_PROVIDER)
    .useFactory({
      factory: (c: ConfigService<Env, true>) => new StubMuxProvider(c),
      inject: [ConfigService],
    })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
    rawBody: true,
  });
  setupApp(app);
  // Listen once on a random port; otherwise supertest re-binds the server on every request.
  await app.listen(0, '127.0.0.1');
  return app;
}

export const mediaStub = (app: INestApplication) => app.get<StubMuxProvider>(MEDIA_PROVIDER);

export const mediaQueue = (app: INestApplication) => app.get<Queue>(getQueueToken(MEDIA_QUEUE));

/** Empties every table touched by the tests, the media queue and the Mux stub's records. */
export async function resetDb(app: INestApplication): Promise<void> {
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE "Notification", "Comment", "Like", "Video", "Follow", "RefreshToken", "User" CASCADE',
    );
  const queue = mediaQueue(app);
  await queue.pause();
  await queue.obliterate({ force: true });
  await queue.resume();
  // Feed snapshots, seen sets and view debounce keys (test Redis db only, see setup-env.ts).
  const redis = app.get<Redis>(REDIS);
  for (const pattern of ['feed:*', 'seen:*', 'view:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
  mediaStub(app).reset();
}

/** Polls until `check` returns a truthy value (e.g. a queue job has been applied). */
export async function waitFor<T>(check: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A Mux webhook body with a valid mux-signature header for MUX_WEBHOOK_SECRET. */
export function signedMuxWebhook(event: { id: string; type: string; data: object }): {
  body: string;
  signature: string;
} {
  const body = JSON.stringify({ object: { type: 'asset' }, created_at: new Date(), ...event });
  const t = Math.floor(Date.now() / 1000);
  const hmac = createHmac('sha256', process.env.MUX_WEBHOOK_SECRET!).update(`${t}.${body}`);
  return { body, signature: `t=${t},v1=${hmac.digest('hex')}` };
}

export function postMuxWebhook(
  app: INestApplication<App>,
  event: { id: string; type: string; data: object },
) {
  const { body, signature } = signedMuxWebhook(event);
  return request(app.getHttpServer())
    .post('/v1/webhooks/mux')
    .set('content-type', 'application/json')
    .set('mux-signature', signature)
    .send(body);
}

let counter = 0;

export async function signup(
  app: INestApplication<App>,
  overrides: Partial<{ email: string; username: string; password: string }> = {},
): Promise<AuthResponse> {
  counter += 1;
  const username = overrides.username ?? `user_${counter}_${Date.now() % 100000}`;
  const res = await request(app.getHttpServer())
    .post('/v1/auth/signup')
    .send({ email: `${username}@example.com`, password: 'password123', username, ...overrides })
    .expect(201);
  return res.body as AuthResponse;
}

export const bearer = (auth: AuthResponse) => ({ Authorization: `Bearer ${auth.accessToken}` });
