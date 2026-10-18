# Phase 1 — Core Backend Foundation (Days 4–12)

**Status:** ✅ done (see *Implementation notes* for where the build differs from the original plan)

## Goal
Users can sign up, log in, refresh tokens, view and edit profiles, and follow or unfollow each other. The full MVP data model is migrated now, so later phases add logic but rarely change the schema.

## Scope
- **In:** Prisma schema for all MVP entities, the `auth`, `users` and `follows` modules, global validation, error format, `/v1` versioning, roles.
- **Out:** password reset email (stubbed; see Risks), social login, avatar upload (Phase 5 uses R2 presign).

## Prerequisites
- Phase 0 done.

## Tasks

### Day 4 — Schema & migration
- [x] Write `backend/prisma/schema.prisma` (see Contracts) and run `prisma migrate dev --name init`
- [x] `backend/prisma/seed.ts`: 5 users with follows between them. Wire it to `prisma db seed`.

### Day 5 — App-wide plumbing
- [x] `setup-app.ts` (shared by `main.ts` and e2e tests): `app.setGlobalPrefix('v1')`, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, CORS, `helmet`
- [x] `common/filters/http-exception.filter.ts`: emits the `{ statusCode, error, message, requestId }` shape and maps Prisma `P2002` → 409 and `P2025` → 404
- [x] `common/middleware/request-id.middleware.ts` (`x-request-id`)
- [x] `common/decorators/public.decorator.ts`, `current-user.decorator.ts`, `roles.decorator.ts`
- [x] `common/guards/roles.guard.ts`

### Days 6–7 — Auth module
- [x] `auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
- [x] `auth/strategies/jwt.strategy.ts`. Register `JwtAuthGuard` as a global `APP_GUARD` that honours `@Public()`.
- [x] Signup: validate the DTO, hash with `argon2`, create the user, issue tokens
- [x] Login: verify the password, issue tokens. The error message is the same for an unknown email and a wrong password.
- [x] Refresh: look up the hashed refresh token, **rotate it** (revoke the old one, issue a new one). If a revoked token is reused, revoke all of that user's tokens.
- [x] Logout: revoke the presented refresh token
- [x] Password reset stub: `POST /auth/forgot-password` logs a reset token outside production; `POST /auth/reset-password` sets the new password and revokes all sessions
- [x] `GET /auth/me`
- [x] Request/response types in `packages/shared/src/api/auth.ts` and `users.ts`; the backend DTO classes `implements` them

### Days 8–9 — Users module
- [x] `users/users.module.ts`, `users.service.ts`, `users.controller.ts`, `users/dto/update-user.dto.ts`
- [x] `GET /users/:id` (public) returns the profile plus `followerCount`, `followingCount`, `videoCount` and `isFollowing` (when authenticated)
- [x] `GET /users/by-username/:username` (public)
- [x] `PATCH /users/:id`: allowed only for the user themself or an `ADMIN`; `username` stays unique (409 on conflict)
- [x] `GET /users/:id/videos`: returns an empty paginated list for now (filled in during Phase 2)

### Days 10–11 — Follows module
- [x] `follows/follows.module.ts`, `follows.service.ts`, `follows.controller.ts`
- [x] `POST /users/:id/follow`: idempotent (return 200 if already following), 400 when following yourself
- [x] `DELETE /users/:id/follow`: idempotent
- [x] Update the denormalized `followerCount` / `followingCount` in the same transaction as the follow row
- [x] `GET /users/:id/followers` and `GET /users/:id/following` (cursor-paginated)
- [x] Emit a `follow.created` event (`@nestjs/event-emitter`). Phase 4 turns it into a notification.

### Day 12 — Buffer & docs
- [x] Swagger at `/docs` (`@nestjs/swagger`)
- [x] Fix anything left over and update this plan's contracts if they changed

## Contracts

### Prisma schema (MVP-complete)
```prisma
enum Role { USER ADMIN }
enum VideoStatus { UPLOADING PROCESSING READY FAILED }
enum NotificationType { LIKE COMMENT FOLLOW REPLY }

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  username       String   @unique
  passwordHash   String
  displayName    String?
  bio            String?  @db.VarChar(160)
  avatarUrl      String?
  role           Role     @default(USER)
  followerCount  Int      @default(0)
  followingCount Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  videos        Video[]
  likes         Like[]
  comments      Comment[]
  followers     Follow[]        @relation("following")
  following     Follow[]        @relation("follower")
  refreshTokens RefreshToken[]
  notifications Notification[]  @relation("recipient")
  actedNotifs   Notification[]  @relation("actor")
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model Video {
  id            String      @id @default(cuid())
  authorId      String
  caption       String?     @db.VarChar(300)
  status        VideoStatus @default(UPLOADING)
  muxUploadId   String?     @unique
  muxAssetId    String?     @unique
  muxPlaybackId String?
  durationSec   Float?
  aspectRatio   String?
  likeCount     Int         @default(0)
  commentCount  Int         @default(0)
  shareCount    Int         @default(0)
  viewCount     Int         @default(0)
  hidden        Boolean     @default(false)
  publishedAt   DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  author        User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  likes         Like[]
  comments      Comment[]
  @@index([authorId, publishedAt])
  @@index([status, publishedAt])
}

model Like {
  userId    String
  videoId   String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@id([userId, videoId])
  @@index([videoId])
}

model Comment {
  id        String    @id @default(cuid())
  videoId   String
  authorId  String
  parentId  String?
  body      String    @db.VarChar(500)
  replyCount Int      @default(0)
  createdAt DateTime  @default(now())
  deletedAt DateTime?
  video     Video     @relation(fields: [videoId], references: [id], onDelete: Cascade)
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent    Comment?  @relation("replies", fields: [parentId], references: [id])
  replies   Comment[] @relation("replies")
  @@index([videoId, createdAt])
  @@index([parentId, createdAt])
}

