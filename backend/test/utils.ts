import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse } from '@app/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  setupApp(app);
  // Listen once on a random port; otherwise supertest re-binds the server on every request.
  await app.listen(0, '127.0.0.1');
  return app;
}

/** Empties every table touched by the tests. */
export async function resetDb(app: INestApplication): Promise<void> {
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE "Notification", "Comment", "Like", "Video", "Follow", "RefreshToken", "User" CASCADE',
    );
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