model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("follower",  fields: [followerId],  references: [id], onDelete: Cascade)
  following   User     @relation("following", fields: [followingId], references: [id], onDelete: Cascade)
  @@id([followerId, followingId])
  @@index([followingId, createdAt])
  @@index([followerId, createdAt])
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  actorId     String
  type        NotificationType
  videoId     String?
  commentId   String?
  readAt      DateTime?
  createdAt   DateTime         @default(now())
  recipient   User             @relation("recipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor       User             @relation("actor",     fields: [actorId],     references: [id], onDelete: Cascade)
  @@index([recipientId, createdAt])
}
```

### Endpoints
| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| POST | `/auth/signup` | public | `{ email, username, password }` (username `^[a-z0-9_.]{3,24}$`, password ≥ 8) | `AuthResponse` |
| POST | `/auth/login` | public | `{ email, password }` | `AuthResponse` |
| POST | `/auth/refresh` | public | `{ refreshToken }` | `AuthResponse` |
| POST | `/auth/logout` | user | `{ refreshToken }` | 204 |
| POST | `/auth/forgot-password` | public | `{ email }` | 204 (always) |
| POST | `/auth/reset-password` | public | `{ token, password }` | 204, or 400 if the token is invalid or used |
| GET | `/auth/me` | user | — | `MeProfile` |
| GET | `/users/:id` | public | — | `UserProfile` |
| GET | `/users/by-username/:username` | public | — | `UserProfile` |
| PATCH | `/users/:id` | self/admin | `{ displayName?, bio?, username?, avatarUrl? }` (null clears; `avatarUrl` must be https) | `MeProfile` |
| GET | `/users/:id/videos` | public | `cursor, limit` | `Paginated<VideoDto>` |
| POST | `/users/:id/follow` | user | — | `{ following: true }` |
| DELETE | `/users/:id/follow` | user | — | `{ following: false }` |
| GET | `/users/:id/followers` | public | `cursor, limit` | `Paginated<UserSummary>` |
| GET | `/users/:id/following` | public | `cursor, limit` | `Paginated<UserSummary>` |

- `AuthResponse = { accessToken, refreshToken, user: MeProfile }`
- `UserProfile` = `UserSummary` + `bio, followerCount, followingCount, videoCount, isFollowing, createdAt`. `isFollowing` is null for anonymous viewers and on your own profile.
- `MeProfile` = `UserProfile` + `email, role`. Only `/auth/me`, auth responses and `PATCH /users/:id` return private fields.
- Follower/following cursors are the id of the last user on the page.

### New env vars
```dotenv
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
PASSWORD_RESET_TTL_SECONDS=900
```

## Done when
- [x] Signup → login → `/auth/me` → refresh → logout works through Swagger and in e2e tests
- [x] Reusing a rotated refresh token returns 401 and revokes all of the user's sessions
- [x] Follow and unfollow are idempotent, and the counts stay correct under repeated and concurrent calls
- [x] Error responses follow the shared shape, and a duplicate email or username returns 409

## Tests
- Unit (`pnpm --filter backend test`): env validation, refresh token generation and hashing, `toPage` pagination, unique-violation field parsing.
- E2E (`pnpm --filter backend test:e2e`, Vitest + supertest): runs against a separate `<db>_test` database (or `TEST_DATABASE_URL`) that `test/global-setup.ts` migrates, and truncates tables before each test.
  - `auth.e2e-spec.ts`: full flow, 401s, identical login errors, reuse detection, concurrent refresh, validation, 409s, password reset.
  - `users.e2e-spec.ts`: public vs private fields, `isFollowing`, self/admin/anonymous edit permissions, clearing fields, username conflict.
  - `follows.e2e-spec.ts`: idempotency and counts, 10 concurrent follows and unfollows, self/unknown/anonymous errors, cursor paging, limit validation, `follow.created` event.
- The rules (rotation, reuse, counters) are tested end to end against Postgres rather than with a mocked Prisma, since races and constraints are what matter.

## Implementation notes (where the build differs from the original plan)
- **Reuse detection revokes all of the user's sessions**, not a "token family", because the schema has no family column. Both refresh paths are guarded: a revoked token, and losing the race in a conditional `updateMany` when two refreshes use the same token at once.
- **Login timing:** unknown emails are verified against a dummy argon2 hash, so both failure paths take the same time.
- **Password reset** needs no table. The token is a JWT signed with `JWT_ACCESS_SECRET` plus the user's current password hash, so it stops working once the password changes.
- **Access token TTL** is `JWT_ACCESS_TTL_SECONDS` (a number) instead of `15m`, which avoids string-duration typing in `@nestjs/jwt`.
- **Roles live in the access token.** A role change takes effect at the next login or refresh (within 15 min).
- **Prisma 7 P2002 errors** report only the index name (`User_email_key`) through the driver adapter. `common/prisma-errors.ts` derives the field name so a 409 says `email already in use`.
- **Swagger** uses the `@nestjs/swagger` CLI plugin (`nest-cli.json`), so DTOs need no `@ApiProperty` decorators. It's served at `/docs` outside production.
- **Seed** (`pnpm --filter backend prisma:seed`): alice, bob, carol, dave and erin (admin) at `@example.com`, password `password123`. Re-runnable; it recomputes the follow counters.
- An extra `Follow(followerId, createdAt)` index backs the "following" list order.

## Risks & notes
- **Password reset** needs an email provider. Stub a `POST /auth/forgot-password` that logs the token in development. Add Resend or Postmark in Phase 7 if beta users need it.
- Keep the counters (`followerCount`, etc.) inside transactions. A nightly reconcile job can come later if they drift.
